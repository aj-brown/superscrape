import { describe, it, expect } from 'vitest';
import { parseCliArgs } from '../src/cli';

describe('parseCliArgs', () => {
  it('parses --all flag', () => {
    const result = parseCliArgs(['--all']);

    expect(result.filter.mode).toBe('all');
  });

  it('parses multiple -c options', () => {
    const result = parseCliArgs(['-c', 'Pantry', '-c', 'Bakery']);

    expect(result.filter.mode).toBe('specific');
    expect(result.filter.categories).toEqual(['Pantry', 'Bakery']);
  });

  it('parses category path with >', () => {
    const result = parseCliArgs(['-c', 'Fruit & Vegetables > Fruit']);

    expect(result.filter.mode).toBe('specific');
    expect(result.filter.categories).toEqual(['Fruit & Vegetables > Fruit']);
  });

  it('sets default values', () => {
    const result = parseCliArgs([]);

    expect(result.maxPages).toBe(10);
    expect(result.headless).toBe(true);
    expect(result.filter.mode).toBe('all');
  });

  it('--dry-run sets dryRun flag', () => {
    const result = parseCliArgs(['--dry-run']);

    expect(result.dryRun).toBe(true);
  });

  it('--help returns help flag', () => {
    const result = parseCliArgs(['--help']);

    expect(result.help).toBe(true);
  });

  it('-h returns help flag', () => {
    const result = parseCliArgs(['-h']);

    expect(result.help).toBe(true);
  });

  it('--pages sets maxPages', () => {
    const result = parseCliArgs(['--pages', '5']);

    expect(result.maxPages).toBe(5);
  });

  it('-p sets maxPages', () => {
    const result = parseCliArgs(['-p', '3']);

    expect(result.maxPages).toBe(3);
  });

  it('--no-headless sets headless to false', () => {
    const result = parseCliArgs(['--no-headless']);

    expect(result.headless).toBe(false);
  });

  it('--log-format sets logFormat (default: text)', () => {
    const result = parseCliArgs([]);

    expect(result.logFormat).toBe('text');
  });

  it('--log-format json sets logFormat to json', () => {
    const result = parseCliArgs(['--log-format', 'json']);

    expect(result.logFormat).toBe('json');
  });

  it('--log-level sets logLevel (default: info)', () => {
    const result = parseCliArgs([]);

    expect(result.logLevel).toBe('info');
  });

  it('--log-level debug sets logLevel to debug', () => {
    const result = parseCliArgs(['--log-level', 'debug']);

    expect(result.logLevel).toBe('debug');
  });

  it('--config sets configPath', () => {
    const result = parseCliArgs(['--config', 'my-config.json']);

    expect(result.configPath).toBe('my-config.json');
  });

  it('configPath is undefined by default', () => {
    const result = parseCliArgs([]);

    expect(result.configPath).toBeUndefined();
  });
});
