// React-side wrapper around the SWR helper. Returns:
//   • data    — best-available value (cached if hit, else null until fetch)
//   • loading — true ONLY when there's nothing cached and a fetch is
//               in-flight. Stays false while a background revalidate
//               runs over a cached value.
//   • error   — the last fetcher rejection, if any.
//   • refresh — manual re-fetch (skip cache, force fresh).
//
// Pages render `data` immediately on mount when the cache has a hit,
// no spinner. Background revalidate updates the same `data` reference
// when fresher data arrives, triggering a re-render via the SWR
// listener subscription.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  swrGet, swrPeek, swrSubscribe,
  type SwrOpts,
} from '@/shared/utils/swr';

export function useSwr<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  opts: SwrOpts = {},
): {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
} {
  const storage = opts.storage ?? 'memory';
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // Seed initial state from the cache so the first render is instant
  // when there's already a cached value.
  const [data, setData] = useState<T | null>(() =>
    key ? swrPeek<T>(key, storage) : null
  );
  const [loading, setLoading] = useState<boolean>(() =>
    key ? swrPeek<T>(key, storage) === null : false
  );
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async (force: boolean) => {
    if (!key) return;
    const hadCache = swrPeek<T>(key, storage) !== null;
    if (!hadCache) setLoading(true);
    setError(null);
    try {
      // Force=true skips cache by passing a 0 ttl which always
      // looks expired; the helper still revalidates and notifies.
      const fresh = await swrGet(
        key,
        fetcherRef.current,
        force ? { ...opts, ttlMs: 0 } : opts,
      );
      setData(fresh);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [key, storage, opts]);

  // Initial load + key changes.
  useEffect(() => { void load(false); }, [load]);

  // Subscribe to background updates from the SWR helper so we
  // re-render when a stale-then-revalidate refresh writes a new value.
  useEffect(() => {
    if (!key) return;
    return swrSubscribe(key, () => {
      const next = swrPeek<T>(key, storage);
      if (next !== null) setData(next);
    });
  }, [key, storage]);

  const refresh = useCallback(() => load(true), [load]);

  return { data, loading, error, refresh };
}
