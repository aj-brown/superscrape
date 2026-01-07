# Scraper Reliability & Politeness Plan

## Key Decisions
- **Rate limit**: 15-20 req/min (~3-4s between requests with jitter)
- **Retry strategy**: Exponential backoff (1s, 2s, 4s...) up to 3 retries
- **Circuit breaker**: Trip after 5 consecutive failures, 60s cooldown
- **Logging**: Structured logs for requests, responses, retries, timing
- **robots.txt**: Not respected (per user decision)

## Architecture

```
src/reliability/
  types.ts           # Interfaces for all components
  rate-limiter.ts    # Token bucket with jitter
  retry.ts           # Exponential backoff wrapper
  circuit-breaker.ts # State machine (closed/open/half-open)
  logger.ts          # Structured logging
  index.ts           # ReliabilityWrapper composing all components
```

Integration point: `src/scraper.ts:108` - wrap `navigateAndCapture()` method.

---

## Phase 1: Test Infrastructure + Logger

**Goal**: Set up vitest, create structured logger with timing support.

**Tasks**:
1. Add vitest to devDependencies, create `vitest.config.ts`
2. Add test scripts to `package.json`
3. Create `src/reliability/types.ts` with all interfaces
4. TDD: Write `tests/reliability/logger.test.ts`
5. Implement `src/reliability/logger.ts`

**Verification**:
```bash
npm test -- logger
```
- Logger outputs correct level, timestamp, context
- `startTimer()` returns accurate duration

---

## Phase 2: Rate Limiter

**Goal**: Enforce 15-20 req/min with randomized delays.

**Tasks**:
1. TDD: Write `tests/reliability/rate-limiter.test.ts`
2. Implement `src/reliability/rate-limiter.ts`
   - Track request timestamps in rolling window
   - Calculate delay to stay under limit
   - Add 0-500ms jitter for natural timing

**Verification**:
```bash
npm test -- rate-limiter
```
- `acquire()` delays appropriately under load
- Stats track requests accurately
- Jitter applied to delays

**Config defaults**:
```typescript
{ requestsPerMinute: 17, minDelayMs: 3000, maxDelayMs: 4500, jitterMs: 500 }
```

---

## Phase 3: Retry with Exponential Backoff

**Goal**: Retry transient failures with increasing delays.

**Tasks**:
1. TDD: Write `tests/reliability/retry.test.ts`
2. Implement `src/reliability/retry.ts`
   - `retryWithBackoff<T>(fn, config): Promise<RetryResult<T>>`
   - Delay formula: `min(initialDelay * 2^attempt, maxDelay)`
   - Classify retryable errors (timeout, network, 5xx)

**Verification**:
```bash
npm test -- retry
```
- Returns immediately on success
- Retries transient failures with backoff
- Stops after maxRetries
- Does NOT retry 4xx or validation errors

**Config defaults**:
```typescript
{ maxRetries: 3, initialDelayMs: 1000, maxDelayMs: 30000, backoffMultiplier: 2 }
```

---

## Phase 4: Circuit Breaker

**Goal**: Stop all requests after repeated failures.

**Tasks**:
1. TDD: Write `tests/reliability/circuit-breaker.test.ts`
2. Implement `src/reliability/circuit-breaker.ts`
   - State machine: CLOSED -> OPEN -> HALF-OPEN
   - Trip after N consecutive failures
   - Probe with single request in half-open

**Verification**:
```bash
npm test -- circuit-breaker
```
- Starts closed, allows requests
- Trips to open after threshold
- Rejects requests when open (throws `CircuitOpenError`)
- Transitions to half-open after timeout
- Closes on successful probe, re-opens on failure

**Config defaults**:
```typescript
{ failureThreshold: 5, resetTimeoutMs: 60000, halfOpenRequests: 1 }
```

---

## Phase 5: Integration

**Goal**: Compose all components, integrate into scraper.

**Tasks**:
1. Create `src/reliability/index.ts` with `ReliabilityWrapper`
2. TDD: Write `tests/integration/scraper-reliability.test.ts`
3. Modify `src/scraper.ts`:
   - Extend `ScraperConfig` with `reliability?: Partial<ReliabilityConfig>`
   - Create wrapper in constructor
   - Wrap `navigateAndCapture()` with `reliability.execute()`
4. Remove hardcoded `waitForTimeout()` calls (rate limiter handles delays)

**Verification**:
```bash
npm test
```
- Full test suite passes
- Integration tests verify end-to-end behavior

---

## Files to Modify

| File | Change |
|------|--------|
| `package.json` | Add vitest, test scripts |
| `src/scraper.ts` | Integrate ReliabilityWrapper |

## Files to Create

| File | Purpose |
|------|---------|
| `vitest.config.ts` | Test configuration |
| `src/reliability/types.ts` | All interfaces |
| `src/reliability/logger.ts` | Structured logging |
| `src/reliability/rate-limiter.ts` | Token bucket rate limiter |
| `src/reliability/retry.ts` | Exponential backoff |
| `src/reliability/circuit-breaker.ts` | State machine |
| `src/reliability/index.ts` | ReliabilityWrapper |
| `tests/reliability/*.test.ts` | Unit tests |
| `tests/integration/*.test.ts` | Integration tests |

---

## Default Configuration Summary

```typescript
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
```
