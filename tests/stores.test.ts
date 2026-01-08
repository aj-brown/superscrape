import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { initDatabase, closeDatabase, getDatabase } from '../src/storage/database';
import {
  syncStoresToDb,
  sampleStores,
  findStoreByName,
  findStoresByName,
  formatStoresTable,
} from '../src/stores';
import type { StoreInfo } from '../src/utils';

const TEST_DB_DIR = join(__dirname, '../.test-data');
const TEST_DB_PATH = join(TEST_DB_DIR, 'test-stores.sqlite');

const makeStore = (
  id: string,
  name: string,
  overrides: Partial<StoreInfo> = {}
): StoreInfo => ({
  id,
  name,
  address: '123 Test St',
  region: 'NI',
  latitude: -41.0,
  longitude: 174.0,
  onlineActive: true,
  physicalActive: true,
  ...overrides,
});

describe('stores utilities', () => {
  describe('syncStoresToDb', () => {
    beforeEach(() => {
      mkdirSync(TEST_DB_DIR, { recursive: true });
      if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
      initDatabase(TEST_DB_PATH);
    });

    afterEach(() => {
      closeDatabase(TEST_DB_PATH);
      if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
    });

    it('inserts stores into database', () => {
      const stores = [
        makeStore('store-1', 'New World Metro Auckland'),
        makeStore('store-2', 'New World Thorndon'),
      ];

      syncStoresToDb(TEST_DB_PATH, stores);

      const db = getDatabase(TEST_DB_PATH);
      const count = db.prepare('SELECT COUNT(*) as count FROM stores').get() as {
        count: number;
      };
      expect(count.count).toBe(2);
    });

    it('is idempotent (upserts correctly)', () => {
      const stores = [makeStore('store-1', 'New World Metro')];

      syncStoresToDb(TEST_DB_PATH, stores);
      syncStoresToDb(TEST_DB_PATH, stores);

      const db = getDatabase(TEST_DB_PATH);
      const count = db.prepare('SELECT COUNT(*) as count FROM stores').get() as {
        count: number;
      };
      expect(count.count).toBe(1);
    });

    it('updates existing store data', () => {
      syncStoresToDb(TEST_DB_PATH, [makeStore('store-1', 'Old Name')]);
      syncStoresToDb(TEST_DB_PATH, [makeStore('store-1', 'New Name')]);

      const db = getDatabase(TEST_DB_PATH);
      const store = db
        .prepare('SELECT name FROM stores WHERE store_id = ?')
        .get('store-1') as { name: string };
      expect(store.name).toBe('New Name');
    });

    it('handles empty stores array', () => {
      expect(() => syncStoresToDb(TEST_DB_PATH, [])).not.toThrow();

      const db = getDatabase(TEST_DB_PATH);
      const count = db.prepare('SELECT COUNT(*) as count FROM stores').get() as {
        count: number;
      };
      expect(count.count).toBe(0);
    });
  });

  describe('sampleStores', () => {
    const stores = [
      makeStore('1', 'Store 1'),
      makeStore('2', 'Store 2'),
      makeStore('3', 'Store 3'),
      makeStore('4', 'Store 4'),
      makeStore('5', 'Store 5'),
    ];

    it('returns exact count requested', () => {
      const sample = sampleStores(stores, 3);
      expect(sample).toHaveLength(3);
    });

    it('returns all stores if count exceeds length', () => {
      const sample = sampleStores(stores, 10);
      expect(sample).toHaveLength(5);
    });

    it('returns no duplicates', () => {
      const sample = sampleStores(stores, 5);
      const ids = sample.map((s) => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('does not modify original array', () => {
      const original = [...stores];
      sampleStores(stores, 3);
      expect(stores).toEqual(original);
    });

    it('handles count of 0', () => {
      const sample = sampleStores(stores, 0);
      expect(sample).toHaveLength(0);
    });

    it('handles empty stores array', () => {
      const sample = sampleStores([], 5);
      expect(sample).toHaveLength(0);
    });
  });

  describe('findStoreByName', () => {
    const stores = [
      makeStore('1', 'New World Metro Auckland'),
      makeStore('2', 'New World Thorndon'),
      makeStore('3', 'New World Lambton Quay'),
    ];

    it('finds exact match (case-insensitive)', () => {
      const result = findStoreByName(stores, 'new world thorndon');
      expect(result?.id).toBe('2');
    });

    it('finds partial match', () => {
      const result = findStoreByName(stores, 'Metro');
      expect(result?.id).toBe('1');
    });

    it('returns null for no match', () => {
      const result = findStoreByName(stores, 'Nonexistent');
      expect(result).toBeNull();
    });

    it('prefers exact match over partial', () => {
      const storesWithSimilar = [
        makeStore('1', 'Metro'),
        makeStore('2', 'New World Metro Auckland'),
      ];
      const result = findStoreByName(storesWithSimilar, 'Metro');
      expect(result?.id).toBe('1');
    });

    it('handles empty stores array', () => {
      const result = findStoreByName([], 'Metro');
      expect(result).toBeNull();
    });

    it('handles empty search string', () => {
      const result = findStoreByName(stores, '');
      // Empty string is a substring of everything - should match first store
      expect(result).not.toBeNull();
    });
  });

  describe('findStoresByName', () => {
    const stores = [
      makeStore('1', 'New World Metro Auckland'),
      makeStore('2', 'New World Thorndon'),
      makeStore('3', 'Pak n Save Metro'),
    ];

    it('returns all partial matches', () => {
      const results = findStoresByName(stores, 'Metro');
      expect(results).toHaveLength(2);
      expect(results.map((s) => s.id)).toContain('1');
      expect(results.map((s) => s.id)).toContain('3');
    });

    it('returns empty array for no matches', () => {
      const results = findStoresByName(stores, 'Countdown');
      expect(results).toHaveLength(0);
    });

    it('is case-insensitive', () => {
      const results = findStoresByName(stores, 'WORLD');
      expect(results).toHaveLength(2);
    });

    it('handles empty stores array', () => {
      const results = findStoresByName([], 'Metro');
      expect(results).toHaveLength(0);
    });
  });

  describe('formatStoresTable', () => {
    it('formats stores grouped by region', () => {
      const stores = [
        makeStore('id-1', 'New World Metro', { region: 'NI' }),
        makeStore('id-2', 'New World Thorndon', { region: 'NI' }),
      ];

      const output = formatStoresTable(stores);

      expect(output).toContain('New World Metro');
      expect(output).toContain('New World Thorndon');
      expect(output).toContain('id-1');
      expect(output).toContain('[NI]');
    });

    it('sorts stores alphabetically within region', () => {
      const stores = [
        makeStore('id-z', 'Zebra Store', { region: 'NI' }),
        makeStore('id-a', 'Alpha Store', { region: 'NI' }),
      ];

      const output = formatStoresTable(stores);

      const alphaIndex = output.indexOf('Alpha Store');
      const zebraIndex = output.indexOf('Zebra Store');
      expect(alphaIndex).toBeLessThan(zebraIndex);
    });

    it('groups multiple regions', () => {
      const stores = [
        makeStore('id-1', 'North Store', { region: 'NI' }),
        makeStore('id-2', 'South Store', { region: 'SI' }),
      ];

      const output = formatStoresTable(stores);

      expect(output).toContain('[NI]');
      expect(output).toContain('[SI]');
    });

    it('handles empty stores array', () => {
      const output = formatStoresTable([]);

      expect(output).toContain('Name');
      expect(output).toContain('ID');
    });

    it('includes header row', () => {
      const stores = [makeStore('id-1', 'Test Store')];

      const output = formatStoresTable(stores);

      expect(output).toContain('Name');
      expect(output).toContain('ID');
    });
  });
});
