"""OEM accounts and product baseline signatures (plan §11.2).

``ProductBaseline`` is the only place embeddings are computed server-side, and only ever from
OEM-submitted reference macro-photographs — never from consumer captures.
"""

from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models


class OEMAccount(models.Model):
    company_name = models.CharField(max_length=200, unique=True)
    contact_email = models.EmailField()
    verified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["company_name"]

    def __str__(self) -> str:
        return self.company_name

    @property
    def is_verified(self) -> bool:
        return self.verified_at is not None


class OEMMembership(models.Model):
    class Role(models.TextChoices):
        ADMIN = "admin", "OEM admin"
        UPLOADER = "uploader", "OEM uploader"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="oem_membership"
    )
    account = models.ForeignKey(OEMAccount, on_delete=models.CASCADE, related_name="memberships")
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.UPLOADER)

    def __str__(self) -> str:
        return f"{self.user} @ {self.account} ({self.role})"

    @property
    def is_oem_admin(self) -> bool:
        return self.role == self.Role.ADMIN

    @property
    def is_oem_uploader(self) -> bool:
        return self.role in {self.Role.ADMIN, self.Role.UPLOADER}


class Product(models.Model):
    """Catalogue entry for a product consumers can scan.

    ``ProductBaseline.product_category`` refers to ``Product.slug``. A product is scannable only
    once a READY baseline exists for it under the active model version; until then clients list
    it as "reference pending" and refuse to give a verdict.
    """

    class Sector(models.TextChoices):
        FOOD_BEVERAGE = "food_beverage", "Food & beverage"
        PHARMACEUTICAL = "pharmaceutical", "Pharmaceutical"
        PERSONAL_CARE = "personal_care", "Personal care"
        DEMO = "demo", "Demo / synthetic"

    slug = models.SlugField(max_length=120, unique=True)
    display_name = models.CharField(max_length=200)
    manufacturer = models.CharField(max_length=200, blank=True)
    pack = models.CharField(max_length=120, blank=True)
    sector = models.CharField(max_length=32, choices=Sector.choices, default=Sector.FOOD_BEVERAGE)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["display_name"]

    def __str__(self) -> str:
        return self.display_name


def baseline_image_path(instance: BaselineImage, filename: str) -> str:
    return f"baselines/{instance.baseline_id}/{uuid.uuid4().hex}_{filename[-80:]}"


class ProductBaseline(models.Model):
    """A reference signature for one product category, produced from an OEM image set."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        RUNNING = "running", "Running"
        READY = "ready", "Ready"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    oem_account = models.ForeignKey(OEMAccount, on_delete=models.CASCADE, related_name="baselines")
    product_category = models.SlugField(max_length=120)
    model_version = models.ForeignKey(
        "models_registry.ModelVersion", on_delete=models.PROTECT, related_name="baselines"
    )
    embedding_vector = models.JSONField(null=True, blank=True)  # list[float], 128-dim
    orb_descriptors_b64 = models.TextField(
        blank=True
    )  # base64(uint8[N,32]) for client-side matching
    source_image_set_ref = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    error_message = models.TextField(blank=True)
    task_id = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["oem_account", "product_category"])]

    def __str__(self) -> str:
        return f"{self.product_category} ({self.status})"


class BaselineImage(models.Model):
    baseline = models.ForeignKey(ProductBaseline, on_delete=models.CASCADE, related_name="images")
    image = models.ImageField(upload_to=baseline_image_path)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return self.image.name
