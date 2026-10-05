"""Idempotent development seed.

Creates a superuser, an OEM account with an admin user, the NAFDAC group with a read-only
analyst, and an initial ModelVersion row pointing at the bundled TF.js artifact.
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
    help = "Seed development data (safe to run repeatedly)."

    def handle(self, *args: object, **options: object) -> None:
        user_model = get_user_model()

        su_email = os.environ.get("DEV_SUPERUSER_EMAIL", "admin@example.com")
        su_pw = os.environ.get("DEV_SUPERUSER_PASSWORD", "admin12345")
        if not user_model.objects.filter(username=su_email).exists():
            user_model.objects.create_superuser(username=su_email, email=su_email, password=su_pw)
            self.stdout.write(f"created superuser {su_email}")

        oem_email = os.environ.get("DEV_OEM_EMAIL", "oem@example.com")
        oem_pw = os.environ.get("DEV_OEM_PASSWORD", "oem12345")
        account, _ = OEMAccount.objects.get_or_create(
            company_name="Demo Pharma Ltd",
            defaults={"contact_email": oem_email, "verified_at": timezone.now()},
        )
        oem_user, created = user_model.objects.get_or_create(
            username=oem_email, defaults={"email": oem_email}
        )
        if created:
            oem_user.set_password(oem_pw)
            oem_user.save()
            self.stdout.write(f"created OEM user {oem_email}")
        OEMMembership.objects.get_or_create(
            user=oem_user, defaults={"account": account, "role": OEMMembership.Role.ADMIN}
        )
        # Dev convenience: the site administrator can also use the OEM portal (demo manufacturer).
        superuser = user_model.objects.filter(username=su_email).first()
        if superuser is not None:
            OEMMembership.objects.get_or_create(
                user=superuser, defaults={"account": account, "role": OEMMembership.Role.ADMIN}
            )

        group, _ = Group.objects.get_or_create(name=NAFDAC_GROUP)
        nafdac_email = os.environ.get("DEV_NAFDAC_EMAIL", "nafdac@example.com")
        nafdac_pw = os.environ.get("DEV_NAFDAC_PASSWORD", "nafdac12345")
        nafdac_user, created = user_model.objects.get_or_create(
            username=nafdac_email, defaults={"email": nafdac_email, "is_staff": True}
        )
        if created:
            nafdac_user.set_password(nafdac_pw)
            nafdac_user.save()
            self.stdout.write(f"created NAFDAC user {nafdac_email}")
        nafdac_user.groups.add(group)

        if not ModelVersion.objects.exists():
            ModelVersion.objects.create(
                version_string="1.0.0",
                release_notes="Initial model bundled with the PWA.",
                tfjs_manifest_url="/models/v1/model.json",
                baselines_url="/baselines/v1/baselines.json",
                published_at=timezone.now(),
                is_active=True,
            )
            self.stdout.write("created initial ModelVersion 1.0.0")

        call_command("seed_products")
        self.stdout.write(self.style.SUCCESS("seed complete"))
