import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { initDatabase, closeDatabase } from '../../src/storage/database';
import {
  upsertProduct,
  insertPriceSnapshot,
  saveProducts,
  getProductHistory,
  getLatestPrices,
} from '../../src/storage/repository';
import type { ProductRecord, PriceSnapshotRecord } from '../../src/storage/types';

const TEST_DB_DIR = join(__dirname, '../../.test-data');
const TEST_DB_PATH = join(TEST_DB_DIR, 'test-repository.sqlite');

describe('repository', () => {
  beforeEach(() => {
    mkdirSync(TEST_DB_DIR, { recursive: true });
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    initDatabase(TEST_DB_PATH);
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
      expect(result.price).toBe(5.99);
      expect(result.price_per_unit).toBe(1.2);
    });

    it('enforces unique constraint on product_id and scraped_at', () => {
      const product = makeProduct();
      upsertProduct(TEST_DB_PATH, product);

      const snapshot = makeSnapshot();
      insertPriceSnapshot(TEST_DB_PATH, snapshot);

      expect(() => insertPriceSnapshot(TEST_DB_PATH, snapshot)).toThrow();
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
