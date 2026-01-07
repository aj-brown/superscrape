import { getDatabase } from './storage/database';
import { getProductsOnPromo } from './storage/queries';
import type { PriceSnapshotRecord } from './storage/types';
import type { PriceChange } from './storage/queries';

export interface OverallStats {
  totalProducts: number;
  totalSnapshots: number;
  productsOnPromo: number;
  categories: string[];
  dateRange: { earliest: string | null; latest: string | null };
}

export function getOverallStats(dbPath: string): OverallStats {
  const db = getDatabase(dbPath);

  const productCount = db
    .prepare('SELECT COUNT(*) as count FROM products')
    .get() as { count: number };

  const snapshotCount = db
    .prepare('SELECT COUNT(*) as count FROM price_snapshots')
    .get() as { count: number };

  const categories = db
    .prepare('SELECT DISTINCT category FROM products ORDER BY category')
    .all() as { category: string }[];

  const dateRange = db.prepare(`
    SELECT MIN(scraped_at) as earliest, MAX(scraped_at) as latest
    FROM price_snapshots
  `).get() as { earliest: string | null; latest: string | null };

  const promoProducts = getProductsOnPromo(dbPath);

  return {
    totalProducts: productCount.count,
    totalSnapshots: snapshotCount.count,
    productsOnPromo: promoProducts.length,
    categories: categories.map((c) => c.category),
    dateRange,
  };
}

export function formatPriceChange(change: PriceChange): string {
  const sign = change.delta >= 0 ? '+' : '-';
  const absDelta = Math.abs(change.delta).toFixed(2);
  return `${change.from_date} -> ${change.to_date}: $${change.from_price.toFixed(2)} -> $${change.to_price.toFixed(2)} (${sign}$${absDelta})`;
}

export function formatPromoProduct(promo: PriceSnapshotRecord): string {
  const savings = promo.promo_price
    ? ((1 - promo.promo_price / promo.price) * 100).toFixed(0)
    : 0;
  const name = promo.display_name || promo.product_id;
  return `${name}: $${promo.price.toFixed(2)} -> $${promo.promo_price?.toFixed(2)} (${savings}% off)`;
}
