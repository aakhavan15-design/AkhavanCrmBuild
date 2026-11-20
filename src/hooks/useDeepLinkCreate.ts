import { useEffect, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

/** Consume a create link once, including denied attempts, while preserving other query parameters. */
export function useDeepLinkCreate(open: () => void, allowed = true) {
  const { key, state } = useLocation();
  const [params, setParams] = useSearchParams();
  const handledKey = useRef<string | null>(null);

  useEffect(() => {
    if (params.get('new') !== '1' || handledKey.current === key) return;
    handledKey.current = key;
    if (allowed) open();
    const next = new URLSearchParams(params);
    next.delete('new');
    setParams(next, { replace: true, state });
  }, [allowed, key, params, setParams, open, state]);

  useEffect(() => {
    if (!allowed) return;
    const handler = () => open();
    window.addEventListener('akhavan-quick-add', handler);
    return () => window.removeEventListener('akhavan-quick-add', handler);
  }, [allowed, open]);
}
