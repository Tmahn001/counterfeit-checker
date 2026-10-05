"""Image preprocessing + ORB extraction — the Python twin of ``apps/web/lib/vision``.

Both implementations must stay numerically aligned: grayscale → CLAHE → Non-Local-Means denoise →
ORB (n=500, FAST ε=20) → keypoint-centred ROI crop → resize to ``input_size`` → scale to [0, 1].
"""

from __future__ import annotations

import base64
from dataclasses import dataclass

import cv2
import numpy as np
from numpy.typing import NDArray

from .params import ORB, PREPROCESS, OrbParams, PreprocessParams

U8 = NDArray[np.uint8]
F32 = NDArray[np.float32]

# Side of the square frame the client camera hands to the pipeline (CameraCapture captureSize).
CAPTURE_SIZE = 512


def _u8(arr: np.ndarray) -> U8:
    """Narrow an OpenCV result (typed loosely by the stubs) to a uint8 array."""
    return np.asarray(arr, dtype=np.uint8)


def to_grayscale(image: np.ndarray) -> U8:
    """Convert an RGB/BGR/gray uint8 image to single-channel gray (ITU-R 601 luma weights)."""
    if image.ndim == 2:
        return image.astype(np.uint8)
    if image.shape[2] == 4:
        image = cv2.cvtColor(image, cv2.COLOR_BGRA2BGR)
    return _u8(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY))


def normalize_illumination(gray: U8, params: PreprocessParams = PREPROCESS) -> U8:
    """CLAHE for uneven lighting; falls back to global equalisation if CLAHE is unavailable."""
    try:
        clahe = cv2.createCLAHE(
            clipLimit=params.clahe_clip_limit,
            tileGridSize=(params.clahe_tile_grid, params.clahe_tile_grid),
        )
        return _u8(clahe.apply(gray))
    except cv2.error:  # pragma: no cover - defensive
        return _u8(cv2.equalizeHist(gray))


def denoise(gray: U8, params: PreprocessParams = PREPROCESS) -> U8:
    """Denoise (plan §9.1 step 3): Non-Local Means, or the bilateral filter the client uses."""
    if params.denoise_method == "nlm":
        return _u8(
            cv2.fastNlMeansDenoising(
                gray,
                None,
                h=params.nlm_h,
                templateWindowSize=params.nlm_template_window,
                searchWindowSize=params.nlm_search_window,
            )
        )
    return _u8(
        cv2.bilateralFilter(
            gray,
            params.bilateral_d,
            params.bilateral_sigma_color,
            params.bilateral_sigma_space,
            borderType=cv2.BORDER_DEFAULT,
        )
    )


def preprocess(image: np.ndarray, params: PreprocessParams = PREPROCESS) -> U8:
    """Full preprocessing chain: grayscale → CLAHE → NLM denoise."""
    return denoise(normalize_illumination(to_grayscale(image), params), params)


def make_orb(params: OrbParams = ORB) -> cv2.ORB:
    """Instantiate an ORB detector with the plan's parameters (§8.3)."""
    return cv2.ORB.create(
        nfeatures=params.n_keypoints,
        scaleFactor=params.scale_factor,
        nlevels=params.n_levels,
        edgeThreshold=params.edge_threshold,
        firstLevel=0,
        WTA_K=2,
        scoreType=cv2.ORB_HARRIS_SCORE,
        patchSize=params.patch_size,
        fastThreshold=params.fast_threshold,
    )


@dataclass
class OrbFeatures:
    """Keypoint coordinates (N,2) and binary descriptors (N,32) uint8."""

    points: NDArray[np.float32]
    descriptors: U8

    @property
    def count(self) -> int:
        """Number of keypoints."""
        return int(self.points.shape[0])

    def descriptors_b64(self) -> str:
        """Descriptors as base64 (row-major uint8, 32 bytes per keypoint)."""
        return base64.b64encode(np.ascontiguousarray(self.descriptors).tobytes()).decode("ascii")

    @staticmethod
    def descriptors_from_b64(data: str) -> U8:
        """Inverse of :meth:`descriptors_b64`."""
        raw = np.frombuffer(base64.b64decode(data), dtype=np.uint8)
        return raw.reshape(-1, 32)


def extract_orb(gray: U8, params: OrbParams = ORB) -> OrbFeatures:
    """Detect ORB keypoints and compute rBRIEF descriptors."""
    orb = make_orb(params)
    keypoints, descriptors = orb.detectAndCompute(gray, None)  # type: ignore[call-overload]
    if descriptors is None or len(keypoints) == 0:
        return OrbFeatures(np.zeros((0, 2), np.float32), np.zeros((0, 32), np.uint8))
    pts = np.array([kp.pt for kp in keypoints], dtype=np.float32)
    return OrbFeatures(pts, descriptors.astype(np.uint8))


def match_orb(query: U8, baseline: U8, params: OrbParams = ORB) -> tuple[int, float]:
    """Brute-force Hamming matching with Lowe's ratio test and a hard distance threshold.

    Returns:
        (good_match_count, match_ratio) where ratio = good / min(len(query), len(baseline)).
    """
    if len(query) < 2 or len(baseline) < 2:
        return 0, 0.0
    matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
    knn = matcher.knnMatch(query, baseline, k=2)
    good = 0
    for pair in knn:
        if len(pair) < 2:
            continue
        m, n = pair
        if m.distance < params.lowe_ratio * n.distance and m.distance <= params.hamming_threshold:
            good += 1
    return good, good / float(min(len(query), len(baseline)))


def roi_crop(gray: U8, points: NDArray[np.float32], params: PreprocessParams = PREPROCESS) -> U8:
    """Crop a square ROI centred on the median keypoint location and resize to ``input_size``.

    Concentrating the CNN on the region of densest micro-detail keeps the 128×128 input from being
    dominated by empty substrate. With no keypoints, falls back to a centre crop.
    """
    h, w = gray.shape[:2]
    side = max(8, int(round(min(h, w) * params.roi_fraction)))
    if points.shape[0] > 0:
        cx, cy = float(np.median(points[:, 0])), float(np.median(points[:, 1]))
    else:
        cx, cy = w / 2.0, h / 2.0
    x0 = int(round(min(max(cx - side / 2.0, 0.0), w - side)))
    y0 = int(round(min(max(cy - side / 2.0, 0.0), h - side)))
    crop = gray[y0 : y0 + side, x0 : x0 + side]
    return _u8(
        cv2.resize(crop, (params.input_size, params.input_size), interpolation=cv2.INTER_AREA)
    )


def to_model_input(crop: U8) -> F32:
    """Scale a uint8 crop to a float32 [0,1] tensor of shape (H, W, 1)."""
    return (crop.astype(np.float32) / 255.0)[..., None]


@dataclass
class PipelineOutput:
    """Everything the client also produces per capture."""

    gray: U8
    orb: OrbFeatures
    crop: U8
    tensor: F32


def run_pipeline(image: np.ndarray) -> PipelineOutput:
    """Preprocess → ORB → ROI crop → model input, exactly as the client does."""
    gray = preprocess(image)
    orb = extract_orb(gray)
    crop = roi_crop(gray, orb.points)
    return PipelineOutput(gray=gray, orb=orb, crop=crop, tensor=to_model_input(crop))


def to_capture_frame(image: np.ndarray, size: int = CAPTURE_SIZE) -> np.ndarray:
    """Centre-square crop resized to ``size``: the framing the client camera produces.

    OEM reference photos can come from any camera at any resolution; without this step their
    texture scale would differ from what the scanner sees and genuine items would not match.
    """
    h, w = image.shape[:2]
    side = min(h, w)
    y0, x0 = (h - side) // 2, (w - side) // 2
    crop = image[y0 : y0 + side, x0 : x0 + side]
    interpolation = cv2.INTER_AREA if side > size else cv2.INTER_LINEAR
    return np.asarray(cv2.resize(crop, (size, size), interpolation=interpolation))


def load_image(path: str) -> np.ndarray:
    """Read an image from disk (BGR or gray)."""
    img = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise FileNotFoundError(path)
    return img
