"""Idempotent production bootstrap. Safe to run on every deploy (Render pre-deploy command).

Creates what a fresh database needs and nothing with a built-in password:
  * the product catalogue (``seed_products``),
  * the initial active ``ModelVersion`` pointing at the artifact bundled with the PWA,
  * the ``nafdac`` group,
  * accounts only when their credentials are supplied through the environment:
      BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD        superuser
      BOOTSTRAP_NAFDAC_EMAIL / BOOTSTRAP_NAFDAC_PASSWORD      regulator (nafdac group)
      BOOTSTRAP_OEM_COMPANY / BOOTSTRAP_OEM_EMAIL / BOOTSTRAP_OEM_PASSWORD   manufacturer + admin
    Existing accounts are left untouched (passwords are never reset here).
"""

import os

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.utils import timezone

from common.permissions import NAFDAC_GROUP
from models_registry.models import ModelVersion
from oem.models import OEMAccount, OEMMembership


class Command(BaseCommand):
    help = (
        "Idempotent production bootstrap (catalogue, model release, groups, env-provided accounts)."
    )

    def handle(self, *args: object, **options: object) -> None:
        user_model = get_user_model()
        call_command("seed_products")

        if not ModelVersion.objects.filter(is_active=True).exists():
            version, created = ModelVersion.objects.get_or_create(
                version_string=os.environ.get("BOOTSTRAP_MODEL_VERSION", "1.0.0"),
                defaults={
                    "release_notes": "Initial model bundled with the PWA.",
                    "tfjs_manifest_url": "/models/v1/model.json",
                    "baselines_url": "/baselines/v1/baselines.json",
                    "published_at": timezone.now(),
                },
            )
            version.is_active = True
            version.save(update_fields=["is_active"])
            self.stdout.write(f"model version {version.version_string} active")

        group, _ = Group.objects.get_or_create(name=NAFDAC_GROUP)

        admin_email = os.environ.get("BOOTSTRAP_ADMIN_EMAIL")
        admin_pw = os.environ.get("BOOTSTRAP_ADMIN_PASSWORD")
        if (
            admin_email
            and admin_pw
            and not user_model.objects.filter(username=admin_email).exists()
        ):
            user_model.objects.create_superuser(
                username=admin_email, email=admin_email, password=admin_pw
            )
            self.stdout.write(f"created superuser {admin_email}")

        nafdac_email = os.environ.get("BOOTSTRAP_NAFDAC_EMAIL")
        nafdac_pw = os.environ.get("BOOTSTRAP_NAFDAC_PASSWORD")
        if nafdac_email and nafdac_pw:
            user, created = user_model.objects.get_or_create(
                username=nafdac_email, defaults={"email": nafdac_email, "is_staff": True}
            )
            if created:
                user.set_password(nafdac_pw)
                user.save()
                self.stdout.write(f"created regulator user {nafdac_email}")
            user.groups.add(group)

        company = os.environ.get("BOOTSTRAP_OEM_COMPANY")
        oem_email = os.environ.get("BOOTSTRAP_OEM_EMAIL")
        oem_pw = os.environ.get("BOOTSTRAP_OEM_PASSWORD")
        if company and oem_email and oem_pw:
            account, _ = OEMAccount.objects.get_or_create(
                company_name=company,
                defaults={"contact_email": oem_email, "verified_at": timezone.now()},
            )
            user, created = user_model.objects.get_or_create(
                username=oem_email, defaults={"email": oem_email}
            )
            if created:
                user.set_password(oem_pw)
                user.save()
                self.stdout.write(f"created OEM user {oem_email} for {company}")
            OEMMembership.objects.get_or_create(
                user=user, defaults={"account": account, "role": OEMMembership.Role.ADMIN}
            )

        self.stdout.write(self.style.SUCCESS("bootstrap complete"))
