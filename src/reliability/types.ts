// Core configuration interfaces
export interface RateLimiterConfig {
  requestsPerMinute: number;
  minDelayMs: number;
  maxDelayMs: number;
  jitterMs: number;
}

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenRequests: number;
}

export interface TimeoutConfig {
  navigationTimeoutMs: number;
  operationTimeoutMs: number;
}

export interface ReliabilityConfig {
  rateLimiter: RateLimiterConfig;
  retry: RetryConfig;
  circuitBreaker: CircuitBreakerConfig;
  timeouts: TimeoutConfig;
}

// Logger types
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFormat = 'json' | 'text';

export interface LogContext {
  [key: string]: unknown;
}

export interface TimerHandle {
  end: () => number;
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  startTimer(): TimerHandle;
}

// Rate limiter types
export interface RateLimiterStats {
  requestsInWindow: number;
  currentDelayMs: number;
}

export interface RateLimiter {
  acquire(): Promise<void>;
  getStats(): RateLimiterStats;
}

// Retry types
export interface RetryResult<T> {
  success: boolean;
  value?: T;
  error?: Error;
  attempts: number;
}

// Circuit breaker types
export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerStats {
  state: CircuitState;
  consecutiveFailures: number;
  lastFailureTime?: number;
}

export interface CircuitBreaker {
  execute<T>(fn: () => Promise<T>): Promise<T>;
  getStats(): CircuitBreakerStats;
}

export class CircuitOpenError extends Error {
  constructor(message: string = 'Circuit breaker is open') {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

// Reliability wrapper types
export interface ReliabilityWrapper {
  execute<T>(fn: () => Promise<T>): Promise<T>;
}
