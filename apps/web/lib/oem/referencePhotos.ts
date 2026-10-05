/**
 * Reference-photo helpers for the OEM portal.
 *
 * A baseline signature must be computed from frames with the same geometry the scanner sees, or a
 * genuine item scanned later will not match its own reference. The scanner (CameraCapture) takes the
 * centre square of the camera frame and scales it to CAPTURE_SIZE; every reference photo goes
 * through the same transform here, whether it came from the in-app camera or from a file. The API
 * applies the same normalisation again as a safety net for uploads that bypass this page.
 */
export const CAPTURE_SIZE = 512;
export const MIN_PHOTOS = 5;
export const MAX_PHOTOS = 200;
export const RECOMMENDED_PHOTOS = 15;

function canvasToFile(canvas: HTMLCanvasElement, name: string): Promise<File> {
  return new Promise((resolve, reject) => {
    // PNG, not JPEG: compression artefacts would blur the micro-print the model compares.
    canvas.toBlob((blob) => {
      if (blob) resolve(new File([blob], name, { type: 'image/png' }));
      else reject(new Error('could not encode image'));
    }, 'image/png');
  });
}

/** A frame from the in-app camera (already CAPTURE_SIZE square) as an uploadable file. */
export function frameToFile(frame: ImageData, name: string): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = frame.width;
  canvas.height = frame.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('canvas unavailable'));
  ctx.putImageData(frame, 0, 0);
  return canvasToFile(canvas, name);
}

/** Centre-square crop + resize to CAPTURE_SIZE, exactly as the scanner frames a capture. */
export async function normalizePhoto(file: File, size = CAPTURE_SIZE): Promise<File> {
  const bitmap = await createImageBitmap(file); // honours EXIF orientation
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas unavailable');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      size,
      size,
    );
    return await canvasToFile(canvas, `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.png`);
  } finally {
    bitmap.close();
  }
}

/** What the submit area should say, given the current selection. */
export function uploadHint(
  productChosen: boolean,
  count: number,
): { ready: boolean; key: 'chooseProduct' | 'needMore' | 'tooMany' | 'ready'; missing: number } {
  if (!productChosen)
    return { ready: false, key: 'chooseProduct', missing: Math.max(0, MIN_PHOTOS - count) };
  if (count > MAX_PHOTOS) return { ready: false, key: 'tooMany', missing: 0 };
  if (count < MIN_PHOTOS) return { ready: false, key: 'needMore', missing: MIN_PHOTOS - count };
  return { ready: true, key: 'ready', missing: 0 };
}
