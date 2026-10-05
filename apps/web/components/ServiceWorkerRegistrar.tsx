'use client';
import { useEffect, useState } from 'react';

/** Registers the Workbox service worker (production builds only) and surfaces update prompts. */
export function ServiceWorkerRegistrar() {
  const [updateReady, setUpdateReady] = useState<(() => void) | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    let cancelled = false;
    void import('workbox-window').then(({ Workbox }) => {
      if (cancelled) return;
      const wb = new Workbox('/sw.js');
      wb.addEventListener('waiting', () => {
        setUpdateReady(() => () => {
          wb.addEventListener('controlling', () => window.location.reload());
          void wb.messageSkipWaiting();
        });
      });
      void wb.register();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!updateReady) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-50 flex items-center justify-between gap-3 rounded-xl bg-slate-900 p-4 text-white shadow-lg"
    >
      <span className="text-sm">A new version is available.</span>
      <button
        className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-900"
        onClick={updateReady}
      >
        Update
      </button>
    </div>
  );
}
