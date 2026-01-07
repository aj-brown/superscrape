# Superscrape Improvement Plan

Based on analysis of reviews from ChatGPT, Gemini, and Grok, combined with codebase exploration.

**Goal**: Data pipeline use case
**Scope**: Medium (7 improvements across all focus areas)

---

## Phase 1: Database Performance

### 1.1 WAL Mode for SQLite
**Focus**: Performance | **Effort**: Low

Enable Write-Ahead Logging for better concurrent read performance.

**Files**: `src/storage/database.ts`

**Tasks**:
- [x] Add `PRAGMA journal_mode=WAL` after connection
- [x] Add `PRAGMA synchronous=NORMAL` for balanced durability/speed
- [x] Add `checkpoint()` function for manual WAL checkpointing

**Verification**:
- [x] Unit test: verify WAL mode is enabled after connection
- [x] Unit test: checkpoint function executes without error
- [ ] Manual: confirm `data/*.db-wal` file created after scrape

---

## Phase 2: Observability

### 2.1 JSON Structured Logging
**Focus**: Developer UX | **Effort**: Low

Upgrade logging for pipeline observability.

**Files**: `src/reliability/logger.ts`, `src/cli.ts`

**Tasks**:
- [x] Add `LogFormat` type (`json` | `text`)
- [x] Update logger to support JSON output (newline-delimited)
- [x] Add `--log-format` CLI flag (default: `text`)
- [x] Add `--log-level` CLI flag (default: `info`)
- [x] Ensure logs go to stderr (keep stdout clean for data)

**Verification**:
- [x] Unit test: JSON format outputs valid JSON per line
- [x] Unit test: log level filtering works correctly
- [ ] Integration test: `--log-format json` produces parseable output
- [ ] Manual: pipe JSON logs to `jq` to verify structure

---

## Phase 3: Data Integrity

### 3.1 Data Validation with Zod
**Focus**: Reliability | **Effort**: Medium

Validate scraped data before database insertion.

**Files**: `src/schemas.ts` (new), `src/utils.ts`, `src/storage/repository.ts`

**Tasks**:
- [x] Add `zod` dependency
- [x] Create `src/schemas.ts` with Product and PriceSnapshot schemas
- [ ] Update `parseProductFromApi()` to use Zod parsing
- [ ] Add validation stats to scrape results (valid/invalid counts)
- [ ] Log and skip invalid products (don't crash pipeline)

**Verification**:
- [x] Unit test: valid product passes schema
- [x] Unit test: missing required field throws ZodError
- [x] Unit test: invalid price (negative, NaN) rejected
- [ ] Integration test: scraper continues when invalid product encountered
- [ ] Manual: inject malformed product, verify logged and skipped

---

## Phase 4: Developer Experience

### 4.1 Config File Support
**Focus**: Developer UX | **Effort**: Low

Support JSON config files for repeatable pipeline runs.

**Files**: `src/config.ts` (new), `src/cli.ts`

**Tasks**:
- [ ] Create `src/config.ts` with config schema (using Zod)
- [ ] Add `--config <path>` CLI flag
- [ ] Implement config file loading and validation
- [ ] Merge config with CLI args (CLI takes precedence)
- [ ] Add example `config.example.json` to project root

**Verification**:
- [ ] Unit test: config file loads and validates correctly
- [ ] Unit test: CLI args override config values
- [ ] Unit test: invalid config file throws descriptive error
- [ ] Integration test: full scrape with config file only
- [ ] Manual: run with `--config config.example.json`

---

## Phase 5: Data Export

### 5.1 CSV Export Command
**Focus**: Data/Export | **Effort**: Low

Add export capability for pipeline integration.

**Files**: `src/export.ts` (new), `src/stats-cli.ts`

**Tasks**:
- [ ] Create `src/export.ts` with export logic
- [ ] Add `export` command to stats CLI
- [ ] Support `--format csv|json` flag
- [ ] Support `--since <duration>` filter (e.g., `7d`, `30d`)
- [ ] Support `--category <name>` filter
- [ ] Support `--output <file>` (default: stdout)

**Verification**:
- [ ] Unit test: CSV output has correct headers and escaping
- [ ] Unit test: JSON output is valid array of objects
- [ ] Unit test: date filtering returns correct range
- [ ] Integration test: export piped to file matches DB query
- [ ] Manual: `npm run stats -- export --format csv --since 7d > export.csv`

---

## Phase 6: Fault Tolerance

### 6.1 Resume/Checkpoint Support
**Focus**: Reliability | **Effort**: Medium

Allow long scrapes to resume after failures.

**Files**: `src/storage/database.ts`, `src/storage/repository.ts`, `src/multi-scraper.ts`, `src/cli.ts`

**Tasks**:
- [ ] Add `scrape_runs` table schema (id, started_at, completed_at, status)
- [ ] Add `category_runs` table schema (run_id, category_slug, status, last_page, error)
- [ ] Add repository functions: `createRun()`, `updateCategoryRun()`, `getIncompleteRun()`
- [ ] Update `MultiCategoryScraper` to record progress after each category
- [ ] Add `--resume` CLI flag to continue last incomplete run
- [ ] Add `--run-id <id>` to resume specific run

**Verification**:
- [ ] Unit test: run record created with correct initial state
- [ ] Unit test: category progress updated after completion
- [ ] Unit test: `getIncompleteRun()` returns most recent incomplete
- [ ] Integration test: interrupt scrape, resume completes remaining categories
- [ ] Manual: kill process mid-scrape, verify `--resume` continues correctly

---

## Phase 7: Performance

### 7.1 Parallel Category Scraping
**Focus**: Performance | **Effort**: Medium

Scrape multiple categories concurrently with rate limiting.

**Files**: `src/multi-scraper.ts`, `src/cli.ts`

**Tasks**:
- [ ] Add `p-limit` dependency
- [ ] Add `--concurrency <n>` CLI flag (default: 1)
- [ ] Refactor `MultiCategoryScraper` to use worker pool pattern
- [ ] Create separate browser contexts per worker (not pages)
- [ ] Share rate limiter across all workers
- [ ] Update progress reporting for parallel execution

**Verification**:
- [ ] Unit test: concurrency limit respected (mock timing)
- [ ] Unit test: rate limiter shared across workers
- [ ] Integration test: `--concurrency 3` completes faster than `--concurrency 1`
- [ ] Integration test: errors in one worker don't crash others
- [ ] Manual: observe 3 browser windows with `--no-headless --concurrency 3`

---

## Summary

### Files to Modify
- `src/storage/database.ts`
- `src/storage/repository.ts`
- `src/multi-scraper.ts`
- `src/cli.ts`
- `src/utils.ts`
- `src/reliability/logger.ts`
- `src/stats-cli.ts`

### Files to Create
- `src/schemas.ts`
- `src/config.ts`
- `src/export.ts`
- `config.example.json`

### Dependencies to Add
- `zod` - schema validation
- `p-limit` - concurrency control
