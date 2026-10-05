/**
 * Product catalogue cache.
 *
 * The catalogue (names, manufacturers) ships as a static file so the picker works offline from the
 * first load. When the device is online the registry endpoint is consulted for (a) new products
 * and (b) baseline signatures generated from OEM reference sets, which are merged into the same
 * IndexedDB store the pipeline reads. None of this runs inside the authentication path.
 */
import type {
  BaselineSignature,
  Product,
  ProductCatalogueFile,
  ProductCatalogueResponse,
} from '@authentic-edge/shared-types';
import { STORES, idb } from './idb';

export interface CatalogueEntry extends Product {
  /** False = listed but not scannable yet ("reference pending"). */
  readonly hasBaseline: boolean;
}

export async function loadCatalogue(url: string): Promise<Product[]> {
  let cached: Product[] = [];
  try {
    cached = await idb.getAll<Product>(STORES.catalogue);
  } catch {
    cached = [];
  }
  if (cached.length > 0) return cached;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`catalogue fetch failed: ${res.status}`);
  const file = (await res.json()) as ProductCatalogueFile;
  await storeProducts(file.products);
  return [...file.products];
}

async function storeProducts(products: readonly Product[]): Promise<void> {
  try {
    for (const p of products) await idb.put(STORES.catalogue, p);
  } catch {
    /* storage unavailable */
  }
}

/** Merge the live registry into the local stores. Returns the number of baselines received. */
export async function refreshFromApi(
  apiBaseUrl: string,
  currentModelVersion?: string,
): Promise<number> {
  const res = await fetch(`${apiBaseUrl}/api/v1/products/`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`registry fetch failed: ${res.status}`);
  const body = (await res.json()) as ProductCatalogueResponse;
  let received = 0;
  for (const { baseline, ...product } of body.products) {
    await idb.put(STORES.catalogue, product);
    if (!baseline) continue;
    // A signature only means something under the model that produced it.
    if (currentModelVersion && baseline.model_version !== currentModelVersion) continue;
    const signature: BaselineSignature = {
      product_category: product.slug,
      display_name: product.display_name,
      embedding: baseline.embedding,
      orb_descriptors_b64: baseline.orb_descriptors_b64,
      orb_keypoint_count: Math.floor((baseline.orb_descriptors_b64.length * 3) / 4 / 32),
      image_count: baseline.image_count,
    };
    await idb.put(STORES.baselines, signature);
    received++;
  }
  return received;
}

/** Catalogue ∪ baselines, scannable products first, then alphabetical. */
export async function listProducts(): Promise<CatalogueEntry[]> {
  const [products, baselines] = await Promise.all([
    idb.getAll<Product>(STORES.catalogue).catch(() => [] as Product[]),
    idb.getAll<BaselineSignature>(STORES.baselines).catch(() => [] as BaselineSignature[]),
  ]);
  const withBaseline = new Set(baselines.map((b) => b.product_category));
  const bySlug = new Map<string, CatalogueEntry>();
  for (const p of products) bySlug.set(p.slug, { ...p, hasBaseline: withBaseline.has(p.slug) });
  for (const b of baselines) {
    if (!bySlug.has(b.product_category)) {
      bySlug.set(b.product_category, {
        slug: b.product_category,
        display_name: b.display_name,
        manufacturer: '',
        pack: '',
        sector: 'demo',
        hasBaseline: true,
      });
    }
  }
  return [...bySlug.values()].sort(
    (a, b) =>
      Number(b.hasBaseline) - Number(a.hasBaseline) || a.display_name.localeCompare(b.display_name),
  );
}
