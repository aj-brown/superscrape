import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLogger } from '../../src/reliability/logger';
import type { LogLevel } from '../../src/reliability/types';

describe('Logger', () => {
  let consoleOutput: Array<{ level: string; message: string; data: unknown }>;

  beforeEach(() => {
    consoleOutput = [];
    // Mock console methods
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

  describe('log levels', () => {
    it('should log debug messages with context', () => {
      const logger = createLogger('test');
      logger.debug('debug message', { key: 'value' });

      expect(consoleOutput).toHaveLength(1);
      expect(consoleOutput[0].level).toBe('debug');
      expect(consoleOutput[0].message).toContain('[test]');
      expect(consoleOutput[0].message).toContain('debug message');
      expect(consoleOutput[0].data).toMatchObject({ key: 'value' });
    });

    it('should log info messages', () => {
      const logger = createLogger('test');
      logger.info('info message');

      expect(consoleOutput).toHaveLength(1);
      expect(consoleOutput[0].level).toBe('info');
      expect(consoleOutput[0].message).toContain('info message');
    });

    it('should log warn messages', () => {
      const logger = createLogger('test');
      logger.warn('warn message');

      expect(consoleOutput).toHaveLength(1);
      expect(consoleOutput[0].level).toBe('warn');
      expect(consoleOutput[0].message).toContain('warn message');
    });

    it('should log error messages', () => {
      const logger = createLogger('test');
      logger.error('error message');

      expect(consoleOutput).toHaveLength(1);
      expect(consoleOutput[0].level).toBe('error');
      expect(consoleOutput[0].message).toContain('error message');
    });

    it('should include timestamp in log output', () => {
      const logger = createLogger('test');
      logger.info('timestamped message');

      const logMessage = consoleOutput[0].message;
      // Check for ISO timestamp format
      expect(logMessage).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should include component name in log output', () => {
      const logger = createLogger('MyComponent');
      logger.info('test message');

      expect(consoleOutput[0].message).toContain('[MyComponent]');
    });
  });

  describe('timer functionality', () => {
    it('should create a timer and return accurate duration', async () => {
      const logger = createLogger('test');
      const timer = logger.startTimer();

      // Wait for a small amount of time
      await new Promise((resolve) => setTimeout(resolve, 50));

      const duration = timer.end();

      // Duration should be roughly 50ms (allow some margin)
      expect(duration).toBeGreaterThanOrEqual(45);
      expect(duration).toBeLessThan(100);
    });

    it('should measure multiple timers independently', async () => {
      const logger = createLogger('test');
      const timer1 = logger.startTimer();

      await new Promise((resolve) => setTimeout(resolve, 30));

      const timer2 = logger.startTimer();

      await new Promise((resolve) => setTimeout(resolve, 30));

      const duration2 = timer2.end();
      const duration1 = timer1.end();

      // timer1 should be roughly 60ms, timer2 roughly 30ms
      expect(duration1).toBeGreaterThanOrEqual(55);
      expect(duration2).toBeGreaterThanOrEqual(25);
      expect(duration2).toBeLessThan(duration1);
    });

    it('should be callable multiple times', () => {
      const logger = createLogger('test');
      const timer = logger.startTimer();

      const duration1 = timer.end();
      const duration2 = timer.end();

      // Both should return valid durations
      expect(duration1).toBeGreaterThanOrEqual(0);
      expect(duration2).toBeGreaterThanOrEqual(duration1);
    });
  });

  describe('context handling', () => {
    it('should handle missing context gracefully', () => {
      const logger = createLogger('test');
      logger.info('no context');

      expect(consoleOutput).toHaveLength(1);
      expect(consoleOutput[0].data).toBeUndefined();
    });

    it('should handle complex context objects', () => {
      const logger = createLogger('test');
      const context = {
        nested: { object: { with: 'values' } },
        array: [1, 2, 3],
        number: 42,
        boolean: true,
        null: null,
      };

      logger.info('complex context', context);

      expect(consoleOutput[0].data).toMatchObject(context);
    });
  });

  describe('log level filtering', () => {
    it('should respect minimum log level', () => {
      const logger = createLogger('test', 'warn' as LogLevel);

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      // Should only log warn and error
      expect(consoleOutput).toHaveLength(2);
      expect(consoleOutput[0].level).toBe('warn');
      expect(consoleOutput[1].level).toBe('error');
    });
  });
});
