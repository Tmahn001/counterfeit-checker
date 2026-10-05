"""Model version metadata and distribution (plan §11.1, §16.3).

The model artifact is versioned independently of the app. ``is_active`` is flipped only after
staging device-lab verification; clients poll ``/api/v1/models/latest/`` and refresh their cache
when the version (or weights hash) changes.
"""

from django.db import models


class ModelVersion(models.Model):
    version_string = models.CharField(max_length=32, unique=True)  # SemVer of the model artifact
    release_notes = models.TextField(blank=True)
    tfjs_manifest_url = models.CharField(
        max_length=500
    )  # model.json (absolute or web-root relative)
    baselines_url = models.CharField(max_length=500, blank=True)  # baselines.json bundle
    weights_sha256 = models.CharField(max_length=64, blank=True)
    input_size = models.PositiveSmallIntegerField(default=128)
    embedding_dim = models.PositiveSmallIntegerField(default=128)
    margin = models.FloatField(default=1.0)  # contrastive margin m used for the decision
    published_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-published_at", "-created_at"]

    def __str__(self) -> str:
        return f"model {self.version_string}{' (active)' if self.is_active else ''}"
