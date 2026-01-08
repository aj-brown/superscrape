/**
 * Token lifecycle management utilities for the New World scraper.
 *
 * The access token expires after 30 minutes. We refresh proactively
 * at 25 minutes to avoid failed requests.
 */

/** Token refresh threshold - refresh when token is 25 minutes old */
export const TOKEN_REFRESH_THRESHOLD_MS = 25 * 60 * 1000;

/**
 * Check if a token is expiring soon and needs refresh.
 *
 * @param tokenAcquiredAt - Timestamp when token was acquired (or null if no token)
 * @returns true if token should be refreshed
 */
export function isTokenExpiringSoon(tokenAcquiredAt: number | null): boolean {
  if (tokenAcquiredAt === null) {
    return true; // No token, needs refresh
  }
  const elapsed = Date.now() - tokenAcquiredAt;
  return elapsed >= TOKEN_REFRESH_THRESHOLD_MS;
}
