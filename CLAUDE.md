# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Superscrape is a web scraping project built with TypeScript and Camoufox, a privacy-focused browser automation tool based on Firefox designed to avoid detection.

## Development Commands

```bash
# Install dependencies
npm install

# Run in development mode (no build required)
npm run dev

# Build TypeScript to JavaScript
npm run build

# Run compiled code
npm start

# Run tests once
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui
```

## Technology Stack

- **TypeScript** with ES2022 target and NodeNext modules
- **Camoufox** (v0.1.19) - Firefox-based browser automation with anti-detection
- **Vitest** - Test framework
- **tsx** - For running TypeScript directly during development

## CLI Arguments

```bash
npm run dev -- [options]
```

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--all` | `-a` | Scrape all categories | Yes (default behavior) |
| `--category` | `-c` | Scrape specific category (repeatable) | - |
| `--pages` | `-p` | Max pages per category | 10 |
| `--headless` | - | Run browser in headless mode | true |
| `--no-headless` | - | Run with visible browser | - |
| `--dry-run` | - | List categories without scraping | false |
| `--help` | `-h` | Show usage information | - |

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

## Project Structure

```
src/
├── index.ts              # Entry point with CLI integration
├── cli.ts                # CLI argument parsing
├── scraper.ts            # Main scraper with reliability wrapper
├── multi-scraper.ts      # Multi-category orchestrator
├── utils.ts              # Utility functions
├── categories/           # Category handling module
│   ├── index.ts          # Re-exports
│   ├── types.ts          # CategoryNode, FlatCategory, CategoryFilter
│   ├── parser.ts         # Parse categories.json, exclude Featured
│   └── selector.ts       # Filter categories by mode
├── storage/              # SQLite storage module
│   ├── index.ts          # Re-exports
│   ├── database.ts       # Database initialization
│   ├── repository.ts     # CRUD operations
│   ├── converters.ts     # Product to record conversion
│   ├── queries.ts        # Price tracking queries
│   └── types.ts          # Database record types
└── reliability/          # Reliability module
    ├── index.ts          # Exports withReliability wrapper
    ├── types.ts          # Type definitions
    ├── retry.ts          # Exponential backoff retry logic
    ├── circuit-breaker.ts # Circuit breaker state machine
    ├── rate-limiter.ts   # Token bucket rate limiter
    └── logger.ts         # Structured logging

tests/
├── categories/           # Category module tests
├── reliability/          # Reliability component tests
├── storage/              # Storage module tests
└── integration/          # Integration tests
```

## Architecture Notes

- Project uses CommonJS modules (`"type": "commonjs"` in package.json)
- TypeScript compiles from `src/` to `dist/` with strict mode enabled
- Source maps and declaration files are generated for debugging
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
- **Structured logging** - Consistent logging across all components

Use `withReliability()` wrapper to apply these patterns to any async function.
