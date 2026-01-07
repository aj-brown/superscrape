import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createCircuitBreaker } from '../../src/reliability/circuit-breaker';
import { CircuitState, CircuitOpenError } from '../../src/reliability/types';
import type { CircuitBreakerConfig } from '../../src/reliability/types';

describe('CircuitBreaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  describe('closed state', () => {
    it('should start in closed state', () => {
      const config: CircuitBreakerConfig = {
        failureThreshold: 5,
        resetTimeoutMs: 60000,
        halfOpenRequests: 1,
      };
      const breaker = createCircuitBreaker(config);

      const stats = breaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.consecutiveFailures).toBe(0);
    });

    it('should allow requests in closed state', async () => {
      const config: CircuitBreakerConfig = {
        failureThreshold: 5,
        resetTimeoutMs: 60000,
        halfOpenRequests: 1,
      };
      const breaker = createCircuitBreaker(config);

      const fn = vi.fn().mockResolvedValue('success');
      const result = await breaker.execute(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should track consecutive failures', async () => {
      const config: CircuitBreakerConfig = {
        failureThreshold: 5,
        resetTimeoutMs: 60000,
        halfOpenRequests: 1,
      };
      const breaker = createCircuitBreaker(config);

      const fn = vi.fn().mockRejectedValue(new Error('failure'));

      for (let i = 1; i <= 3; i++) {
        try {
          await breaker.execute(fn);
        } catch (error) {
          // Expected
        }

        const stats = breaker.getStats();
        expect(stats.consecutiveFailures).toBe(i);
      }
    });

    it('should reset failure count on success', async () => {
      const config: CircuitBreakerConfig = {
        failureThreshold: 5,
        resetTimeoutMs: 60000,
        halfOpenRequests: 1,
      };
      const breaker = createCircuitBreaker(config);

      const failFn = vi.fn().mockRejectedValue(new Error('failure'));
      const successFn = vi.fn().mockResolvedValue('success');

      // Fail twice
      try {
        await breaker.execute(failFn);
      } catch {}
      try {
        await breaker.execute(failFn);
      } catch {}

      expect(breaker.getStats().consecutiveFailures).toBe(2);

      // Succeed
      await breaker.execute(successFn);

      expect(breaker.getStats().consecutiveFailures).toBe(0);
    });
  });

  describe('open state', () => {
    it('should trip to open after threshold failures', async () => {
      const config: CircuitBreakerConfig = {
        failureThreshold: 3,
        resetTimeoutMs: 60000,
        halfOpenRequests: 1,
      };
      const breaker = createCircuitBreaker(config);

      const fn = vi.fn().mockRejectedValue(new Error('failure'));

      // Fail threshold times
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(fn);
        } catch {}
      }

      const stats = breaker.getStats();
      expect(stats.state).toBe(CircuitState.OPEN);
      expect(stats.consecutiveFailures).toBe(3);
      expect(stats.lastFailureTime).toBeDefined();
    });

    it('should reject requests immediately when open', async () => {
      const config: CircuitBreakerConfig = {
        failureThreshold: 2,
        resetTimeoutMs: 60000,
        halfOpenRequests: 1,
      };
      const breaker = createCircuitBreaker(config);

      const fn = vi.fn().mockRejectedValue(new Error('failure'));

      // Trip the circuit
      try {
        await breaker.execute(fn);
      } catch {}
      try {
        await breaker.execute(fn);
      } catch {}

      expect(breaker.getStats().state).toBe(CircuitState.OPEN);

      // Try to execute - should fail immediately
      const successFn = vi.fn().mockResolvedValue('success');

      await expect(breaker.execute(successFn)).rejects.toThrow(CircuitOpenError);
      expect(successFn).not.toHaveBeenCalled();
    });

    it('should throw CircuitOpenError with correct message', async () => {
      const config: CircuitBreakerConfig = {
        failureThreshold: 1,
        resetTimeoutMs: 60000,
        halfOpenRequests: 1,
      };
      const breaker = createCircuitBreaker(config);

      const fn = vi.fn().mockRejectedValue(new Error('failure'));

      // Trip the circuit
      try {
        await breaker.execute(fn);
      } catch {}

      // Try to execute
      try {
        await breaker.execute(fn);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitOpenError);
        expect((error as Error).message).toContain('Circuit breaker is open');
      }
    });
  });

  describe('half-open state', () => {
    it('should transition to half-open after timeout', async () => {
      const config: CircuitBreakerConfig = {
        failureThreshold: 2,
        resetTimeoutMs: 60000,
        halfOpenRequests: 1,
      };
      const breaker = createCircuitBreaker(config);

      const fn = vi.fn().mockRejectedValue(new Error('failure'));

      // Trip the circuit
      try {
        await breaker.execute(fn);
      } catch {}
      try {
        await breaker.execute(fn);
      } catch {}

      expect(breaker.getStats().state).toBe(CircuitState.OPEN);

      // Advance time past reset timeout
      vi.advanceTimersByTime(60000);

      // Check state (this should trigger transition)
      const stats = breaker.getStats();
      expect(stats.state).toBe(CircuitState.HALF_OPEN);
    });

    it('should allow probe request in half-open state', async () => {
      const config: CircuitBreakerConfig = {
        failureThreshold: 1,
        resetTimeoutMs: 60000,
        halfOpenRequests: 1,
      };
      const breaker = createCircuitBreaker(config);

      // Trip the circuit
      const failFn = vi.fn().mockRejectedValue(new Error('failure'));
      try {
        await breaker.execute(failFn);
      } catch {}

      // Wait for reset timeout
      vi.advanceTimersByTime(60000);

      // Execute probe request
      const successFn = vi.fn().mockResolvedValue('success');
      const result = await breaker.execute(successFn);

      expect(result).toBe('success');
      expect(successFn).toHaveBeenCalledTimes(1);
    });

    it('should close on successful probe', async () => {
      const config: CircuitBreakerConfig = {
        failureThreshold: 1,
        resetTimeoutMs: 60000,
        halfOpenRequests: 1,
      };
      const breaker = createCircuitBreaker(config);

      // Trip the circuit
      const failFn = vi.fn().mockRejectedValue(new Error('failure'));
      try {
        await breaker.execute(failFn);
      } catch {}

      // Wait for reset timeout
      vi.advanceTimersByTime(60000);

      // Successful probe
      const successFn = vi.fn().mockResolvedValue('success');
      await breaker.execute(successFn);

      const stats = breaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.consecutiveFailures).toBe(0);
    });

    it('should reopen on failed probe', async () => {
      const config: CircuitBreakerConfig = {
        failureThreshold: 1,
        resetTimeoutMs: 60000,
        halfOpenRequests: 1,
      };
      const breaker = createCircuitBreaker(config);

      // Trip the circuit
      const failFn = vi.fn().mockRejectedValue(new Error('failure'));
      try {
        await breaker.execute(failFn);
      } catch {}

      // Wait for reset timeout
      vi.advanceTimersByTime(60000);

      expect(breaker.getStats().state).toBe(CircuitState.HALF_OPEN);

      // Failed probe
      try {
        await breaker.execute(failFn);
      } catch {}

      const stats = breaker.getStats();
      expect(stats.state).toBe(CircuitState.OPEN);
    });

    it('should reject additional requests while probe is pending', async () => {
      const config: CircuitBreakerConfig = {
        failureThreshold: 1,
        resetTimeoutMs: 60000,
        halfOpenRequests: 1,
      };
      const breaker = createCircuitBreaker(config);

      // Trip the circuit
      const failFn = vi.fn().mockRejectedValue(new Error('failure'));
      try {
        await breaker.execute(failFn);
      } catch {}

      // Wait for reset timeout
      vi.advanceTimersByTime(60000);

      // Start probe request (slow)
      const slowFn = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve('success'), 5000);
          })
      );

      const probePromise = breaker.execute(slowFn);

      // Try another request while probe is pending
      const anotherFn = vi.fn().mockResolvedValue('another');

      await expect(breaker.execute(anotherFn)).rejects.toThrow(CircuitOpenError);
      expect(anotherFn).not.toHaveBeenCalled();

      // Complete the probe
      vi.advanceTimersByTime(5000);
      await vi.runAllTimersAsync();
      await probePromise;
    });
  });

  describe('configuration', () => {
    it('should respect custom failure threshold', async () => {
      const config: CircuitBreakerConfig = {
        failureThreshold: 10,
        resetTimeoutMs: 60000,
        halfOpenRequests: 1,
      };
      const breaker = createCircuitBreaker(config);

      const fn = vi.fn().mockRejectedValue(new Error('failure'));

      // Fail 9 times (should stay closed)
      for (let i = 0; i < 9; i++) {
        try {
          await breaker.execute(fn);
        } catch {}
      }

      expect(breaker.getStats().state).toBe(CircuitState.CLOSED);

      // 10th failure should trip
      try {
        await breaker.execute(fn);
      } catch {}

      expect(breaker.getStats().state).toBe(CircuitState.OPEN);
    });

    it('should respect custom reset timeout', async () => {
      const config: CircuitBreakerConfig = {
        failureThreshold: 1,
        resetTimeoutMs: 30000, // 30 seconds
        halfOpenRequests: 1,
      };
      const breaker = createCircuitBreaker(config);

      const fn = vi.fn().mockRejectedValue(new Error('failure'));

      // Trip the circuit
      try {
        await breaker.execute(fn);
      } catch {}

      expect(breaker.getStats().state).toBe(CircuitState.OPEN);

      // Advance to just before timeout
      vi.advanceTimersByTime(29999);
      expect(breaker.getStats().state).toBe(CircuitState.OPEN);

      // Advance past timeout
      vi.advanceTimersByTime(1);
      expect(breaker.getStats().state).toBe(CircuitState.HALF_OPEN);
    });
  });

  describe('error propagation', () => {
    it('should propagate original error from failed function', async () => {
      const config: CircuitBreakerConfig = {
        failureThreshold: 5,
        resetTimeoutMs: 60000,
        halfOpenRequests: 1,
      };
      const breaker = createCircuitBreaker(config);

      const customError = new Error('Custom error message');
      const fn = vi.fn().mockRejectedValue(customError);

      try {
        await breaker.execute(fn);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBe(customError);
        expect((error as Error).message).toBe('Custom error message');
      }
    });
  });
});
