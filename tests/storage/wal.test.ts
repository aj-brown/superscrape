import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { initDatabase, checkpoint, closeDatabase } from '../../src/storage/database';

const TEST_DB_DIR = join(__dirname, '../../.test-data');
const TEST_DB_PATH = join(TEST_DB_DIR, 'test-wal.sqlite');

describe('WAL mode', () => {
  beforeEach(() => {
    mkdirSync(TEST_DB_DIR, { recursive: true });
    [TEST_DB_PATH, `${TEST_DB_PATH}-wal`, `${TEST_DB_PATH}-shm`].forEach((f) => {
      if (existsSync(f)) unlinkSync(f);
    });
  });

  afterEach(() => {
    closeDatabase(TEST_DB_PATH);
    [TEST_DB_PATH, `${TEST_DB_PATH}-wal`, `${TEST_DB_PATH}-shm`].forEach((f) => {
      if (existsSync(f)) unlinkSync(f);
    });
  });

  it('enables WAL mode after connection', () => {
    const db = initDatabase(TEST_DB_PATH);
    const result = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
    expect(result.journal_mode).toBe('wal');
  });

  it('sets synchronous to NORMAL for balanced durability/speed', () => {
    const db = initDatabase(TEST_DB_PATH);
    const result = db.prepare('PRAGMA synchronous').get() as { synchronous: number };
    // NORMAL = 1
    expect(result.synchronous).toBe(1);
  });

  it('checkpoint function executes without error', () => {
    initDatabase(TEST_DB_PATH);
    expect(() => checkpoint(TEST_DB_PATH)).not.toThrow();
  });

  it('checkpoint returns stats about pages checkpointed', () => {
    const db = initDatabase(TEST_DB_PATH);
    // Insert some data to create WAL entries
    db.exec("INSERT INTO products (product_id, name, first_seen, last_seen) VALUES ('test', 'Test Product', '2024-01-01', '2024-01-01')");

    const result = checkpoint(TEST_DB_PATH);
    expect(result).toHaveProperty('walPages');
    expect(result).toHaveProperty('movedPages');
    expect(typeof result.walPages).toBe('number');
    expect(typeof result.movedPages).toBe('number');
  });
});
