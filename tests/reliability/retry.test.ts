import { describe, it, expect, beforeEach, vi } from 'vitest';
import { retryWithBackoff, isRetryableError } from '../../src/reliability/retry';
import type { RetryConfig } from '../../src/reliability/types';

describe('Retry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  describe('successful operations', () => {
    it('should return immediately on first success', async () => {
      const config: RetryConfig = {
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
      };

      const fn = vi.fn().mockResolvedValue('success');
      const promise = retryWithBackoff(fn, config);

      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.value).toBe('success');
      expect(result.attempts).toBe(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should return the correct value type', async () => {
      const config: RetryConfig = {
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
      };

      const fn = vi.fn().mockResolvedValue({ data: 'test', count: 42 });
      const promise = retryWithBackoff(fn, config);

      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.value).toEqual({ data: 'test', count: 42 });
    });
  });

  describe('transient failures with recovery', () => {
    it('should retry on network errors', async () => {
      const config: RetryConfig = {
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
      };

      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValue('success');

      const promise = retryWithBackoff(fn, config);

      // First attempt fails
      await vi.runAllTimersAsync();

      // First retry after 1000ms
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();

      // Second retry after 2000ms
      vi.advanceTimersByTime(2000);
      await vi.runAllTimersAsync();

      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.value).toBe('success');
      expect(result.attempts).toBe(3);
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should apply exponential backoff', async () => {
      const config: RetryConfig = {
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
      };

      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockResolvedValue('success');

      const promise = retryWithBackoff(fn, config);

      await vi.runAllTimersAsync();

      // First retry: 1000ms
      const beforeRetry1 = Date.now();
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();
      const afterRetry1 = Date.now();
      expect(afterRetry1 - beforeRetry1).toBe(1000);

      // Second retry: 2000ms (1000 * 2^1)
      const beforeRetry2 = Date.now();
      vi.advanceTimersByTime(2000);
      await vi.runAllTimersAsync();
      const afterRetry2 = Date.now();
      expect(afterRetry2 - beforeRetry2).toBe(2000);

      const result = await promise;
      expect(result.success).toBe(true);
    });

    it('should respect maxDelay cap', async () => {
      const config: RetryConfig = {
        maxRetries: 5,
        initialDelayMs: 1000,
        maxDelayMs: 3000,
        backoffMultiplier: 2,
      };

      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockRejectedValueOnce(new Error('Error 3'))
        .mockRejectedValueOnce(new Error('Error 4'))
        .mockResolvedValue('success');

      const promise = retryWithBackoff(fn, config);

      await vi.runAllTimersAsync();

      // Delays should be: 1000, 2000, 3000 (capped), 3000 (capped)
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();

      vi.advanceTimersByTime(2000);
      await vi.runAllTimersAsync();

      vi.advanceTimersByTime(3000); // Would be 4000, but capped at 3000
      await vi.runAllTimersAsync();

      vi.advanceTimersByTime(3000); // Would be 8000, but capped at 3000
      await vi.runAllTimersAsync();

      const result = await promise;
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(5);
    });
  });

  describe('permanent failures', () => {
    it('should stop after maxRetries', async () => {
      const config: RetryConfig = {
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
      };

      const fn = vi.fn().mockRejectedValue(new Error('Persistent error'));

      const promise = retryWithBackoff(fn, config);

      await vi.runAllTimersAsync();

      // Retry 1
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();

      // Retry 2
      vi.advanceTimersByTime(2000);
      await vi.runAllTimersAsync();

      // Retry 3
      vi.advanceTimersByTime(4000);
      await vi.runAllTimersAsync();

      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('Persistent error');
      expect(result.attempts).toBe(4); // Initial + 3 retries
      expect(fn).toHaveBeenCalledTimes(4);
    });

    it('should NOT retry 4xx errors', async () => {
      const config: RetryConfig = {
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
      };

      const error = new Error('Bad request');
      (error as any).statusCode = 400;
      const fn = vi.fn().mockRejectedValue(error);

      const promise = retryWithBackoff(fn, config);

      await vi.runAllTimersAsync();

      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Bad request');
      expect(result.attempts).toBe(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry validation errors', async () => {
      const config: RetryConfig = {
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
      };

      const error = new Error('Validation failed');
      error.name = 'ValidationError';
      const fn = vi.fn().mockRejectedValue(error);

      const promise = retryWithBackoff(fn, config);

      await vi.runAllTimersAsync();

      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('retryable error classification', () => {
    it('should classify network errors as retryable', () => {
      const errors = [
        new Error('Network error'),
        new Error('ETIMEDOUT'),
        new Error('ECONNREFUSED'),
        new Error('ENOTFOUND'),
        new Error('socket hang up'),
      ];

      errors.forEach((error) => {
        expect(isRetryableError(error)).toBe(true);
      });
    });

    it('should classify timeout errors as retryable', () => {
      const errors = [new Error('Timeout'), new Error('Request timeout'), new Error('Operation timed out')];

      errors.forEach((error) => {
        expect(isRetryableError(error)).toBe(true);
      });
    });

    it('should classify 5xx status codes as retryable', () => {
      const error500 = new Error('Internal server error');
      (error500 as any).statusCode = 500;

      const error502 = new Error('Bad gateway');
      (error502 as any).statusCode = 502;

      const error503 = new Error('Service unavailable');
      (error503 as any).statusCode = 503;

      expect(isRetryableError(error500)).toBe(true);
      expect(isRetryableError(error502)).toBe(true);
      expect(isRetryableError(error503)).toBe(true);
    });

    it('should classify 4xx status codes as non-retryable', () => {
      const error400 = new Error('Bad request');
      (error400 as any).statusCode = 400;

      const error401 = new Error('Unauthorized');
      (error401 as any).statusCode = 401;

      const error404 = new Error('Not found');
      (error404 as any).statusCode = 404;

      expect(isRetryableError(error400)).toBe(false);
      expect(isRetryableError(error401)).toBe(false);
      expect(isRetryableError(error404)).toBe(false);
    });

    it('should classify validation errors as non-retryable', () => {
      const error = new Error('Validation failed');
      error.name = 'ValidationError';

      expect(isRetryableError(error)).toBe(false);
    });

    it('should classify authentication errors as non-retryable', () => {
      const error = new Error('Auth failed');
      error.name = 'AuthenticationError';

      expect(isRetryableError(error)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle zero maxRetries', async () => {
      const config: RetryConfig = {
        maxRetries: 0,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
      };

      const fn = vi.fn().mockRejectedValue(new Error('Error'));

      const promise = retryWithBackoff(fn, config);
      await vi.runAllTimersAsync();

      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle functions that throw synchronously', async () => {
      const config: RetryConfig = {
        maxRetries: 2,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
      };

      const fn = vi.fn().mockImplementation(() => {
        throw new Error('Sync error');
      });

      const promise = retryWithBackoff(fn, config);
      await vi.runAllTimersAsync();

      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();

      vi.advanceTimersByTime(2000);
      await vi.runAllTimersAsync();

      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Sync error');
      expect(result.attempts).toBe(3);
    });
  });
});
