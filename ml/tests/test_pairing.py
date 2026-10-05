"""Pairing / augmentation / split-leakage tests (plan §7.4 — leakage is tested explicitly)."""

import numpy as np
import pytest

from authentic_edge_ml.data_pipeline.augmentation import (
    NEGATIVE,
    POSITIVE,
    assign_splits,
    augment_image,
    check_no_leakage,
    make_pairs,
)
from authentic_edge_ml.data_pipeline.labeling import ImageRecord, inter_rater_agreement


def _records(n_batches=12, per_batch=6, categories=("cat_a", "cat_b")):
    recs = []
    for cat in categories:
        for b in range(n_batches):
            for i in range(per_batch):
                recs.append(
                    ImageRecord(
                        f"{cat}-a-{b}-{i}",
                        "x.png",
                        cat,
                        "authentic",
                        oem_batch_id=f"{cat}:auth:{b}",
                    )
                )
        for b in range(n_batches // 2):
            for i in range(per_batch):
                recs.append(
                    ImageRecord(
                        f"{cat}-c-{b}-{i}",
                        "x.png",
                        cat,
                        "counterfeit",
                        oem_batch_id=f"{cat}:fake:{b}",
                    )
                )
        for i in range(per_batch):
            recs.append(
                ImageRecord(
                    f"{cat}-ga-{i}",
                    "x.png",
                    cat,
                    "counterfeit",
                    oem_batch_id=f"{cat}:ga:0",
                    counterfeit_grade="A",
                )
            )
    return recs


def test_split_is_by_batch_and_deterministic():
    recs = _records()
    s1, s2 = assign_splits(recs), assign_splits(recs)
    assert s1 == s2
    by_batch = {}
    for r in recs:
        by_batch.setdefault(r.oem_batch_id, set()).add(s1[r.image_id])
    assert all(len(v) == 1 for v in by_batch.values()), "a batch straddles splits"
    assert {"train", "val", "test", "adversarial"} <= set(s1.values())


def test_grade_a_always_adversarial():
    recs = _records()
    splits = assign_splits(recs)
    assert all(splits[r.image_id] == "adversarial" for r in recs if r.counterfeit_grade == "A")


def test_pairs_balanced_and_labelled():
    recs = _records()
    splits = assign_splits(recs)
    pairs = make_pairs(recs, "train", splits, seed=1)
    pos = [p for p in pairs if p.label == POSITIVE]
    neg = [p for p in pairs if p.label == NEGATIVE]
    assert len(pos) == len(neg) > 0
    by_id = {r.image_id: r for r in recs}
    for p in pos:
        assert by_id[p.a].oem_batch_id == by_id[p.b].oem_batch_id
        assert by_id[p.a].label == by_id[p.b].label == "authentic"
        assert p.augment is True
    for p in neg:
        assert {by_id[p.a].label, by_id[p.b].label} == {"authentic", "counterfeit"}
        assert p.augment is False, "negative pairs must never be augmented"
        assert by_id[p.a].product_category == by_id[p.b].product_category


def test_no_leakage_check_passes_and_detects():
    recs = _records()
    splits = assign_splits(recs)
    pairs = {s: make_pairs(recs, s, splits) for s in ("train", "val", "test")}
    check_no_leakage(pairs, recs)
    leaked = dict(pairs)
    leaked["val"] = leaked["val"] + pairs["train"][:1]
    with pytest.raises(ValueError):
        check_no_leakage(leaked, recs)


def test_adversarial_pairs_use_held_out_counterfeits():
    recs = _records()
    splits = assign_splits(recs)
    by_id = {r.image_id: r for r in recs}
    pairs = make_pairs(recs, "adversarial", splits)
    assert pairs
    for p in pairs:
        if p.label == NEGATIVE:
            assert by_id[p.b].counterfeit_grade == "A"


def test_augment_image_keeps_shape_and_range():
    rng = np.random.default_rng(0)
    img = rng.integers(0, 255, (128, 128), dtype=np.uint8)
    out = augment_image(img, rng)
    assert out.shape == img.shape and out.dtype == np.uint8


def test_inter_rater_agreement():
    recs = _records()[:20]
    for r in recs[:10]:
        r.second_annotator_label = r.label
    recs[0].second_annotator_label = "counterfeit"
    agree, audited = inter_rater_agreement(recs)
    assert audited == 10 and agree == pytest.approx(0.9)
