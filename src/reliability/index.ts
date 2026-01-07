import { createLogger } from './logger';
import { createRateLimiter } from './rate-limiter';
import { retryWithBackoff } from './retry';
import { createCircuitBreaker } from './circuit-breaker';
import type { ReliabilityConfig, ReliabilityWrapper } from './types';

const DEFAULT_CONFIG: ReliabilityConfig = {
  rateLimiter: {
    requestsPerMinute: 17,
    minDelayMs: 3000,
    maxDelayMs: 4500,
    jitterMs: 500,
  },
  retry: {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
  },
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeoutMs: 60000,
    halfOpenRequests: 1,
  },
  timeouts: {
    navigationTimeoutMs: 60000,
    operationTimeoutMs: 120000,
  },
};

export function createReliabilityWrapper(config: Partial<ReliabilityConfig> = {}): ReliabilityWrapper {
  const fullConfig: ReliabilityConfig = {
    rateLimiter: { ...DEFAULT_CONFIG.rateLimiter, ...config.rateLimiter },
    retry: { ...DEFAULT_CONFIG.retry, ...config.retry },
    circuitBreaker: { ...DEFAULT_CONFIG.circuitBreaker, ...config.circuitBreaker },
    timeouts: { ...DEFAULT_CONFIG.timeouts, ...config.timeouts },
  };

  const logger = createLogger('ReliabilityWrapper');
  const rateLimiter = createRateLimiter(fullConfig.rateLimiter);
  const circuitBreaker = createCircuitBreaker(fullConfig.circuitBreaker);

  async function execute<T>(fn: () => Promise<T>): Promise<T> {
    const timer = logger.startTimer();

    // Apply rate limiting first
    await rateLimiter.acquire();
    const rateLimiterStats = rateLimiter.getStats();
    logger.debug('Rate limiter acquired', {
      requestsInWindow: rateLimiterStats.requestsInWindow,
      currentDelayMs: rateLimiterStats.currentDelayMs,
    });

    // Execute through circuit breaker and retry logic
    const result = await retryWithBackoff(async () => {
      return await circuitBreaker.execute(fn);
    }, fullConfig.retry);

    const duration = timer.end();

    if (result.success) {
      logger.info('Operation succeeded', {
        attempts: result.attempts,
        durationMs: duration,
        circuitState: circuitBreaker.getStats().state,
      });
      return result.value as T;
    } else {
      logger.error('Operation failed after retries', {
        attempts: result.attempts,
        durationMs: duration,
        error: result.error?.message,
        circuitState: circuitBreaker.getStats().state,
      });
      throw result.error;
    }
  }

  return {
    execute,
  };
}

// Re-export types and utilities
export type { ReliabilityConfig, ReliabilityWrapper } from './types';
export { CircuitState, CircuitOpenError } from './types';
