"""Shared pytest fixtures for the Django backend."""

from __future__ import annotations

import io

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from common.permissions import NAFDAC_GROUP
from models_registry.models import ModelVersion
from oem.models import OEMAccount, OEMMembership


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def model_version(db) -> ModelVersion:  # type: ignore[no-untyped-def]
    return ModelVersion.objects.create(
        version_string="1.0.0",
        tfjs_manifest_url="/models/v1/model.json",
        baselines_url="/baselines/v1/baselines.json",
        published_at=timezone.now(),
        is_active=True,
    )


@pytest.fixture
def product(db):  # type: ignore[no-untyped-def]
    from oem.models import Product

    return Product.objects.create(
        slug="antimalarial_tablet_20mg", display_name="Antimalarial 20mg", sector="pharmaceutical"
    )


@pytest.fixture
def oem_account(db) -> OEMAccount:  # type: ignore[no-untyped-def]
    return OEMAccount.objects.create(
        company_name="Demo Pharma", contact_email="oem@example.com", verified_at=timezone.now()
    )


TEST_PASSWORD = "pw12345!x"


def _make_user(email: str, password: str = TEST_PASSWORD):  # type: ignore[no-untyped-def]
    user = get_user_model().objects.create_user(username=email, email=email, password=password)
    return user


@pytest.fixture
def oem_admin_user(oem_account):  # type: ignore[no-untyped-def]
    user = _make_user("admin@oem.example")
    OEMMembership.objects.create(user=user, account=oem_account, role=OEMMembership.Role.ADMIN)
    return user


@pytest.fixture
def oem_uploader_user(oem_account):  # type: ignore[no-untyped-def]
    user = _make_user("uploader@oem.example")
    OEMMembership.objects.create(user=user, account=oem_account, role=OEMMembership.Role.UPLOADER)
    return user


@pytest.fixture
def plain_user(db):  # type: ignore[no-untyped-def]
    return _make_user("nobody@example.com")


@pytest.fixture
def nafdac_user(db):  # type: ignore[no-untyped-def]
    user = _make_user("analyst@nafdac.example")
    group, _ = Group.objects.get_or_create(name=NAFDAC_GROUP)
    user.groups.add(group)
    return user


def make_image_file(name: str = "img.png", size: int = 64) -> SimpleUploadedFile:
    buf = io.BytesIO()
    Image.new("L", (size, size), color=128).save(buf, format="PNG")
    return SimpleUploadedFile(name, buf.getvalue(), content_type="image/png")


@pytest.fixture
def image_files():  # type: ignore[no-untyped-def]
    return [make_image_file(f"ref_{i}.png") for i in range(5)]
