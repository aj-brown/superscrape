import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { initDatabase, getDatabase } from '../../src/storage/database';

const TEST_DB_DIR = join(__dirname, '../../.test-data');
const TEST_DB_PATH = join(TEST_DB_DIR, 'test-db.sqlite');

describe('database', () => {
  beforeEach(() => {
    mkdirSync(TEST_DB_DIR, { recursive: true });
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  afterEach(() => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  it('creates database file at specified path', () => {
    initDatabase(TEST_DB_PATH);
    expect(existsSync(TEST_DB_PATH)).toBe(true);
  });

  it('creates products table with correct schema', () => {
    const db = initDatabase(TEST_DB_PATH);
    const tableInfo = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='products'")
      .get() as { name: string } | undefined;
    expect(tableInfo?.name).toBe('products');

    const columns = db.prepare("PRAGMA table_info('products')").all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>;

    const columnNames = columns.map((c) => c.name);
    expect(columnNames).toContain('product_id');
    expect(columnNames).toContain('name');
    expect(columnNames).toContain('brand');
    expect(columnNames).toContain('category');
    expect(columnNames).toContain('subcategory');
    expect(columnNames).toContain('category_level2');
    expect(columnNames).toContain('origin');
    expect(columnNames).toContain('sale_type');
    expect(columnNames).toContain('first_seen');
    expect(columnNames).toContain('last_seen');

    const pkColumn = columns.find((c) => c.pk === 1);
    expect(pkColumn?.name).toBe('product_id');
  });

  it('creates price_snapshots table with correct schema', () => {
    const db = initDatabase(TEST_DB_PATH);
    const tableInfo = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='price_snapshots'"
      )
      .get() as { name: string } | undefined;
    expect(tableInfo?.name).toBe('price_snapshots');

    const columns = db.prepare("PRAGMA table_info('price_snapshots')").all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>;

    const columnNames = columns.map((c) => c.name);
    expect(columnNames).toContain('id');
    expect(columnNames).toContain('product_id');
    expect(columnNames).toContain('scraped_at');
    expect(columnNames).toContain('price');
    expect(columnNames).toContain('price_per_unit');
    expect(columnNames).toContain('unit_of_measure');
    expect(columnNames).toContain('display_name');
    expect(columnNames).toContain('available_in_store');
    expect(columnNames).toContain('available_online');
    expect(columnNames).toContain('promo_price');
    expect(columnNames).toContain('promo_price_per_unit');
    expect(columnNames).toContain('promo_type');
    expect(columnNames).toContain('promo_description');
    expect(columnNames).toContain('promo_requires_card');
    expect(columnNames).toContain('promo_limit');
  });

  it('creates indexes', () => {
    const db = initDatabase(TEST_DB_PATH);
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
      .all() as Array<{ name: string }>;

    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain('idx_snapshots_product');
    expect(indexNames).toContain('idx_snapshots_date');
  });

  it('is idempotent - running twice does not error', () => {
    initDatabase(TEST_DB_PATH);
    expect(() => initDatabase(TEST_DB_PATH)).not.toThrow();
  });

  it('returns usable database connection', () => {
    const db = initDatabase(TEST_DB_PATH);
    const result = db.prepare('SELECT 1 + 1 as sum').get() as { sum: number };
    expect(result.sum).toBe(2);
  });

  it('getDatabase returns existing connection for same path', () => {
    const db1 = initDatabase(TEST_DB_PATH);
    const db2 = getDatabase(TEST_DB_PATH);
    expect(db2).toBe(db1);
  });
});
