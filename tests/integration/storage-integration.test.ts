import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  initDatabase,
  closeDatabase,
  saveProducts,
  getLatestPrices,
  getProductHistory,
  productsToRecordsAndSnapshots,
  upsertStore,
} from '../../src/storage';
import type { Product } from '../../src/utils';

const TEST_DB_DIR = join(__dirname, '../../.test-data');
const TEST_DB_PATH = join(TEST_DB_DIR, 'test-integration.sqlite');
const TEST_STORE_ID = 'test-store-001';

describe('Storage Integration', () => {
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

  const makeProduct = (overrides: Partial<Product> = {}): Product => ({
    productId: 'test-123',
    name: 'Test Product',
    displayName: '500g Test Product',
    brand: 'Test Brand',
    price: 5.99,
    pricePerUnit: 1.2,
    unitOfMeasure: '100g',
    category: 'Groceries',
    subcategory: 'Dairy',
    categoryLevel2: 'Milk',
    availability: ['IN_STORE', 'ONLINE'],
    origin: 'New Zealand',
    saleType: 'BOTH',
    ...overrides,
  });

  it('full scrape flow saves products to database', () => {
    const products: Product[] = [
      makeProduct({ productId: 'prod-1', name: 'Product 1', price: 1.99 }),
      makeProduct({ productId: 'prod-2', name: 'Product 2', price: 2.99 }),
      makeProduct({ productId: 'prod-3', name: 'Product 3', price: 3.99 }),
    ];

    const timestamp = '2024-01-01T00:00:00Z';
    const { records, snapshots } = productsToRecordsAndSnapshots(products, TEST_STORE_ID, timestamp);
    saveProducts(TEST_DB_PATH, records, snapshots);

    const latestPrices = getLatestPrices(TEST_DB_PATH);
    expect(latestPrices).toHaveLength(3);

    const prices = latestPrices.map((p) => p.price).sort();
    expect(prices).toEqual([1.99, 2.99, 3.99]);
  });

  it('multiple scrapes create price history', () => {
    const product = makeProduct({ productId: 'prod-1', price: 5.99 });

    // First scrape
    const timestamp1 = '2024-01-01T00:00:00Z';
    const { records: records1, snapshots: snapshots1 } = productsToRecordsAndSnapshots(
      [product],
      TEST_STORE_ID,
      timestamp1
    );
    saveProducts(TEST_DB_PATH, records1, snapshots1);

    // Second scrape with price change
    const updatedProduct = { ...product, price: 6.99 };
    const timestamp2 = '2024-01-02T00:00:00Z';
    const { records: records2, snapshots: snapshots2 } = productsToRecordsAndSnapshots(
      [updatedProduct],
      TEST_STORE_ID,
      timestamp2
    );
    saveProducts(TEST_DB_PATH, records2, snapshots2);

    // Third scrape with another price change
    const finalProduct = { ...product, price: 4.99 };
    const timestamp3 = '2024-01-03T00:00:00Z';
    const { records: records3, snapshots: snapshots3 } = productsToRecordsAndSnapshots(
      [finalProduct],
      TEST_STORE_ID,
      timestamp3
    );
    saveProducts(TEST_DB_PATH, records3, snapshots3);

    // Check price history
    const history = getProductHistory(TEST_DB_PATH, 'prod-1');
    expect(history).toHaveLength(3);
    expect(history[0].price).toBe(5.99);
    expect(history[1].price).toBe(6.99);
    expect(history[2].price).toBe(4.99);

    // Check latest price
    const latest = getLatestPrices(TEST_DB_PATH);
    expect(latest).toHaveLength(1);
    expect(latest[0].price).toBe(4.99);
  });

  it('database persists between runs', () => {
    const products: Product[] = [makeProduct({ productId: 'persistent-prod', price: 9.99 })];

    const timestamp = '2024-01-01T00:00:00Z';
    const { records, snapshots } = productsToRecordsAndSnapshots(products, TEST_STORE_ID, timestamp);
    saveProducts(TEST_DB_PATH, records, snapshots);

    // Close and reopen the database
    closeDatabase(TEST_DB_PATH);
    initDatabase(TEST_DB_PATH);

    // Data should still be there
    const latestPrices = getLatestPrices(TEST_DB_PATH);
    expect(latestPrices).toHaveLength(1);
    expect(latestPrices[0].product_id).toBe('persistent-prod');
    expect(latestPrices[0].price).toBe(9.99);
  });

  it('converts Product to records correctly including promo fields', () => {
    const productWithPromo = makeProduct({
      productId: 'promo-prod',
      price: 10.00,
      promoPrice: 7.50,
      promoPricePerUnit: 1.50,
      promoType: 'NEW_PRICE',
      promoDescription: 'Special offer',
      promoRequiresCard: true,
      promoLimit: 6,
    });

    const timestamp = '2024-01-01T00:00:00Z';
    const { records, snapshots } = productsToRecordsAndSnapshots([productWithPromo], TEST_STORE_ID, timestamp);
    saveProducts(TEST_DB_PATH, records, snapshots);

    const latest = getLatestPrices(TEST_DB_PATH);
    expect(latest).toHaveLength(1);

    const snapshot = latest[0];
    expect(snapshot.price).toBe(10.00);
    expect(snapshot.promo_price).toBe(7.50);
    expect(snapshot.promo_price_per_unit).toBe(1.50);
    expect(snapshot.promo_type).toBe('NEW_PRICE');
    expect(snapshot.promo_description).toBe('Special offer');
    expect(snapshot.promo_requires_card).toBe(1);
    expect(snapshot.promo_limit).toBe(6);
  });
});
