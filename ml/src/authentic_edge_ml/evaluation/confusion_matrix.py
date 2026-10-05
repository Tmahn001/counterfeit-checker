"""Confusion-matrix plotting."""

from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402


def plot_confusion(cm: dict[str, int | float], title: str, out: str | Path) -> Path:
    """Render a 2×2 confusion matrix (positive class = counterfeit) to ``out`` (PNG)."""
    matrix = [[cm["tn"], cm["fp"]], [cm["fn"], cm["tp"]]]
    fig, ax = plt.subplots(figsize=(4, 3.6), dpi=120)
    ax.imshow(matrix, cmap="Blues")
    for i in range(2):
        for j in range(2):
            ax.text(j, i, str(int(matrix[i][j])), ha="center", va="center", fontsize=12)
    ax.set_xticks([0, 1], ["pred authentic", "pred counterfeit"])
    ax.set_yticks([0, 1], ["authentic", "counterfeit"])
    ax.set_title(title)
    fig.tight_layout()
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out)
    plt.close(fig)
    return Path(out)
