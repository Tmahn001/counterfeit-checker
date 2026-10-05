import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScanProgress } from './ScanProgress';
import { VerdictCard } from './VerdictCard';
import type { ScanResult } from '@/lib/scan/machine';

const result: ScanResult = {
  decision: {
    verdict: 'counterfeit',
    confidence: 0.93,
    distance: 1.1,
    threshold: 0.5,
    score: -0.93,
    orb: { good: 12, ratio: 0.1 },
  },
  productCategory: 'x',
  modelVersion: '1.0.0',
  backend: 'wasm',
  orbCount: 300,
  timings: { preprocessMs: 10, orbMs: 20, inferMs: 30, totalMs: 60 },
};

describe('ScanProgress', () => {
  it.each([
    ['capturing', 'Capturing frame'],
    ['preprocessing', 'Cleaning up the image'],
    ['extracting_features', 'Reading the print pattern'],
    ['inferring', 'Comparing with the manufacturer reference'],
  ] as const)('renders %s', (status, label) => {
    const state =
      status === 'capturing'
        ? { status }
        : status === 'inferring'
          ? { status, startedAt: 0, orbCount: 1 }
          : { status, startedAt: 0 };
    render(<ScanProgress state={state} />);
    expect(screen.getByTestId('scan-status')).toHaveTextContent(label);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});

describe('VerdictCard', () => {
  it('shows the verdict, confidence, explanation and technical details', () => {
    const onReset = vi.fn();
    render(<VerdictCard result={result} onReset={onReset} />);
    expect(screen.getByTestId('verdict')).toHaveTextContent('Likely counterfeit');
    expect(screen.getByText(/93%/)).toBeInTheDocument();
    expect(screen.getByText(/report it to your pharmacist/)).toBeInTheDocument();
    expect(screen.getByText('12 / 300')).toBeInTheDocument();
    expect(screen.getByText('wasm')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Scan another product'));
    expect(onReset).toHaveBeenCalled();
  });
  it('renders authentic and inconclusive variants', () => {
    const { rerender } = render(
      <VerdictCard
        result={{ ...result, decision: { ...result.decision, verdict: 'authentic' } }}
      />,
    );
    expect(screen.getByTestId('verdict')).toHaveTextContent('Likely genuine');
    rerender(
      <VerdictCard
        result={{ ...result, decision: { ...result.decision, verdict: 'inconclusive' } }}
      />,
    );
    expect(screen.getByTestId('verdict')).toHaveTextContent('Could not decide');
  });
});
