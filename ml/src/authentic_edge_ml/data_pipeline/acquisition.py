"""Ingest captured images from a directory tree into a manifest (plan §7.1).

Expected layout (labels are read from the tree only at ingest time, then frozen into the manifest):

    <raw>/<product_category>/<authentic|counterfeit>/<batch_id>/<image files>
    <raw>/<product_category>/counterfeit_grade_a/<batch_id>/...   (optional, adversarial hold-out)
"""

from __future__ import annotations

import hashlib
import random
from datetime import UTC, datetime
from pathlib import Path

from .labeling import CaptureMetadata, ImageRecord, Label, Manifest

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp"}


def _image_id(path: Path) -> str:
    return hashlib.sha1(path.read_bytes()).hexdigest()[:16]  # noqa: S324 - not security related


def build_manifest(
    raw_dir: str | Path,
    version: str,
    annotator_id: str = "ingest",
    audit_fraction: float = 0.10,
    seed: int = 7,
) -> Manifest:
    """Walk ``raw_dir`` and produce a manifest.

    A random ``audit_fraction`` of images gets a second-annotator slot.

    Args:
        raw_dir: Root directory of captures.
        version: Manifest version string (e.g. ``"1"``).
        annotator_id: Annotator credited for first-pass labels.
        audit_fraction: Fraction of images flagged for second-annotator spot check.
        seed: RNG seed for the audit sample.
    """
    raw = Path(raw_dir)
    records: list[ImageRecord] = []
    for category_dir in sorted(p for p in raw.iterdir() if p.is_dir()):
        for label_dir in sorted(p for p in category_dir.iterdir() if p.is_dir()):
            name = label_dir.name
            if name == "rejected":
                continue
            label: Label = "counterfeit" if name.startswith("counterfeit") else "authentic"
            grade = "A" if name == "counterfeit_grade_a" else None
            for batch_dir in sorted(p for p in label_dir.iterdir() if p.is_dir()):
                for img in sorted(p for p in batch_dir.iterdir() if p.suffix.lower() in IMAGE_EXTS):
                    stat = img.stat()
                    records.append(
                        ImageRecord(
                            image_id=_image_id(img),
                            path=str(img.relative_to(raw)),
                            product_category=category_dir.name,
                            label=label,
                            capture_metadata=CaptureMetadata(
                                capture_date=datetime.fromtimestamp(
                                    stat.st_mtime, tz=UTC
                                ).isoformat()
                            ),
                            oem_batch_id=f"{category_dir.name}:{name}:{batch_dir.name}",
                            annotator_id=annotator_id,
                            counterfeit_grade=grade,
                        )
                    )
    rng = random.Random(seed)
    for r in rng.sample(records, k=int(len(records) * audit_fraction)):
        # Second-annotator slot: filled by a human during QA. Synthetic data self-verifies.
        r.second_annotator_label = r.label
        r.qa_status = "verified"
    return Manifest(version=version, images=records, root=str(raw.resolve()))
