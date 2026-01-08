# Multi-Store Support Specification

## Overview

This document outlines the changes needed to support scraping multiple New World stores, as pricing can vary between locations.

## API Analysis

### 1. List Stores - `GET /v1/edge/store`

Returns all 144 New World stores with metadata.

**Request:**
```
GET https://api-prod.newworld.co.nz/v1/edge/store
Authorization: Bearer {token}
```

**Response Structure:**
```typescript
interface Store {
  id: string;              // UUID, e.g., "60928d93-06fa-4d8f-92a6-8c359e7e846d"
  name: string;            // e.g., "New World Metro Auckland"
  banner: string;          // Always "MNW"
  address: string;         // Full address string
  region: string;          // "NI" (North Island), etc.
  clickAndCollect: boolean;
  delivery: boolean;
  latitude: number;
  longitude: number;
  onlineActive: boolean;
  physicalActive: boolean;
  // ... additional fields (hours, phone, etc.)
}

interface StoresResponse {
  stores: Store[];
}
```

### 2. Set Store Context - `POST /v1/edge/cart/store/{storeId}`

Sets the active store for the session (affects cart operations).

**Request:**
```
POST https://api-prod.newworld.co.nz/v1/edge/cart/store/{storeId}
Authorization: Bearer {token}
Content-Type: application/json
(empty body)
```

**Response:** 200 OK with empty body

### 3. Verify Store - `GET /v1/edge/cart`

Returns cart including current store context.

**Request:**
```
GET https://api-prod.newworld.co.nz/v1/edge/cart
Authorization: Bearer {token}
```

**Response includes:**
```typescript
interface CartResponse {
  store: {
    storeId: string;
    storeName: string;
    storeAddress: string;
    storeRegion: string;
  };
  // ... cart items, etc.
}
```

## Key Insight

The product search API already accepts `storeId` as a parameter in the payload:
```typescript
filters: `stores:${query.storeId}` // Already in buildProductSearchPayload()
```

This means we can query products for any store **without** needing to call the POST store endpoint. The POST endpoint is primarily for cart/checkout flows.

## Current Architecture Issues

1. **Database schema lacks store association**
   - `products` table has no `store_id`
   - `price_snapshots` has no `store_id`
   - Cannot track per-store pricing

2. **Single store assumption**
   - `NewWorldScraper` initializes with one store and keeps it
   - No mechanism to switch stores or iterate through multiple

3. **CLI has no store selection**
   - No `--store` or `--all-stores` options

4. **Run/resume system is store-unaware**
   - `category_runs` tracks `(run_id, category_slug)` only
   - Cannot track which stores have been completed
   - Resume would not know which store+category pairs remain

## Current Run/Resume Architecture

### Existing Tables

```sql
-- Tracks overall scrape runs
CREATE TABLE scrape_runs (
  id            INTEGER PRIMARY KEY,
  started_at    TEXT NOT NULL,
  completed_at  TEXT,
  status        TEXT NOT NULL DEFAULT 'in_progress'  -- 'in_progress', 'completed'
);

-- Tracks per-category progress within a run
CREATE TABLE category_runs (
  id            INTEGER PRIMARY KEY,
  run_id        INTEGER NOT NULL REFERENCES scrape_runs(id),
  category_slug TEXT NOT NULL,  -- e.g., "Pantry > Canned Foods"
  status        TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'in_progress', 'completed', 'failed'
  last_page     INTEGER,
  product_count INTEGER,
  error         TEXT,
  UNIQUE(run_id, category_slug)
);
```

### Current Resume Flow

1. `resolveResumeState()` checks for incomplete runs
2. `--resume` flag finds last in_progress run
3. `--run-id X` resumes specific run
4. Returns only pending/failed categories to re-scrape
5. Completed categories are skipped

### Multi-Store Impact

With 144 stores × 140 categories = 20,160 store+category combinations per full run:

- **Granularity change**: Track `(run_id, store_id, category_slug)` instead of `(run_id, category_slug)`
- **Run scope**: A single run spans all selected stores
- **Resume precision**: Can resume mid-store (e.g., store A done, store B partially done, store C not started)

## Proposed Changes

### Phase 1: Database Schema Changes

Fresh schema with store support (no migration needed - start with new database):

```sql
-- Store metadata cache
CREATE TABLE IF NOT EXISTS stores (
  store_id    TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  address     TEXT,
  region      TEXT,
  latitude    REAL,
  longitude   REAL,
  last_synced TEXT NOT NULL
);

-- Master product data (store-agnostic)
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

-- Price history (per-store)
CREATE TABLE IF NOT EXISTS price_snapshots (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id          TEXT NOT NULL REFERENCES products(product_id),
  store_id            TEXT NOT NULL REFERENCES stores(store_id),  -- NEW: required
  scraped_at          TEXT NOT NULL,
  price               REAL NOT NULL,
  -- ... other price fields ...
  UNIQUE(product_id, store_id, scraped_at)  -- Changed from (product_id, scraped_at)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_product ON price_snapshots(product_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_store ON price_snapshots(store_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_date ON price_snapshots(scraped_at);

-- Run tracking (unchanged)
CREATE TABLE IF NOT EXISTS scrape_runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at    TEXT NOT NULL,
  completed_at  TEXT,
  status        TEXT NOT NULL DEFAULT 'in_progress'
);

-- Category run tracking (per-store)
CREATE TABLE IF NOT EXISTS category_runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id        INTEGER NOT NULL REFERENCES scrape_runs(id),
  store_id      TEXT NOT NULL REFERENCES stores(store_id),  -- NEW: required
  category_slug TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  last_page     INTEGER,
  product_count INTEGER,
  error         TEXT,
  UNIQUE(run_id, store_id, category_slug)  -- Changed from (run_id, category_slug)
);

CREATE INDEX IF NOT EXISTS idx_category_runs_run ON category_runs(run_id);
CREATE INDEX IF NOT EXISTS idx_category_runs_store ON category_runs(store_id);
```

**Decision:** Start fresh with new database. Existing data can be deleted.

### Phase 2: Store API Client

**Design Decision:** Add `getStores()` method to `NewWorldScraper` class, following the existing `getCategories()` pattern. This keeps API interaction logic centralized and reuses the captured auth token and page context.

**Scraper addition** (`src/scraper.ts`):

```typescript
const STORES_API_URL = 'https://api-prod.newworld.co.nz/v1/edge/store';

// Add to NewWorldScraper class
async getStores(): Promise<StoreInfo[]> {
  await this.ensureValidToken();
  const headers = buildApiHeaders(this.cookies, this.authorizationToken!);

  const response = await this.reliability.execute(async () => {
    return this.page!.context().request.get(STORES_API_URL, { headers });
  });

  if (!response.ok()) {
    throw new Error(`Stores API failed: ${response.status()}`);
  }

  const data = await response.json() as { stores?: StoreApiResponse[] };
  return (data.stores || []).map(parseStoreFromApi);
}
```

**Utility module** (`src/stores.ts`) - pure functions, no API calls:

```typescript
interface StoreInfo {
  id: string;
  name: string;
  address: string;
  region: string;
  latitude: number;
  longitude: number;
  onlineActive: boolean;
  physicalActive: boolean;
}

// Parse API response to StoreInfo (used by scraper)
function parseStoreFromApi(raw: StoreApiResponse): StoreInfo

// Save stores to database cache
function syncStoresToDb(dbPath: string, stores: StoreInfo[]): void

// Get random sample of stores for testing
function sampleStores(stores: StoreInfo[], count: number): StoreInfo[]

// Find store by name (fuzzy match for CLI)
function findStoreByName(stores: StoreInfo[], name: string): StoreInfo | null
```

### Phase 3: Scraper storeId Flow

The product search API already accepts `storeId` in the payload (see `buildProductSearchPayload()`). No session state change is needed - just pass the target `storeId` through the scrape methods.

**Changes:**
- `scrapeCategory()` already uses `this.storeId` in the query
- Add `setStoreId(id: string)` method to switch stores between scrapes
- The `storeId` flows: CLI → scraper → `fetchProductsFromApi()` → `saveProducts()`

```typescript
// Add to NewWorldScraper class
setStoreId(storeId: string): void {
  this.storeId = storeId;
}

getStoreId(): string | null {
  return this.storeId;
}
```

**Note:** No need to call POST `/v1/edge/cart/store/{storeId}` - that's only for cart/checkout. Product queries accept storeId directly in the payload.

### Phase 4: CLI Changes

New CLI options:

```bash
# Scrape specific store(s) by name (repeatable)
npm run dev -- --store "New World Metro Auckland"
npm run dev -- --store "New World Metro Auckland" --store "New World Thorndon"

# Scrape specific store by ID
npm run dev -- --store-id "60928d93-06fa-4d8f-92a6-8c359e7e846d"

# Scrape all stores
npm run dev -- --all-stores

# List available stores (dry-run variant)
npm run dev -- --list-stores

# Sample N random stores (for testing)
npm run dev -- --all-stores --sample-stores 5
```

### Phase 5: Multi-Store Scraper Workflow

New high-level flow:

```
1. Initialize browser & capture token
2. Fetch stores list from API
3. Filter to target stores (CLI selection or all)
4. For each store:
   a. Update storeId in scraper context
   b. For each category:
      - Scrape products with storeId in payload
      - Save to DB with store_id association
5. Report summary per store
```

### Phase 6: Database Query Updates

Update `repository.ts` functions:

```typescript
// saveProducts needs store_id parameter
function saveProducts(
  dbPath: string,
  records: ProductRecord[],
  snapshots: SnapshotRecord[],
  storeId: string  // NEW
): void

// New queries
function getProductsByStore(dbPath: string, storeId: string): Product[]
function getPriceHistory(dbPath: string, productId: string, storeId?: string): Snapshot[]
function comparePricesAcrossStores(dbPath: string, productId: string): StorePrice[]
```

## Data Model Considerations

### Unique Constraint Changes

**price_snapshots:**
- Current: `UNIQUE(product_id, scraped_at)`
- New: `UNIQUE(product_id, store_id, scraped_at)`
- Allows same product to have different prices at different stores on same timestamp

**category_runs:**
- Current: `UNIQUE(run_id, category_slug)`
- New: `UNIQUE(run_id, store_id, category_slug)`
- Allows tracking progress per store+category combination

### Product Identity

Products have the same `productId` across all stores. Only pricing and availability differ. The `products` table remains store-agnostic (master data), while `price_snapshots` becomes store-specific.

## Resume System Changes

### Updated Types

```typescript
// src/storage/types.ts

interface CategoryRunRecord {
  storeId: string;        // NEW
  categorySlug: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  lastPage?: number;
  productCount?: number;
  error?: string;
}

interface IncompleteRun {
  id: number;
  startedAt: string;
  pendingItems: Array<{   // Changed from pendingCategories: string[]
    storeId: string;
    categorySlug: string;
  }>;
}
```

### Updated Resume Flow

```typescript
// src/resume.ts - resolveResumeState() changes

interface ResumeResult {
  runId?: number;
  itemsToScrape: Array<{    // Changed from categoriesToScrape
    store: StoreInfo;
    category: FlatCategory;
  }>;
  isResuming: boolean;
  message?: string;
  allCompleted?: boolean;
}

// Resume logic:
// 1. Find incomplete run (same as before)
// 2. Get pending (store_id, category_slug) pairs from category_runs
// 3. Match against selected stores × selected categories
// 4. Return only pending combinations
```

### Run Creation Changes

```typescript
// src/storage/repository.ts - createRun() changes

function createRun(
  dbPath: string,
  stores: StoreInfo[],      // NEW parameter
  categories: string[]
): number {
  // Creates run record
  // Creates category_runs for each (store, category) combination
  // Total rows = stores.length × categories.length
}
```

### Progress Tracking

With multi-store, progress becomes two-dimensional:

```
Run #5 Progress:
├── New World Metro Auckland (3/140 categories)
│   ├── Pantry > Canned Foods ✓
│   ├── Pantry > Pasta & Rice ✓
│   ├── Pantry > Baking (in progress)
│   └── ... 137 pending
├── New World Thorndon (0/140 categories)
│   └── ... 140 pending
└── New World Lambton Quay (0/140 categories)
    └── ... 140 pending

Overall: 3/420 completed (0.7%)
```

### Resume CLI Behavior

```bash
# Resume last incomplete run (picks up where it left off)
npm run dev -- --resume

# Resume specific run
npm run dev -- --run-id 5

# Resume but only for specific store (filters pending items)
npm run dev -- --resume --store "New World Metro Auckland"
```

## Implementation Checklist

### Phase 1: Database Schema
- [x] Create fresh schema with `stores` table
- [x] Add `store_id` column to `price_snapshots` table
- [x] Add `store_id` column to `category_runs` table
- [x] Update unique constraints for multi-store support
- [x] Add indexes for store-based queries

**Acceptance Criteria:**
- Schema creates successfully with `npm run dev` (auto-init)
- `price_snapshots` accepts `(product_id, store_id, scraped_at)` as unique
- `category_runs` accepts `(run_id, store_id, category_slug)` as unique

**Tests:**
- `repository.test.ts`: Insert same product with different store_ids succeeds
- `repository.test.ts`: Insert duplicate (product_id, store_id, scraped_at) fails with constraint error

---

### Phase 2: Store API Client
- [x] Add `STORES_API_URL` constant to `src/utils.ts`
- [x] Add `StoreInfo` type and `parseStoreFromApi()` to `src/utils.ts`
- [x] Add `getStores()` method to `NewWorldScraper` (like `getCategories()`)
- [x] Create `src/stores.ts` with utility functions (no API calls)
- [x] Implement `syncStoresToDb()` - cache stores in database
- [x] Implement `sampleStores()` - random selection for testing
- [x] Implement `findStoreByName()` - fuzzy match for CLI

**Acceptance Criteria:**
- `scraper.getStores()` returns array of 144 stores with required fields
- `syncStoresToDb()` upserts stores (idempotent)
- `sampleStores(stores, 5)` returns exactly 5 random stores

**Tests:**
- `scraper.test.ts`: Mock stores API response, verify `getStores()` parsing
- `stores.test.ts`: `sampleStores` returns correct count, no duplicates
- `stores.test.ts`: `syncStoresToDb` handles upsert correctly
- `stores.test.ts`: `findStoreByName` matches partial names

---

### Phase 3: CLI `--list-stores`
- [ ] Add `--list-stores` CLI flag
- [ ] Fetch and display all stores in table format
- [ ] Show store name, region, and ID
- [ ] Exit after listing (no scrape)

**Acceptance Criteria:**
- `npm run dev -- --list-stores` prints store table and exits
- Output includes store name, region, ID columns
- Works without any other flags

**Tests:**
- Integration test: CLI exits with code 0, output contains expected store names

---

### Phase 4: Repository Updates
- [ ] Update `saveProducts()` to accept `storeId` parameter
- [ ] Update `createRun()` to accept stores array
- [ ] Update `updateCategoryRun()` to use `(run_id, store_id, category_slug)`
- [ ] Update `getCategoryRunStatus()` for store-aware queries
- [ ] Add `getProductsByStore()` query
- [ ] Add `comparePricesAcrossStores()` query

**Acceptance Criteria:**
- `saveProducts(db, products, snapshots, storeId)` inserts with store_id
- `createRun(db, stores, categories)` creates N×M category_run rows
- All existing tests pass with updated signatures

**Tests:**
- `repository.test.ts`: `saveProducts` inserts correct store_id
- `repository.test.ts`: `createRun` with 2 stores × 3 categories = 6 rows
- `repository.test.ts`: `getCategoryRunStatus` filters by store_id

---

### Phase 5: Resume System Updates
- [ ] Update `CategoryRunRecord` type with `storeId` field
- [ ] Update `IncompleteRun.pendingItems` to `Array<{storeId, categorySlug}>`
- [ ] Update `ResumeResult.itemsToScrape` to include store info
- [ ] Update `resolveResumeState()` for (store, category) pairs
- [ ] Update `getPendingCategories()` to return store+category tuples

**Acceptance Criteria:**
- Resume finds pending (store, category) pairs, not just categories
- `--resume` picks up mid-store (store A done, store B partial)
- `--resume --store X` filters to only store X's pending items

**Tests:**
- `resume.test.ts`: Incomplete run with 2 stores, 1 partially done → correct pending items
- `resume.test.ts`: Resume with store filter returns only that store's pending
- `resume.test.ts`: All (store, category) pairs completed → `allCompleted: true`

---

### Phase 6: Scraper storeId Flow
- [ ] Add `setStoreId(id)` and `getStoreId()` methods to `NewWorldScraper`
- [ ] Update `scrapeCategory()` to return `storeId` with products
- [ ] Pass `storeId` from scraper through to `saveProducts()`
- [ ] Verify `buildProductSearchPayload()` uses the correct `storeId`

**Acceptance Criteria:**
- `scraper.setStoreId(id)` switches store without re-initialization
- `scraper.getStoreId()` returns current store
- Products saved with correct `store_id` in database
- Price snapshots associated with correct store

**Tests:**
- `scraper.test.ts`: `setStoreId` updates internal state
- `scraper.test.ts`: Mock scrape with storeId → payload contains correct store filter
- Integration: Scrape same category from 2 stores → both have records in DB

---

### Phase 7: CLI `--store` Option
- [ ] Add `--store` flag (repeatable) for store name selection
- [ ] Add `--store-id` flag for UUID selection
- [ ] Validate store names/IDs against fetched stores
- [ ] Error on invalid store name with suggestions

**Acceptance Criteria:**
- `--store "New World Metro Auckland"` scrapes only that store
- `--store X --store Y` scrapes both stores
- Invalid store name shows error with closest matches

**Tests:**
- CLI test: `--store "Invalid"` exits with error, suggests similar names
- CLI test: `--store "New World Metro Auckland"` filters correctly

---

### Phase 8: CLI `--all-stores`
- [ ] Add `--all-stores` flag
- [ ] Fetch all 144 stores when flag is set
- [ ] Iterate through stores in scrape loop
- [ ] Show progress per store

**Acceptance Criteria:**
- `--all-stores` scrapes all 144 stores
- Progress shows current store and overall completion
- Can be combined with `--sample-stores` for subset

**Tests:**
- Integration: `--all-stores --dry-run` shows 144 stores queued

---

### Phase 9: CLI `--sample-stores`
- [ ] Add `--sample-stores N` flag
- [ ] Randomly select N stores from available stores
- [ ] Seed RNG for reproducible tests (optional `--seed`)
- [ ] Works with `--all-stores` only

**Acceptance Criteria:**
- `--all-stores --sample-stores 5` scrapes exactly 5 random stores
- Different runs select different stores (unless seeded)
- Error if used without `--all-stores`

**Tests:**
- CLI test: `--sample-stores 3` without `--all-stores` → error
- CLI test: `--all-stores --sample-stores 3` → 3 stores selected

---

### Phase 10: Progress & Reporting
- [ ] Update progress display for two-dimensional progress
- [ ] Show per-store category completion
- [ ] Show overall (store × category) completion percentage
- [ ] Summary report at end with per-store stats

**Acceptance Criteria:**
- Progress shows: `Store 2/5: New World Metro (3/140 categories)`
- Overall shows: `Overall: 143/700 (20.4%)`
- Final summary lists products/store and any failures

**Tests:**
- Unit test: Progress formatter produces expected output format

---

## Implementation Order

1. **Database schema** - Fresh schema with `store_id` in `price_snapshots` and `category_runs`
2. **Store API client** - Add `getStores()` to scraper (like `getCategories()`), utilities in `src/stores.ts`
3. **CLI `--list-stores`** - Quick validation that store fetching works
4. **Update repository** - Add `store_id` to `saveProducts()`, `createRun()`, `updateCategoryRun()`
5. **Update resume system** - Change `resolveResumeState()` to work with (store, category) pairs
6. **Scraper `storeId` flow** - Add `setStoreId()`/`getStoreId()`, pass through to DB
7. **CLI `--store` option** - Single/multiple store selection
8. **CLI `--all-stores`** - Full multi-store support
9. **CLI `--sample-stores`** - Random sampling for testing
10. **Progress/reporting** - Show per-store progress during scrape

## Scope Decisions

1. **Which stores to scrape by default?**
   - **Decision:** Include all store types (both online and physical-only)
   - Rationale: Capture complete pricing data across all locations

2. **Store subset strategies?**
   - **Decision:** No region filtering for initial version
   - Support explicit store selection via `--store` flag only
   - Region filtering can be added later if needed

3. **Database file strategy?**
   - **Decision:** Single database for all stores
   - Enables cross-store price comparison queries
   - Simpler backup/management

4. **Testing support?**
   - **Decision:** Add `--sample-stores N` flag for testing
   - Randomly selects N stores from the full list
   - Useful for development and CI runs

5. **Resume + store filtering interaction?**
   - **Decision:** `--resume --store X` filters pending items to store X only
   - Allows partial resume (e.g., finish just one store from a multi-store run)
   - Remaining stores stay pending for future resume

## Performance Considerations

- 144 stores × ~140 categories = ~20,000 category scrapes per full run
- Use `--sample-stores N` for testing with random subset
- May need to increase concurrency or run in batches
- Token refresh will happen multiple times in long runs (already handled)

## Example Commands

```bash
# List all available stores
npm run dev -- --list-stores

# Test with 3 random stores, 1 category, 1 page
npm run dev -- --all-stores --sample-stores 3 -c "Pantry" --pages 1

# Scrape specific stores
npm run dev -- \
  --store "New World Metro Auckland" \
  --store "New World Thorndon" \
  -c "Pantry" \
  --pages 1

# Full scrape of all 144 stores, all categories, 10 pages each
npm run dev -- --all-stores --all --pages 10
```

## Testing Strategy

### Unit Tests
| Module | File | Coverage |
|--------|------|----------|
| Store API | `stores.test.ts` | `fetchStores`, `syncStoresToDb`, `sampleStores` |
| Repository | `repository.test.ts` | Multi-store `saveProducts`, `createRun`, constraints |
| Resume | `resume.test.ts` | Store-aware `resolveResumeState`, filtering |
| Progress | `progress.test.ts` | Two-dimensional progress formatting |

### Integration Tests
| Scenario | Command | Validates |
|----------|---------|-----------|
| List stores | `--list-stores` | API fetch, display format |
| Single store | `--store "X" -c "Pantry" --pages 1` | Store selection, DB association |
| Multi-store | `--store "X" --store "Y" --dry-run` | Multiple store handling |
| Sample stores | `--all-stores --sample-stores 3 --dry-run` | Random selection |
| Resume mid-store | Start multi-store, interrupt, `--resume` | Correct pending items |

### End-to-End Acceptance Test

**Scenario:** Full multi-store workflow with resume

```bash
# 1. Start 2-store scrape, interrupt after 1st store completes
npm run dev -- --store "New World Metro Auckland" --store "New World Thorndon" -c "Pantry" --pages 1
# (interrupt mid-second-store)

# 2. Resume and verify only pending items scraped
npm run dev -- --resume

# 3. Verify database state
sqlite3 data/products.db "SELECT store_id, COUNT(*) FROM price_snapshots GROUP BY store_id"
# Expected: Both stores have product counts
```

**Pass Criteria:**
- [ ] Resume does not re-scrape completed (store, category) pairs
- [ ] Both stores have price_snapshots in database
- [ ] Products table has store-agnostic entries (no duplicates)
- [ ] Final run status is 'completed'
