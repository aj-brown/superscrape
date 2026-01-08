import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { initDatabase, closeDatabase } from '../../src/storage/database';
import { upsertProduct, insertPriceSnapshot } from '../../src/storage/repository';
import {
  getPriceHistory,
  getPriceChanges,
  getProductsByCategory,
  getProductsOnPromo,
  searchProducts,
  listRuns,
  getDatabaseTotals,
} from '../../src/storage/queries';
import { createRun, updateCategoryRun, completeRun } from '../../src/storage/repository';
import type { ProductRecord, PriceSnapshotRecord } from '../../src/storage/types';

const TEST_DB_DIR = join(__dirname, '../../.test-data');
const TEST_DB_PATH = join(TEST_DB_DIR, 'test-queries.sqlite');

describe('queries', () => {
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

  describe('getPriceHistory', () => {
    it('returns chronological snapshots', () => {
      upsertProduct(TEST_DB_PATH, makeProduct());

      insertPriceSnapshot(TEST_DB_PATH, makeSnapshot({ scraped_at: '2024-01-03T00:00:00Z', price: 7.99 }));
      insertPriceSnapshot(TEST_DB_PATH, makeSnapshot({ scraped_at: '2024-01-01T00:00:00Z', price: 5.99 }));
      insertPriceSnapshot(TEST_DB_PATH, makeSnapshot({ scraped_at: '2024-01-02T00:00:00Z', price: 6.99 }));

      const history = getPriceHistory(TEST_DB_PATH, 'test-123');

      expect(history).toHaveLength(3);
      expect(history[0].price).toBe(5.99);
      expect(history[1].price).toBe(6.99);
      expect(history[2].price).toBe(7.99);
    });
  });

  describe('getPriceChanges', () => {
    it('calculates correct deltas between snapshots', () => {
      upsertProduct(TEST_DB_PATH, makeProduct());

      insertPriceSnapshot(TEST_DB_PATH, makeSnapshot({ scraped_at: '2024-01-01T00:00:00Z', price: 5.00 }));
      insertPriceSnapshot(TEST_DB_PATH, makeSnapshot({ scraped_at: '2024-01-02T00:00:00Z', price: 6.00 }));
      insertPriceSnapshot(TEST_DB_PATH, makeSnapshot({ scraped_at: '2024-01-03T00:00:00Z', price: 4.50 }));

      const changes = getPriceChanges(TEST_DB_PATH, 'test-123');

      expect(changes).toHaveLength(2);
      expect(changes[0].from_price).toBe(5.00);
      expect(changes[0].to_price).toBe(6.00);
      expect(changes[0].delta).toBe(1.00);
      expect(changes[1].from_price).toBe(6.00);
      expect(changes[1].to_price).toBe(4.50);
      expect(changes[1].delta).toBe(-1.50);
    });

    it('returns empty array for single snapshot', () => {
      upsertProduct(TEST_DB_PATH, makeProduct());
      insertPriceSnapshot(TEST_DB_PATH, makeSnapshot());

      const changes = getPriceChanges(TEST_DB_PATH, 'test-123');

      expect(changes).toHaveLength(0);
    });
  });

  describe('getProductsByCategory', () => {
    beforeEach(() => {
      upsertProduct(TEST_DB_PATH, makeProduct({ product_id: 'dairy-1', category: 'Groceries', subcategory: 'Dairy' }));
      upsertProduct(TEST_DB_PATH, makeProduct({ product_id: 'dairy-2', category: 'Groceries', subcategory: 'Dairy' }));
      upsertProduct(TEST_DB_PATH, makeProduct({ product_id: 'bakery-1', category: 'Groceries', subcategory: 'Bakery' }));
      upsertProduct(TEST_DB_PATH, makeProduct({ product_id: 'fruit-1', category: 'Fruit & Vegetables', subcategory: 'Fruit' }));
    });

    it('filters by category', () => {
      const products = getProductsByCategory(TEST_DB_PATH, 'Groceries');

      expect(products).toHaveLength(3);
      products.forEach((p) => {
        expect(p.category).toBe('Groceries');
      });
    });

    it('filters by subcategory when provided', () => {
      const products = getProductsByCategory(TEST_DB_PATH, 'Groceries', 'Dairy');

      expect(products).toHaveLength(2);
      products.forEach((p) => {
        expect(p.category).toBe('Groceries');
        expect(p.subcategory).toBe('Dairy');
      });
    });
  });

  describe('getProductsOnPromo', () => {
    it('returns only products with promo_price set', () => {
      upsertProduct(TEST_DB_PATH, makeProduct({ product_id: 'promo-1' }));
      upsertProduct(TEST_DB_PATH, makeProduct({ product_id: 'promo-2' }));
      upsertProduct(TEST_DB_PATH, makeProduct({ product_id: 'no-promo' }));

      insertPriceSnapshot(TEST_DB_PATH, makeSnapshot({ product_id: 'promo-1', promo_price: 3.99, scraped_at: '2024-01-01T00:00:00Z' }));
      insertPriceSnapshot(TEST_DB_PATH, makeSnapshot({ product_id: 'promo-2', promo_price: 4.99, scraped_at: '2024-01-01T00:00:01Z' }));
      insertPriceSnapshot(TEST_DB_PATH, makeSnapshot({ product_id: 'no-promo', promo_price: null, scraped_at: '2024-01-01T00:00:02Z' }));

      const promoProducts = getProductsOnPromo(TEST_DB_PATH);

      expect(promoProducts).toHaveLength(2);
      const productIds = promoProducts.map((p) => p.product_id);
      expect(productIds).toContain('promo-1');
      expect(productIds).toContain('promo-2');
      expect(productIds).not.toContain('no-promo');
    });
  });

  describe('searchProducts', () => {
    beforeEach(() => {
      upsertProduct(TEST_DB_PATH, makeProduct({ product_id: 'apple-1', name: 'Royal Gala Apple', brand: 'Fresh' }));
      upsertProduct(TEST_DB_PATH, makeProduct({ product_id: 'apple-2', name: 'Granny Smith Apple', brand: 'Organic Fresh' }));
      upsertProduct(TEST_DB_PATH, makeProduct({ product_id: 'milk-1', name: 'Full Cream Milk', brand: 'Anchor' }));
      upsertProduct(TEST_DB_PATH, makeProduct({ product_id: 'juice-1', name: 'Apple Juice', brand: 'Just' }));
    });

    it('matches on product name (case-insensitive)', () => {
      const products = searchProducts(TEST_DB_PATH, 'apple');

      expect(products).toHaveLength(3);
      const productIds = products.map((p) => p.product_id);
      expect(productIds).toContain('apple-1');
      expect(productIds).toContain('apple-2');
      expect(productIds).toContain('juice-1');
    });

    it('matches on brand (case-insensitive)', () => {
      const products = searchProducts(TEST_DB_PATH, 'ANCHOR');

      expect(products).toHaveLength(1);
      expect(products[0].product_id).toBe('milk-1');
    });

    it('returns empty array for no matches', () => {
      const products = searchProducts(TEST_DB_PATH, 'xyz123notfound');

      expect(products).toHaveLength(0);
    });
  });

  describe('listRuns', () => {
    it('returns empty array when no runs exist', () => {
      const runs = listRuns(TEST_DB_PATH);
      expect(runs).toHaveLength(0);
    });

    it('returns runs in reverse chronological order', () => {
      createRun(TEST_DB_PATH, ['Pantry']);
      createRun(TEST_DB_PATH, ['Bakery', 'Dairy']);

      const runs = listRuns(TEST_DB_PATH);

      expect(runs).toHaveLength(2);
      expect(runs[0].id).toBe(2);
      expect(runs[1].id).toBe(1);
    });

    it('includes run status and category counts', () => {
      const runId = createRun(TEST_DB_PATH, ['Pantry', 'Bakery', 'Dairy']);
      updateCategoryRun(TEST_DB_PATH, runId, 'Pantry', {
        status: 'completed',
        lastPage: 5,
        productCount: 100,
      });

      const runs = listRuns(TEST_DB_PATH);

      expect(runs[0].status).toBe('in_progress');
      expect(runs[0].totalCategories).toBe(3);
      expect(runs[0].completedCategories).toBe(1);
    });

    it('shows completed runs with completion time', () => {
      const runId = createRun(TEST_DB_PATH, ['Pantry']);
      updateCategoryRun(TEST_DB_PATH, runId, 'Pantry', {
        status: 'completed',
        lastPage: 5,
        productCount: 100,
      });
      completeRun(TEST_DB_PATH, runId);

      const runs = listRuns(TEST_DB_PATH);

      expect(runs[0].status).toBe('completed');
      expect(runs[0].completedAt).toBeDefined();
    });

    it('respects limit parameter', () => {
      createRun(TEST_DB_PATH, ['Pantry']);
      createRun(TEST_DB_PATH, ['Bakery']);
      createRun(TEST_DB_PATH, ['Dairy']);

      const runs = listRuns(TEST_DB_PATH, 2);

      expect(runs).toHaveLength(2);
      expect(runs[0].id).toBe(3);
      expect(runs[1].id).toBe(2);
    });
  });

  describe('getDatabaseTotals', () => {
    it('returns zeros for empty database', () => {
      const totals = getDatabaseTotals(TEST_DB_PATH);

      expect(totals.totalProducts).toBe(0);
      expect(totals.totalSnapshots).toBe(0);
      expect(totals.productsOnPromo).toBe(0);
    });

    it('counts products correctly', () => {
      upsertProduct(TEST_DB_PATH, makeProduct({ product_id: 'prod-1' }));
      upsertProduct(TEST_DB_PATH, makeProduct({ product_id: 'prod-2' }));
      upsertProduct(TEST_DB_PATH, makeProduct({ product_id: 'prod-3' }));

      const totals = getDatabaseTotals(TEST_DB_PATH);

      expect(totals.totalProducts).toBe(3);
    });

    it('counts snapshots correctly', () => {
      upsertProduct(TEST_DB_PATH, makeProduct({ product_id: 'prod-1' }));

      insertPriceSnapshot(TEST_DB_PATH, makeSnapshot({ product_id: 'prod-1', scraped_at: '2024-01-01T00:00:00Z' }));
      insertPriceSnapshot(TEST_DB_PATH, makeSnapshot({ product_id: 'prod-1', scraped_at: '2024-01-02T00:00:00Z' }));
      insertPriceSnapshot(TEST_DB_PATH, makeSnapshot({ product_id: 'prod-1', scraped_at: '2024-01-03T00:00:00Z' }));

      const totals = getDatabaseTotals(TEST_DB_PATH);

      expect(totals.totalSnapshots).toBe(3);
    });

    it('counts products on promo correctly', () => {
      upsertProduct(TEST_DB_PATH, makeProduct({ product_id: 'promo-1' }));
      upsertProduct(TEST_DB_PATH, makeProduct({ product_id: 'promo-2' }));
      upsertProduct(TEST_DB_PATH, makeProduct({ product_id: 'no-promo' }));

      insertPriceSnapshot(TEST_DB_PATH, makeSnapshot({ product_id: 'promo-1', promo_price: 3.99, scraped_at: '2024-01-01T00:00:00Z' }));
      insertPriceSnapshot(TEST_DB_PATH, makeSnapshot({ product_id: 'promo-2', promo_price: 4.99, scraped_at: '2024-01-01T00:00:01Z' }));
      insertPriceSnapshot(TEST_DB_PATH, makeSnapshot({ product_id: 'no-promo', promo_price: null, scraped_at: '2024-01-01T00:00:02Z' }));

      const totals = getDatabaseTotals(TEST_DB_PATH);

      expect(totals.productsOnPromo).toBe(2);
    });

    it('uses latest snapshot for promo status', () => {
      upsertProduct(TEST_DB_PATH, makeProduct({ product_id: 'prod-1' }));

      // First snapshot has promo
      insertPriceSnapshot(TEST_DB_PATH, makeSnapshot({ product_id: 'prod-1', promo_price: 3.99, scraped_at: '2024-01-01T00:00:00Z' }));
      // Latest snapshot has no promo
      insertPriceSnapshot(TEST_DB_PATH, makeSnapshot({ product_id: 'prod-1', promo_price: null, scraped_at: '2024-01-02T00:00:00Z' }));

      const totals = getDatabaseTotals(TEST_DB_PATH);

      expect(totals.productsOnPromo).toBe(0);
    });
  });
});
