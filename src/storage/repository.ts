import { getDatabase } from './database';
import type { ProductRecord, PriceSnapshotRecord } from './types';

export function upsertProduct(dbPath: string, product: ProductRecord): void {
  const db = getDatabase(dbPath);
  const stmt = db.prepare(`
    INSERT INTO products (
      product_id, name, brand, category, subcategory, category_level2,
      origin, sale_type, first_seen, last_seen
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(product_id) DO UPDATE SET
      name = excluded.name,
      brand = excluded.brand,
      category = excluded.category,
      subcategory = excluded.subcategory,
      category_level2 = excluded.category_level2,
      origin = excluded.origin,
      sale_type = excluded.sale_type,
      last_seen = excluded.last_seen
  `);
  stmt.run(
    product.product_id,
    product.name,
    product.brand,
    product.category,
    product.subcategory,
    product.category_level2,
    product.origin,
    product.sale_type,
    product.first_seen,
    product.last_seen
  );
}

export function insertPriceSnapshot(dbPath: string, snapshot: PriceSnapshotRecord): void {
  const db = getDatabase(dbPath);
  const stmt = db.prepare(`
    INSERT INTO price_snapshots (
      product_id, scraped_at, price, price_per_unit, unit_of_measure,
      display_name, available_in_store, available_online, promo_price,
      promo_price_per_unit, promo_type, promo_description,
      promo_requires_card, promo_limit
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    snapshot.product_id,
    snapshot.scraped_at,
    snapshot.price,
    snapshot.price_per_unit,
    snapshot.unit_of_measure,
    snapshot.display_name,
    snapshot.available_in_store,
    snapshot.available_online,
    snapshot.promo_price,
    snapshot.promo_price_per_unit,
    snapshot.promo_type,
    snapshot.promo_description,
    snapshot.promo_requires_card,
    snapshot.promo_limit
  );
}

export function saveProducts(
  dbPath: string,
  products: ProductRecord[],
  snapshots: PriceSnapshotRecord[]
): void {
  const db = getDatabase(dbPath);
  const transaction = db.transaction(() => {
    for (const product of products) {
      upsertProduct(dbPath, product);
    }
    for (const snapshot of snapshots) {
      insertPriceSnapshot(dbPath, snapshot);
    }
  });
  transaction();
}

export function getProductHistory(dbPath: string, productId: string): PriceSnapshotRecord[] {
  const db = getDatabase(dbPath);
  const stmt = db.prepare(`
    SELECT * FROM price_snapshots
    WHERE product_id = ?
    ORDER BY scraped_at ASC
  `);
  return stmt.all(productId) as PriceSnapshotRecord[];
}

export function getLatestPrices(dbPath: string): PriceSnapshotRecord[] {
  const db = getDatabase(dbPath);
  const stmt = db.prepare(`
    SELECT ps.* FROM price_snapshots ps
    INNER JOIN (
      SELECT product_id, MAX(scraped_at) as max_scraped_at
      FROM price_snapshots
      GROUP BY product_id
    ) latest ON ps.product_id = latest.product_id AND ps.scraped_at = latest.max_scraped_at
  `);
  return stmt.all() as PriceSnapshotRecord[];
}
