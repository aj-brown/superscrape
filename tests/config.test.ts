import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { loadConfig, ConfigSchema, mergeConfigWithCli } from '../src/config';
import type { CliOptions } from '../src/cli';

const TEST_DIR = join(__dirname, '../.test-data');
const TEST_CONFIG_PATH = join(TEST_DIR, 'test-config.json');

describe('ConfigSchema', () => {
  it('validates a valid config', () => {
    const config = {
      maxPages: 5,
      headless: true,
      logFormat: 'json',
      logLevel: 'debug',
      categories: ['Pantry', 'Bakery'],
    };
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('allows partial config', () => {
    const config = { maxPages: 10 };
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('rejects invalid logFormat', () => {
    const config = { logFormat: 'invalid' };
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('rejects invalid logLevel', () => {
    const config = { logLevel: 'invalid' };
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('rejects negative maxPages', () => {
    const config = { maxPages: -1 };
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });
});

describe('loadConfig', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_CONFIG_PATH)) {
      unlinkSync(TEST_CONFIG_PATH);
    }
  });

  it('loads valid config file', () => {
    writeFileSync(TEST_CONFIG_PATH, JSON.stringify({ maxPages: 20 }));

    const config = loadConfig(TEST_CONFIG_PATH);
    expect(config.maxPages).toBe(20);
  });

  it('throws descriptive error for invalid config', () => {
    writeFileSync(TEST_CONFIG_PATH, JSON.stringify({ maxPages: -5 }));

    expect(() => loadConfig(TEST_CONFIG_PATH)).toThrow(/maxPages/);
  });

  it('throws error for non-existent file', () => {
    expect(() => loadConfig('/nonexistent/path.json')).toThrow(/not found/i);
  });

  it('throws error for invalid JSON', () => {
    writeFileSync(TEST_CONFIG_PATH, 'not valid json');

    expect(() => loadConfig(TEST_CONFIG_PATH)).toThrow();
  });
});

describe('mergeConfigWithCli', () => {
  const baseCliOptions: CliOptions = {
    filter: { mode: 'all' },
    maxPages: 10,
    headless: true,
    dryRun: false,
    help: false,
    logFormat: 'text',
    logLevel: 'info',
  };

  it('returns CLI options unchanged when no config', () => {
    const result = mergeConfigWithCli(baseCliOptions, undefined);
    expect(result).toEqual(baseCliOptions);
  });

  it('config provides defaults for CLI options', () => {
    const config = { maxPages: 25, logFormat: 'json' as const };
    const cliWithDefaults = { ...baseCliOptions };

    const result = mergeConfigWithCli(cliWithDefaults, config);
    expect(result.maxPages).toBe(25);
    expect(result.logFormat).toBe('json');
  });

  it('config values used when CLI has defaults', () => {
    // Config provides values that override CLI defaults
    // This is the expected behavior: config is loaded first, CLI args override
    const config = { maxPages: 25 };
    const result = mergeConfigWithCli(baseCliOptions, config);
    expect(result.maxPages).toBe(25);
  });

  it('config categories set filter mode to specific', () => {
    const config = { categories: ['Pantry', 'Bakery'] };
    const result = mergeConfigWithCli(baseCliOptions, config);

    expect(result.filter.mode).toBe('specific');
    expect(result.filter.categories).toEqual(['Pantry', 'Bakery']);
  });
});
