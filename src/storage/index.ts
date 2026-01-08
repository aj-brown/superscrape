export { initDatabase, getDatabase, closeDatabase, checkpoint } from './database';
export {
  upsertStore,
  upsertProduct,
  insertPriceSnapshot,
  saveProducts,
  getProductHistory,
  getLatestPrices,
  createRun,
  updateCategoryRun,
  getRunStatus,
  getIncompleteRun,
  completeRun,
} from './repository';
export {
  getPriceHistory as getPriceHistoryQuery,
  getPriceChanges,
  getProductsByCategory,
  getProductsOnPromo,
  searchProducts,
  getDatabaseTotals,
  type PriceChange,
  type DatabaseTotals,
} from './queries';
export {
  productToRecord,
  productToSnapshot,
  productsToRecordsAndSnapshots,
} from './converters';
export type {
  StoreRecord,
  ProductRecord,
  PriceSnapshotRecord,
  StorageConfig,
  DatabaseConnection,
  CheckpointResult,
} from './types';
