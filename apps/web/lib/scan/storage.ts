/** Session-scoped handoff of the last scan result between /scan and /scan/result (no image data). */
import type { ScanResult } from './machine';

export const RESULT_STORAGE_KEY = 'authentic-edge:last-result';

export function saveLastResult(result: ScanResult): void {
  try {
    sessionStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify(result));
  } catch {
    /* storage unavailable */
  }
}

export function loadLastResult(): ScanResult | null {
  try {
    const raw = sessionStorage.getItem(RESULT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ScanResult) : null;
  } catch {
    return null;
  }
}
