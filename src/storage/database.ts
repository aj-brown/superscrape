import Database from 'better-sqlite3';
import type { DatabaseConnection } from './types';

const connections = new Map<string, DatabaseConnection>();

const SCHEMA = `
-- Master product data (upserted on each scrape)
CREATE TABLE IF NOT EXISTS products (
  product_id      TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  brand           TEXT,
  category        TEXT,
  subcategory     TEXT,
  category_level2 TEXT,
  origin          TEXT,
  sale_type       TEXT,
  first_seen      TEXT NOT NULL,
  last_seen       TEXT NOT NULL
);

-- Price history (one row per product per scrape)
CREATE TABLE IF NOT EXISTS price_snapshots (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id          TEXT NOT NULL REFERENCES products(product_id),
  scraped_at          TEXT NOT NULL,
  price               REAL NOT NULL,
  price_per_unit      REAL,
  unit_of_measure     TEXT,
  display_name        TEXT,
  available_in_store  INTEGER NOT NULL DEFAULT 0,
  available_online    INTEGER NOT NULL DEFAULT 0,
  promo_price         REAL,
  promo_price_per_unit REAL,
  promo_type          TEXT,
  promo_description   TEXT,
  promo_requires_card INTEGER,
  promo_limit         INTEGER,
  UNIQUE(product_id, scraped_at)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_product ON price_snapshots(product_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_date ON price_snapshots(scraped_at);
`;

export function initDatabase(path: string): DatabaseConnection {
  const existing = connections.get(path);
  if (existing) {
    return existing;
  }

  const db = new Database(path);
  db.exec(SCHEMA);
  connections.set(path, db);
  return db;
}

export function getDatabase(path: string): DatabaseConnection {
  const existing = connections.get(path);
  if (existing) {
    return existing;
  }
  return initDatabase(path);
}

export function closeDatabase(path: string): void {
  const db = connections.get(path);
  if (db) {
    db.close();
    connections.delete(path);
  }
}
