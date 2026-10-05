'use client';
import { useEffect, useState } from 'react';
import { env } from '@/lib/env';
import {
  listProducts,
  loadCatalogue,
  refreshFromApi,
  type CatalogueEntry,
} from '@/lib/storage/catalogue';

interface Props {
  readonly label: string;
  readonly pendingSuffix: string;
  readonly value: string;
  readonly onChange: (v: string) => void;
}

/**
 * Lists the product catalogue. Products without a reference signature are shown as pending; picking
 * one yields the graceful "no baseline" message instead of a verdict.
 */
export function ProductPicker({ label, pendingSuffix, value, onChange }: Props) {
  const [options, setOptions] = useState<CatalogueEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      listProducts()
        .then((rows) => {
          if (cancelled) return;
          setOptions(rows);
          const firstScannable = rows.find((r) => r.hasBaseline);
          if (!value && firstScannable) onChange(firstScannable.slug);
        })
        .catch(() => undefined);
    void loadCatalogue(env.catalogueUrl)
      .catch(() => undefined)
      .then(refresh)
      .then(() => (navigator.onLine ? refreshFromApi(env.apiBaseUrl).then(refresh) : undefined))
      .catch(() => undefined);
    // Baselines are written by the engine worker on first run; poll until they show up.
    const timer = setInterval(() => void refresh(), 1500);
    const stop = setTimeout(() => clearInterval(timer), 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      clearTimeout(stop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <select
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid="product-picker"
      >
        {options.length === 0 && <option value="">Loading…</option>}
        {options.map((o) => (
          <option key={o.slug} value={o.slug}>
            {o.display_name}
            {o.hasBaseline ? '' : ` — ${pendingSuffix}`}
          </option>
        ))}
      </select>
    </label>
  );
}
