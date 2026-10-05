// @vitest-environment node
/** Runs the real OpenCV.js WASM build in Node against a synthetic frame. */
import { describe, expect, it, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import { __setOpenCVForTests, initializeOpenCV, loadOpenCV, type CV } from './opencv';
import { denoise, normalizeIllumination, preprocess, roiCrop, toGrayscale } from './preprocess';
import { extractOrb, matchDescriptors } from './orb';

let cv: CV;
function frame(size = 256, seed = 1): ImageData {
  const data = new Uint8ClampedArray(size * size * 4);
  let s = seed;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const stripes = Math.sin(x * 0.7) > 0 ? 200 : 60;
      const block = (x >> 4) % 3 === 0 && (y >> 4) % 2 === 0 ? 40 : 0;
      const v = Math.max(0, Math.min(255, stripes - block + (s % 20)));
      const i = (y * size + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  return { data, width: size, height: size, colorSpace: 'srgb' } as ImageData;
}

describe('OpenCV.js preprocessing pipeline', () => {
  beforeAll(async () => {
    // Vitest's module runner never resolves a dynamic import of this CJS/emscripten bundle, so the
    // test loads it natively; the browser path (loadOpenCV → import()) is exercised by Playwright.
    const require = createRequire(import.meta.url);
    __setOpenCVForTests(await initializeOpenCV(require('@techstark/opencv-js')));
    cv = await loadOpenCV();
  }, 120_000);

  it('grayscale → CLAHE → denoise keeps size and single channel', () => {
    const rgba = cv.matFromImageData(frame());
    const gray = toGrayscale(cv, rgba);
    expect(gray.channels()).toBe(1);
    expect([gray.rows, gray.cols]).toEqual([256, 256]);
    const eq = normalizeIllumination(cv, gray);
    const dn = denoise(cv, eq);
    expect(dn.channels()).toBe(1);
    rgba.delete();
    gray.delete();
    eq.delete();
    dn.delete();
  });

  it('extracts ≤500 ORB keypoints with 32-byte descriptors and crops a 128² ROI', () => {
    const rgba = cv.matFromImageData(frame());
    const gray = preprocess(cv, rgba);
    const feats = extractOrb(cv, gray);
    expect(feats.count).toBeGreaterThan(20);
    expect(feats.count).toBeLessThanOrEqual(500);
    expect(feats.descriptors.length).toBe(feats.count * 32);
    const { tensor, rect } = roiCrop(cv, gray, feats.points);
    expect(tensor.length).toBe(128 * 128);
    expect(rect.side).toBe(192);
    expect(Math.max(...tensor)).toBeLessThanOrEqual(1);
    expect(Math.min(...tensor)).toBeGreaterThanOrEqual(0);
    // Same frame matches itself; a different frame does not.
    const same = matchDescriptors(feats.descriptors, feats.descriptors);
    expect(same.ratio).toBe(1);
    const rgba2 = cv.matFromImageData(frame(256, 99));
    const gray2 = preprocess(cv, rgba2);
    const feats2 = extractOrb(cv, gray2);
    expect(matchDescriptors(feats2.descriptors, feats.descriptors).ratio).toBeLessThan(same.ratio);
    rgba.delete();
    gray.delete();
    rgba2.delete();
    gray2.delete();
  });
});
