'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { VerdictCard } from '@/components/VerdictCard';
import type { ScanResult } from '@/lib/scan/machine';
import { loadLastResult } from '@/lib/scan/storage';
import { t } from '@/lib/i18n';

export default function ResultPage() {
  const d = t();
  const [result, setResult] = useState<ScanResult | null>(null);
  useEffect(() => {
    setResult(loadLastResult());
  }, []);
  if (!result) {
    return (
      <div className="card text-center">
        <p className="text-slate-700">{d.result.inconclusive}</p>
        <Link href="/scan" className="btn-primary mt-3 w-full">
          {d.result.scanAnother}
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <VerdictCard result={result} />
      <Link href="/scan" className="btn-primary w-full">
        {d.result.scanAnother}
      </Link>
    </div>
  );
}
