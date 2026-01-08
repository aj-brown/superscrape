import type { Product } from '../utils';
import type { ProductRecord, PriceSnapshotRecord } from './types';

export function productToRecord(product: Product, timestamp: string): ProductRecord {
  return {
    product_id: product.productId,
    name: product.name,
    brand: product.brand || null,
    category: product.category,
    subcategory: product.subcategory || null,
    category_level2: product.categoryLevel2 || null,
    origin: product.origin || null,
    sale_type: product.saleType || null,
    first_seen: timestamp,
    last_seen: timestamp,
  };
}

export function productToSnapshot(
  product: Product,
  storeId: string,
  timestamp: string
): PriceSnapshotRecord {
  return {
    product_id: product.productId,
    store_id: storeId,
    scraped_at: timestamp,
    price: product.price,
    price_per_unit: product.pricePerUnit ?? null,
    unit_of_measure: product.unitOfMeasure || null,
    display_name: product.displayName || null,
    available_in_store: product.availability.includes('IN_STORE') ? 1 : 0,
    available_online: product.availability.includes('ONLINE') ? 1 : 0,
    promo_price: product.promoPrice ?? null,
    promo_price_per_unit: product.promoPricePerUnit ?? null,
    promo_type: product.promoType || null,
    promo_description: product.promoDescription || null,
    promo_requires_card: product.promoRequiresCard != null ? (product.promoRequiresCard ? 1 : 0) : null,
    promo_limit: product.promoLimit ?? null,
  };
}

export function productsToRecordsAndSnapshots(
  products: Product[],
  storeId: string,
  timestamp: string
): { records: ProductRecord[]; snapshots: PriceSnapshotRecord[] } {
  return {
    records: products.map((p) => productToRecord(p, timestamp)),
    snapshots: products.map((p) => productToSnapshot(p, storeId, timestamp)),
  };
}
