from unittest import mock

from authentic_edge_ml.training.callbacks import RecallFirstCheckpoint


def test_recall_first_checkpoint_ranks_recall_then_precision_then_loss(tmp_path):
    cb = RecallFirstCheckpoint(tmp_path / "best.keras", verbose=0)
    cb.model = mock.Mock()
    epochs = [
        {"val_recall": 0.5, "val_precision": 0.9, "val_loss": 0.3},  # save (first)
        {"val_recall": 1.0, "val_precision": 0.6, "val_loss": 0.3},  # save (recall up)
        {"val_recall": 1.0, "val_precision": 0.5, "val_loss": 0.1},  # skip (precision down)
        {"val_recall": 1.0, "val_precision": 0.6, "val_loss": 0.2},  # save (same, lower loss)
        {"val_recall": 1.0, "val_precision": 0.8, "val_loss": 0.25},  # save (precision up)
        {"val_recall": 0.9, "val_precision": 1.0, "val_loss": 0.01},  # skip (recall down)
    ]
    for i, logs in enumerate(epochs):
        cb.on_epoch_end(i, logs)
    assert cb.model.save.call_count == 4
    assert cb.best_epoch == 4
    assert cb.best == (1.0, 0.8, -0.25)
