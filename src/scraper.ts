import { Camoufox } from 'camoufox';
import type { Browser, BrowserContext, Cookie, Page, Request } from 'playwright-core';
import {
  parseProductFromApi,
  parseStoreFromApi,
  extractStoreIdFromCookies,
  buildProductSearchPayload,
  buildApiHeaders,
  PRODUCTS_API_URL,
  CATEGORIES_API_URL,
  STORES_API_URL,
  type Product,
  type CategoryInfo,
  type StoreInfo,
  type StoreApiResponse,
  type SearchQuery,
} from './utils';
import { createReliabilityWrapper, type ReliabilityConfig } from './reliability';
import { isTokenExpiringSoon } from './token';

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
  private tokenAcquiredAt: number | null = null;
  private isRefreshing: boolean = false;
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
      if (url.includes('api-prod.newworld.co.nz')) {
        const authHeader = request.headers()['authorization'];
        if (authHeader?.startsWith('Bearer ')) {
          const isNewToken = this.authorizationToken !== authHeader;
          this.authorizationToken = authHeader;
          this.tokenAcquiredAt = Date.now();
          if (isNewToken) {
            console.log('🔑 Captured authorization token');
          }
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

  /**
   * Refresh the authorization token by re-navigating to trigger get-current-user.
   * This is called proactively before the token expires.
   */
  private async refreshToken(): Promise<void> {
    if (this.isRefreshing) {
      // Wait for in-progress refresh
      while (this.isRefreshing) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return;
    }

    this.isRefreshing = true;
    console.log('🔄 Refreshing authorization token...');

    try {
      // Clear current token to allow capture of new one
      this.authorizationToken = null;
      this.tokenAcquiredAt = null;

      // Navigate to specials page to trigger get-current-user API call
      await this.page!.goto('https://www.newworld.co.nz/shop/specials?pg=1', {
        waitUntil: 'networkidle',
        timeout: 60000,
      });

      // Refresh cookies as they may have changed
      this.cookies = await this.page!.context().cookies();

      if (!this.authorizationToken) {
        throw new Error('Failed to capture new authorization token during refresh');
      }
      console.log('✅ Token refreshed successfully');
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Ensure the token is valid before making API calls.
   * Proactively refreshes if token is expiring soon.
   */
  private async ensureValidToken(): Promise<void> {
    if (isTokenExpiringSoon(this.tokenAcquiredAt)) {
      await this.refreshToken();
    }
  }

  /**
   * Get the current store ID.
   * Returns null if scraper is not initialized.
   */
  getStoreId(): string | null {
    return this.storeId;
  }

  private async fetchProductsFromApi(query: SearchQuery): Promise<{
    products: Product[];
    totalHits: number;
  }> {
    if (!this.page || !this.storeId) {
      throw new Error('Scraper not initialized. Call initialize() first.');
    }

    // Ensure token is valid before making the request
    await this.ensureValidToken();

    if (!this.authorizationToken) {
      throw new Error('No valid authorization token available');
    }

    const payload = buildProductSearchPayload(query);
    const headers = buildApiHeaders(this.cookies, this.authorizationToken);

    const response = await this.page.context().request.post(PRODUCTS_API_URL, {
      data: payload,
      headers,
    });

    // Handle token expiry mid-request (401 Unauthorized)
    if (response.status() === 401) {
      console.log('⚠️ Token expired mid-request, refreshing...');
      await this.refreshToken();

      // Retry the request once with fresh token
      const retryHeaders = buildApiHeaders(this.cookies, this.authorizationToken!);
      const retryResponse = await this.page.context().request.post(PRODUCTS_API_URL, {
        data: payload,
        headers: retryHeaders,
      });

      if (!retryResponse.ok()) {
        throw new Error(`API request failed after token refresh: ${retryResponse.status()}`);
      }

      const data = (await retryResponse.json()) as {
        products?: Array<Record<string, unknown>>;
        totalHits?: number;
      };

      return {
        products: (data.products || []).map(parseProductFromApi),
        totalHits: data.totalHits || 0,
      };
    }

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
    if (!this.page) {
      throw new Error('Scraper not initialized. Call initialize() first.');
    }

    // Ensure token is valid before making the request
    await this.ensureValidToken();

    if (!this.authorizationToken) {
      throw new Error('No valid authorization token available');
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

  async getStores(): Promise<StoreInfo[]> {
    if (!this.page) {
      throw new Error('Scraper not initialized. Call initialize() first.');
    }

    await this.ensureValidToken();

    if (!this.authorizationToken) {
      throw new Error('No valid authorization token available');
    }

    console.log('🏪 Fetching stores from API...');

    const headers = buildApiHeaders(this.cookies, this.authorizationToken);

    const response = await this.reliability.execute(async () => {
      return this.page!.context().request.get(STORES_API_URL, { headers });
    });

    if (!response.ok()) {
      throw new Error(`Stores API failed: ${response.status()} ${response.statusText()}`);
    }

    const data = (await response.json()) as { stores?: StoreApiResponse[] };
    const stores = (data.stores || []).map(parseStoreFromApi);
    console.log(`🏪 Found ${stores.length} stores`);
    return stores;
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
