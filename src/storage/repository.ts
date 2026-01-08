import { getDatabase } from './database';
import type {
  StoreRecord,
  ProductRecord,
  PriceSnapshotRecord,
  RunStatus,
  IncompleteRun,
  CategoryRunRecord,
  CategoryRunUpdate,
} from './types';

export function upsertStore(dbPath: string, store: StoreRecord): void {
  const db = getDatabase(dbPath);
  const stmt = db.prepare(`
    INSERT INTO stores (store_id, name, address, region, latitude, longitude, last_synced)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(store_id) DO UPDATE SET
      name = excluded.name,
      address = excluded.address,
      region = excluded.region,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      last_synced = excluded.last_synced
  `);
  stmt.run(
    store.store_id,
    store.name,
    store.address,
    store.region,
    store.latitude,
    store.longitude,
    store.last_synced
  );
}

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
      product_id, store_id, scraped_at, price, price_per_unit, unit_of_measure,
      display_name, available_in_store, available_online, promo_price,
      promo_price_per_unit, promo_type, promo_description,
      promo_requires_card, promo_limit
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    snapshot.product_id,
    snapshot.store_id,
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

// Run tracking functions
export function createRun(dbPath: string, storeId: string, categories: string[]): number {
  const db = getDatabase(dbPath);
  const now = new Date().toISOString();

  const insertRun = db.prepare(`
    INSERT INTO scrape_runs (started_at, status) VALUES (?, 'in_progress')
  `);
  const result = insertRun.run(now);
  const runId = result.lastInsertRowid as number;

  const insertCategory = db.prepare(`
    INSERT INTO category_runs (run_id, store_id, category_slug, status) VALUES (?, ?, ?, 'pending')
  `);

  for (const category of categories) {
    insertCategory.run(runId, storeId, category);
  }

  return runId;
}

export function updateCategoryRun(
  dbPath: string,
  runId: number,
  storeId: string,
  categorySlug: string,
  update: CategoryRunUpdate
): void {
  const db = getDatabase(dbPath);
  const stmt = db.prepare(`
    UPDATE category_runs
    SET status = ?, last_page = ?, product_count = ?, error = ?
    WHERE run_id = ? AND store_id = ? AND category_slug = ?
  `);
  stmt.run(
    update.status,
    update.lastPage ?? null,
    update.productCount ?? null,
    update.error ?? null,
    runId,
    storeId,
    categorySlug
  );
}

export function getRunStatus(dbPath: string, runId: number): RunStatus | null {
  const db = getDatabase(dbPath);

  const runStmt = db.prepare('SELECT * FROM scrape_runs WHERE id = ?');
  const run = runStmt.get(runId) as
    | { id: number; started_at: string; completed_at: string | null; status: string }
    | undefined;

  if (!run) {
    return null;
  }

  const categoriesStmt = db.prepare(
    'SELECT category_slug, status, last_page, product_count, error FROM category_runs WHERE run_id = ?'
  );
  const categoryRows = categoriesStmt.all(runId) as Array<{
    category_slug: string;
    status: string;
    last_page: number | null;
    product_count: number | null;
    error: string | null;
  }>;

  const categories: CategoryRunRecord[] = categoryRows.map((row) => ({
    categorySlug: row.category_slug,
    status: row.status as CategoryRunRecord['status'],
    lastPage: row.last_page ?? undefined,
    productCount: row.product_count ?? undefined,
    error: row.error ?? undefined,
  }));

  const completedCategories = categories.filter(
    (c) => c.status === 'completed'
  ).length;

  return {
    id: run.id,
    startedAt: run.started_at,
    completedAt: run.completed_at ?? undefined,
    status: run.status as RunStatus['status'],
    totalCategories: categories.length,
    completedCategories,
    categories,
  };
}

export function getIncompleteRun(dbPath: string): IncompleteRun | null {
  const db = getDatabase(dbPath);

  const runStmt = db.prepare(`
    SELECT id, started_at FROM scrape_runs
    WHERE status = 'in_progress'
    ORDER BY started_at DESC
    LIMIT 1
  `);
  const run = runStmt.get() as { id: number; started_at: string } | undefined;

  if (!run) {
    return null;
  }

  const pendingStmt = db.prepare(`
    SELECT category_slug FROM category_runs
    WHERE run_id = ? AND status IN ('pending', 'failed')
  `);
  const pendingRows = pendingStmt.all(run.id) as Array<{ category_slug: string }>;

  return {
    id: run.id,
    startedAt: run.started_at,
    pendingCategories: pendingRows.map((r) => r.category_slug),
  };
}

export function completeRun(dbPath: string, runId: number): void {
  const db = getDatabase(dbPath);
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE scrape_runs SET status = 'completed', completed_at = ? WHERE id = ?
  `);
  stmt.run(now, runId);
}
