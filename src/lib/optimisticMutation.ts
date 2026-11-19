/**
 * optimisticMutation — Local-First 2026
 * Apply change to local store immediately (Optimistic UI),
 * and enqueue the same operation for durable sync when offline / pending.
 *
 * Pure helper; does not own React state. Callers still use updateState.
 */
import { addToOfflineQueue } from './offline';
import { generateSecureId } from './secureId';
import type { OfflineOperation } from '../types';

export type OptimisticAction = OfflineOperation['action'];

export interface OptimisticMutationInput {
  action: OptimisticAction;
  entityType: string;
  entityId?: string;
  payload: Record<string, any>;
  /** When true (default), always enqueue even if currently online (for durability). */
  alwaysQueue?: boolean;
}

/**
 * Enqueue a durable offline operation. Local state update is the caller's responsibility
 * (they already call updateState optimistically).
 *
 * Returns the queued operation (or null if skipped because online and alwaysQueue=false).
 */
export async function enqueueOptimisticMutation(
  input: OptimisticMutationInput
): Promise<OfflineOperation | null> {
  const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
  const shouldQueue = input.alwaysQueue !== false || !isOnline;

  if (!shouldQueue) return null;

  const entityId = input.entityId || generateSecureId(input.entityType);

  return addToOfflineQueue({
    action: input.action,
    entityType: input.entityType,
    entityId,
    payload: {
      ...input.payload,
      // stamp for server-side idempotency / audit
      clientMutationId: generateSecureId('mut'),
      queuedAt: Date.now(),
    },
  });
}

/**
 * Convenience: run local updater + enqueue in one call from UI handlers.
 * `applyLocal` must be synchronous and only touch the draft.
 */
export async function optimisticUpdate<T = void>(
  applyLocal: () => T,
  mutation: OptimisticMutationInput
): Promise<{ local: T; queued: OfflineOperation | null }> {
  const local = applyLocal();
  const queued = await enqueueOptimisticMutation(mutation);
  return { local, queued };
}
