import { describe, expect, it } from 'vitest';
import { DESCRIPTOR_BYTES, descriptorsFromBase64, hamming, matchDescriptors } from './orb';
import { frameQuality } from './blur';
import { median } from './preprocess';

function desc(rows: number[][]): Uint8Array {
  const out = new Uint8Array(rows.length * DESCRIPTOR_BYTES);
  rows.forEach((r, i) => out.set(r, i * DESCRIPTOR_BYTES));
  return out;
}
const rnd = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed % 256;
};
function randomRow(seed: number): number[] {
  const r = rnd(seed);
  return Array.from({ length: DESCRIPTOR_BYTES }, () => r());
}

describe('hamming', () => {
  it('counts differing bits', () => {
    const a = desc([new Array<number>(32).fill(0)]);
    const b = desc([[0xff, 0x0f, ...new Array<number>(30).fill(0)]]);
    expect(hamming(a, 0, b, 0)).toBe(12);
    expect(hamming(a, 0, a, 0)).toBe(0);
  });
});

describe('matchDescriptors', () => {
  const baseline = desc(Array.from({ length: 40 }, (_, i) => randomRow(i + 1)));
  it('matches identical descriptors', () => {
    const { good, ratio } = matchDescriptors(baseline, baseline);
    expect(good).toBe(40);
    expect(ratio).toBe(1);
  });
  it('rejects unrelated descriptors (ratio test + hamming threshold)', () => {
    const other = desc(Array.from({ length: 40 }, (_, i) => randomRow(1000 + i)));
    expect(matchDescriptors(other, baseline).ratio).toBeLessThan(0.1);
  });
  it('tolerates a few flipped bits but not many', () => {
    const noisy = new Uint8Array(baseline);
    for (let i = 0; i < noisy.length; i += 7) noisy[i] = (noisy[i] ?? 0) ^ 0x01; // ~5 bits per descriptor
    expect(matchDescriptors(noisy, baseline).ratio).toBeGreaterThan(0.9);
    const wrecked = new Uint8Array(baseline);
    for (let i = 0; i < wrecked.length; i++) wrecked[i] = (wrecked[i] ?? 0) ^ 0xaa;
    expect(matchDescriptors(wrecked, baseline).ratio).toBeLessThan(0.1);
  });
  it('handles empty inputs', () => {
    expect(matchDescriptors(new Uint8Array(0), baseline)).toEqual({ good: 0, ratio: 0 });
  });
});

describe('descriptorsFromBase64', () => {
  it('round-trips', () => {
    const raw = desc([randomRow(3), randomRow(4)]);
    const b64 = Buffer.from(raw).toString('base64');
    expect(descriptorsFromBase64(b64)).toEqual(raw);
    expect(descriptorsFromBase64('').length).toBe(0);
  });
});

describe('frameQuality', () => {
  function img(fn: (x: number, y: number) => number, w = 32, h = 32): ImageData {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const v = fn(x, y);
        const i = (y * w + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = v;
        data[i + 3] = 255;
      }
    return { data, width: w, height: h, colorSpace: 'srgb' } as ImageData;
  }
  it('flags dark, blurry and sharp frames', () => {
    expect(frameQuality(img(() => 10)).reason).toBe('dark');
    expect(frameQuality(img(() => 128)).reason).toBe('blurry');
    expect(frameQuality(img((x) => (x % 2 ? 255 : 60))).reason).toBe('ok');
  });
});

describe('median', () => {
  it('handles odd/even/empty', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});
