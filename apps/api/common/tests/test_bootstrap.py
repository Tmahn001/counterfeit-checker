import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command

from models_registry.models import ModelVersion
from oem.models import OEMMembership, Product

pytestmark = pytest.mark.django_db


def test_bootstrap_without_env_creates_no_accounts(monkeypatch):
    for k in ("BOOTSTRAP_ADMIN_EMAIL", "BOOTSTRAP_ADMIN_PASSWORD", "BOOTSTRAP_OEM_EMAIL"):
        monkeypatch.delenv(k, raising=False)
    call_command("bootstrap")
    call_command("bootstrap")  # idempotent
    assert get_user_model().objects.count() == 0
    assert Product.objects.count() == 9
    assert ModelVersion.objects.filter(is_active=True, version_string="1.0.0").count() == 1


def test_bootstrap_creates_env_accounts_once_and_never_resets_passwords(monkeypatch):
    monkeypatch.setenv("BOOTSTRAP_ADMIN_EMAIL", "root@example.org")
    monkeypatch.setenv("BOOTSTRAP_ADMIN_PASSWORD", "first-secret-9")
    monkeypatch.setenv("BOOTSTRAP_NAFDAC_EMAIL", "reg@example.org")
    monkeypatch.setenv("BOOTSTRAP_NAFDAC_PASSWORD", "reg-secret-9")
    monkeypatch.setenv("BOOTSTRAP_OEM_COMPANY", "CWAY Food & Beverages")
    monkeypatch.setenv("BOOTSTRAP_OEM_EMAIL", "ops@cway.example")
    monkeypatch.setenv("BOOTSTRAP_OEM_PASSWORD", "oem-secret-9")
    call_command("bootstrap")
    users = get_user_model().objects
    assert users.get(username="root@example.org").is_superuser
    assert users.get(username="reg@example.org").groups.filter(name="nafdac").exists()
    membership = OEMMembership.objects.get(user__username="ops@cway.example")
    assert membership.account.company_name == "CWAY Food & Beverages" and membership.role == "admin"

    monkeypatch.setenv("BOOTSTRAP_ADMIN_PASSWORD", "changed-later")
    call_command("bootstrap")
    assert users.get(username="root@example.org").check_password("first-secret-9")
    assert users.count() == 3


def test_bootstrap_keeps_an_existing_active_model(model_version):
    call_command("bootstrap")
    assert ModelVersion.objects.filter(is_active=True).count() == 1
