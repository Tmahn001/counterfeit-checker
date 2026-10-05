import { progressOf, type ScanState } from '@/lib/scan/machine';
import { t } from '@/lib/i18n';

export function ScanProgress({ state }: { state: ScanState }) {
  const d = t();
  const pct = Math.round(progressOf(state) * 100);
  return (
    <div aria-live="polite" className="space-y-2">
      <div className="flex justify-between text-sm">
        <span data-testid="scan-status">{d.scan.states[state.status]}</span>
        <span>{pct}%</span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className="bg-brand-600 h-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
