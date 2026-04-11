/**
 * Intervals for “live enough” UX without full WebSocket infra.
 * Polling pauses when the browser tab is hidden (see hooks/use-visible-interval.ts).
 */

/** Sepolia escrow reads (job lists, job detail, admin job tables). */
export const ESCROW_POLL_INTERVAL_MS = 12_000;

/** API-backed lists (offers, deliverables). */
export const API_POLL_INTERVAL_MS = 15_000;

/** Default TanStack Query options for wagmi `useReadContract` / `useReadContracts`. */
export const escrowLiveQueryOptions = {
  refetchInterval: ESCROW_POLL_INTERVAL_MS,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
} as const;
