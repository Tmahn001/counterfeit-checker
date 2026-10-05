import numpy as np

from authentic_edge_ml.data_pipeline.synthetic import _design, render_item
from authentic_edge_ml.inference import BaselineSigner
from authentic_edge_ml.preprocessing import (
    CAPTURE_SIZE,
    OrbFeatures,
    extract_orb,
    match_orb,
    preprocess,
    roi_crop,
    run_pipeline,
    to_capture_frame,
    to_grayscale,
)


def _img(seed=0, counterfeit=False):
    rng = np.random.default_rng(seed)
    design, f = _design(rng)
    return render_item(design, f, rng, counterfeit)


def test_grayscale_luma():
    rgb = np.zeros((4, 4, 3), np.uint8)
    rgb[..., 2] = 255  # BGR → red channel
    assert int(to_grayscale(rgb)[0, 0]) == 76  # 0.299 * 255


def test_pipeline_shapes():
    out = run_pipeline(_img())
    assert out.gray.shape == (256, 256)
    assert out.crop.shape == (128, 128)
    assert out.tensor.shape == (128, 128, 1) and out.tensor.dtype == np.float32
    assert 0.0 <= out.tensor.min() and out.tensor.max() <= 1.0
    assert out.orb.count > 50
    assert out.orb.descriptors.shape == (out.orb.count, 32)


def test_orb_descriptor_roundtrip():
    feats = extract_orb(preprocess(_img()))
    b64 = feats.descriptors_b64()
    assert np.array_equal(OrbFeatures.descriptors_from_b64(b64), feats.descriptors)


def test_orb_matching_prefers_same_item():
    a = extract_orb(preprocess(_img(1))).descriptors
    a2 = extract_orb(preprocess(_img(1))).descriptors  # identical render
    b = extract_orb(preprocess(_img(2))).descriptors  # different design
    _, same = match_orb(a, a2)
    _, diff = match_orb(a, b)
    assert same > diff


def test_roi_crop_handles_no_keypoints():
    gray = np.zeros((200, 300), np.uint8)
    crop = roi_crop(gray, np.zeros((0, 2), np.float32))
    assert crop.shape == (128, 128)


def test_to_capture_frame_matches_scanner_geometry():
    big = np.zeros((3000, 4000, 3), np.uint8)
    big[:, 500:3500] = 200  # centre square region is bright, side bands dark
    frame = to_capture_frame(big)
    assert frame.shape == (CAPTURE_SIZE, CAPTURE_SIZE, 3)
    assert frame.min() == 200  # side bands cropped away
    small = to_capture_frame(np.full((256, 300), 50, np.uint8))
    assert small.shape == (CAPTURE_SIZE, CAPTURE_SIZE)


def test_sign_image_set_normalizes_uploads(tmp_path):
    import cv2

    class FakeEmbedding:
        def __call__(self, x, training=False):
            return np.tile(np.arange(1, 129, dtype=np.float32), (x.shape[0], 1))

    paths = []
    for i in range(3):
        rng = np.random.default_rng(i)
        img = (rng.random((900, 1200)) * 255).astype(np.uint8)
        p = tmp_path / f"ref{i}.png"
        cv2.imwrite(str(p), img)
        paths.append(str(p))
    sig = BaselineSigner(FakeEmbedding()).sign_image_set(paths, normalize=True)
    assert sig.image_count == 3 and len(sig.embedding) == 128
    assert abs(float(np.linalg.norm(sig.embedding)) - 1.0) < 1e-5
    assert sig.orb_keypoint_count > 0
