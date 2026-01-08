import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unlink } from 'node:fs/promises';
import { initDatabase, closeDatabase } from '../src/storage/database';
import { upsertStore, saveProducts } from '../src/storage/repository';
import {
  getOverallStats,
  formatPriceChange,
  formatPromoProduct,
} from '../src/stats';
import type { ProductRecord, PriceSnapshotRecord } from '../src/storage/types';
import type { PriceChange } from '../src/storage/queries';

const TEST_DB = '/tmp/stats-test.db';
const TEST_STORE_ID = 'test-store-001';

describe('stats', () => {
  beforeEach(() => {
    initDatabase(TEST_DB);

    // Insert test store (required for foreign key constraint)
    upsertStore(TEST_DB, {
      store_id: TEST_STORE_ID,
      name: 'Test Store',
      address: '123 Test St',
      region: 'NI',
      latitude: -41.0,
      longitude: 174.0,
      last_synced: new Date().toISOString(),
    });
  });

  afterEach(async () => {
    closeDatabase(TEST_DB);
    await unlink(TEST_DB).catch(() => {});
  });

  describe('getOverallStats', () => {
    it('returns zero counts for empty database', () => {
      const stats = getOverallStats(TEST_DB);
      expect(stats.totalProducts).toBe(0);
      expect(stats.totalSnapshots).toBe(0);
      expect(stats.productsOnPromo).toBe(0);
      expect(stats.categories).toEqual([]);
    });

    it('returns correct counts after inserting products', () => {
      const now = new Date().toISOString();
      const products: ProductRecord[] = [
        {
          product_id: 'p1',
          name: 'Apples',
          brand: 'Fresh',
          category: 'Fruit',
          subcategory: 'Apples',
          category_level2: null,
          origin: null,
          sale_type: null,
          first_seen: now,
          last_seen: now,
        },
        {
          product_id: 'p2',
          name: 'Bananas',
          brand: 'Fresh',
          category: 'Fruit',
          subcategory: 'Tropical',
          category_level2: null,
          origin: null,
          sale_type: null,
          first_seen: now,
          last_seen: now,
        },
      ];
      const snapshots: PriceSnapshotRecord[] = [
        {
          product_id: 'p1',
          store_id: TEST_STORE_ID,
          scraped_at: now,
          price: 3.99,
          price_per_unit: null,
          unit_of_measure: null,
          display_name: 'Apples',
          available_in_store: 1,
          available_online: 1,
          promo_price: null,
          promo_price_per_unit: null,
          promo_type: null,
          promo_description: null,
          promo_requires_card: null,
          promo_limit: null,
        },
        {
          product_id: 'p2',
          store_id: TEST_STORE_ID,
          scraped_at: now,
          price: 2.99,
          price_per_unit: null,
          unit_of_measure: null,
          display_name: 'Bananas',
          available_in_store: 1,
          available_online: 1,
          promo_price: null,
          promo_price_per_unit: null,
          promo_type: null,
          promo_description: null,
          promo_requires_card: null,
          promo_limit: null,
        },
      ];
      saveProducts(TEST_DB, products, snapshots);

      const stats = getOverallStats(TEST_DB);
      expect(stats.totalProducts).toBe(2);
      expect(stats.totalSnapshots).toBe(2);
      expect(stats.categories).toContain('Fruit');
    });
  });

  describe('formatPriceChange', () => {
    it('formats price increase with plus sign', () => {
      const change: PriceChange = {
        product_id: 'p1',
        from_date: '2024-01-01',
        to_date: '2024-01-02',
        from_price: 2.99,
        to_price: 3.49,
        delta: 0.5,
      };
      const formatted = formatPriceChange(change);
      expect(formatted).toContain('+$0.50');
    });

    it('formats price decrease with minus sign', () => {
      const change: PriceChange = {
        product_id: 'p1',
        from_date: '2024-01-01',
        to_date: '2024-01-02',
        from_price: 3.49,
        to_price: 2.99,
        delta: -0.5,
      };
      const formatted = formatPriceChange(change);
      expect(formatted).toContain('-$0.50');
    });
  });

  describe('formatPromoProduct', () => {
    it('formats promo with savings percentage', () => {
      const promo: PriceSnapshotRecord = {
        product_id: 'p1',
        scraped_at: '2024-01-01',
        price: 5.99,
        price_per_unit: null,
        unit_of_measure: null,
        display_name: 'Test Product',
        available_in_store: 1,
        available_online: 1,
        promo_price: 3.99,
        promo_price_per_unit: null,
        promo_type: 'sale',
        promo_description: 'Special offer',
        promo_requires_card: 0,
        promo_limit: null,
      };
      const formatted = formatPromoProduct(promo);
      expect(formatted).toContain('$5.99');
      expect(formatted).toContain('$3.99');
      expect(formatted).toContain('33%');
    });
  });
});
