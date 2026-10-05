import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORES, __resetDbForTests, idb } from './idb';
import { listProducts, loadCatalogue, refreshFromApi } from './catalogue';

const file = {
  version: '1',
  products: [
    {
      slug: 'cway-table-water-75cl',
      display_name: 'CWAY Table Water 75cl',
      manufacturer: 'CWAY',
      pack: '75 cl',
      sector: 'food_beverage',
    },
    {
      slug: 'gala-sausage-roll',
      display_name: 'Gala Sausage Roll',
      manufacturer: 'UAC Foods',
      pack: 'roll',
      sector: 'food_beverage',
    },
  ],
};
const baseline = {
  embedding: new Array<number>(128).fill(0.1),
  orb_descriptors_b64: 'A'.repeat(172),
  image_count: 6,
  model_version: '1.0.0',
  completed_at: null,
};

describe('product catalogue', () => {
  beforeEach(() => {
    indexedDB = new IDBFactory();
    __resetDbForTests();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('loads the static catalogue once and lists every product as pending', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(file)));
    vi.stubGlobal('fetch', fetchMock);
    expect(await loadCatalogue('/catalogue/v1/products.json')).toHaveLength(2);
    expect(await loadCatalogue('/catalogue/v1/products.json')).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const rows = await listProducts();
    expect(rows.map((r) => [r.slug, r.hasBaseline])).toEqual([
      ['cway-table-water-75cl', false],
      ['gala-sausage-roll', false],
    ]);
  });

  it('merges registry baselines, puts scannable products first, and keeps bundled demo baselines', async () => {
    await idb.put(STORES.baselines, {
      product_category: 'synthetic_product_01',
      display_name: 'Synthetic Product 01',
      embedding: [],
      orb_descriptors_b64: '',
      orb_keypoint_count: 0,
      image_count: 1,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(file))));
    await loadCatalogue('/x');
    const registry = {
      model_version: '1.0.0',
      products: [
        { ...file.products[0], baseline: null },
        { ...file.products[1], baseline },
        {
          slug: 'new-product',
          display_name: 'A New Product',
          manufacturer: '',
          pack: '',
          sector: 'food_beverage',
          baseline: { ...baseline, model_version: '0.9.0' },
        },
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(registry))));
    expect(await refreshFromApi('http://api', '1.0.0')).toBe(1); // stale-model signature ignored
    const rows = await listProducts();
    expect(rows.map((r) => [r.slug, r.hasBaseline])).toEqual([
      ['gala-sausage-roll', true],
      ['synthetic_product_01', true],
      ['new-product', false],
      ['cway-table-water-75cl', false],
    ]);
    const stored = await idb.get<{ orb_keypoint_count: number }>(
      STORES.baselines,
      'gala-sausage-roll',
    );
    expect(stored?.orb_keypoint_count).toBe(4);
  });

  it('surfaces registry failures to the caller', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 503 })));
    await expect(refreshFromApi('http://api')).rejects.toThrow(/503/);
  });
});
