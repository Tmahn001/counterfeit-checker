"""Labeling schema and manifest I/O (plan §7.2).

A manifest is a versioned JSON document — labels are never implied by the filesystem layout.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Literal

Label = Literal["authentic", "counterfeit"]
QAStatus = Literal["pending", "verified", "rejected"]


@dataclass
class CaptureMetadata:
    """Capture conditions recorded at acquisition time."""

    device: str = "unknown"
    working_distance_mm: int = 70
    lighting_condition: str = "controlled_ring_light"
    capture_date: str = ""


@dataclass
class ImageRecord:
    """One labelled macro-photographic image."""

    image_id: str
    path: str
    product_category: str
    label: Label
    capture_metadata: CaptureMetadata = field(default_factory=CaptureMetadata)
    oem_batch_id: str | None = None
    annotator_id: str = "unknown"
    qa_status: QAStatus = "pending"
    second_annotator_label: Label | None = None
    counterfeit_grade: str | None = (
        None  # "A" = high-fidelity counterfeit, held out for adversarial eval
    )
    split: str | None = None  # train | val | test | adversarial, assigned by batch

    @staticmethod
    def from_dict(d: dict[str, object]) -> ImageRecord:
        """Deserialise from a manifest entry."""
        meta = d.get("capture_metadata") or {}
        return ImageRecord(
            image_id=str(d["image_id"]),
            path=str(d["path"]),
            product_category=str(d["product_category"]),
            label=d["label"],  # type: ignore[arg-type]
            capture_metadata=CaptureMetadata(**meta),  # type: ignore[arg-type]
            oem_batch_id=d.get("oem_batch_id"),  # type: ignore[arg-type]
            annotator_id=str(d.get("annotator_id", "unknown")),
            qa_status=d.get("qa_status", "pending"),  # type: ignore[arg-type]
            second_annotator_label=d.get("second_annotator_label"),  # type: ignore[arg-type]
            counterfeit_grade=d.get("counterfeit_grade"),  # type: ignore[arg-type]
            split=d.get("split"),  # type: ignore[arg-type]
        )


@dataclass
class Manifest:
    """A versioned dataset manifest."""

    version: str
    images: list[ImageRecord]
    root: str = ""
    notes: str = ""

    def to_json(self) -> str:
        """Serialise to pretty JSON."""
        payload = {
            "version": self.version,
            "root": self.root,
            "notes": self.notes,
            "images": [asdict(r) for r in self.images],
        }
        return json.dumps(payload, indent=2)

    def save(self, path: str | Path) -> None:
        """Write the manifest to ``path``."""
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        Path(path).write_text(self.to_json())

    @staticmethod
    def load(path: str | Path) -> Manifest:
        """Read a manifest from ``path``."""
        raw = json.loads(Path(path).read_text())
        return Manifest(
            version=str(raw["version"]),
            root=str(raw.get("root", "")),
            notes=str(raw.get("notes", "")),
            images=[ImageRecord.from_dict(d) for d in raw["images"]],
        )

    def usable(self) -> list[ImageRecord]:
        """Images that survived QA (rejected ones stay in the manifest but are never trained on)."""
        return [r for r in self.images if r.qa_status != "rejected"]

    def resolve(self, record: ImageRecord) -> str:
        """Absolute path of an image."""
        p = Path(record.path)
        return str(p if p.is_absolute() else Path(self.root) / p)


def inter_rater_agreement(images: list[ImageRecord]) -> tuple[float, int]:
    """Agreement between first and second annotator on the audited subsample.

    Returns:
        (agreement_ratio, audited_count). Objective 1 gate is ≥ 0.95 on a ≥10% sample.
    """
    audited = [r for r in images if r.second_annotator_label is not None]
    if not audited:
        return 0.0, 0
    agree = sum(1 for r in audited if r.second_annotator_label == r.label)
    return agree / len(audited), len(audited)
