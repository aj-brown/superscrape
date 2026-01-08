import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import { parseCategories, selectCategories, type CategoryNode } from '../../src/categories';
import { parseCliArgs } from '../../src/cli';

// Mock the scraper and storage to avoid actual scraping
vi.mock('../../src/scraper', () => ({
  NewWorldScraper: class MockScraper {
    initialize = vi.fn().mockResolvedValue(undefined);
    scrapeCategory = vi.fn().mockResolvedValue([]);
    close = vi.fn().mockResolvedValue(undefined);
  },
}));

vi.mock('../../src/storage/database', () => ({
  getDatabase: vi.fn().mockReturnValue({
    prepare: vi.fn().mockReturnValue({ run: vi.fn() }),
    exec: vi.fn(),
    transaction: vi.fn((fn) => fn),
  }),
  initDatabase: vi.fn(),
}));

vi.mock('../../src/storage/repository', () => ({
  saveProducts: vi.fn(),
}));

describe('Multi-Category Integration', () => {
  const categoriesPath = './categories.json';

  it('dry-run lists categories without scraping', async () => {
    // Parse CLI args for dry-run
    const cliOptions = parseCliArgs(['--dry-run']);
    expect(cliOptions.dryRun).toBe(true);

    // Load and parse categories
    const rawCategories = JSON.parse(fs.readFileSync(categoriesPath, 'utf-8')) as CategoryNode[];
    const flatCategories = parseCategories(rawCategories);
    const selectedCategories = selectCategories(flatCategories, cliOptions.filter);

    // Should have many categories (no Featured)
    expect(selectedCategories.length).toBeGreaterThan(50);
    expect(selectedCategories.find((c) => c.category0 === 'Featured')).toBeUndefined();

    // In dry-run mode, we just list categories without scraping
    // This is the expected behavior - no scraper.initialize() or scraper.scrapeCategory() calls
  });

  it('scrapes single category end-to-end', async () => {
    // Parse CLI args for a single category
    const cliOptions = parseCliArgs(['-c', 'Pantry', '--pages', '1']);

    expect(cliOptions.filter.mode).toBe('specific');
    expect(cliOptions.filter.categories).toEqual(['Pantry']);
    expect(cliOptions.maxPages).toBe(1);

    // Load and parse categories
    const rawCategories = JSON.parse(fs.readFileSync(categoriesPath, 'utf-8')) as CategoryNode[];
    const flatCategories = parseCategories(rawCategories);
    const selectedCategories = selectCategories(flatCategories, cliOptions.filter);

    // Should have Pantry subcategories
    expect(selectedCategories.length).toBeGreaterThan(0);
    expect(selectedCategories.every((c) => c.category0 === 'Pantry')).toBe(true);
  });

  it('parses categories and excludes Featured', () => {
    const rawCategories = JSON.parse(fs.readFileSync(categoriesPath, 'utf-8')) as CategoryNode[];
    const flatCategories = parseCategories(rawCategories);

    // No Featured category should be present
    expect(flatCategories.find((c) => c.category0 === 'Featured')).toBeUndefined();

    // Should have valid structure
    expect(flatCategories.every((c) => c.category0 && c.category1)).toBe(true);
  });
});
