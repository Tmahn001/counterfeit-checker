"""Anonymized incident telemetry (plan §11.2).

Geo is coarse by construction: an LGA (Local Government Area) code plus coordinates rounded to two
decimals (~1.1 km) — see docs/adr/0002-coarse-geo-without-postgis.md. No raw image, device
identifier or precise GPS fix is ever stored; the serializer structurally rejects such fields.
"""

from django.db import models


class TelemetryEvent(models.Model):
    class Verdict(models.TextChoices):
        AUTHENTIC = "authentic", "Authentic"
        COUNTERFEIT = "counterfeit", "Counterfeit"
        INCONCLUSIVE = "inconclusive", "Inconclusive"

    product_category = models.SlugField(max_length=120)
    verdict = models.CharField(max_length=16, choices=Verdict.choices)
    confidence_score = models.FloatField()  # 0..1
    distance = models.FloatField(null=True, blank=True)  # D_W, optional (model diagnostics)
    state_code = models.CharField(max_length=8, blank=True)  # e.g. "LA" (Lagos)
    lga_code = models.CharField(max_length=16, blank=True)  # e.g. "LA-IKEJA"
    geo_lat = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    geo_lng = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    model_version = models.ForeignKey(
        "models_registry.ModelVersion",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="telemetry_events",
    )
    model_version_string = models.CharField(max_length=32)
    backend = models.CharField(max_length=16, blank=True)  # webgl | wasm | cpu
    inference_ms = models.PositiveIntegerField(null=True, blank=True)
    client_timestamp = models.DateTimeField()
    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["product_category", "received_at"]),
            models.Index(fields=["state_code", "lga_code"]),
            models.Index(fields=["received_at"]),
        ]
        ordering = ["-received_at"]

    def __str__(self) -> str:
        return f"{self.product_category} {self.verdict} {self.confidence_score:.2f}"
