# SQLite Price Tracking Storage Module

## Overview
Add SQLite storage to track product price snapshots over time. Products stored in unified table with separate price history table.

## Database Schema

```sql
-- Master product data (upserted on each scrape)
CREATE TABLE products (
  product_id      TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  brand           TEXT,
  category        TEXT,
  subcategory     TEXT,
  category_level2 TEXT,           -- More granular (e.g., "Apples & Pears")
  origin          TEXT,
  sale_type       TEXT,           -- "BOTH", "IN_STORE", "ONLINE"
  first_seen      TEXT NOT NULL,  -- ISO timestamp
  last_seen       TEXT NOT NULL   -- ISO timestamp
);

-- Price history (one row per product per scrape)
CREATE TABLE price_snapshots (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id          TEXT NOT NULL REFERENCES products(product_id),
  scraped_at          TEXT NOT NULL,  -- ISO timestamp
  price               REAL NOT NULL,  -- In dollars (5.19)
  price_per_unit      REAL,
  unit_of_measure     TEXT,           -- "100g", "1kg", "1L"
  display_name        TEXT,           -- "150g", "2L"
  available_in_store  INTEGER NOT NULL DEFAULT 0,
  available_online    INTEGER NOT NULL DEFAULT 0,
  -- Promo fields (from promotions[] array, best promotion)
  promo_price         REAL,           -- rewardValue in dollars (3.99)
  promo_price_per_unit REAL,          -- promo comparativePrice
  promo_type          TEXT,           -- rewardType: "NEW_PRICE", etc.
  promo_description   TEXT,           -- "Limit 12 assorted"
  promo_requires_card INTEGER,        -- cardDependencyFlag (0/1)
  promo_limit         INTEGER,        -- max quantity allowed
  UNIQUE(product_id, scraped_at)
);

CREATE INDEX idx_snapshots_product ON price_snapshots(product_id);
CREATE INDEX idx_snapshots_date ON price_snapshots(scraped_at);
```

## Files to Create/Modify

**New files:**
- `src/storage/index.ts` - Main exports
- `src/storage/database.ts` - SQLite connection & schema setup
- `src/storage/repository.ts` - CRUD operations
- `src/storage/types.ts` - TypeScript interfaces
- `tests/storage/database.test.ts` - Schema tests
- `tests/storage/repository.test.ts` - Repository tests

**Modified files:**
- `src/utils.ts` - Extend Product interface with new fields
- `src/index.ts` - Call storage after scraping
- `package.json` - Add better-sqlite3 dependency

---

## Phase 1: Database Setup Module

### Tasks
- [x] Add `better-sqlite3` dependency
- [x] Create `src/storage/types.ts` with interfaces
- [x] Create `src/storage/database.ts` with:
  - [x] `initDatabase(path)` - Creates DB file and tables
  - [x] `getDatabase(path)` - Gets existing connection
  - [x] Schema creation with indexes

### Tests (`tests/storage/database.test.ts`)
- [x] Creates database file at specified path
- [x] Creates products table with correct schema
- [x] Creates price_snapshots table with correct schema
- [x] Creates indexes
- [x] Idempotent - running twice doesn't error
- [x] Returns usable database connection

### Verification
```bash
npm test -- tests/storage/database.test.ts
```

---

## Phase 2: Repository Module

### Tasks
- [x] Create `src/storage/repository.ts` with:
  - [x] `upsertProduct(product)` - Insert or update product master data
  - [x] `insertPriceSnapshot(productId, snapshot)` - Add price record
  - [x] `saveProducts(products[], scrapedAt)` - Batch save (main entry point)
  - [x] `getProductHistory(productId)` - Get price history for a product
  - [x] `getLatestPrices()` - Get most recent price for all products

### Tests (`tests/storage/repository.test.ts`)
- [x] upsertProduct creates new product
- [x] upsertProduct updates existing product's last_seen
- [x] upsertProduct preserves first_seen on update
- [x] insertPriceSnapshot creates snapshot record
- [x] insertPriceSnapshot enforces unique constraint (product_id, scraped_at)
- [x] saveProducts handles batch of products correctly
- [x] saveProducts updates products and creates snapshots atomically
- [x] getProductHistory returns chronological price history
- [x] getLatestPrices returns most recent snapshot per product

### Verification
```bash
npm test -- tests/storage/repository.test.ts
```

---

## Phase 3: Extend Product Interface

### Tasks
- [x] Update `src/utils.ts` Product interface to include:
  - [x] `categoryLevel2?: string`
  - [x] `saleType?: string`
  - [x] `promoPrice?: number` (from promotions[0].rewardValue / 100)
  - [x] `promoPricePerUnit?: number`
  - [x] `promoType?: string` (rewardType: "NEW_PRICE", etc.)
  - [x] `promoDescription?: string`
  - [x] `promoRequiresCard?: boolean` (cardDependencyFlag)
  - [x] `promoLimit?: number`
- [x] Update `parseProduct()` in utils.ts to:
  - [x] Extract categoryLevel2 from categoryTrees[0].level2
  - [x] Extract saleType
  - [x] Find best promotion (where bestPromotion=true) from promotions[]
  - [x] Parse promo fields from that promotion
- [x] Create `src/storage/index.ts` to export public API

### Tests
- [x] Existing tests still pass
- [x] parseProduct extracts categoryLevel2 from categoryTrees[0].level2
- [x] parseProduct extracts saleType
- [x] parseProduct extracts promo fields when promotions[] exists
- [x] parseProduct finds bestPromotion=true when multiple promos
- [x] parseProduct handles missing promotions[] gracefully (all promo fields undefined)

### Verification
```bash
npm test
```

---

## Phase 4: Integration with Scraper

### Tasks
- [x] Modify `src/index.ts` to:
  - [x] Import storage module
  - [x] Initialize database on startup
  - [x] Call `saveProducts()` after each scrape operation
  - [x] Keep JSON output as backup/debug option

### Tests (`tests/integration/storage-integration.test.ts`)
- [x] Full scrape flow saves products to database
- [x] Multiple scrapes create price history
- [x] Database persists between runs

### Verification
```bash
# Run full test suite
npm test

# Manual verification
npm run dev
# Check ./data/prices.db exists and has data
```

---

## Phase 5: Query Utilities

### Tasks
- [x] Add to `src/storage/queries.ts`:
  - [x] `getPriceHistory(productId)` - Get all snapshots for a product
  - [x] `getPriceChanges(productId)` - Show price deltas over time (price went up/down)
  - [x] `getProductsByCategory(category, subcategory?)` - Filter by category
  - [x] `getProductsOnPromo()` - Find products with active promotions
  - [x] `searchProducts(query)` - Text search on name/brand

### Tests (`tests/storage/queries.test.ts`)
- [x] getPriceHistory returns chronological snapshots
- [x] getPriceChanges calculates correct deltas between snapshots
- [x] getPriceChanges returns empty array for single snapshot
- [x] getProductsByCategory filters by category
- [x] getProductsByCategory filters by subcategory when provided
- [x] getProductsOnPromo returns only products with promo_price set
- [x] searchProducts matches on product name (case-insensitive)
- [x] searchProducts matches on brand (case-insensitive)
- [x] searchProducts returns empty array for no matches

### Verification
```bash
npm test -- tests/storage/queries.test.ts
```

---

## Implementation Order

1. **Phase 1** → Run tests → Verify
2. **Phase 2** → Run tests → Verify
3. **Phase 3** → Run full test suite → Verify
4. **Phase 4** → Run integration tests → Manual verification
5. **Phase 5** → Run query tests → Verify

## Dependencies to Add

```bash
npm install better-sqlite3
npm install -D @types/better-sqlite3
```

## Success Criteria

- [x] All tests pass (99 tests passing)
- [x] Database created at `./data/prices.db`
- [x] Products table populated with master data
- [x] Price snapshots table has one row per product per scrape
- [x] Running scraper multiple times creates price history
- [x] Existing JSON output still works
