'use client';
/**
 * On-device latency benchmark harness (plan §10.2/§14). Runs N embedding forward passes on each
 * available backend and reports p50/p95/p99. "Download JSON" produces the file consumed by
 * `authentic-edge-ml evaluate --latency-json`.
 */
import { useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import { selectBackend } from '@/lib/inference/backend';
import { loadEmbeddingModel } from '@/lib/inference/model';
import { embed } from '@/lib/inference/siamese';
import { env } from '@/lib/env';

interface Run {
  backend: string;
  device: string;
  n: number;
  p50: number;
  p95: number;
  p99: number;
  numTensorsDelta: number;
}

function pct(sorted: number[], p: number): number {
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i] ?? 0;
}

export default function BenchPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [status, setStatus] = useState('idle');
  const [n, setN] = useState(100);

  const run = async () => {
    const out: Run[] = [];
    const device = `${navigator.userAgent.slice(0, 80)} / ${navigator.hardwareConcurrency ?? '?'} cores / ${(navigator as { deviceMemory?: number }).deviceMemory ?? '?'} GB`;
    for (const backend of ['webgl', 'wasm'] as const) {
      setStatus(`loading ${backend}`);
      const selected = await selectBackend(backend);
      if (selected !== backend) continue;
      const { model, metadata } = await loadEmbeddingModel(env.modelManifestUrl);
      const size = metadata.inputSize;
      const input = new Float32Array(size * size).map(() => Math.random());
      for (let i = 0; i < 5; i++) embed(model, input, size); // warm-up
      const before = tf.memory().numTensors;
      const times: number[] = [];
      for (let i = 0; i < n; i++) {
        const t0 = performance.now();
        embed(model, input, size);
        times.push(performance.now() - t0);
        if (i % 10 === 0) setStatus(`${backend}: ${i}/${n}`);
        await new Promise((r) => setTimeout(r, 0));
      }
      const after = tf.memory().numTensors;
      times.sort((a, b) => a - b);
      out.push({
        backend,
        device,
        n,
        p50: pct(times, 50),
        p95: pct(times, 95),
        p99: pct(times, 99),
        numTensorsDelta: after - before,
      });
      setRuns([...out]);
    }
    setStatus('done');
  };

  const download = () => {
    const blob = new Blob(
      [JSON.stringify({ runs, generatedAt: new Date().toISOString() }, null, 2)],
      { type: 'application/json' },
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'latency-benchmark.json';
    a.click();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Inference latency benchmark</h1>
      <label className="block space-y-1">
        <span className="text-sm">Iterations</span>
        <input
          className="input"
          type="number"
          min={10}
          max={1000}
          value={n}
          onChange={(e) => setN(Number(e.target.value))}
        />
      </label>
      <button className="btn-primary w-full" onClick={() => void run()}>
        Run
      </button>
      <p className="text-sm text-slate-600">{status}</p>
      {runs.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th>backend</th>
              <th>p50</th>
              <th>p95</th>
              <th>p99</th>
              <th>Δtensors</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.backend}>
                <td>{r.backend}</td>
                <td>{r.p50.toFixed(1)} ms</td>
                <td>{r.p95.toFixed(1)} ms</td>
                <td>{r.p99.toFixed(1)} ms</td>
                <td>{r.numTensorsDelta}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {runs.length > 0 && (
        <button className="btn-secondary w-full" onClick={download}>
          Download JSON
        </button>
      )}
    </div>
  );
}
