import { getDatabase } from './database';
import type { ProductRecord, PriceSnapshotRecord, RunStatus } from './types';

export interface PriceChange {
  product_id: string;
  from_date: string;
  to_date: string;
  from_price: number;
  to_price: number;
  delta: number;
}

export interface RunSummary {
  id: number;
  startedAt: string;
  completedAt?: string;
  status: RunStatus['status'];
  totalCategories: number;
  completedCategories: number;
}

export interface DatabaseTotals {
  totalProducts: number;
  totalSnapshots: number;
  productsOnPromo: number;
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

export function listRuns(dbPath: string, limit = 20): RunSummary[] {
  const db = getDatabase(dbPath);
  const stmt = db.prepare(`
    SELECT
      sr.id,
      sr.started_at,
      sr.completed_at,
      sr.status,
      COUNT(cr.id) as total_categories,
      SUM(CASE WHEN cr.status = 'completed' THEN 1 ELSE 0 END) as completed_categories
    FROM scrape_runs sr
    LEFT JOIN category_runs cr ON sr.id = cr.run_id
    GROUP BY sr.id
    ORDER BY sr.id DESC
    LIMIT ?
  `);

  const rows = stmt.all(limit) as Array<{
    id: number;
    started_at: string;
    completed_at: string | null;
    status: string;
    total_categories: number;
    completed_categories: number;
  }>;

  return rows.map((row) => ({
    id: row.id,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    status: row.status as RunStatus['status'],
    totalCategories: row.total_categories,
    completedCategories: row.completed_categories,
  }));
}

export function getDatabaseTotals(dbPath: string): DatabaseTotals {
  const db = getDatabase(dbPath);

  const productCount = db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number };
  const snapshotCount = db.prepare('SELECT COUNT(*) as count FROM price_snapshots').get() as { count: number };

  // Count products with promo in their latest snapshot
  const promoCount = db.prepare(`
    SELECT COUNT(*) as count FROM (
      SELECT ps.product_id FROM price_snapshots ps
      INNER JOIN (
        SELECT product_id, MAX(scraped_at) as max_scraped_at
        FROM price_snapshots
        GROUP BY product_id
      ) latest ON ps.product_id = latest.product_id AND ps.scraped_at = latest.max_scraped_at
      WHERE ps.promo_price IS NOT NULL
    )
  `).get() as { count: number };

  return {
    totalProducts: productCount.count,
    totalSnapshots: snapshotCount.count,
    productsOnPromo: promoCount.count,
  };
}
