/**
 * Minimal promise wrapper over IndexedDB. Stores:
 *  - settings   (key/value: model metadata, active product, install state)
 *  - baselines  (BaselineSignature by product_category)
 *  - telemetry  (outbound queue)
 */
const DB_NAME = 'authentic-edge';
const DB_VERSION = 2;
export const STORES = {
  settings: 'settings',
  baselines: 'baselines',
  telemetry: 'telemetry',
  catalogue: 'catalogue',
} as const;
type StoreName = (typeof STORES)[keyof typeof STORES];

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.settings)) db.createObjectStore(STORES.settings);
      if (!db.objectStoreNames.contains(STORES.baselines))
        db.createObjectStore(STORES.baselines, { keyPath: 'product_category' });
      if (!db.objectStoreNames.contains(STORES.telemetry))
        db.createObjectStore(STORES.telemetry, { autoIncrement: true });
      if (!db.objectStoreNames.contains(STORES.catalogue))
        db.createObjectStore(STORES.catalogue, { keyPath: 'slug' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
  return dbPromise;
}

function tx<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T> | IDBRequest,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
      }),
  );
}

export const idb = {
  get: <T>(store: StoreName, key: IDBValidKey) =>
    tx<T | undefined>(store, 'readonly', (s) => s.get(key)),
  getAll: <T>(store: StoreName) => tx<T[]>(store, 'readonly', (s) => s.getAll()),
  getAllKeys: (store: StoreName) => tx<IDBValidKey[]>(store, 'readonly', (s) => s.getAllKeys()),
  put: (store: StoreName, value: unknown, key?: IDBValidKey) =>
    tx<IDBValidKey>(store, 'readwrite', (s) =>
      key === undefined ? s.put(value) : s.put(value, key),
    ),
  add: (store: StoreName, value: unknown) =>
    tx<IDBValidKey>(store, 'readwrite', (s) => s.add(value)),
  delete: (store: StoreName, key: IDBValidKey) =>
    tx<undefined>(store, 'readwrite', (s) => s.delete(key)),
  clear: (store: StoreName) => tx<undefined>(store, 'readwrite', (s) => s.clear()),
};

export async function getSetting<T>(key: string): Promise<T | null> {
  try {
    const v = await idb.get<T>(STORES.settings, key);
    return v ?? null;
  } catch {
    return null;
  }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  try {
    await idb.put(STORES.settings, value, key);
  } catch {
    /* storage unavailable */
  }
}

/** Test hook. */
export function __resetDbForTests(): void {
  dbPromise = null;
}
