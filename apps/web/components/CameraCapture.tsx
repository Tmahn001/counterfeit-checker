'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { frameQuality, type FrameQuality } from '@/lib/vision/blur';
import { t } from '@/lib/i18n';

export type CameraError = 'camera_denied' | 'camera_unavailable' | 'camera_insecure';

interface Props {
  readonly disabled?: boolean;
  readonly onCapture: (frame: ImageData) => void;
  readonly onError: (code: CameraError, message: string) => void;
  /** Longest side of the captured frame handed to the pipeline. */
  readonly captureSize?: number;
  /** Button text; defaults to the scanner's "Capture". */
  readonly captureLabel?: string;
}

const GUIDE_INTERVAL_MS = 150;
const GUIDE_SIZE = 96;

/**
 * Rear-camera preview with a live framing/sharpness guide (plan §9.5). Frames never leave this
 * component except as an in-memory ImageData handed to the pipeline.
 */
export function CameraCapture({
  disabled,
  onCapture,
  onError,
  captureSize = 512,
  captureLabel,
}: Props) {
  const d = t();
  const videoRef = useRef<HTMLVideoElement>(null);
  const guideCanvas = useRef<HTMLCanvasElement | null>(null);
  const [quality, setQuality] = useState<FrameQuality | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    if (!window.isSecureContext) {
      onError('camera_insecure', d.scan.cameraInsecure);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      onError('camera_unavailable', d.scan.cameraUnavailable);
      return;
    }
    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((tr) => tr.stop());
          return;
        }
        stream = s;
        const v = videoRef.current;
        if (v) {
          v.srcObject = s;
          void v.play().then(() => setReady(true));
        }
      })
      .catch((err: unknown) => {
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'NotAllowedError' || name === 'SecurityError')
          onError('camera_denied', d.scan.cameraDenied);
        else onError('camera_unavailable', d.scan.cameraUnavailable);
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((tr) => tr.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live guidance: cheap Laplacian-variance sharpness + exposure on a tiny downsample.
  useEffect(() => {
    if (!ready) return;
    const canvas = guideCanvas.current ?? document.createElement('canvas');
    guideCanvas.current = canvas;
    canvas.width = GUIDE_SIZE;
    canvas.height = GUIDE_SIZE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const timer = setInterval(() => {
      const v = videoRef.current;
      if (!v || !ctx || v.readyState < 2) return;
      const side = Math.min(v.videoWidth, v.videoHeight) * 0.6;
      ctx.drawImage(
        v,
        (v.videoWidth - side) / 2,
        (v.videoHeight - side) / 2,
        side,
        side,
        0,
        0,
        GUIDE_SIZE,
        GUIDE_SIZE,
      );
      setQuality(frameQuality(ctx.getImageData(0, 0, GUIDE_SIZE, GUIDE_SIZE)));
    }, GUIDE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [ready]);

  const capture = useCallback(() => {
    const v = videoRef.current;
    if (!v || v.readyState < 2) return;
    const side = Math.min(v.videoWidth, v.videoHeight);
    const canvas = document.createElement('canvas');
    canvas.width = captureSize;
    canvas.height = captureSize;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(
      v,
      (v.videoWidth - side) / 2,
      (v.videoHeight - side) / 2,
      side,
      side,
      0,
      0,
      captureSize,
      captureSize,
    );
    onCapture(ctx.getImageData(0, 0, captureSize, captureSize));
  }, [captureSize, onCapture]);

  const hint = !ready
    ? d.scan.hold
    : quality?.reason === 'blurry'
      ? d.scan.blurry
      : quality?.reason === 'dark'
        ? d.scan.dark
        : d.scan.ready;

  return (
    <div className="space-y-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          className="h-full w-full object-cover"
          aria-label="Camera preview"
        />
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-[18%] rounded-xl border-4 transition-colors ${quality?.ok ? 'border-brand-500' : 'border-white/70'}`}
        />
      </div>
      <p role="status" className="text-center text-sm text-slate-700" data-testid="capture-hint">
        {hint}
      </p>
      <button
        type="button"
        className="btn-primary w-full"
        onClick={capture}
        disabled={disabled || !ready}
        data-testid="capture-button"
      >
        {captureLabel ?? d.scan.capture}
      </button>
    </div>
  );
}
