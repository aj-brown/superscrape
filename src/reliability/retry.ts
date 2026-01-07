import type { RetryConfig, RetryResult } from './types';

export function isRetryableError(error: Error): boolean {
  // Check for validation errors (not retryable)
  if (error.name === 'ValidationError' || error.name === 'AuthenticationError') {
    return false;
  }

  // Check for 4xx status codes (client errors - not retryable)
  const statusCode = (error as any).statusCode;
  if (statusCode && statusCode >= 400 && statusCode < 500) {
    return false;
  }

  // Check for 5xx status codes (server errors - retryable)
  if (statusCode && statusCode >= 500 && statusCode < 600) {
    return true;
  }

  // Check for network/timeout errors (retryable)
  const message = error.message.toLowerCase();
  const retryablePatterns = [
    'network',
    'timeout',
    'timed out',
    'etimedout',
    'econnrefused',
    'enotfound',
    'socket hang up',
    'econnreset',
  ];

  if (retryablePatterns.some((pattern) => message.includes(pattern))) {
    return true;
  }

  // Default: assume retryable for unknown errors (be conservative)
  return true;
}

export async function retryWithBackoff<T>(fn: () => Promise<T>, config: RetryConfig): Promise<RetryResult<T>> {
  let attempts = 0;
  let lastError: Error | undefined;

  while (attempts <= config.maxRetries) {
    attempts++;

    try {
      const value = await fn();
      return {
        success: true,
        value,
        attempts,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // If this is not a retryable error, fail immediately
      if (!isRetryableError(lastError)) {
        return {
          success: false,
          error: lastError,
          attempts,
        };
      }

      // If we've exhausted retries, fail
      if (attempts > config.maxRetries) {
        return {
          success: false,
          error: lastError,
          attempts,
        };
      }

      // Calculate delay for next retry using exponential backoff
      const exponentialDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempts - 1);
      const delay = Math.min(exponentialDelay, config.maxDelayMs);

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Should never reach here, but TypeScript needs this
  return {
    success: false,
    error: lastError || new Error('Unknown error'),
    attempts,
  };
}
