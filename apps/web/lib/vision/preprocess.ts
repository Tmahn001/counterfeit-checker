/**
 * Preprocessing chain (plan §9.1), the TypeScript twin of `authentic_edge_ml.preprocessing`:
 *   1. grayscale  L = 0.299R + 0.587G + 0.114B  (cv.COLOR_RGBA2GRAY)
 *   2. CLAHE illumination normalisation (falls back to global equalisation)
 *   3. Non-Local Means denoising (falls back to a bilateral filter if the photo module is absent)
 * Every step is independently callable and testable against a fixed image.
 * All intermediate Mats are deleted; callers own the returned Mat.
 */
import type { PreprocessParams } from '@authentic-edge/shared-types';
import type { CV } from './opencv';
import type { Mat } from '@techstark/opencv-js';
import { DEFAULT_PREPROCESS } from './params';

/** OpenCV.js typings expose enum constants as `any`; read them through a typed accessor. */
export function cvConst(
  cv: CV,
  name: 'COLOR_RGBA2GRAY' | 'COLOR_RGB2GRAY' | 'BORDER_DEFAULT' | 'INTER_AREA',
): number {
  const v = (cv as unknown as Record<string, unknown>)[name];
  if (typeof v !== 'number') throw new Error(`OpenCV constant ${name} unavailable`);
  return v;
}

export function toGrayscale(cv: CV, rgba: Mat): Mat {
  const gray = new cv.Mat();
  if (rgba.channels() === 1) {
    rgba.copyTo(gray);
  } else {
    cv.cvtColor(
      rgba,
      gray,
      rgba.channels() === 4 ? cvConst(cv, 'COLOR_RGBA2GRAY') : cvConst(cv, 'COLOR_RGB2GRAY'),
    );
  }
  return gray;
}

export function normalizeIllumination(
  cv: CV,
  gray: Mat,
  p: PreprocessParams = DEFAULT_PREPROCESS,
): Mat {
  const out = new cv.Mat();
  try {
    const clahe = new cv.CLAHE(
      p.clahe_clip_limit,
      new cv.Size(p.clahe_tile_grid, p.clahe_tile_grid),
    );
    clahe.apply(gray, out);
    clahe.delete();
  } catch {
    cv.equalizeHist(gray, out);
  }
  return out;
}

export function denoise(cv: CV, gray: Mat, p: PreprocessParams = DEFAULT_PREPROCESS): Mat {
  const out = new cv.Mat();
  const nlm = (cv as unknown as { fastNlMeansDenoising?: (...a: unknown[]) => void })
    .fastNlMeansDenoising;
  if (p.denoise_method === 'nlm' && typeof nlm === 'function') {
    nlm.call(cv, gray, out, p.nlm_h, p.nlm_template_window, p.nlm_search_window);
  } else {
    // Bilateral: edge-preserving smoothing with the same parameters as the Python twin.
    cv.bilateralFilter(
      gray,
      out,
      p.bilateral_d,
      p.bilateral_sigma_color,
      p.bilateral_sigma_space,
      cvConst(cv, 'BORDER_DEFAULT'),
    );
  }
  return out;
}

/** Full chain; returns a new single-channel Mat the caller must delete. */
export function preprocess(cv: CV, rgba: Mat, p: PreprocessParams = DEFAULT_PREPROCESS): Mat {
  const gray = toGrayscale(cv, rgba);
  try {
    const eq = normalizeIllumination(cv, gray, p);
    try {
      return denoise(cv, eq, p);
    } finally {
      eq.delete();
    }
  } finally {
    gray.delete();
  }
}

/**
 * Square ROI centred on the median keypoint, resized to `input_size` and scaled to [0,1].
 * Returns a Float32Array of length input_size² in row-major order (H, W, 1).
 */
export function roiCrop(
  cv: CV,
  gray: Mat,
  points: ReadonlyArray<readonly [number, number]>,
  p: PreprocessParams = DEFAULT_PREPROCESS,
): { readonly tensor: Float32Array; readonly rect: { x: number; y: number; side: number } } {
  const h = gray.rows;
  const w = gray.cols;
  const side = Math.max(8, Math.round(Math.min(h, w) * p.roi_fraction));
  let cx = w / 2;
  let cy = h / 2;
  if (points.length > 0) {
    cx = median(points.map((pt) => pt[0]));
    cy = median(points.map((pt) => pt[1]));
  }
  const x0 = Math.round(Math.min(Math.max(cx - side / 2, 0), w - side));
  const y0 = Math.round(Math.min(Math.max(cy - side / 2, 0), h - side));
  const roi = gray.roi(new cv.Rect(x0, y0, side, side));
  const resized = new cv.Mat();
  try {
    cv.resize(
      roi,
      resized,
      new cv.Size(p.input_size, p.input_size),
      0,
      0,
      cvConst(cv, 'INTER_AREA'),
    );
    const n = p.input_size * p.input_size;
    const tensor = new Float32Array(n);
    const data = resized.data;
    for (let i = 0; i < n; i++) tensor[i] = (data[i] ?? 0) / 255;
    return { tensor, rect: { x: x0, y: y0, side } };
  } finally {
    roi.delete();
    resized.delete();
  }
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/** Convert an ImageData (RGBA) into an OpenCV Mat. Caller deletes. */
export function matFromImageData(cv: CV, image: ImageData): Mat {
  return cv.matFromImageData(image);
}
