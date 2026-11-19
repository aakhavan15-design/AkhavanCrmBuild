/**
 * useOfflineStatus — Local-First 2026
 * Tracks navigator.onLine + pending offline queue count.
 * Safe for SSR / non-browser environments.
 */
import { useState, useEffect, useCallback } from 'react';
import { getOfflineQueue } from '../lib/offline';

export interface OfflineStatus {
  isOnline: boolean;
  pendingCount: number;
  failedCount: number;
  isSyncing: boolean;
  refresh: () => Promise<void>;
}

export function useOfflineStatus(pollMs = 4000): OfflineStatus {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const queue = await getOfflineQueue();
      const pending = queue.filter((op) => op.status === 'PENDING' || op.status === 'SYNCING').length;
      const failed = queue.filter((op) => op.status === 'FAILED').length;
      const syncing = queue.some((op) => op.status === 'SYNCING');
      setPendingCount(pending);
      setFailedCount(failed);
      setIsSyncing(syncing);
    } catch {
      // IDB may be unavailable in private mode / restricted contexts
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onOnline = () => {
      setIsOnline(true);
      void refresh();
    };
    const onOffline = () => setIsOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    void refresh();
    const id = window.setInterval(() => void refresh(), pollMs);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.clearInterval(id);
    };
  }, [refresh, pollMs]);

  return { isOnline, pendingCount, failedCount, isSyncing, refresh };
}
