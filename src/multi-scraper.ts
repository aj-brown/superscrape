import pLimit from 'p-limit';
import type { FlatCategory } from './categories';
import { NewWorldScraper } from './scraper';
import {
  saveProducts,
  createRun,
  updateCategoryRun,
  completeRun,
} from './storage/repository';
import { productsToRecordsAndSnapshots } from './storage/converters';

export interface MultiScraperConfig {
  categories: FlatCategory[];
  maxPages: number;
  headless: boolean;
  dbPath: string;
  runId?: number;
  concurrency?: number;
  onProgress?: (progress: ScrapeProgress) => void;
}

export interface CategoryResult {
  category: string;
  success: boolean;
  productCount: number;
  error?: string;
}

export interface ScrapeProgress {
  runId: number;
  total: number;
  completed: number;
  failed: number;
  current?: string;
  results: CategoryResult[];
}

export class MultiCategoryScraper {
  private config: MultiScraperConfig;
  private scrapers: NewWorldScraper[] = [];

  constructor(config: MultiScraperConfig) {
    this.config = config;
  }

  async run(): Promise<ScrapeProgress> {
    const concurrency = this.config.concurrency ?? 1;

    // Create or reuse run ID
    const categorySlugs = this.config.categories.map(
      (c) => `${c.category0} > ${c.category1}`
    );
    const runId =
      this.config.runId ?? createRun(this.config.dbPath, categorySlugs);

    const progress: ScrapeProgress = {
      runId,
      total: this.config.categories.length,
      completed: 0,
      failed: 0,
      results: [],
    };

    // Use p-limit for concurrency control
    const limit = pLimit(concurrency);

    try {
      // Create a pool of scrapers for parallel execution
      console.log(`🚀 Initializing ${concurrency} worker(s)...`);
      for (let i = 0; i < concurrency; i++) {
        const scraper = new NewWorldScraper({ headless: this.config.headless });
        await scraper.initialize();
        this.scrapers.push(scraper);
      }

      // Create tasks for each category
      const tasks = this.config.categories.map((category, index) => {
        return limit(async () => {
          // Assign to a worker based on round-robin
          const scraper = this.scrapers[index % this.scrapers.length];
          return this.scrapeCategory(scraper, category, runId, progress);
        });
      });

      // Execute all tasks with concurrency limit
      await Promise.all(tasks);

      // Mark run as completed
      completeRun(this.config.dbPath, runId);
    } finally {
      // Close all scrapers
      await Promise.all(this.scrapers.map((s) => s.close()));
      this.scrapers = [];
    }

    progress.current = undefined;
    return progress;
  }

  private async scrapeCategory(
    scraper: NewWorldScraper,
    category: FlatCategory,
    runId: number,
    progress: ScrapeProgress
  ): Promise<void> {
    const categoryPath = `${category.category0} > ${category.category1}`;

    // Mark category as in progress
    updateCategoryRun(this.config.dbPath, runId, categoryPath, {
      status: 'in_progress',
    });

    try {
      const products = await scraper.scrapeCategory(
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

      // Mark category as completed
      updateCategoryRun(this.config.dbPath, runId, categoryPath, {
        status: 'completed',
        lastPage: this.config.maxPages,
        productCount: products.length,
      });

      progress.completed++;
      progress.results.push({
        category: categoryPath,
        success: true,
        productCount: products.length,
      });

      console.log(`✅ ${categoryPath}: ${products.length} products`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Mark category as failed
      updateCategoryRun(this.config.dbPath, runId, categoryPath, {
        status: 'failed',
        error: errorMessage,
      });

      progress.failed++;
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
}
