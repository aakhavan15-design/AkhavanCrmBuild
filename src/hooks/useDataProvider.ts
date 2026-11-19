import { useState, useEffect, useRef, useCallback } from 'react';
import { getActiveDataProvider, DataProvider } from '../services/dataProvider';
import { shouldApplyRaceResult, createRequestIdAllocator, type RaceState } from '../lib/dataQueryRace';

export interface DataQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * هوک کانونیکال برای استخراج داده‌ها از لایه DataProvider.
 * با این هوک، کامپوننت‌های UI از نوع دیتابیس (IndexedDB یا SQL Server) کاملاً بی‌اطلاع می‌مانند.
 * محافظ پاسخ کهنه: فقط آخرین درخواست اعمال می‌شود؛ بعد از unmount setState نمی‌شود.
 */
export function useDataQuery<T>(
  queryFn: (provider: DataProvider) => Promise<T>,
  deps: unknown[] = []
): DataQueryResult<T> {
  const [state, setState] = useState<RaceState<T>>({
    data: null,
    loading: true,
    error: null,
  });
  const mountedRef = useRef(true);
  const allocatorRef = useRef(createRequestIdAllocator());
  const queryFnRef = useRef(queryFn);
  queryFnRef.current = queryFn;

  const fetchData = useCallback(async () => {
    const requestId = allocatorRef.current.nextId();
    setState(prev => {
      const applied = shouldApplyRaceResult(
        allocatorRef.current.current(),
        requestId,
        mountedRef.current,
        { type: 'loading' },
        prev
      );
      return applied ?? prev;
    });

    try {
      const provider = getActiveDataProvider();
      const result = await queryFnRef.current(provider);
      setState(prev => {
        const next = shouldApplyRaceResult(
          allocatorRef.current.current(),
          requestId,
          mountedRef.current,
          { type: 'success', requestId, data: result },
          prev
        );
        return next ?? prev;
      });
    } catch (err) {
      console.error('[AKHAVAN DataQuery Error]', err);
      const error = err instanceof Error ? err : new Error('خطای ناشناخته در دریافت داده');
      setState(prev => {
        const next = shouldApplyRaceResult(
          allocatorRef.current.current(),
          requestId,
          mountedRef.current,
          { type: 'error', requestId, error },
          prev
        );
        return next ?? prev;
      });
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    refetch: fetchData,
  };
}
