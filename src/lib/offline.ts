import { idbQueuePut, idbQueueGetAll, idbQueueDelete } from './idb';
import type { OfflineOperation } from '../types';
import { generateSecureId } from './secureId';

type OfflineOperationInput = Omit<OfflineOperation, 'id' | 'timestamp' | 'status' | 'retryCount'>;
type OfflineSyncHandler = (operation: OfflineOperation) => Promise<void>;

let syncHandler: OfflineSyncHandler | null = null;
let isProcessing = false;

const MAX_RETRIES = 3;

const createOperationId = (): string => generateSecureId('offline');

export const registerOfflineSyncHandler = (handler: OfflineSyncHandler): void => {
  syncHandler = handler;
};

export const addToOfflineQueue = async (operation: OfflineOperationInput): Promise<OfflineOperation> => {
  const newOperation: OfflineOperation = {
    ...operation,
    id: createOperationId(),
    timestamp: Date.now(),
    status: 'PENDING',
    retryCount: 0,
  };

  await idbQueuePut(newOperation);

  if (typeof navigator !== 'undefined' && navigator.onLine) {
    void processOfflineQueue();
  }

  return newOperation;
};

export const getOfflineQueue = async (): Promise<OfflineOperation[]> => {
  return idbQueueGetAll<OfflineOperation>();
};

const idMap = new Map<string, string>();

export const registerIdMapping = (tempId: string, realId: string) => {
  idMap.set(tempId, realId);
};

const replaceIdsDeep = (obj: unknown, map: Map<string, string>): unknown => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => replaceIdsDeep(item, map));
  
  const newObj: unknown = {};
  for (const key in obj) {
    let val = obj[key];
    if (typeof val === 'string' && map.has(val)) {
      val = map.get(val)!;
    }
    newObj[key] = replaceIdsDeep(val, map);
  }
  return newObj;
};

export const processOfflineQueue = async (): Promise<void> => {
  if (isProcessing) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  if (!syncHandler) return;

  isProcessing = true;

  try {
    const queue = await idbQueueGetAll<OfflineOperation>();
    const pendingOperations = queue
      .filter(op => op.status === 'PENDING' || op.status === 'FAILED')
      .sort((a, b) => a.timestamp - b.timestamp);

    for (const operation of pendingOperations) {
      if (operation.retryCount >= MAX_RETRIES) continue;

      const resolvedPayload = replaceIdsDeep(operation.payload, idMap);

      const syncing: OfflineOperation = {
        ...operation,
        payload: resolvedPayload,
        status: 'SYNCING',
      };

      await idbQueuePut(syncing);

      try {
        const result: unknown = await syncHandler(syncing);
        if (syncing.action === 'CREATE' && result?.realId) {
          registerIdMapping(syncing.entityId, result.realId);
        }
        await idbQueueDelete(syncing.id);
      } catch (error: Record<string, unknown>) {
        const failed: OfflineOperation = {
          ...syncing,
          status: 'FAILED',
          retryCount: syncing.retryCount + 1,
          error: error?.message || 'Offline synchronization failed.',
        };
        await idbQueuePut(failed);
      }
    }
  } finally {
    isProcessing = false;
  }
};

export const retryFailedOfflineOperations = async (): Promise<void> => {
  const queue = await idbQueueGetAll<OfflineOperation>();
  for (const operation of queue) {
    if (operation.status === 'FAILED' && operation.retryCount < MAX_RETRIES) {
      await idbQueuePut({
        ...operation,
        status: 'PENDING',
        error: undefined,
      });
    }
  }
  await processOfflineQueue();
};

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void processOfflineQueue();
  });

  // Background Sync message from service worker (Local-First 2026)
  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'OFFLINE_SYNC_REQUEST') {
        void processOfflineQueue();
      }
    });
  }
}
