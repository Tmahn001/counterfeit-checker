"""Precision / Recall / F1 from pair distances, and validation-set threshold tuning."""

from __future__ import annotations

import numpy as np
from numpy.typing import NDArray


def confusion(d: NDArray[np.floating], y: NDArray[np.integer], threshold: float) -> dict[str, int]:
    """Confusion counts with counterfeit (Y=1) as the positive class."""
    pred = d > threshold
    truth = y.astype(bool)
    return {
        "tp": int(np.sum(truth & pred)),
        "fp": int(np.sum(~truth & pred)),
        "fn": int(np.sum(truth & ~pred)),
        "tn": int(np.sum(~truth & ~pred)),
    }


def prf(cm: dict[str, int]) -> dict[str, float]:
    """Precision, recall, F1, accuracy, FPR and FNR from a confusion dict."""
    tp, fp, fn, tn = cm["tp"], cm["fp"], cm["fn"], cm["tn"]
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    total = tp + fp + fn + tn
    return {
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "accuracy": (tp + tn) / total if total else 0.0,
        "fpr": fp / (fp + tn) if fp + tn else 0.0,
        "fnr": fn / (fn + tp) if fn + tp else 0.0,
    }


def evaluate_at(
    d: NDArray[np.floating], y: NDArray[np.integer], threshold: float
) -> dict[str, float]:
    """Metrics + confusion counts at one threshold."""
    cm = confusion(d, y, threshold)
    return {**prf(cm), **{k: float(v) for k, v in cm.items()}, "threshold": threshold}


def tune_threshold(
    d: NDArray[np.floating],
    y: NDArray[np.integer],
    target_recall: float = 0.95,
    margin: float = 1.0,
    steps: int = 200,
) -> tuple[float, dict[str, float]]:
    """Choose the D_W threshold on the validation set.

    Policy (public-health asymmetry, plan §10.2): among thresholds achieving ``target_recall``,
    pick the one with the highest precision; if none does, pick the threshold with the highest
    recall, breaking ties by F1. Candidates span (0, margin].
    """
    candidates = np.linspace(margin / steps, margin, steps)
    results = [(t, evaluate_at(d, y, float(t))) for t in candidates]
    meeting = [r for r in results if r[1]["recall"] >= target_recall]
    if meeting:
        best = max(meeting, key=lambda r: (r[1]["precision"], r[1]["f1"]))
    else:
        best = max(results, key=lambda r: (r[1]["recall"], r[1]["f1"]))
    return float(best[0]), best[1]
