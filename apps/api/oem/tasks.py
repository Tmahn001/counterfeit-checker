"""Celery task: generate a product baseline signature from an OEM reference image set (plan §11.5).

The task reuses the ml package's inference code (``authentic_edge_ml.inference``) — the same
preprocessing, ORB extraction and Siamese forward pass the client performs — rather than a
reimplementation. TensorFlow is imported lazily so the lean ``api`` image never needs it; only
the ``worker`` image does.
"""

from __future__ import annotations

import logging
import time

from celery import shared_task
from django.utils import timezone

from .models import ProductBaseline

log = logging.getLogger(__name__)


@shared_task(bind=True, autoretry_for=(OSError,), retry_backoff=True, max_retries=3)
def generate_baseline_embedding(self, baseline_id: str) -> str:  # type: ignore[no-untyped-def]
    baseline = ProductBaseline.objects.select_related("model_version").get(pk=baseline_id)
    baseline.status = ProductBaseline.Status.RUNNING
    baseline.task_id = self.request.id or ""
    baseline.save(update_fields=["status", "task_id"])

    started = time.perf_counter()
    try:
        from authentic_edge_ml.inference import BaselineSigner

        signer = BaselineSigner.from_model_version(baseline.model_version.version_string)
        paths = [img.image.path for img in baseline.images.all()]
        signature = signer.sign_image_set(paths, normalize=True)
        baseline.embedding_vector = signature.embedding
        baseline.orb_descriptors_b64 = signature.orb_descriptors_b64
        baseline.source_image_set_ref = f"media:baselines/{baseline.pk}"
        baseline.status = ProductBaseline.Status.READY
        baseline.error_message = ""
        baseline.completed_at = timezone.now()
        baseline.save()
        log.info(
            "baseline embedding generated",
            extra={
                "baseline_id": str(baseline.pk),
                "product_category": baseline.product_category,
                "images": len(paths),
                "duration_ms": round((time.perf_counter() - started) * 1000),
            },
        )
        return str(baseline.pk)
    except Exception as exc:
        baseline.status = ProductBaseline.Status.FAILED
        baseline.error_message = f"{type(exc).__name__}: {exc}"[:2000]
        baseline.save(update_fields=["status", "error_message"])
        log.exception("baseline embedding failed", extra={"baseline_id": str(baseline.pk)})
        raise
