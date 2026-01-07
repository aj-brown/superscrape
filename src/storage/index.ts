export { initDatabase, getDatabase, closeDatabase, checkpoint } from './database';
export {
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
  CheckpointResult,
} from './types';
