import { getDatabase } from './database';
import type { ProductRecord, PriceSnapshotRecord } from './types';

export interface PriceChange {
  product_id: string;
  from_date: string;
  to_date: string;
  from_price: number;
  to_price: number;
  delta: number;
}

export function getPriceHistory(dbPath: string, productId: string): PriceSnapshotRecord[] {
  const db = getDatabase(dbPath);
  const stmt = db.prepare(`
    SELECT * FROM price_snapshots
    WHERE product_id = ?
    ORDER BY scraped_at ASC
  `);
  return stmt.all(productId) as PriceSnapshotRecord[];
}

export function getPriceChanges(dbPath: string, productId: string): PriceChange[] {
  const history = getPriceHistory(dbPath, productId);

  if (history.length < 2) {
    return [];
  }

  const changes: PriceChange[] = [];
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const curr = history[i];
    changes.push({
      product_id: productId,
      from_date: prev.scraped_at,
      to_date: curr.scraped_at,
      from_price: prev.price,
      to_price: curr.price,
      delta: Number((curr.price - prev.price).toFixed(2)),
    });
  }

  return changes;
}

export function getProductsByCategory(
  dbPath: string,
  category: string,
  subcategory?: string
): ProductRecord[] {
  const db = getDatabase(dbPath);

  if (subcategory) {
    const stmt = db.prepare(`
      SELECT * FROM products
      WHERE category = ? AND subcategory = ?
      ORDER BY name ASC
    `);
    return stmt.all(category, subcategory) as ProductRecord[];
  }

  const stmt = db.prepare(`
    SELECT * FROM products
    WHERE category = ?
    ORDER BY name ASC
  `);
  return stmt.all(category) as ProductRecord[];
}

export function getProductsOnPromo(dbPath: string): PriceSnapshotRecord[] {
  const db = getDatabase(dbPath);
  const stmt = db.prepare(`
    SELECT ps.* FROM price_snapshots ps
    INNER JOIN (
      SELECT product_id, MAX(scraped_at) as max_scraped_at
      FROM price_snapshots
      GROUP BY product_id
    ) latest ON ps.product_id = latest.product_id AND ps.scraped_at = latest.max_scraped_at
    WHERE ps.promo_price IS NOT NULL
  `);
  return stmt.all() as PriceSnapshotRecord[];
}

export function searchProducts(dbPath: string, query: string): ProductRecord[] {
  const db = getDatabase(dbPath);
  const searchPattern = `%${query}%`;
  const stmt = db.prepare(`
    SELECT * FROM products
    WHERE name LIKE ? COLLATE NOCASE
       OR brand LIKE ? COLLATE NOCASE
    ORDER BY name ASC
  `);
  return stmt.all(searchPattern, searchPattern) as ProductRecord[];
}
