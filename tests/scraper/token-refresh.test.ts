import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isTokenExpiringSoon, TOKEN_REFRESH_THRESHOLD_MS } from '../../src/token';

describe('Token Refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('isTokenExpiringSoon', () => {
    it('should return true when no token acquisition time exists', () => {
      expect(isTokenExpiringSoon(null)).toBe(true);
    });

    it('should return false for fresh token (< 25 min old)', () => {
      const now = Date.now();
      const tenMinutesAgo = now - 10 * 60 * 1000;
      expect(isTokenExpiringSoon(tenMinutesAgo)).toBe(false);
    });

    it('should return false for token exactly 24 minutes old', () => {
      const now = Date.now();
      const twentyFourMinutesAgo = now - 24 * 60 * 1000;
      expect(isTokenExpiringSoon(twentyFourMinutesAgo)).toBe(false);
    });

    it('should return true when token is exactly at 25 minute threshold', () => {
      const now = Date.now();
      const exactlyThreshold = now - TOKEN_REFRESH_THRESHOLD_MS;
      expect(isTokenExpiringSoon(exactlyThreshold)).toBe(true);
    });

    it('should return true when token is 26 minutes old', () => {
      const now = Date.now();
      const twentySixMinutesAgo = now - 26 * 60 * 1000;
      expect(isTokenExpiringSoon(twentySixMinutesAgo)).toBe(true);
    });

    it('should return true for very old tokens (> 30 min)', () => {
      const now = Date.now();
      const oneHourAgo = now - 60 * 60 * 1000;
      expect(isTokenExpiringSoon(oneHourAgo)).toBe(true);
    });

    it('should work correctly as time advances', () => {
      const tokenAcquiredAt = Date.now();

      // Fresh token
      expect(isTokenExpiringSoon(tokenAcquiredAt)).toBe(false);

      // Advance 20 minutes - still fresh
      vi.advanceTimersByTime(20 * 60 * 1000);
      expect(isTokenExpiringSoon(tokenAcquiredAt)).toBe(false);

      // Advance 5 more minutes (25 total) - now expiring soon
      vi.advanceTimersByTime(5 * 60 * 1000);
      expect(isTokenExpiringSoon(tokenAcquiredAt)).toBe(true);
    });
  });

  describe('TOKEN_REFRESH_THRESHOLD_MS', () => {
    it('should be 25 minutes in milliseconds', () => {
      expect(TOKEN_REFRESH_THRESHOLD_MS).toBe(25 * 60 * 1000);
    });
  });
});
