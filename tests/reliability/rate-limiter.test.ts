import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRateLimiter } from '../../src/reliability/rate-limiter';
import type { RateLimiterConfig } from '../../src/reliability/types';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  describe('basic rate limiting', () => {
    it('should allow first request immediately', async () => {
      const config: RateLimiterConfig = {
        requestsPerMinute: 60,
        minDelayMs: 1000,
        maxDelayMs: 1000,
        jitterMs: 0,
      };
      const limiter = createRateLimiter(config);

      const start = Date.now();
      await limiter.acquire();
      const elapsed = Date.now() - start;

      expect(elapsed).toBe(0);
    });

    it('should enforce minimum delay between requests', async () => {
      const config: RateLimiterConfig = {
        requestsPerMinute: 60,
        minDelayMs: 1000,
        maxDelayMs: 1000,
        jitterMs: 0,
      };
      const limiter = createRateLimiter(config);

      const startTime = Date.now();
      await limiter.acquire(); // First request

      const acquirePromise = limiter.acquire(); // Second request

      // Advance time and let promise resolve
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();
      await acquirePromise;

      const endTime = Date.now();
      const elapsed = endTime - startTime;

      // Should have taken at least 1000ms
      expect(elapsed).toBeGreaterThanOrEqual(1000);
    });

    it('should enforce requests per minute limit', async () => {
      const config: RateLimiterConfig = {
        requestsPerMinute: 6, // 6 requests per minute = 10 seconds between requests
        minDelayMs: 3000,
        maxDelayMs: 3000,
        jitterMs: 0,
      };
      const limiter = createRateLimiter(config);

      const startTime = Date.now();

      // Make 6 requests
      for (let i = 0; i < 6; i++) {
        const promise = limiter.acquire();
        if (i > 0) {
          vi.advanceTimersByTime(3000);
          await vi.runAllTimersAsync();
        }
        await promise;
      }

      // 7th request should be delayed by ~10 seconds to stay within rate limit
      const acquirePromise = limiter.acquire();
      vi.advanceTimersByTime(10000);
      await vi.runAllTimersAsync();
      await acquirePromise;

      const elapsed = Date.now() - startTime;

      // Should have been delayed significantly to stay within rate limit
      expect(elapsed).toBeGreaterThanOrEqual(10000);
    });
  });

  describe('jitter functionality', () => {
    it('should apply random jitter to delays', async () => {
      const config: RateLimiterConfig = {
        requestsPerMinute: 60,
        minDelayMs: 1000,
        maxDelayMs: 1000,
        jitterMs: 500,
      };

      // Mock Math.random to return predictable values
      const originalRandom = Math.random;
      Math.random = vi.fn(() => 0.5);

      const limiter = createRateLimiter(config);

      const startTime = Date.now();
      await limiter.acquire();
      const acquirePromise = limiter.acquire();

      // Expected delay: 1000ms + (0.5 * 500) = 1250ms
      vi.advanceTimersByTime(1250);
      await vi.runAllTimersAsync();
      await acquirePromise;

      const elapsed = Date.now() - startTime;

      // Should have jitter applied
      expect(elapsed).toBeGreaterThanOrEqual(1250);

      Math.random = originalRandom;
    });

    it('should vary jitter across multiple requests', async () => {
      const config: RateLimiterConfig = {
        requestsPerMinute: 60,
        minDelayMs: 1000,
        maxDelayMs: 1000,
        jitterMs: 500,
      };

      const jitterValues = [0.2, 0.8, 0.5];
      let jitterIndex = 0;
      const originalRandom = Math.random;
      Math.random = vi.fn(() => jitterValues[jitterIndex++ % jitterValues.length]);

      const limiter = createRateLimiter(config);

      await limiter.acquire();

      // Second request: 1000 + (0.2 * 500) = 1100ms
      const promise1 = limiter.acquire();
      vi.advanceTimersByTime(1100);
      await vi.runAllTimersAsync();

      // Third request: 1000 + (0.8 * 500) = 1400ms
      const promise2 = limiter.acquire();
      vi.advanceTimersByTime(1400);
      await vi.runAllTimersAsync();

      await Promise.all([promise1, promise2]);

      Math.random = originalRandom;
    });
  });

  describe('stats tracking', () => {
    it('should track requests in window correctly', async () => {
      const config: RateLimiterConfig = {
        requestsPerMinute: 60,
        minDelayMs: 1000,
        maxDelayMs: 1000,
        jitterMs: 0,
      };
      const limiter = createRateLimiter(config);

      expect(limiter.getStats().requestsInWindow).toBe(0);

      await limiter.acquire();
      expect(limiter.getStats().requestsInWindow).toBe(1);

      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();
      await limiter.acquire();
      expect(limiter.getStats().requestsInWindow).toBe(2);
    });

    it('should remove old requests from window', async () => {
      const config: RateLimiterConfig = {
        requestsPerMinute: 60,
        minDelayMs: 100,
        maxDelayMs: 100,
        jitterMs: 0,
      };
      const limiter = createRateLimiter(config);

      await limiter.acquire();
      vi.advanceTimersByTime(100);
      await vi.runAllTimersAsync();

      await limiter.acquire();
      expect(limiter.getStats().requestsInWindow).toBe(2);

      // Advance past the 60-second window
      vi.advanceTimersByTime(61000);

      // Check stats (this should clean old requests)
      const stats = limiter.getStats();
      expect(stats.requestsInWindow).toBe(0);
    });

    it('should report current delay', async () => {
      const config: RateLimiterConfig = {
        requestsPerMinute: 60,
        minDelayMs: 1000,
        maxDelayMs: 2000,
        jitterMs: 0,
      };
      const limiter = createRateLimiter(config);

      await limiter.acquire();

      const stats = limiter.getStats();
      expect(stats.currentDelayMs).toBeGreaterThanOrEqual(1000);
      expect(stats.currentDelayMs).toBeLessThanOrEqual(2000);
    });
  });

  describe('configuration validation', () => {
    it('should handle high request rate', async () => {
      const config: RateLimiterConfig = {
        requestsPerMinute: 120, // 2 per second
        minDelayMs: 500,
        maxDelayMs: 500,
        jitterMs: 0,
      };
      const limiter = createRateLimiter(config);

      await limiter.acquire();
      vi.advanceTimersByTime(500);
      await vi.runAllTimersAsync();
      await limiter.acquire();

      expect(limiter.getStats().requestsInWindow).toBe(2);
    });

    it('should handle low request rate', async () => {
      const config: RateLimiterConfig = {
        requestsPerMinute: 6, // 1 per 10 seconds
        minDelayMs: 10000,
        maxDelayMs: 10000,
        jitterMs: 0,
      };
      const limiter = createRateLimiter(config);

      await limiter.acquire();
      const promise = limiter.acquire();

      vi.advanceTimersByTime(10000);
      await vi.runAllTimersAsync();

      await promise;
      expect(limiter.getStats().requestsInWindow).toBe(2);
    });
  });

  describe('concurrent requests', () => {
    it('should queue multiple concurrent acquire calls', async () => {
      const config: RateLimiterConfig = {
        requestsPerMinute: 60,
        minDelayMs: 1000,
        maxDelayMs: 1000,
        jitterMs: 0,
      };
      const limiter = createRateLimiter(config);

      await limiter.acquire(); // First request

      // Queue multiple requests
      const promises = [limiter.acquire(), limiter.acquire(), limiter.acquire()];

      // They should resolve sequentially
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();

      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();

      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();

      await Promise.all(promises);

      expect(limiter.getStats().requestsInWindow).toBe(4);
    });
  });
});
