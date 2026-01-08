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

## Proposed Changes

### Phase 1: Database Schema Changes

Add store tracking to the database:

```sql
-- New table: stores (cache store metadata)
CREATE TABLE IF NOT EXISTS stores (
  store_id    TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  address     TEXT,
  region      TEXT,
  latitude    REAL,
  longitude   REAL,
  last_synced TEXT NOT NULL
);

-- Modify price_snapshots to include store
ALTER TABLE price_snapshots ADD COLUMN store_id TEXT;
CREATE INDEX IF NOT EXISTS idx_snapshots_store ON price_snapshots(store_id);
```

**Migration Strategy:**
- Existing snapshots get `store_id = NULL` (or the default store ID)
- New snapshots require `store_id`

### Phase 2: Store API Client

New module: `src/stores.ts`

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

// Fetch all stores from API
async function fetchStores(page: Page, token: string): Promise<StoreInfo[]>

// Save stores to database cache
function syncStoresToDb(dbPath: string, stores: StoreInfo[]): void

// Get random sample of stores for testing
function sampleStores(stores: StoreInfo[], count: number): StoreInfo[]
```

### Phase 3: Scraper Modifications

**Option A: Switch store mid-scrape (lightweight)**
- Add `setStore(storeId)` method to `NewWorldScraper`
- For each store, call setStore then scrape categories
- Products already track `storeId` in payload, just needs to flow to DB

**Option B: Store per scraper instance (isolated)**
- Each scraper instance locks to one store
- For multi-store, create multiple scrapers
- Better isolation, slightly more resource usage

**Recommendation:** Option A is simpler since the product search already accepts storeId as a parameter - no actual "session state" change needed.

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

### Unique Constraint Change

Current: `UNIQUE(product_id, scraped_at)`
New: `UNIQUE(product_id, store_id, scraped_at)`

This allows the same product to have different prices at different stores on the same scrape timestamp.

### Product Identity

Products have the same `productId` across all stores. Only pricing and availability differ. The `products` table remains store-agnostic (master data), while `price_snapshots` becomes store-specific.

## Implementation Order

1. **Schema migration** - Add `store_id` column, update constraints
2. **Store API client** - Fetch and cache store list
3. **CLI `--list-stores`** - Quick validation
4. **Scraper `storeId` flow** - Pass through to DB save
5. **CLI `--store` option** - Single store selection
6. **CLI `--all-stores`** - Full multi-store support
7. **Progress/reporting** - Show per-store progress

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
