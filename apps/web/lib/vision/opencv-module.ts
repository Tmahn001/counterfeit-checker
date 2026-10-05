/**
 * Isolated static import of OpenCV.js.
 *
 * Why not `import('@techstark/opencv-js')` directly? The emscripten Module exposes a `then`
 * method, and webpack's dynamic-import interop hands such a thenable straight back to the
 * promise machinery, which then adopts it forever (the callback receives the thenable itself) and
 * freezes the main thread. Dynamically importing *this* ES module keeps the 10 MB bundle in a
 * lazy chunk while the promise resolves to a plain namespace object instead of the thenable.
 */
import cv from '@techstark/opencv-js';

export function getOpenCVModule(): unknown {
  return cv;
}
