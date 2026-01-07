export { initDatabase, getDatabase, closeDatabase } from './database';
export {
  upsertProduct,
  insertPriceSnapshot,
  saveProducts,
  getProductHistory,
  getLatestPrices,
} from './repository';
export {
  getPriceHistory as getPriceHistoryQuery,
  getPriceChanges,
  getProductsByCategory,
  getProductsOnPromo,
  searchProducts,
  type PriceChange,
} from './queries';
export {
  productToRecord,
  productToSnapshot,
  productsToRecordsAndSnapshots,
} from './converters';
export type {
  ProductRecord,
  PriceSnapshotRecord,
  StorageConfig,
  DatabaseConnection,
} from './types';
