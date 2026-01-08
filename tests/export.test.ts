import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { initDatabase, closeDatabase } from '../src/storage/database';
import { upsertStore, upsertProduct, insertPriceSnapshot } from '../src/storage/repository';
import { exportData, formatCsv, formatJson } from '../src/export';

const TEST_DB_DIR = join(__dirname, '../.test-data');
const TEST_DB_PATH = join(TEST_DB_DIR, 'test-export.sqlite');
const TEST_STORE_ID = 'test-store-001';

describe('export', () => {
  beforeEach(() => {
    mkdirSync(TEST_DB_DIR, { recursive: true });
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }

    // Set up test data
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

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Product 1 - recent
    upsertProduct(TEST_DB_PATH, {
      product_id: 'prod-1',
      name: 'Test Product 1',
      brand: 'Brand A',
      category: 'Pantry',
      subcategory: 'Chips',
      category_level2: null,
      origin: null,
      sale_type: 'EACH',
      first_seen: now.toISOString(),
      last_seen: now.toISOString(),
    });

    insertPriceSnapshot(TEST_DB_PATH, {
      product_id: 'prod-1',
      store_id: TEST_STORE_ID,
      scraped_at: now.toISOString(),
      price: 5.99,
      price_per_unit: 1.2,
      unit_of_measure: 'kg',
      display_name: 'Test Product 1 500g',
      available_in_store: 1,
      available_online: 1,
      promo_price: null,
      promo_price_per_unit: null,
      promo_type: null,
      promo_description: null,
      promo_requires_card: null,
      promo_limit: null,
    });

    // Product 2 - from yesterday (different category)
    upsertProduct(TEST_DB_PATH, {
      product_id: 'prod-2',
      name: 'Test Product 2',
      brand: 'Brand B',
      category: 'Bakery',
      subcategory: null,
      category_level2: null,
      origin: null,
      sale_type: 'EACH',
      first_seen: yesterday.toISOString(),
      last_seen: yesterday.toISOString(),
    });

    insertPriceSnapshot(TEST_DB_PATH, {
      product_id: 'prod-2',
      store_id: TEST_STORE_ID,
      scraped_at: yesterday.toISOString(),
      price: 3.5,
      price_per_unit: null,
      unit_of_measure: null,
      display_name: 'Test Product 2',
      available_in_store: 1,
      available_online: 0,
      promo_price: 2.99,
      promo_price_per_unit: null,
      promo_type: 'MULTI_BUY',
      promo_description: 'Buy 2 for $5',
      promo_requires_card: null,
      promo_limit: null,
    });

    // Product 3 - from last week
    upsertProduct(TEST_DB_PATH, {
      product_id: 'prod-3',
      name: 'Old Product',
      brand: null,
      category: 'Pantry',
      subcategory: null,
      category_level2: null,
      origin: null,
      sale_type: 'KG',
      first_seen: lastWeek.toISOString(),
      last_seen: lastWeek.toISOString(),
    });

    insertPriceSnapshot(TEST_DB_PATH, {
      product_id: 'prod-3',
      store_id: TEST_STORE_ID,
      scraped_at: lastWeek.toISOString(),
      price: 10.0,
      price_per_unit: 10.0,
      unit_of_measure: 'kg',
      display_name: 'Old Product 1kg',
      available_in_store: 0,
      available_online: 1,
      promo_price: null,
      promo_price_per_unit: null,
      promo_type: null,
      promo_description: null,
      promo_requires_card: null,
      promo_limit: null,
    });
  });

  afterEach(() => {
    closeDatabase(TEST_DB_PATH);
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  describe('exportData', () => {
    it('returns all records without filters', () => {
      const records = exportData(TEST_DB_PATH, {});
      expect(records.length).toBe(3);
    });

    it('filters by category', () => {
      const records = exportData(TEST_DB_PATH, { category: 'Pantry' });
      expect(records.length).toBe(2);
      records.forEach((r) => expect(r.category).toBe('Pantry'));
    });

    it('filters by since duration (6d)', () => {
      const records = exportData(TEST_DB_PATH, { since: '6d' });
      // Should include products from last 6 days (prod-1 and prod-2, not lastWeek)
      expect(records.length).toBe(2);
    });

    it('filters by since duration (2d)', () => {
      const records = exportData(TEST_DB_PATH, { since: '2d' });
      // Should include today and yesterday (prod-1 and prod-2)
      expect(records.length).toBe(2);
    });

    it('combines category and since filters', () => {
      const records = exportData(TEST_DB_PATH, { category: 'Pantry', since: '1d' });
      expect(records.length).toBe(1);
      expect(records[0].product_id).toBe('prod-1');
    });
  });

  describe('formatCsv', () => {
    it('outputs correct headers', () => {
      const records = exportData(TEST_DB_PATH, {}).slice(0, 1);
      const csv = formatCsv(records);
      const headers = csv.split('\n')[0];
      expect(headers).toContain('product_id');
      expect(headers).toContain('name');
      expect(headers).toContain('price');
      expect(headers).toContain('category');
    });

    it('escapes values with commas', () => {
      const records = [
        {
          product_id: 'p1',
          name: 'Product, with comma',
          brand: null,
          category: 'Test',
          price: 1.0,
          scraped_at: '2024-01-01',
        },
      ];
      const csv = formatCsv(records as any);
      expect(csv).toContain('"Product, with comma"');
    });

    it('handles null values', () => {
      const records = exportData(TEST_DB_PATH, { category: 'Pantry' });
      const csv = formatCsv(records);
      // Brand is null for prod-3
      expect(csv).toContain(',,'); // empty value for null
    });
  });

  describe('formatJson', () => {
    it('outputs valid JSON array', () => {
      const records = exportData(TEST_DB_PATH, {});
      const json = formatJson(records);
      expect(() => JSON.parse(json)).not.toThrow();
      const parsed = JSON.parse(json);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(3);
    });

    it('includes all expected fields', () => {
      const records = exportData(TEST_DB_PATH, {}).slice(0, 1);
      const json = formatJson(records);
      const parsed = JSON.parse(json)[0];
      expect(parsed).toHaveProperty('product_id');
      expect(parsed).toHaveProperty('name');
      expect(parsed).toHaveProperty('price');
      expect(parsed).toHaveProperty('category');
    });
  });
});
