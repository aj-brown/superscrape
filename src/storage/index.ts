export { initDatabase, getDatabase, closeDatabase } from './database';
export {
  upsertProduct,
  insertPriceSnapshot,
  saveProducts,
  getProductHistory,
  getLatestPrices,
} from './repository';
export type {
  ProductRecord,
  PriceSnapshotRecord,
  StorageConfig,
  DatabaseConnection,
} from './types';
