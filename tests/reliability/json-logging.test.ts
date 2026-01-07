import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLogger } from '../../src/reliability/logger';
import type { LogFormat } from '../../src/reliability/types';

describe('JSON Logging', () => {
  let stderrOutput: string[];

  beforeEach(() => {
    stderrOutput = [];
    // Mock process.stderr.write for JSON mode (logs to stderr)
    vi.spyOn(process.stderr, 'write').mockImplementation((msg) => {
      stderrOutput.push(msg.toString());
      return true;
    });
  });

  describe('JSON format', () => {
    it('outputs valid JSON per line', () => {
      const logger = createLogger('test', 'debug', 'json');
      logger.info('test message', { key: 'value' });

      expect(stderrOutput).toHaveLength(1);
      const parsed = JSON.parse(stderrOutput[0]);
      expect(parsed).toHaveProperty('timestamp');
      expect(parsed).toHaveProperty('level', 'info');
      expect(parsed).toHaveProperty('component', 'test');
      expect(parsed).toHaveProperty('message', 'test message');
      expect(parsed).toHaveProperty('context');
      expect(parsed.context).toMatchObject({ key: 'value' });
    });

    it('outputs newline-delimited JSON', () => {
      const logger = createLogger('test', 'debug', 'json');
      logger.info('message 1');
      logger.info('message 2');

      expect(stderrOutput).toHaveLength(2);
      expect(stderrOutput[0]).toMatch(/\n$/);
      expect(stderrOutput[1]).toMatch(/\n$/);

      // Both should be parseable JSON
      expect(() => JSON.parse(stderrOutput[0])).not.toThrow();
      expect(() => JSON.parse(stderrOutput[1])).not.toThrow();
    });

    it('includes ISO timestamp in JSON output', () => {
      const logger = createLogger('test', 'debug', 'json');
      logger.info('timestamp test');

      const parsed = JSON.parse(stderrOutput[0]);
      expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('handles missing context', () => {
      const logger = createLogger('test', 'debug', 'json');
      logger.info('no context');

      const parsed = JSON.parse(stderrOutput[0]);
      expect(parsed).not.toHaveProperty('context');
    });

    it('handles complex context objects', () => {
      const logger = createLogger('test', 'debug', 'json');
      const context = {
        nested: { object: { with: 'values' } },
        array: [1, 2, 3],
        number: 42,
        boolean: true,
      };
      logger.info('complex', context);

      const parsed = JSON.parse(stderrOutput[0]);
      expect(parsed.context).toMatchObject(context);
    });
  });

  describe('log level filtering with JSON format', () => {
    it('respects minimum log level in JSON mode', () => {
      const logger = createLogger('test', 'warn', 'json');

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      // Should only log warn and error
      expect(stderrOutput).toHaveLength(2);
      expect(JSON.parse(stderrOutput[0]).level).toBe('warn');
      expect(JSON.parse(stderrOutput[1]).level).toBe('error');
    });
  });

  describe('text format (default)', () => {
    let consoleOutput: Array<{ level: string; message: string; data: unknown }>;

    beforeEach(() => {
      consoleOutput = [];
      vi.spyOn(console, 'debug').mockImplementation((msg, data) => {
        consoleOutput.push({ level: 'debug', message: msg, data });
      });
      vi.spyOn(console, 'info').mockImplementation((msg, data) => {
        consoleOutput.push({ level: 'info', message: msg, data });
      });
      vi.spyOn(console, 'warn').mockImplementation((msg, data) => {
        consoleOutput.push({ level: 'warn', message: msg, data });
      });
      vi.spyOn(console, 'error').mockImplementation((msg, data) => {
        consoleOutput.push({ level: 'error', message: msg, data });
      });
    });

    it('defaults to text format', () => {
      const logger = createLogger('test');
      logger.info('text format test');

      // Should use console.info, not process.stderr
      expect(consoleOutput).toHaveLength(1);
      expect(consoleOutput[0].message).toContain('[test]');
      expect(consoleOutput[0].message).toContain('text format test');
    });

    it('supports explicit text format', () => {
      const logger = createLogger('test', 'debug', 'text');
      logger.info('explicit text');

      expect(consoleOutput).toHaveLength(1);
      expect(consoleOutput[0].message).toContain('explicit text');
    });
  });
});
