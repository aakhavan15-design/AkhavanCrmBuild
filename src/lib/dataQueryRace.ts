/**
 * Pure helpers for stale-response protection in useDataQuery.
 * Request counter + mounted flag so older results/errors are ignored and no setState after unmount.
 */

export type RaceApplyAction<T> =
  | { type: 'success'; requestId: number; data: T }
  | { type: 'error'; requestId: number; error: Error }
  | { type: 'loading' };

export interface RaceState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Decide whether a completed request should update state.
 * Returns the next state, or null if the result must be ignored (stale or unmounted).
 */
export function shouldApplyRaceResult<T>(
  currentRequestId: number,
  incomingRequestId: number,
  mounted: boolean,
  action: RaceApplyAction<T>,
  prev: RaceState<T>
): RaceState<T> | null {
  if (!mounted) return null;
  if (action.type === 'loading') {
    return { ...prev, loading: true, error: null };
  }
  if (incomingRequestId !== currentRequestId) return null; // stale
  if (action.type === 'success') {
    return { data: action.data, loading: false, error: null };
  }
  return { data: prev.data, loading: false, error: action.error };
}

/**
 * Create a request-id allocator for sequential queries.
 */
export function createRequestIdAllocator() {
  let next = 0;
  return {
    nextId: () => ++next,
    current: () => next,
  };
}
