/** Build-time public configuration (see apps/web/.env.example). */
/**
 * API origin. Empty means same-origin (nginx proxies /api in production and in the `make https`
 * dev front door). The one exception is the bare `next dev` server on port 3000, which cannot
 * proxy Django, so it talks to the api container's published port directly.
 */
function apiBaseUrl(): string {
  const configured = (process.env.NEXT_PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');
  if (configured) return configured;
  if (typeof window !== 'undefined' && window.location.port === '3000')
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  return '';
}

export const env = {
  get apiBaseUrl(): string {
    return apiBaseUrl();
  },
  modelManifestUrl: process.env.NEXT_PUBLIC_MODEL_MANIFEST_URL ?? '/models/v1/model.json',
  baselinesUrl: process.env.NEXT_PUBLIC_BASELINES_URL ?? '/baselines/v1/baselines.json',
  catalogueUrl: process.env.NEXT_PUBLIC_CATALOGUE_URL ?? '/catalogue/v1/products.json',
  sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? '',
  appVersion: '0.1.0',
} as const;
