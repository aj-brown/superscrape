# Superscrape - New World Grocery Price Scraper

A TypeScript-based web scraper for extracting product prices from New World (newworld.co.nz), a major NZ grocery retailer. Uses Camoufox for anti-detection browser automation.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Application                             │
├─────────────────────────────────────────────────────────────┤
│  src/index.ts       │  Main entry point & demo script        │
│  src/scraper.ts     │  Core NewWorldScraper class            │
│  src/utils.ts       │  Helper functions & type definitions   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Camoufox Browser                        │
│  - Firefox-based with anti-fingerprinting                   │
│  - Automated session management                              │
│  - Response interception                                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    New World APIs                            │
│  api-prod.newworld.co.nz/v1/edge/...                        │
└─────────────────────────────────────────────────────────────┘
```

## How It Works

1. **Browser Session**: Launches Camoufox browser and navigates to newworld.co.nz
2. **Cookie Capture**: Automatically captures session cookies and store ID
3. **Response Interception**: Intercepts API responses as pages are navigated
4. **Data Extraction**: Parses product data from captured API responses

The scraper navigates to actual category/search pages rather than making direct API calls, ensuring all authentication tokens and headers are properly handled by the browser.

## Discovered API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/edge/store/{storeId}/categories` | GET | Get all store categories |
| `/v1/edge/search/paginated/products` | POST | Search products (paginated) |
| `/v1/edge/store` | GET | Get default store info |
| `/v1/edge/cart` | GET | Get shopping cart |
| `/v1/edge/user` | GET | Get user info (requires auth) |

### Product Search Payload

```json
{
  "algoliaQuery": {
    "filters": "stores:{storeId} AND category0NI:\"Category\"",
    "hitsPerPage": 50,
    "page": 0
  },
  "storeId": "{storeId}",
  "sortOrder": "NI_POPULARITY_ASC"
}
```

### Product Response Structure

```json
{
  "productId": "5045821-EA-000",
  "name": "Blueberries",
  "displayName": "125g",
  "availability": ["IN_STORE", "ONLINE"],
  "singlePrice": {
    "price": 599,
    "comparativePrice": {
      "pricePerUnit": 4792,
      "unitQuantityUom": "kg"
    }
  },
  "categoryTrees": [
    {
      "level0": "Fruit & Vegetables",
      "level1": "Fruit",
      "level2": "Berries, Grapes & Cherries"
    }
  ]
}
```

## Setup

### Prerequisites

- Node.js 18+
- npm or pnpm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Run

```bash
npm start
```

## Usage

### Basic Example

```typescript
import { NewWorldScraper } from './scraper';

const scraper = new NewWorldScraper({
  headless: true,  // Set to false to see browser
});

try {
  await scraper.initialize();

  // Scrape a category
  const fruits = await scraper.scrapeCategory(
    'Fruit & Vegetables',
    'Fruit',
    1  // max pages
  );

  // Search for products
  const milk = await scraper.search('milk', 1);

  console.log(fruits, milk);
} finally {
  await scraper.close();
}
```

### Scraper Options

```typescript
interface ScraperConfig {
  headless?: boolean;  // Run browser in headless mode (default: true)
  storeId?: string;    // Specific store ID (default: auto-detected)
  proxy?: string;      // Proxy URL for requests
}
```

## Output Format

Products are returned as:

```typescript
interface Product {
  productId: string;
  brand?: string;
  name: string;
  displayName: string;
  price: number;           // In dollars (e.g., 5.99)
  pricePerUnit?: number;   // Comparative price per unit
  unitOfMeasure?: string;  // e.g., "1kg"
  category: string;
  subcategory?: string;
  availability: string[];  // ["IN_STORE", "ONLINE"]
  origin?: string;         // e.g., "Product of New Zealand"
}
```

## Anti-Detection Features

This scraper uses Camoufox which provides:

- Firefox-based browser (less common for bots)
- Randomized browser fingerprints
- Proper cookie handling
- Natural page navigation patterns
- No direct API calls (intercepted from page loads)

## Potential Blocks & Limitations

| Issue | Mitigation |
|-------|------------|
| Rate limiting | Add delays between requests, limit pages |
| Cloudflare protection | Camoufox handles most challenges |
| JWT token expiry | Re-initialize session periodically |
| Store-specific prices | Use consistent store ID |
| Pagination limits | Respect 50 items per page limit |

## Legal Considerations

This scraper is intended for personal use and research purposes. Please:

- Respect the website's robots.txt and terms of service
- Don't overload servers with excessive requests
- Don't use scraped data for commercial purposes without permission
- Consider using official APIs if available

## Project Structure

```
superscrape/
├── src/
│   ├── index.ts      # Main entry point
│   ├── scraper.ts    # NewWorldScraper class
│   └── utils.ts      # Helper functions
├── dist/             # Compiled JavaScript
├── package.json
├── tsconfig.json
└── README.md
```

## Dependencies

- **camoufox** - Anti-detection Firefox browser automation
- **playwright-core** - Browser automation types
- **typescript** - TypeScript compiler
- **tsx** - TypeScript execution for development
