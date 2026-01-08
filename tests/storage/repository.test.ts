import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { initDatabase, closeDatabase } from '../../src/storage/database';
import {
  upsertStore,
  upsertProduct,
  insertPriceSnapshot,
  saveProducts,
  getProductHistory,
  getLatestPrices,
} from '../../src/storage/repository';
import type { StoreRecord, ProductRecord, PriceSnapshotRecord } from '../../src/storage/types';

const TEST_DB_DIR = join(__dirname, '../../.test-data');
const TEST_DB_PATH = join(TEST_DB_DIR, 'test-repository.sqlite');
const TEST_STORE_ID = 'test-store-001';

describe('repository', () => {
  beforeEach(() => {
    mkdirSync(TEST_DB_DIR, { recursive: true });
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    initDatabase(TEST_DB_PATH);

    // Insert test store (required for foreign key constraint)
    upsertStore(TEST_DB_PATH, {
      store_id: TEST_STORE_ID,
      name: 'Test Store',
      address: '123 Test St',
      region: 'NI',
      latitude: -41.0,
      longitude: 174.0,
      last_synced: new Date().toISOString(),
    });
  });

  afterEach(() => {
    closeDatabase(TEST_DB_PATH);
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  const makeProduct = (overrides: Partial<ProductRecord> = {}): ProductRecord => ({
    product_id: 'test-123',
    name: 'Test Product',
    brand: 'Test Brand',
    category: 'Groceries',
    subcategory: 'Dairy',
    category_level2: 'Milk',
    origin: 'New Zealand',
    sale_type: 'BOTH',
    first_seen: '2024-01-01T00:00:00Z',
    last_seen: '2024-01-01T00:00:00Z',
    ...overrides,
  });

  const makeSnapshot = (overrides: Partial<PriceSnapshotRecord> = {}): PriceSnapshotRecord => ({
    product_id: 'test-123',
    store_id: TEST_STORE_ID,
    scraped_at: '2024-01-01T00:00:00Z',
    price: 5.99,
    price_per_unit: 1.2,
    unit_of_measure: '100g',
    display_name: '500g',
    available_in_store: 1,
    available_online: 1,
    promo_price: null,
    promo_price_per_unit: null,
    promo_type: null,
    promo_description: null,
    promo_requires_card: null,
    promo_limit: null,
    ...overrides,
  });

  const makeStore = (id: string): StoreRecord => ({
    store_id: id,
    name: `Store ${id}`,
    address: '123 Test St',
    region: 'NI',
    latitude: -41.0,
    longitude: 174.0,
    last_synced: new Date().toISOString(),
  });

  describe('upsertProduct', () => {
    it('creates new product', () => {
      const product = makeProduct();
      upsertProduct(TEST_DB_PATH, product);

      const db = initDatabase(TEST_DB_PATH);
      const result = db.prepare('SELECT * FROM products WHERE product_id = ?').get('test-123') as ProductRecord;
      expect(result.product_id).toBe('test-123');
      expect(result.name).toBe('Test Product');
      expect(result.brand).toBe('Test Brand');
      expect(result.category).toBe('Groceries');
    });

    it('updates existing product last_seen', () => {
      const product = makeProduct();
      upsertProduct(TEST_DB_PATH, product);

      const updatedProduct = makeProduct({
        last_seen: '2024-02-01T00:00:00Z',
        name: 'Updated Name',
      });
      upsertProduct(TEST_DB_PATH, updatedProduct);

      const db = initDatabase(TEST_DB_PATH);
      const result = db.prepare('SELECT * FROM products WHERE product_id = ?').get('test-123') as ProductRecord;
      expect(result.last_seen).toBe('2024-02-01T00:00:00Z');
      expect(result.name).toBe('Updated Name');
    });

    it('preserves first_seen on update', () => {
      const product = makeProduct({ first_seen: '2024-01-01T00:00:00Z' });
      upsertProduct(TEST_DB_PATH, product);

      const updatedProduct = makeProduct({
        first_seen: '2024-02-01T00:00:00Z',
        last_seen: '2024-02-01T00:00:00Z',
      });
      upsertProduct(TEST_DB_PATH, updatedProduct);

      const db = initDatabase(TEST_DB_PATH);
      const result = db.prepare('SELECT * FROM products WHERE product_id = ?').get('test-123') as ProductRecord;
      expect(result.first_seen).toBe('2024-01-01T00:00:00Z');
    });
  });

  describe('insertPriceSnapshot', () => {
    it('creates snapshot record', () => {
      const product = makeProduct();
      upsertProduct(TEST_DB_PATH, product);

      const snapshot = makeSnapshot();
      insertPriceSnapshot(TEST_DB_PATH, snapshot);

      const db = initDatabase(TEST_DB_PATH);
      const result = db.prepare('SELECT * FROM price_snapshots WHERE product_id = ?').get('test-123') as PriceSnapshotRecord;
      expect(result.product_id).toBe('test-123');
      expect(result.store_id).toBe(TEST_STORE_ID);
      expect(result.price).toBe(5.99);
      expect(result.price_per_unit).toBe(1.2);
    });

    it('enforces unique constraint on product_id, store_id, and scraped_at', () => {
      const product = makeProduct();
      upsertProduct(TEST_DB_PATH, product);

      const snapshot = makeSnapshot();
      insertPriceSnapshot(TEST_DB_PATH, snapshot);

      // Duplicate (product_id, store_id, scraped_at) should fail
      expect(() => insertPriceSnapshot(TEST_DB_PATH, snapshot)).toThrow(/UNIQUE constraint failed/);
    });

    it('allows same product with different store_ids', () => {
      // Create a second store
      const store2 = makeStore('store-002');
      upsertStore(TEST_DB_PATH, store2);

      const product = makeProduct();
      upsertProduct(TEST_DB_PATH, product);

      const timestamp = '2024-01-01T00:00:00Z';
      const snapshot1 = makeSnapshot({ store_id: TEST_STORE_ID, scraped_at: timestamp });
      const snapshot2 = makeSnapshot({ store_id: 'store-002', scraped_at: timestamp });

      // Should succeed - different stores
      expect(() => insertPriceSnapshot(TEST_DB_PATH, snapshot1)).not.toThrow();
      expect(() => insertPriceSnapshot(TEST_DB_PATH, snapshot2)).not.toThrow();
    });

    it('allows same product and store at different timestamps', () => {
      const product = makeProduct();
      upsertProduct(TEST_DB_PATH, product);

      const snapshot1 = makeSnapshot({ scraped_at: '2024-01-01T00:00:00Z' });
      const snapshot2 = makeSnapshot({ scraped_at: '2024-01-02T00:00:00Z' });

      // Should succeed - different timestamps
      expect(() => insertPriceSnapshot(TEST_DB_PATH, snapshot1)).not.toThrow();
      expect(() => insertPriceSnapshot(TEST_DB_PATH, snapshot2)).not.toThrow();
    });
  });

  describe('upsertStore', () => {
    it('creates new store', () => {
      const newStore = makeStore('new-store-001');
      upsertStore(TEST_DB_PATH, newStore);

      const db = initDatabase(TEST_DB_PATH);
      const result = db.prepare('SELECT * FROM stores WHERE store_id = ?').get('new-store-001') as StoreRecord;
      expect(result.store_id).toBe('new-store-001');
      expect(result.name).toBe('Store new-store-001');
    });

    it('is idempotent', () => {
      const store = makeStore('idempotent-store');

      // Insert twice should not fail
      expect(() => {
        upsertStore(TEST_DB_PATH, store);
        upsertStore(TEST_DB_PATH, store);
      }).not.toThrow();
    });

    it('updates existing store', () => {
      const store1 = makeStore('update-store');
      upsertStore(TEST_DB_PATH, store1);

      // Update with new data
      const store2: StoreRecord = {
        ...store1,
        name: 'Updated Store Name',
        address: 'New Address',
      };
      upsertStore(TEST_DB_PATH, store2);

      // Store should be updated (no duplicate)
      const db = initDatabase(TEST_DB_PATH);
      const result = db.prepare('SELECT * FROM stores WHERE store_id = ?').get('update-store') as StoreRecord;
      expect(result.name).toBe('Updated Store Name');
      expect(result.address).toBe('New Address');

      // Only one record
      const count = db.prepare('SELECT COUNT(*) as count FROM stores WHERE store_id = ?').get('update-store') as { count: number };
      expect(count.count).toBe(1);
    });
  });

  describe('saveProducts', () => {
    it('handles batch of products correctly', () => {
      const products = [
        makeProduct({ product_id: 'prod-1', name: 'Product 1' }),
        makeProduct({ product_id: 'prod-2', name: 'Product 2' }),
        makeProduct({ product_id: 'prod-3', name: 'Product 3' }),
      ];
      const snapshots = [
        makeSnapshot({ product_id: 'prod-1', price: 1.99 }),
        makeSnapshot({ product_id: 'prod-2', price: 2.99 }),
        makeSnapshot({ product_id: 'prod-3', price: 3.99 }),
      ];

      saveProducts(TEST_DB_PATH, products, snapshots);

      const db = initDatabase(TEST_DB_PATH);
      const productCount = db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number };
      const snapshotCount = db.prepare('SELECT COUNT(*) as count FROM price_snapshots').get() as { count: number };

      expect(productCount.count).toBe(3);
      expect(snapshotCount.count).toBe(3);
    });

    it('updates products and creates snapshots atomically', () => {
      const products = [makeProduct({ product_id: 'prod-1' })];
      const validSnapshots = [makeSnapshot({ product_id: 'prod-1' })];

      saveProducts(TEST_DB_PATH, products, validSnapshots);

      const db = initDatabase(TEST_DB_PATH);
      const productCount = db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number };
      expect(productCount.count).toBe(1);

      // Second call with same timestamp should fail due to unique constraint
      expect(() => saveProducts(TEST_DB_PATH, products, validSnapshots)).toThrow();
    });
  });

  describe('getProductHistory', () => {
    it('returns chronological price history', () => {
      const product = makeProduct();
      upsertProduct(TEST_DB_PATH, product);

      insertPriceSnapshot(TEST_DB_PATH, makeSnapshot({ scraped_at: '2024-01-03T00:00:00Z', price: 7.99 }));
      insertPriceSnapshot(TEST_DB_PATH, makeSnapshot({ scraped_at: '2024-01-01T00:00:00Z', price: 5.99 }));
      insertPriceSnapshot(TEST_DB_PATH, makeSnapshot({ scraped_at: '2024-01-02T00:00:00Z', price: 6.99 }));

      const history = getProductHistory(TEST_DB_PATH, 'test-123');

      expect(history).toHaveLength(3);
      expect(history[0].price).toBe(5.99);
      expect(history[1].price).toBe(6.99);
      expect(history[2].price).toBe(7.99);
    });
  });

  describe('getLatestPrices', () => {
    it('returns most recent snapshot per product', () => {
      upsertProduct(TEST_DB_PATH, makeProduct({ product_id: 'prod-1' }));
      upsertProduct(TEST_DB_PATH, makeProduct({ product_id: 'prod-2' }));

      insertPriceSnapshot(TEST_DB_PATH, makeSnapshot({ product_id: 'prod-1', scraped_at: '2024-01-01T00:00:00Z', price: 1.00 }));
      insertPriceSnapshot(TEST_DB_PATH, makeSnapshot({ product_id: 'prod-1', scraped_at: '2024-01-02T00:00:00Z', price: 1.50 }));
      insertPriceSnapshot(TEST_DB_PATH, makeSnapshot({ product_id: 'prod-2', scraped_at: '2024-01-01T00:00:00Z', price: 2.00 }));
      insertPriceSnapshot(TEST_DB_PATH, makeSnapshot({ product_id: 'prod-2', scraped_at: '2024-01-03T00:00:00Z', price: 2.50 }));

      const latest = getLatestPrices(TEST_DB_PATH);

      expect(latest).toHaveLength(2);

      const prod1 = latest.find((p) => p.product_id === 'prod-1');
      const prod2 = latest.find((p) => p.product_id === 'prod-2');

      expect(prod1?.price).toBe(1.50);
      expect(prod2?.price).toBe(2.50);
    });
  });
});
