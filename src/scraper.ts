import { Camoufox } from 'camoufox';
import type { Browser, BrowserContext, Cookie, Page, Request } from 'playwright-core';
import {
  parseProductFromApi,
  extractStoreIdFromCookies,
  buildProductSearchPayload,
  buildApiHeaders,
  PRODUCTS_API_URL,
  CATEGORIES_API_URL,
  type Product,
  type CategoryInfo,
  type SearchQuery,
} from './utils';
import { createReliabilityWrapper, type ReliabilityConfig } from './reliability';

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

export class NewWorldScraper {
  private browserOrContext: Browser | BrowserContext | null = null;
  private cookies: Cookie[] = [];
  private storeId: string | null = null;
  private config: ScraperConfig;
  private page: Page | null = null;
  private authorizationToken: string | null = null;
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

    // Capture Authorization token from outgoing API requests
    this.page.on('request', (request: Request) => {
      const url = request.url();
      if (url.includes('api-prod.newworld.co.nz') && !this.authorizationToken) {
        const authHeader = request.headers()['authorization'];
        if (authHeader?.startsWith('Bearer ')) {
          this.authorizationToken = authHeader;
          console.log('🔑 Captured authorization token');
        }
      }
    });

    // Navigate to specials page to trigger API request and capture auth token
    console.log('📍 Navigating to New World to establish session...');
    await this.page.goto('https://www.newworld.co.nz/shop/specials?pg=1', {
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

    if (!this.authorizationToken) {
      throw new Error('Failed to capture authorization token during initialization');
    }

    console.log(`✅ Scraper initialized with store ID: ${this.storeId}`);
  }

  private async fetchProductsFromApi(query: SearchQuery): Promise<{
    products: Product[];
    totalHits: number;
  }> {
    if (!this.page || !this.authorizationToken || !this.storeId) {
      throw new Error('Scraper not initialized. Call initialize() first.');
    }

    const payload = buildProductSearchPayload(query);
    const headers = buildApiHeaders(this.cookies, this.authorizationToken);

    const response = await this.page.context().request.post(PRODUCTS_API_URL, {
      data: payload,
      headers,
    });

    if (!response.ok()) {
      throw new Error(`API request failed: ${response.status()} ${response.statusText()}`);
    }

    const data = (await response.json()) as {
      products?: Array<Record<string, unknown>>;
      totalHits?: number;
    };

    return {
      products: (data.products || []).map(parseProductFromApi),
      totalHits: data.totalHits || 0,
    };
  }

  async getCategories(): Promise<CategoryInfo[]> {
    if (!this.page || !this.authorizationToken) {
      throw new Error('Scraper not initialized. Call initialize() first.');
    }

    console.log('📂 Fetching categories from API...');

    const headers = buildApiHeaders(this.cookies, this.authorizationToken);

    const response = await this.reliability.execute(async () => {
      return this.page!.context().request.get(CATEGORIES_API_URL, { headers });
    });

    if (!response.ok()) {
      throw new Error(`Categories API failed: ${response.status()} ${response.statusText()}`);
    }

    const data = (await response.json()) as { categories?: CategoryInfo[] };
    const categories = data.categories || [];
    console.log(`📂 Found ${categories.length} top-level categories`);
    return categories;
  }

  async scrapeCategory(
    category0: string,
    category1?: string,
    maxPages: number = 1
  ): Promise<Product[]> {
    if (!this.page || !this.storeId) {
      throw new Error('Scraper not initialized. Call initialize() first.');
    }

    const allProducts: Product[] = [];

    for (let pageNum = 0; pageNum < maxPages; pageNum++) {
      console.log(
        `🔍 Fetching ${category0}${category1 ? ' > ' + category1 : ''} (page ${pageNum + 1})`
      );

      const result = await this.reliability.execute(async () => {
        return this.fetchProductsFromApi({
          storeId: this.storeId!,
          category0,
          category1,
          page: pageNum,
          hitsPerPage: 50,
        });
      });

      allProducts.push(...result.products);
      console.log(`📦 Fetched ${result.products.length} products (page ${pageNum + 1})`);

      // Check if we have more pages
      if (result.products.length < 50) {
        break;
      }
    }

    return allProducts;
  }

  async search(searchTerm: string, maxPages: number = 1): Promise<Product[]> {
    if (!this.page || !this.storeId) {
      throw new Error('Scraper not initialized. Call initialize() first.');
    }

    const allProducts: Product[] = [];

    for (let pageNum = 0; pageNum < maxPages; pageNum++) {
      console.log(`🔎 Searching "${searchTerm}" (page ${pageNum + 1})`);

      const result = await this.reliability.execute(async () => {
        return this.fetchProductsFromApi({
          storeId: this.storeId!,
          searchTerm,
          page: pageNum,
          hitsPerPage: 50,
        });
      });

      allProducts.push(...result.products);
      console.log(`🔎 Found ${result.products.length} products (page ${pageNum + 1})`);

      if (result.products.length < 50) {
        break;
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
