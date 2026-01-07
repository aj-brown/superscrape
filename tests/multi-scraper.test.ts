import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MultiCategoryScraper,
  type MultiScraperConfig,
} from '../src/multi-scraper';
import type { FlatCategory } from '../src/categories';

// Create mock instances
const mockScrapeCategory = vi.fn();
const mockInitialize = vi.fn();
const mockClose = vi.fn();

// Mock dependencies
vi.mock('../src/scraper', () => ({
  NewWorldScraper: class MockScraper {
    initialize = mockInitialize.mockResolvedValue(undefined);
    scrapeCategory = mockScrapeCategory;
    close = mockClose.mockResolvedValue(undefined);
  },
}));

vi.mock('../src/storage/repository', () => ({
  saveProducts: vi.fn(),
  createRun: vi.fn().mockReturnValue(1),
  updateCategoryRun: vi.fn(),
  completeRun: vi.fn(),
}));

vi.mock('../src/storage/converters', () => ({
  productsToRecordsAndSnapshots: vi.fn().mockReturnValue({
    records: [],
    snapshots: [],
  }),
}));

describe('MultiCategoryScraper', () => {
  const mockCategories: FlatCategory[] = [
    { category0: 'Fruit & Vegetables', category1: 'Fruit' },
    { category0: 'Fruit & Vegetables', category1: 'Vegetables' },
    { category0: 'Pantry', category1: 'Chips' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockScrapeCategory.mockResolvedValue([
      { productId: '123', name: 'Test Product', price: 5.99 },
    ]);
  });

  it('scrapes categories sequentially', async () => {
    const config: MultiScraperConfig = {
      categories: mockCategories,
      maxPages: 1,
      headless: true,
      dbPath: ':memory:',
    };

    const scraper = new MultiCategoryScraper(config);
    const result = await scraper.run();

    expect(result.total).toBe(3);
    expect(result.completed).toBe(3);
    expect(result.failed).toBe(0);
    expect(mockScrapeCategory).toHaveBeenCalledTimes(3);
  });

  it('continues after category failure', async () => {
    mockScrapeCategory
      .mockResolvedValueOnce([{ productId: '1', name: 'Product 1', price: 1.99 }])
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce([{ productId: '3', name: 'Product 3', price: 3.99 }]);

    const config: MultiScraperConfig = {
      categories: mockCategories,
      maxPages: 1,
      headless: true,
      dbPath: ':memory:',
    };

    const scraper = new MultiCategoryScraper(config);
    const result = await scraper.run();

    expect(result.total).toBe(3);
    expect(result.completed).toBe(2);
    expect(result.failed).toBe(1);
  });

  it('tracks progress correctly', async () => {
    const config: MultiScraperConfig = {
      categories: mockCategories,
      maxPages: 1,
      headless: true,
      dbPath: ':memory:',
    };

    const scraper = new MultiCategoryScraper(config);
    const result = await scraper.run();

    expect(result.results).toHaveLength(3);
    expect(result.results[0].category).toBe('Fruit & Vegetables > Fruit');
    expect(result.results[1].category).toBe('Fruit & Vegetables > Vegetables');
    expect(result.results[2].category).toBe('Pantry > Chips');
  });

  it('calls onProgress callback', async () => {
    const onProgress = vi.fn();
    const config: MultiScraperConfig = {
      categories: mockCategories,
      maxPages: 1,
      headless: true,
      dbPath: ':memory:',
      onProgress,
    };

    const scraper = new MultiCategoryScraper(config);
    await scraper.run();

    // Called once after each category
    expect(onProgress).toHaveBeenCalledTimes(3);
  });

  it('saves products to database', async () => {
    const { saveProducts } = await import('../src/storage/repository');

    const config: MultiScraperConfig = {
      categories: mockCategories,
      maxPages: 1,
      headless: true,
      dbPath: ':memory:',
    };

    const scraper = new MultiCategoryScraper(config);
    await scraper.run();

    // saveProducts called for each successful category
    expect(saveProducts).toHaveBeenCalledTimes(3);
  });
});
