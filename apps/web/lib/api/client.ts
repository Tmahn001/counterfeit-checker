/**
 * Thin client for the Django administrative API — used only by the OEM portal pages. The scan
 * flow never imports this module.
 */
import type {
  DashboardSummary,
  ModelVersionResponse,
  OEMMe,
  ProductBaseline,
  ProductCatalogueResponse,
  SessionUser,
} from '@authentic-edge/shared-types';
import { env } from '../env';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const csrf = getCookie('csrftoken');
  if (csrf) headers.set('X-CSRFToken', csrf);
  if (!(init.body instanceof FormData) && init.body)
    headers.set('Content-Type', 'application/json');
  const res = await fetch(`${env.apiBaseUrl}${path}`, { ...init, headers, credentials: 'include' });
  if (res.status === 204) return undefined as T;
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = (body as { detail?: string } | null)?.detail ?? JSON.stringify(body);
    throw new ApiError(res.status, detail || res.statusText);
  }
  return body as T;
}

export const api = {
  latestModel: () => request<ModelVersionResponse>('/api/v1/models/latest/'),
  products: () => request<ProductCatalogueResponse>('/api/v1/products/'),
  models: () => request<ModelVersionResponse[]>('/api/v1/models/'),
  auth: {
    login: (email: string, password: string) =>
      request<SessionUser>('/api/v1/auth/login/', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    logout: () => request<void>('/api/v1/auth/logout/', { method: 'POST' }),
    me: () => request<SessionUser>('/api/v1/auth/me/'),
  },
  oem: {
    login: (email: string, password: string) =>
      request<OEMMe>('/api/v1/oem/auth/login/', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    logout: () => request<void>('/api/v1/oem/auth/logout/', { method: 'POST' }),
    me: () => request<OEMMe>('/api/v1/oem/auth/me/'),
    baselines: () => request<ProductBaseline[]>('/api/v1/oem/baselines/'),
    baseline: (id: string) =>
      request<ProductBaseline & { embedding_vector: number[] | null }>(
        `/api/v1/oem/baselines/${id}/`,
      ),
    upload: (productCategory: string, files: File[]) => {
      const fd = new FormData();
      fd.append('product_category', productCategory);
      for (const f of files) fd.append('images', f);
      return request<ProductBaseline>('/api/v1/oem/baselines/', { method: 'POST', body: fd });
    },
  },
  dashboard: (days = 30) => request<DashboardSummary>(`/api/v1/dashboard/summary/?days=${days}`),
};
