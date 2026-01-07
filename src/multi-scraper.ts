import type { FlatCategory } from './categories';
import { NewWorldScraper } from './scraper';
import { saveProducts } from './storage/repository';
import { productsToRecordsAndSnapshots } from './storage/converters';

export interface MultiScraperConfig {
  categories: FlatCategory[];
  maxPages: number;
  headless: boolean;
  dbPath: string;
  onProgress?: (progress: ScrapeProgress) => void;
}

export interface CategoryResult {
  category: string;
  success: boolean;
  productCount: number;
  error?: string;
}

export interface ScrapeProgress {
  total: number;
  completed: number;
  failed: number;
  current?: string;
  results: CategoryResult[];
}

export class MultiCategoryScraper {
  private config: MultiScraperConfig;
  private scraper: NewWorldScraper | null = null;

  constructor(config: MultiScraperConfig) {
    this.config = config;
  }

  async run(): Promise<ScrapeProgress> {
    const progress: ScrapeProgress = {
      total: this.config.categories.length,
      completed: 0,
      failed: 0,
      results: [],
    };

    try {
      this.scraper = new NewWorldScraper({ headless: this.config.headless });
      await this.scraper.initialize();

      for (const category of this.config.categories) {
        const categoryPath = `${category.category0} > ${category.category1}`;
        progress.current = categoryPath;

        try {
          const products = await this.scraper.scrapeCategory(
            category.category0,
            category.category1,
            this.config.maxPages
          );

          // Save products to database
          if (products.length > 0) {
            const timestamp = new Date().toISOString();
            const { records, snapshots } = productsToRecordsAndSnapshots(products, timestamp);
            saveProducts(this.config.dbPath, records, snapshots);
          }

          progress.completed++;
          progress.results.push({
            category: categoryPath,
            success: true,
            productCount: products.length,
          });

          console.log(`✅ ${categoryPath}: ${products.length} products`);
        } catch (error) {
          progress.failed++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          progress.results.push({
            category: categoryPath,
            success: false,
            productCount: 0,
            error: errorMessage,
          });

          console.error(`❌ ${categoryPath}: ${errorMessage}`);
        }

        this.config.onProgress?.(progress);
      }
    } finally {
      if (this.scraper) {
        await this.scraper.close();
      }
    }

    progress.current = undefined;
    return progress;
  }
}
