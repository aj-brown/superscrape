import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { initDatabase, closeDatabase } from '../src/storage/database';
import { upsertStore, createRun, updateCategoryRun, completeRun } from '../src/storage/repository';
import { resolveResumeState, ResumeResult } from '../src/resume';
import type { FlatCategory } from '../src/categories';

const TEST_DB_DIR = join(__dirname, '../.test-data');
const TEST_DB_PATH = join(TEST_DB_DIR, 'test-resume.sqlite');
const TEST_STORE_ID = 'test-store-001';

const mockCategories: FlatCategory[] = [
  { category0: 'Pantry', category1: 'Baking', url: '/pantry/baking' },
  { category0: 'Bakery', category1: 'Bread', url: '/bakery/bread' },
  { category0: 'Dairy', category1: 'Milk', url: '/dairy/milk' },
];

describe('resolveResumeState', () => {
  beforeEach(() => {
    mkdirSync(TEST_DB_DIR, { recursive: true });
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    initDatabase(TEST_DB_PATH);

    // Insert test store (required for foreign key constraint)
    upsertStore(TEST_DB_PATH, {
      store_id: TEST_STORE_ID,
      name: 'Test Store',
      address: '123 Test St',
      region: 'NI',
      latitude: -41.0,
      longitude: 174.0,
      last_synced: new Date().toISOString(),
    });
  });

  afterEach(() => {
    closeDatabase(TEST_DB_PATH);
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  describe('no resume flags', () => {
    it('returns all categories with no runId', () => {
      const result = resolveResumeState(TEST_DB_PATH, mockCategories, {
        resume: false,
      });

      expect(result.runId).toBeUndefined();
      expect(result.categoriesToScrape).toEqual(mockCategories);
      expect(result.isResuming).toBe(false);
    });
  });

  describe('--resume flag', () => {
    it('returns all categories when no incomplete runs exist', () => {
      const result = resolveResumeState(TEST_DB_PATH, mockCategories, {
        resume: true,
      });

      expect(result.runId).toBeUndefined();
      expect(result.categoriesToScrape).toEqual(mockCategories);
      expect(result.isResuming).toBe(false);
      expect(result.message).toContain('No incomplete run');
    });

    it('returns existing runId when incomplete run exists', () => {
      const categorySlugs = mockCategories.map(
        (c) => `${c.category0} > ${c.category1}`
      );
      const existingRunId = createRun(TEST_DB_PATH, TEST_STORE_ID, categorySlugs);

      const result = resolveResumeState(TEST_DB_PATH, mockCategories, {
        resume: true,
      });

      expect(result.runId).toBe(existingRunId);
      expect(result.isResuming).toBe(true);
    });

    it('filters to only pending categories', () => {
      const categorySlugs = mockCategories.map(
        (c) => `${c.category0} > ${c.category1}`
      );
      const runId = createRun(TEST_DB_PATH, TEST_STORE_ID, categorySlugs);

      // Complete Pantry > Baking
      updateCategoryRun(TEST_DB_PATH, runId, TEST_STORE_ID, 'Pantry > Baking', {
        status: 'completed',
        lastPage: 5,
        productCount: 100,
      });

      const result = resolveResumeState(TEST_DB_PATH, mockCategories, {
        resume: true,
      });

      expect(result.categoriesToScrape.length).toBe(2);
      expect(result.categoriesToScrape.map((c) => c.category1)).toEqual([
        'Bread',
        'Milk',
      ]);
    });

    it('includes failed categories in resume', () => {
      const categorySlugs = mockCategories.map(
        (c) => `${c.category0} > ${c.category1}`
      );
      const runId = createRun(TEST_DB_PATH, TEST_STORE_ID, categorySlugs);

      // Complete first, fail second
      updateCategoryRun(TEST_DB_PATH, runId, TEST_STORE_ID, 'Pantry > Baking', {
        status: 'completed',
        lastPage: 5,
        productCount: 100,
      });
      updateCategoryRun(TEST_DB_PATH, runId, TEST_STORE_ID, 'Bakery > Bread', {
        status: 'failed',
        error: 'Network error',
      });

      const result = resolveResumeState(TEST_DB_PATH, mockCategories, {
        resume: true,
      });

      // Should include both pending (Dairy > Milk) and failed (Bakery > Bread)
      expect(result.categoriesToScrape.length).toBe(2);
      const category1s = result.categoriesToScrape.map((c) => c.category1);
      expect(category1s).toContain('Bread');
      expect(category1s).toContain('Milk');
    });

    it('returns empty array when all categories completed', () => {
      const categorySlugs = mockCategories.map(
        (c) => `${c.category0} > ${c.category1}`
      );
      const runId = createRun(TEST_DB_PATH, TEST_STORE_ID, categorySlugs);

      // Complete all categories
      for (const slug of categorySlugs) {
        updateCategoryRun(TEST_DB_PATH, runId, TEST_STORE_ID, slug, {
          status: 'completed',
          lastPage: 5,
          productCount: 100,
        });
      }

      const result = resolveResumeState(TEST_DB_PATH, mockCategories, {
        resume: true,
      });

      expect(result.categoriesToScrape).toEqual([]);
      expect(result.allCompleted).toBe(true);
    });
  });

  describe('--run-id flag', () => {
    it('resumes specific run by ID', () => {
      const categorySlugs = mockCategories.map(
        (c) => `${c.category0} > ${c.category1}`
      );
      const runId = createRun(TEST_DB_PATH, TEST_STORE_ID, categorySlugs);

      const result = resolveResumeState(TEST_DB_PATH, mockCategories, {
        resume: false,
        runId,
      });

      expect(result.runId).toBe(runId);
      expect(result.isResuming).toBe(true);
    });

    it('throws error when run does not exist', () => {
      expect(() =>
        resolveResumeState(TEST_DB_PATH, mockCategories, {
          resume: false,
          runId: 999,
        })
      ).toThrow('Run 999 not found');
    });

    it('throws error when run is already completed', () => {
      const categorySlugs = mockCategories.map(
        (c) => `${c.category0} > ${c.category1}`
      );
      const runId = createRun(TEST_DB_PATH, TEST_STORE_ID, categorySlugs);
      completeRun(TEST_DB_PATH, runId);

      expect(() =>
        resolveResumeState(TEST_DB_PATH, mockCategories, {
          resume: false,
          runId,
        })
      ).toThrow('already completed');
    });

    it('filters to pending/failed categories for specific run', () => {
      const categorySlugs = mockCategories.map(
        (c) => `${c.category0} > ${c.category1}`
      );
      const runId = createRun(TEST_DB_PATH, TEST_STORE_ID, categorySlugs);

      // Complete first category
      updateCategoryRun(TEST_DB_PATH, runId, TEST_STORE_ID, 'Pantry > Baking', {
        status: 'completed',
        lastPage: 5,
        productCount: 100,
      });

      const result = resolveResumeState(TEST_DB_PATH, mockCategories, {
        resume: false,
        runId,
      });

      expect(result.categoriesToScrape.length).toBe(2);
      expect(
        result.categoriesToScrape.find((c) => c.category1 === 'Baking')
      ).toBeUndefined();
    });
  });
});
