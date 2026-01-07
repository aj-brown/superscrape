export { initDatabase, getDatabase, closeDatabase } from './database';
export {
  upsertProduct,
  insertPriceSnapshot,
  saveProducts,
  getProductHistory,
  getLatestPrices,
} from './repository';
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
