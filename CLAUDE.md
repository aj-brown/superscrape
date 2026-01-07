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
```

## Technology Stack

- **TypeScript** with ES2022 target and NodeNext modules (ESM)
- **Camoufox** (v0.1.19) - Firefox-based browser automation with anti-detection
- **tsx** - For running TypeScript directly during development

## Architecture Notes

- Project uses ES modules (`"type": "module"` in package.json)
- TypeScript compiles from `src/` to `dist/` with strict mode enabled
- Source maps and declaration files are generated for debugging
- Entry point: `src/index.ts`

## Camoufox Usage Pattern

Camoufox follows a browser automation pattern similar to Puppeteer/Playwright:
1. Launch browser with `Camoufox.launch()`
2. Create page with `browser.newPage()`
3. Navigate and interact with pages
4. Always close browser in `finally` block to prevent resource leaks
