import type { Database } from 'better-sqlite3';

export interface ProductRecord {
  product_id: string;
  name: string;
  brand: string | null;
  category: string;
  subcategory: string | null;
  category_level2: string | null;
  origin: string | null;
  sale_type: string | null;
  first_seen: string;
  last_seen: string;
}

export interface PriceSnapshotRecord {
  id?: number;
  product_id: string;
  scraped_at: string;
  price: number;
  price_per_unit: number | null;
  unit_of_measure: string | null;
  display_name: string | null;
  available_in_store: number;
  available_online: number;
  promo_price: number | null;
  promo_price_per_unit: number | null;
  promo_type: string | null;
  promo_description: string | null;
  promo_requires_card: number | null;
  promo_limit: number | null;
}

export interface StorageConfig {
  dbPath: string;
}

export type DatabaseConnection = Database;

export interface CheckpointResult {
  walPages: number;
  movedPages: number;
}
