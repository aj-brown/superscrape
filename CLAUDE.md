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

## Project Structure

```
src/
├── index.ts              # Entry point
├── scraper.ts            # Main scraper with reliability wrapper
├── utils.ts              # Utility functions
└── reliability/          # Reliability module
    ├── index.ts          # Exports withReliability wrapper
    ├── types.ts          # Type definitions
    ├── retry.ts          # Exponential backoff retry logic
    ├── circuit-breaker.ts # Circuit breaker state machine
    ├── rate-limiter.ts   # Token bucket rate limiter
    └── logger.ts         # Structured logging

tests/
├── reliability/          # Unit tests for reliability components
│   ├── retry.test.ts
│   ├── circuit-breaker.test.ts
│   ├── rate-limiter.test.ts
│   └── logger.test.ts
└── integration/          # Integration tests
    └── scraper-reliability.test.ts
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
