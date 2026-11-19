import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Keeps a workspace's active view in the URL (?tab=…) so the hierarchical menu can
 * deep-link into it, the browser back button works and refresh keeps the place.
 * - Unknown / not-allowed values fall back to `fallback` (e.g. RBAC-hidden views).
 * - The fallback view is represented by an absent param (clean URLs) unless `keepFallbackInUrl`
 *   is set (used where the menu distinguishes an explicit category from the hub landing page).
 * Setter signature matches React's useState setter for the plain-value case,
 * so existing `setTab('x')` call sites keep working unchanged.
 */
export function useTabParam<T extends string>(allowed: readonly T[], fallback: T, key = 'tab', keepFallbackInUrl = false) {
  const [params, setParams] = useSearchParams();
  const raw = (params.get(key) || '').toLowerCase();
  const match = allowed.find(item => item.toLowerCase() === raw);
  const value = (match ?? fallback) as T;
  const setValue = useCallback((next: T) => {
    const nextParams = new URLSearchParams(params);
    if (next === fallback && !keepFallbackInUrl) nextParams.delete(key); else nextParams.set(key, String(next).toLowerCase());
    setParams(nextParams, { replace: true });
  }, [params, setParams, fallback, key, keepFallbackInUrl]);
  return [value, setValue] as const;
}
