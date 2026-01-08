# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Superscrape is a web scraping project built with TypeScript and Camoufox, a privacy-focused browser automation tool based on Firefox designed to avoid detection.

## Development Workflow

```bash
# 1. Make changes
npm install

# 2. Typecheck
npm run typecheck

# 3. Run tests
npm run test

# 4. Lint before commiting
npm run lint
```

## Technology Stack

- **TypeScript** with ES2022 target and ESNext modules
- **Camoufox** (v0.1.19) - Firefox-based browser automation with anti-detection
- **Vitest** - Test framework
- **tsx** - For running TypeScript directly

## CLI Arguments

```bash
npm run dev -- [options]
```

| Option          | Short | Description                           | Default                |
| --------------- | ----- | ------------------------------------- | ---------------------- |
| `--all`         | `-a`  | Scrape all categories                 | Yes (default behavior) |
| `--category`    | `-c`  | Scrape specific category (repeatable) | -                      |
| `--pages`       | `-p`  | Max pages per category                | 10                     |
| `--headless`    | -     | Run browser in headless mode          | true                   |
| `--no-headless` | -     | Run with visible browser              | -                      |
| `--dry-run`     | -     | List categories without scraping      | false                  |
| `--help`        | `-h`  | Show usage information                | -                      |

## CLI Examples

```bash
# List all available categories (no scraping)
npm run dev -- --dry-run

# Scrape all categories (1 page each)
npm run dev -- --all --pages 1

# Scrape specific top-level category
npm run dev -- -c "Pantry" --pages 2

# Scrape multiple categories
npm run dev -- -c "Pantry" -c "Bakery" --pages 1

# Scrape specific subcategory using path syntax
npm run dev -- -c "Fruit & Vegetables > Fruit" --pages 3

# Run with visible browser for debugging
npm run dev -- -c "Pantry" --no-headless --pages 1

# Show help
npm run dev -- --help
```

## Architecture Notes

- Project uses CommonJS modules (`"type": "commonjs"` in package.json)
- Entry point: `src/index.ts`

## Camoufox Usage Pattern

Camoufox follows a browser automation pattern similar to Puppeteer/Playwright:

1. Launch browser with `Camoufox.launch()`
2. Create page with `browser.newPage()`
3. Navigate and interact with pages
4. Always close browser in `finally` block to prevent resource leaks

## Reliability Module

The `src/reliability/` module provides fault tolerance for scraping operations:

- **Retry with exponential backoff** - Automatic retry with configurable delays
- **Circuit breaker** - Prevents cascading failures by failing fast
- **Rate limiter** - Token bucket algorithm for request throttling
- **Structured logging** - Consistent logging across all components.
