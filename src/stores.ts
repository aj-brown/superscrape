import type { StoreInfo } from './utils';
import type { StoreRecord } from './storage/types';
import { upsertStore } from './storage/repository';
import { getDatabase } from './storage/database';

/**
 * Sync stores to database (batch upsert, idempotent).
 */
export function syncStoresToDb(dbPath: string, stores: StoreInfo[]): void {
  if (stores.length === 0) {
    return;
  }

  const db = getDatabase(dbPath);
  const timestamp = new Date().toISOString();

  const transaction = db.transaction(() => {
    for (const store of stores) {
      const record: StoreRecord = {
        store_id: store.id,
        name: store.name,
        address: store.address,
        region: store.region,
        latitude: store.latitude,
        longitude: store.longitude,
        last_synced: timestamp,
      };
      upsertStore(dbPath, record);
    }
  });
  transaction();
}

/**
 * Get random sample of stores for testing.
 * Uses Fisher-Yates shuffle for unbiased sampling.
 */
export function sampleStores(stores: StoreInfo[], count: number): StoreInfo[] {
  if (count <= 0 || stores.length === 0) {
    return [];
  }

  if (count >= stores.length) {
    return [...stores];
  }

  // Fisher-Yates shuffle on a copy
  const shuffled = [...stores];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

/**
 * Find store by name (case-insensitive partial match).
 * Returns first match or null if not found.
 * Prefers exact match over partial match.
 */
export function findStoreByName(
  stores: StoreInfo[],
  name: string
): StoreInfo | null {
  const searchLower = name.toLowerCase();

  // Exact match first
  const exact = stores.find((s) => s.name.toLowerCase() === searchLower);
  if (exact) return exact;

  // Partial match
  const partial = stores.find((s) => s.name.toLowerCase().includes(searchLower));
  return partial || null;
}

/**
 * Find all stores matching name (for suggestions on error).
 * Case-insensitive partial match.
 */
export function findStoresByName(stores: StoreInfo[], name: string): StoreInfo[] {
  const searchLower = name.toLowerCase();
  return stores.filter((s) => s.name.toLowerCase().includes(searchLower));
}
