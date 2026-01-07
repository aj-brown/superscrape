# Plan: Multi-Category Scraping Support

## Summary
Add support for scraping multiple categories (all or a selection), excluding the "Featured" category by default. Scraping at subcategory level (level 1) with pagination.

## Requirements
- [ ] Scrape all categories OR a limited selection
- [ ] Exclude "Featured" category from all scrapes
- [ ] Scrape at level 1 (subcategory) - e.g., "Fruit & Vegetables" > "Fruit"
- [ ] Maintain existing reliability patterns (rate limiting, retry, circuit breaker)
- [ ] Follow TDD approach

---

## Phase 1: Category Parser

**Goal:** Parse `docs/categories.json` into a flat list of scrapeable categories, excluding "Featured".

### Tasks
- [x] Create `src/categories/types.ts` with `CategoryNode` and `FlatCategory` interfaces
- [x] Create `src/categories/parser.ts` with `parseCategories()` function
- [x] Create `src/categories/index.ts` to re-export

### Key Types
```typescript
interface CategoryNode {
  name: string;
  children: CategoryNode[];
}

interface FlatCategory {
  category0: string;        // "Fruit & Vegetables"
  category1: string;        // "Fruit"
}
```

### Validation & Tests
**File:** `tests/categories/parser.test.ts`

- [x] `parses nested categories into flat list` - Input nested JSON -> output flat array
- [x] `excludes Featured category` - Featured and its children not in output
- [x] `handles categories with no level-1 children` - Top-level only categories handled
- [x] `extracts correct category0 and category1` - Path components correctly assigned

**Manual validation:** Run `npm test` - all parser tests pass

---

## Phase 2: Category Selector

**Goal:** Filter categories based on user selection (all vs specific).

### Tasks
- [x] Add `CategoryFilter` type to `src/categories/types.ts`
- [x] Create `src/categories/selector.ts` with `selectCategories()` function
- [x] Update `src/categories/index.ts` exports

### Key Types
```typescript
interface CategoryFilter {
  mode: 'all' | 'specific';
  categories?: string[];    // For specific mode: ["Fruit & Vegetables", "Pantry"]
}
```

### Validation & Tests
**File:** `tests/categories/selector.test.ts`

- [x] `mode=all returns all categories` - No filtering applied
- [x] `mode=specific filters to matching category0` - Only specified top-level categories
- [x] `mode=specific with path filters to exact match` - "Fruit & Vegetables > Fruit" matches exactly
- [x] `returns empty array for no matches` - Invalid category returns []

**Manual validation:** Run `npm test` - all selector tests pass

---

## Phase 3: CLI Argument Parsing

**Goal:** Parse command-line arguments to configure scraping behavior.

### Tasks
- [ ] Create `src/cli.ts` with `parseCliArgs()` and `printUsage()` functions
- [ ] Use Node's built-in `util.parseArgs`

### CLI Options
```
--all, -a           Scrape all categories (default behavior)
--category, -c      Scrape specific category (repeatable)
--pages, -p         Max pages per category (default: 10)
--headless          Run headless (default: true)
--dry-run           List categories without scraping
--help, -h          Show usage
```

### Example Usage
```bash
npm run dev -- --all
npm run dev -- -c "Fruit & Vegetables" -c "Pantry"
npm run dev -- -c "Fruit & Vegetables > Fruit"
npm run dev -- --all --dry-run
```

### Validation & Tests
**File:** `tests/cli.test.ts`

- [ ] `parses --all flag` - Sets mode to 'all'
- [ ] `parses multiple -c options` - Collects into categories array
- [ ] `parses category path with >` - "A > B" parsed correctly
- [ ] `sets default values` - pages=10, headless=true
- [ ] `--dry-run sets dryRun flag` - Boolean flag works
- [ ] `--help returns help flag` - Help mode detected

**Manual validation:** Run `npm test` - all CLI tests pass

---

## Phase 4: Multi-Category Orchestrator

**Goal:** Orchestrate scraping multiple categories sequentially with progress tracking.

### Tasks
- [ ] Create `src/multi-scraper.ts` with `MultiCategoryScraper` class
- [ ] Implement sequential scraping with existing `NewWorldScraper`
- [ ] Add progress tracking and error handling

### Key Interface
```typescript
interface MultiScraperConfig {
  categories: FlatCategory[];
  maxPages: number;
  headless: boolean;
  dbPath: string;
  onProgress?: (progress: ScrapeProgress) => void;
}

interface ScrapeProgress {
  total: number;
  completed: number;
  failed: number;
  current?: string;
  results: CategoryResult[];
}

class MultiCategoryScraper {
  constructor(config: MultiScraperConfig);
  async run(): Promise<ScrapeProgress>;
}
```

### Behaviors
- Scrape categories sequentially (rate limiting handled by existing scraper)
- Continue on category failure, track in results
- Call `onProgress` callback after each category
- Save products to database after each category

### Validation & Tests
**File:** `tests/multi-scraper.test.ts`

- [ ] `scrapes categories sequentially` - Calls scrapeCategory for each
- [ ] `continues after category failure` - Error doesn't stop other categories
- [ ] `tracks progress correctly` - completed/failed counts accurate
- [ ] `calls onProgress callback` - Callback invoked after each category
- [ ] `saves products to database` - saveProducts called with results

**Manual validation:** Run `npm test` - all multi-scraper tests pass

---

## Phase 5: Integration

**Goal:** Wire everything together in `src/index.ts`.

### Tasks
- [ ] Update `src/index.ts` to use CLI, parser, selector, and multi-scraper
- [ ] Add dry-run mode to list categories without scraping
- [ ] Add summary output with success/failure counts

### Updated Flow
```
1. Parse CLI args
2. Load docs/categories.json
3. Parse categories (exclude Featured)
4. Select categories based on filter
5. If dry-run: print categories and exit
6. Initialize database
7. Run MultiCategoryScraper
8. Print summary
```

### Validation & Tests
**File:** `tests/integration/multi-category.test.ts`

- [ ] `dry-run lists categories without scraping` - No browser launched
- [ ] `scrapes single category end-to-end` - Full flow with 1 category

### Manual Validation
- [ ] `npm run dev -- --dry-run` - Lists ~80 categories (no Featured)
- [ ] `npm run dev -- -c "Pantry" --pages 1` - Scrapes Pantry subcategories
- [ ] `npm run dev -- --all --pages 1` - Scrapes all categories

---

## Files Summary

| Phase | Files to Create/Modify |
|-------|----------------------|
| 1 | `src/categories/types.ts`, `parser.ts`, `index.ts`, `tests/categories/parser.test.ts` |
| 2 | `src/categories/selector.ts`, `tests/categories/selector.test.ts` |
| 3 | `src/cli.ts`, `tests/cli.test.ts` |
| 4 | `src/multi-scraper.ts`, `tests/multi-scraper.test.ts` |
| 5 | `src/index.ts` (modify), `tests/integration/multi-category.test.ts` |

## Notes
- Existing `scrapeCategory(category0, category1?, maxPages)` used as-is
- "Featured" exclusion hardcoded in parser
- Rate limiting handled by existing reliability module
- ~80 subcategories total after excluding Featured
