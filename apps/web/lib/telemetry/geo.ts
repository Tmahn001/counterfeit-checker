/**
 * Coarse location (LGA-level). We never transmit the raw fix: coordinates are rounded to two
 * decimals (~1.1 km) and mapped to a state/LGA code from a small offline lookup of Nigerian
 * state centroids (LGA resolution is refined when the OEM/regulator ships a full LGA table).
 */
import type { CoarseGeo } from '@authentic-edge/shared-types';

/** Approximate state centroids (lat, lng). Enough to attribute a scan to a state offline. */
export const STATE_CENTROIDS: ReadonlyArray<readonly [string, string, number, number]> = [
  ['LA', 'Lagos', 6.52, 3.38],
  ['FC', 'Abuja FCT', 9.06, 7.49],
  ['KN', 'Kano', 12.0, 8.52],
  ['RV', 'Rivers', 4.82, 7.03],
  ['OY', 'Oyo', 7.85, 3.93],
  ['KD', 'Kaduna', 10.52, 7.44],
  ['EN', 'Enugu', 6.45, 7.51],
  ['AN', 'Anambra', 6.21, 6.99],
  ['DE', 'Delta', 5.53, 5.9],
  ['ED', 'Edo', 6.34, 5.62],
  ['OG', 'Ogun', 7.16, 3.35],
  ['KW', 'Kwara', 8.5, 4.55],
  ['PL', 'Plateau', 9.22, 9.52],
  ['BO', 'Borno', 11.85, 13.15],
  ['AK', 'Akwa Ibom', 5.0, 7.85],
  ['CR', 'Cross River', 5.87, 8.6],
  ['IM', 'Imo', 5.49, 7.03],
  ['AB', 'Abia', 5.53, 7.49],
  ['ON', 'Ondo', 7.25, 5.2],
  ['OS', 'Osun', 7.56, 4.56],
  ['EK', 'Ekiti', 7.72, 5.31],
  ['KT', 'Katsina', 12.99, 7.6],
  ['SO', 'Sokoto', 13.06, 5.24],
  ['NI', 'Niger', 9.93, 5.6],
  ['BE', 'Benue', 7.34, 8.74],
  ['KO', 'Kogi', 7.8, 6.74],
  ['NA', 'Nasarawa', 8.54, 8.32],
  ['AD', 'Adamawa', 9.33, 12.4],
  ['BA', 'Bauchi', 10.31, 9.84],
  ['GO', 'Gombe', 10.29, 11.17],
  ['TA', 'Taraba', 8.0, 10.77],
  ['YO', 'Yobe', 12.29, 11.44],
  ['JI', 'Jigawa', 12.23, 9.56],
  ['ZA', 'Zamfara', 12.12, 6.22],
  ['KE', 'Kebbi', 11.5, 4.2],
  ['EB', 'Ebonyi', 6.26, 8.01],
  ['BY', 'Bayelsa', 4.77, 6.08],
];

export function nearestState(lat: number, lng: number): string {
  let best = 'LA';
  let bestD = Infinity;
  for (const [code, , clat, clng] of STATE_CENTROIDS) {
    const d = (lat - clat) ** 2 + (lng - clng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = code;
    }
  }
  return best;
}

export function coarsen(lat: number, lng: number): CoarseGeo {
  const state = nearestState(lat, lng);
  const round2 = (v: number) => Math.round(v * 100) / 100;
  return {
    state_code: state,
    lga_code:
      `${state}-${Math.abs(Math.round(lat * 10))}_${Math.abs(Math.round(lng * 10))}`.toUpperCase(),
    geo_lat_2dp: round2(lat),
    geo_lng_2dp: round2(lng),
  };
}

/** Ask for a coarse location; resolves null if denied/unavailable. Never blocks the scan flow. */
export function getCoarseGeo(timeoutMs = 4000): Promise<CoarseGeo | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    const done = (v: CoarseGeo | null) => resolve(v);
    navigator.geolocation.getCurrentPosition(
      (pos) => done(coarsen(pos.coords.latitude, pos.coords.longitude)),
      () => done(null),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 10 * 60 * 1000 },
    );
  });
}
