import type { RateLimiter, RateLimiterConfig, RateLimiterStats } from './types';

export function createRateLimiter(config: RateLimiterConfig): RateLimiter {
  const requestTimestamps: number[] = [];
  const windowMs = 60000; // 60 seconds

  function cleanOldRequests(now: number): void {
    const cutoff = now - windowMs;
    while (requestTimestamps.length > 0 && requestTimestamps[0] < cutoff) {
      requestTimestamps.shift();
    }
  }

  function calculateDelay(now: number): number {
    cleanOldRequests(now);

    // Calculate minimum delay based on last request
    const lastRequest = requestTimestamps[requestTimestamps.length - 1];
    const timeSinceLastRequest = now - lastRequest;
    const minRequiredDelay = Math.max(0, config.minDelayMs - timeSinceLastRequest);

    let baseDelay = minRequiredDelay;

    // If at or over rate limit, also consider when oldest request expires
    if (requestTimestamps.length >= config.requestsPerMinute) {
      const oldestRequest = requestTimestamps[0];
      const timeUntilOldestExpires = oldestRequest + windowMs - now;
      baseDelay = Math.max(timeUntilOldestExpires, minRequiredDelay);
    }

    return baseDelay + Math.random() * config.jitterMs;
  }

  async function acquire(): Promise<void> {
    // If this is the first request, no delay needed
    if (requestTimestamps.length === 0) {
      requestTimestamps.push(Date.now());
      return;
    }

    // Calculate required delay before the previous request
    const now = Date.now();
    const delay = calculateDelay(now);

    // Wait for the delay
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    // Record the request timestamp after the delay
    requestTimestamps.push(Date.now());
  }

  function getStats(): RateLimiterStats {
    const now = Date.now();
    cleanOldRequests(now);

    return {
      requestsInWindow: requestTimestamps.length,
      currentDelayMs: calculateDelay(now),
    };
  }

  return {
    acquire,
    getStats,
  };
}
