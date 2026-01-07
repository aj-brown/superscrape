import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { initDatabase, closeDatabase } from '../../src/storage/database';
import {
  createRun,
  updateCategoryRun,
  getIncompleteRun,
  completeRun,
  getRunStatus,
} from '../../src/storage/repository';

const TEST_DB_DIR = join(__dirname, '../../.test-data');
const TEST_DB_PATH = join(TEST_DB_DIR, 'test-runs.sqlite');

describe('Scrape Run Tracking', () => {
  beforeEach(() => {
    mkdirSync(TEST_DB_DIR, { recursive: true });
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    initDatabase(TEST_DB_PATH);
  });

  afterEach(() => {
    closeDatabase(TEST_DB_PATH);
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  describe('createRun', () => {
    it('creates run record with correct initial state', () => {
      const categories = ['Pantry', 'Bakery', 'Dairy'];
      const runId = createRun(TEST_DB_PATH, categories);

      expect(runId).toBeGreaterThan(0);

      const status = getRunStatus(TEST_DB_PATH, runId);
      expect(status).toBeDefined();
      expect(status?.status).toBe('in_progress');
      expect(status?.totalCategories).toBe(3);
      expect(status?.completedCategories).toBe(0);
    });

    it('creates category run entries', () => {
      const categories = ['Pantry', 'Bakery'];
      const runId = createRun(TEST_DB_PATH, categories);

      const status = getRunStatus(TEST_DB_PATH, runId);
      expect(status?.categories.length).toBe(2);
      expect(status?.categories[0].status).toBe('pending');
      expect(status?.categories[1].status).toBe('pending');
    });
  });

  describe('updateCategoryRun', () => {
    it('updates category progress after completion', () => {
      const categories = ['Pantry', 'Bakery'];
      const runId = createRun(TEST_DB_PATH, categories);

      updateCategoryRun(TEST_DB_PATH, runId, 'Pantry', {
        status: 'completed',
        lastPage: 5,
        productCount: 100,
      });

      const status = getRunStatus(TEST_DB_PATH, runId);
      const pantryRun = status?.categories.find((c) => c.categorySlug === 'Pantry');
      expect(pantryRun?.status).toBe('completed');
      expect(pantryRun?.lastPage).toBe(5);
      expect(pantryRun?.productCount).toBe(100);
    });

    it('records error on failure', () => {
      const categories = ['Pantry'];
      const runId = createRun(TEST_DB_PATH, categories);

      updateCategoryRun(TEST_DB_PATH, runId, 'Pantry', {
        status: 'failed',
        lastPage: 3,
        error: 'Network timeout',
      });

      const status = getRunStatus(TEST_DB_PATH, runId);
      const pantryRun = status?.categories[0];
      expect(pantryRun?.status).toBe('failed');
      expect(pantryRun?.error).toBe('Network timeout');
      expect(pantryRun?.lastPage).toBe(3);
    });
  });

  describe('getIncompleteRun', () => {
    it('returns most recent incomplete run', () => {
      const runId = createRun(TEST_DB_PATH, ['Pantry', 'Bakery']);

      const incomplete = getIncompleteRun(TEST_DB_PATH);
      expect(incomplete).toBeDefined();
      expect(incomplete?.id).toBe(runId);
    });

    it('returns null when no incomplete runs exist', () => {
      const runId = createRun(TEST_DB_PATH, ['Pantry']);
      completeRun(TEST_DB_PATH, runId);

      const incomplete = getIncompleteRun(TEST_DB_PATH);
      expect(incomplete).toBeNull();
    });

    it('returns categories that need to be resumed', () => {
      const runId = createRun(TEST_DB_PATH, ['Pantry', 'Bakery', 'Dairy']);

      // Complete Pantry
      updateCategoryRun(TEST_DB_PATH, runId, 'Pantry', {
        status: 'completed',
        lastPage: 5,
        productCount: 100,
      });

      const incomplete = getIncompleteRun(TEST_DB_PATH);
      expect(incomplete).toBeDefined();
      expect(incomplete?.pendingCategories).toContain('Bakery');
      expect(incomplete?.pendingCategories).toContain('Dairy');
      expect(incomplete?.pendingCategories).not.toContain('Pantry');
    });
  });

  describe('completeRun', () => {
    it('marks run as completed', () => {
      const runId = createRun(TEST_DB_PATH, ['Pantry']);
      updateCategoryRun(TEST_DB_PATH, runId, 'Pantry', {
        status: 'completed',
        lastPage: 5,
        productCount: 100,
      });

      completeRun(TEST_DB_PATH, runId);

      const status = getRunStatus(TEST_DB_PATH, runId);
      expect(status?.status).toBe('completed');
      expect(status?.completedAt).toBeDefined();
    });
  });
});
