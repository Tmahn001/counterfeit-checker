/**
 * Cheap capture-guidance metrics computed on a downsampled frame without OpenCV:
 * variance of the Laplacian (sharpness) and mean luma (exposure). Runs every ~150 ms on the
 * live preview so users fix framing before an expensive full pipeline run.
 */
export interface FrameQuality {
  readonly sharpness: number;
  readonly meanLuma: number;
  readonly ok: boolean;
  readonly reason: 'ok' | 'blurry' | 'dark';
}

export const SHARPNESS_MIN = 60;
export const LUMA_MIN = 40;

export function frameQuality(data: ImageData): FrameQuality {
  const { width, height } = data;
  const px = data.data;
  const gray = new Float32Array(width * height);
  let sum = 0;
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const v = 0.299 * (px[i] ?? 0) + 0.587 * (px[i + 1] ?? 0) + 0.114 * (px[i + 2] ?? 0);
    gray[j] = v;
    sum += v;
  }
  const meanLuma = sum / gray.length;
  let lapSum = 0;
  let lapSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap =
        -4 * (gray[i] ?? 0) +
        (gray[i - 1] ?? 0) +
        (gray[i + 1] ?? 0) +
        (gray[i - width] ?? 0) +
        (gray[i + width] ?? 0);
      lapSum += lap;
      lapSq += lap * lap;
      n++;
    }
  }
  const mean = n ? lapSum / n : 0;
  const sharpness = n ? lapSq / n - mean * mean : 0;
  const reason: FrameQuality['reason'] =
    meanLuma < LUMA_MIN ? 'dark' : sharpness < SHARPNESS_MIN ? 'blurry' : 'ok';
  return { sharpness, meanLuma, ok: reason === 'ok', reason };
}
