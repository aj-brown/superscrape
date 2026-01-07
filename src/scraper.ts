import { Camoufox } from 'camoufox';
import type { Browser, BrowserContext, Cookie, Page, Request, Response } from 'playwright-core';
import {
  buildProductSearchPayload,
  parseProductFromApi,
  extractStoreIdFromCookies,
  type Product,
  type CategoryInfo,
  type SearchQuery,
} from './utils';
import { createReliabilityWrapper, type ReliabilityConfig } from './reliability';

const API_BASE = 'https://api-prod.newworld.co.nz/v1/edge';

export interface ScraperConfig {
  headless?: boolean;
  storeId?: string;
  proxy?: string;
  reliability?: Partial<ReliabilityConfig>;
}

export interface ScraperResult {
  products: Product[];
  totalProducts: number;
  category: string;
  page: number;
}

interface CapturedResponse {
  url: string;
  body: unknown;
}

export class NewWorldScraper {
  private browserOrContext: Browser | BrowserContext | null = null;
  private cookies: Cookie[] = [];
  private storeId: string | null = null;
  private config: ScraperConfig;
  private page: Page | null = null;
  private capturedResponses: Map<string, CapturedResponse> = new Map();
  private reliability: ReturnType<typeof createReliabilityWrapper>;

  constructor(config: ScraperConfig = {}) {
    this.config = {
      headless: config.headless ?? true,
      storeId: config.storeId,
      proxy: config.proxy,
      reliability: config.reliability,
    };
    this.reliability = createReliabilityWrapper(this.config.reliability);
  }

  async initialize(): Promise<void> {
    console.log('🚀 Initializing scraper...');

    const launchOptions: Record<string, unknown> = {
      headless: this.config.headless,
    };

    if (this.config.proxy) {
      launchOptions.proxy = this.config.proxy;
    }

    this.browserOrContext = await Camoufox(launchOptions);

    // Create a page and navigate to get cookies
    this.page =
      'newPage' in this.browserOrContext
        ? await (this.browserOrContext as Browser).newPage()
        : await (this.browserOrContext as BrowserContext).newPage();

    // Capture API responses
    this.page.on('response', async (response: Response) => {
      const url = response.url();
      if (url.includes('api-prod.newworld.co.nz')) {
        try {
          const body = await response.json();
          this.capturedResponses.set(url, { url, body });
        } catch {
          // Not JSON
        }
      }
    });

    console.log('📍 Navigating to New World to establish session...');
    await this.page.goto('https://www.newworld.co.nz/', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });

    // Get cookies
    const context = this.page.context();
    this.cookies = await context.cookies();

    // Extract store ID from cookies or use provided one
    this.storeId =
      this.config.storeId || extractStoreIdFromCookies(this.cookies);

    if (!this.storeId) {
      console.warn(
        '⚠️  Could not find store ID in cookies, using default store'
      );
      this.storeId = '60928d93-06fa-4d8f-92a6-8c359e7e846d'; // Default store
    }

    console.log(`✅ Scraper initialized with store ID: ${this.storeId}`);
  }

  // Navigate to a page and intercept the API responses
  private async navigateAndCapture(url: string): Promise<void> {
    if (!this.page) {
      throw new Error('Scraper not initialized. Call initialize() first.');
    }

    await this.reliability.execute(async () => {
      this.capturedResponses.clear();
      await this.page!.goto(url, {
        waitUntil: 'networkidle',
        timeout: 60000,
      });
      // Note: Removed waitForTimeout as rate limiter handles delays
    });
  }

  async getCategories(): Promise<CategoryInfo[]> {
    if (!this.storeId || !this.page) {
      throw new Error('Scraper not initialized. Call initialize() first.');
    }

    // Navigate to a category page to trigger the categories API call
    console.log('📂 Navigating to category page to fetch categories...');
    await this.navigateAndCapture(
      'https://www.newworld.co.nz/shop/category/fruit-and-vegetables?pg=1'
    );

    // Find the categories response
    for (const [url, response] of this.capturedResponses) {
      if (url.includes('/categories')) {
        const data = response.body as { categories?: CategoryInfo[] };
        return data.categories || [];
      }
    }

    return [];
  }

  async scrapeCategory(
    category0: string,
    category1?: string,
    maxPages: number = 1
  ): Promise<Product[]> {
    if (!this.page) {
      throw new Error('Scraper not initialized. Call initialize() first.');
    }

    const allProducts: Product[] = [];

    for (let page = 0; page < maxPages; page++) {
      // Build the category URL
      const categorySlug = category1
        ? `${category0.toLowerCase().replace(/ & /g, '-and-').replace(/ /g, '-')}/${category1.toLowerCase().replace(/ /g, '-')}`
        : category0.toLowerCase().replace(/ & /g, '-and-').replace(/ /g, '-');

      const url = `https://www.newworld.co.nz/shop/category/${categorySlug}?pg=${page + 1}`;
      console.log(`🔍 Navigating to: ${url}`);

      await this.navigateAndCapture(url);

      // Find the products response
      for (const [responseUrl, response] of this.capturedResponses) {
        if (responseUrl.includes('/search/paginated/products')) {
          const data = response.body as {
            products?: Array<Record<string, unknown>>;
            totalHits?: number;
          };

          const products = (data.products || []).map(parseProductFromApi);
          allProducts.push(...products);

          console.log(`📦 Fetched ${products.length} products (page ${page + 1})`);

          // Check if we have more pages
          if (products.length < 50) {
            return allProducts;
          }
          break;
        }
      }
    }

    return allProducts;
  }

  async search(searchTerm: string, maxPages: number = 1): Promise<Product[]> {
    if (!this.page) {
      throw new Error('Scraper not initialized. Call initialize() first.');
    }

    const allProducts: Product[] = [];

    for (let page = 0; page < maxPages; page++) {
      const url = `https://www.newworld.co.nz/shop/search?q=${encodeURIComponent(searchTerm)}&pg=${page + 1}`;
      console.log(`🔎 Searching: ${url}`);

      await this.navigateAndCapture(url);

      // Find the products response
      for (const [responseUrl, response] of this.capturedResponses) {
        if (responseUrl.includes('/search/paginated/products')) {
          const data = response.body as {
            products?: Array<Record<string, unknown>>;
            totalHits?: number;
          };

          const products = (data.products || []).map(parseProductFromApi);
          allProducts.push(...products);

          console.log(
            `🔎 Search "${searchTerm}" - found ${products.length} products (page ${page + 1})`
          );

          if (products.length < 50) {
            return allProducts;
          }
          break;
        }
      }
    }

    return allProducts;
  }

  async close(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    if (this.browserOrContext) {
      await this.browserOrContext.close();
      this.browserOrContext = null;
      console.log('🏁 Scraper closed');
    }
  }
}
