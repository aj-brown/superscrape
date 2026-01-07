import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createReliabilityWrapper } from '../../src/reliability';
import type { ReliabilityConfig } from '../../src/reliability/types';

describe('Scraper Reliability Integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('should apply rate limiting between operations', async () => {
    const config: Partial<ReliabilityConfig> = {
      rateLimiter: {
        requestsPerMinute: 60,
        minDelayMs: 1000,
        maxDelayMs: 1000,
        jitterMs: 0,
      },
      retry: {
        maxRetries: 0,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
      },
      circuitBreaker: {
        failureThreshold: 5,
        resetTimeoutMs: 60000,
        halfOpenRequests: 1,
      },
    };

    const wrapper = createReliabilityWrapper(config);

    const fn = vi.fn().mockResolvedValue('success');

    const startTime = Date.now();

    // First operation
    const promise1 = wrapper.execute(fn);
    await vi.runAllTimersAsync();
    await promise1;

    // Second operation - should be delayed
    const promise2 = wrapper.execute(fn);
    vi.advanceTimersByTime(1000);
    await vi.runAllTimersAsync();
    await promise2;

    const elapsed = Date.now() - startTime;

    expect(elapsed).toBeGreaterThanOrEqual(1000);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should retry transient failures', async () => {
    const config: Partial<ReliabilityConfig> = {
      rateLimiter: {
        requestsPerMinute: 60,
        minDelayMs: 0,
        maxDelayMs: 0,
        jitterMs: 0,
      },
      retry: {
        maxRetries: 3,
        initialDelayMs: 100,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
      },
      circuitBreaker: {
        failureThreshold: 10,
        resetTimeoutMs: 60000,
        halfOpenRequests: 1,
      },
    };

    const wrapper = createReliabilityWrapper(config);

    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Timeout'))
      .mockResolvedValue('success');

    const promise = wrapper.execute(fn);

    await vi.runAllTimersAsync();
    vi.advanceTimersByTime(100);
    await vi.runAllTimersAsync();
    vi.advanceTimersByTime(200);
    await vi.runAllTimersAsync();

    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should trip circuit breaker after repeated failures', async () => {
    const config: Partial<ReliabilityConfig> = {
      rateLimiter: {
        requestsPerMinute: 60,
        minDelayMs: 0,
        maxDelayMs: 0,
        jitterMs: 0,
      },
      retry: {
        maxRetries: 0,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
      },
      circuitBreaker: {
        failureThreshold: 3,
        resetTimeoutMs: 60000,
        halfOpenRequests: 1,
      },
    };

    const wrapper = createReliabilityWrapper(config);

    const fn = vi.fn().mockRejectedValue(new Error('Validation error'));

    // Fail 3 times to trip circuit
    for (let i = 0; i < 3; i++) {
      await vi.runAllTimersAsync();
      await expect(wrapper.execute(fn)).rejects.toThrow('Validation error');
    }

    // Next call should fail immediately with CircuitOpenError
    await vi.runAllTimersAsync();
    await expect(wrapper.execute(fn)).rejects.toThrow('Circuit breaker is open');

    // Function should have been called only 3 times (circuit prevents 4th)
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should compose all reliability features together', async () => {
    const config: Partial<ReliabilityConfig> = {
      rateLimiter: {
        requestsPerMinute: 60,
        minDelayMs: 500,
        maxDelayMs: 500,
        jitterMs: 0,
      },
      retry: {
        maxRetries: 2,
        initialDelayMs: 100,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
      },
      circuitBreaker: {
        failureThreshold: 5,
        resetTimeoutMs: 60000,
        halfOpenRequests: 1,
      },
    };

    const wrapper = createReliabilityWrapper(config);

    let callCount = 0;
    const fn = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error('Network error')); // Will retry
      }
      return Promise.resolve(`success-${callCount}`);
    });

    // First operation: fails once, retries, succeeds
    const promise1 = wrapper.execute(fn);
    await vi.runAllTimersAsync();
    vi.advanceTimersByTime(100);
    await vi.runAllTimersAsync();
    const result1 = await promise1;

    expect(result1).toBe('success-2');
    expect(fn).toHaveBeenCalledTimes(2);

    // Second operation: rate limited delay + immediate success
    const promise2 = wrapper.execute(fn);
    vi.advanceTimersByTime(500);
    await vi.runAllTimersAsync();
    const result2 = await promise2;

    expect(result2).toBe('success-3');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should use default config when not specified', () => {
    const wrapper = createReliabilityWrapper();

    expect(wrapper).toBeDefined();
    expect(wrapper.execute).toBeInstanceOf(Function);
  });

  it('should merge partial config with defaults', async () => {
    const config: Partial<ReliabilityConfig> = {
      rateLimiter: {
        requestsPerMinute: 120, // Override just this field
        minDelayMs: 0,
        maxDelayMs: 0,
        jitterMs: 0,
      },
    };

    const wrapper = createReliabilityWrapper(config);

    const fn = vi.fn().mockResolvedValue('success');

    const promise1 = wrapper.execute(fn);
    await vi.runAllTimersAsync();
    await promise1;

    const promise2 = wrapper.execute(fn);
    await vi.runAllTimersAsync();
    await promise2;

    expect(fn).toHaveBeenCalledTimes(2);
  });
});
