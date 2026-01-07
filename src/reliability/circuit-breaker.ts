import {
  CircuitState,
  CircuitOpenError,
  type CircuitBreaker,
  type CircuitBreakerConfig,
  type CircuitBreakerStats,
} from './types';

export function createCircuitBreaker(config: CircuitBreakerConfig): CircuitBreaker {
  let state: CircuitState = CircuitState.CLOSED;
  let consecutiveFailures = 0;
  let lastFailureTime: number | undefined;
  let probeInProgress = false;

  function getStats(): CircuitBreakerStats {
    // Check if we should transition from OPEN to HALF_OPEN
    if (state === CircuitState.OPEN && lastFailureTime) {
      const timeSinceLastFailure = Date.now() - lastFailureTime;
      if (timeSinceLastFailure >= config.resetTimeoutMs) {
        state = CircuitState.HALF_OPEN;
        probeInProgress = false;
      }
    }

    return {
      state,
      consecutiveFailures,
      lastFailureTime,
    };
  }

  function recordSuccess(): void {
    consecutiveFailures = 0;
    state = CircuitState.CLOSED;
    probeInProgress = false;
  }

  function recordFailure(): void {
    consecutiveFailures++;
    lastFailureTime = Date.now();

    if (consecutiveFailures >= config.failureThreshold) {
      state = CircuitState.OPEN;
    }

    probeInProgress = false;
  }

  async function execute<T>(fn: () => Promise<T>): Promise<T> {
    // Update state if needed
    getStats();

    // If circuit is open and we're not in half-open state, reject immediately
    if (state === CircuitState.OPEN) {
      throw new CircuitOpenError();
    }

    // If we're in half-open state and a probe is already in progress, reject
    if (state === CircuitState.HALF_OPEN && probeInProgress) {
      throw new CircuitOpenError();
    }

    // Mark probe as in progress if in half-open state
    if (state === CircuitState.HALF_OPEN) {
      probeInProgress = true;
    }

    try {
      const result = await fn();
      recordSuccess();
      return result;
    } catch (error) {
      recordFailure();
      throw error;
    }
  }

  return {
    execute,
    getStats,
  };
}
