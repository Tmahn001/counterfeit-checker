// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { currentBackend, selectBackend } from './backend';

describe('selectBackend', () => {
  it('falls back gracefully when neither WebGL nor WASM are available', async () => {
    const chosen = await selectBackend();
    expect(['wasm', 'cpu']).toContain(chosen);
    expect(currentBackend()).toBe(chosen);
    // Explicit preference for an unavailable backend still resolves.
    expect(['wasm', 'cpu']).toContain(await selectBackend('webgl'));
  });
});
