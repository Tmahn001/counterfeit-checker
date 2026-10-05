import type { ScanResult } from '@/lib/scan/machine';
import { t } from '@/lib/i18n';

const styles = {
  authentic: 'border-brand-500 bg-brand-50 text-brand-700',
  counterfeit: 'border-danger-500 bg-red-50 text-danger-600',
  inconclusive: 'border-warn-500 bg-amber-50 text-amber-800',
} as const;

export function VerdictCard({ result, onReset }: { result: ScanResult; onReset?: () => void }) {
  const d = t();
  const v = result.decision.verdict;
  const pct = Math.round(result.decision.confidence * 100);
  return (
    <section className={`card space-y-4 border-2 ${styles[v]}`} aria-labelledby="verdict-title">
      <div>
        <h2 id="verdict-title" className="text-2xl font-bold" data-testid="verdict">
          {d.result[v]}
        </h2>
        <p className="text-sm text-slate-700">
          {d.result.confidence}: <strong>{pct}%</strong>
        </p>
      </div>
      <p className="text-slate-800">{d.result.explain[v]}</p>
      <details className="rounded-lg bg-white/70 p-3 text-sm text-slate-700">
        <summary className="cursor-pointer font-medium">{d.result.details}</summary>
        <dl className="mt-2 grid grid-cols-2 gap-y-1">
          <dt>{d.result.distance}</dt>
          <dd>{result.decision.distance.toFixed(3)}</dd>
          <dt>{d.result.threshold}</dt>
          <dd>{result.decision.threshold.toFixed(3)}</dd>
          <dt>{d.result.orbMatches}</dt>
          <dd>
            {result.decision.orb
              ? `${result.decision.orb.good} / ${result.orbCount}`
              : `– / ${result.orbCount}`}
          </dd>
          <dt>{d.result.backend}</dt>
          <dd>{result.backend}</dd>
          <dt>{d.result.latency}</dt>
          <dd>
            {Math.round(result.timings.inferMs)} ms (total {Math.round(result.timings.totalMs)} ms)
          </dd>
          <dt>{d.result.modelVersion}</dt>
          <dd>{result.modelVersion}</dd>
        </dl>
      </details>
      <p className="text-xs text-slate-600">{d.result.reportSent}</p>
      {onReset && (
        <button className="btn-primary w-full" onClick={onReset}>
          {d.result.scanAnother}
        </button>
      )}
    </section>
  );
}
