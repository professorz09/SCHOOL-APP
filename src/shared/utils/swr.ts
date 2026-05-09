// Tiny stale-while-revalidate cache.
//
// The pattern (one function, no library):
//
//   1. Caller asks for `key`.
//   2. If we have a cached value AND it's not expired, return it
//      INSTANTLY. The caller renders without a spinner.
//   3. In the background, run the fetcher. If the result is different,
//      update the cache and call every onUpdate listener so the
//      component re-renders with fresh data.
//
// This is the same model as react-query / SWR but in ~80 lines, no
// new dependency. Suited for our service-layer pattern where each
// service owns its own cache and components just call methods.
//
// Two storage modes:
//   • 'memory' (default) — Map<string, Entry>. Survives across
//     component mounts but resets on full page reload. Best for hot
//     data that changes through the day (fees, attendance, payments).
//   • 'localStorage' — JSON-serialised, survives reloads. Use ONLY for
//     data that is safe to be slightly stale across sessions
//     (school name / logo / address, branding accent, active year
//     metadata). Includes a version tag so a deploy can bust caches.
//
// IMPORTANT: this is NOT a replacement for explicit invalidation
// after a mutation. After a write, callers MUST call invalidate(key)
// (or set the new value with set(key, value)) so the next read sees
// the change immediately rather than waiting for the next revalidate.

export interface SwrOpts {
  /** How long a cached entry is considered "fresh" before we trigger a
   *  background revalidate on next read. Default 60s. */
  ttlMs?: number;
  /** 'memory' (default) or 'localStorage'. localStorage entries also
   *  carry a version stamp so re-deploys bust everyone's cache. */
  storage?: 'memory' | 'localStorage';
  /** Localstorage cache-busting tag — usually the build version. */
  version?: string;
}

interface Entry<T> {
  v: T;        // value
  t: number;   // timestamp written
  ver?: string;
}

const memoryCache = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
const listeners = new Map<string, Set<() => void>>();

function lsKey(key: string): string { return `swr:${key}`; }

function readStorage<T>(key: string, storage: 'memory' | 'localStorage'): Entry<T> | null {
  if (storage === 'localStorage') {
    try {
      const raw = localStorage.getItem(lsKey(key));
      if (!raw) return null;
      return JSON.parse(raw) as Entry<T>;
    } catch { return null; }
  }
  return (memoryCache.get(key) as Entry<T> | undefined) ?? null;
}

function writeStorage<T>(key: string, value: Entry<T>, storage: 'memory' | 'localStorage'): void {
  if (storage === 'localStorage') {
    try { localStorage.setItem(lsKey(key), JSON.stringify(value)); } catch { /* quota / private mode */ }
    return;
  }
  memoryCache.set(key, value as Entry<unknown>);
}

function notify(key: string): void {
  listeners.get(key)?.forEach(fn => fn());
}

/**
 * Fetch-or-cache. Returns the freshest value possible:
 *   • cached if fresh
 *   • cached AND triggers background revalidate if stale
 *   • awaits the fetcher only when there's nothing cached at all
 *
 * The promise resolves with the BEST-AVAILABLE value so callers
 * can do `const v = await swrGet(...)` without thinking. If there
 * was a fresh cache hit we resolve with it immediately and the
 * background fetch happens after.
 */
export async function swrGet<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: SwrOpts = {},
): Promise<T> {
  const ttl = opts.ttlMs ?? 60_000;
  const storage = opts.storage ?? 'memory';
  const version = opts.version;
  const cached = readStorage<T>(key, storage);
  const now = Date.now();
  const fresh = cached
    && (!version || cached.ver === version)
    && (now - cached.t) < ttl;

  if (cached && fresh) {
    // Best case — cached value is fresh, no fetch needed.
    return cached.v;
  }

  if (cached && !fresh) {
    // Stale-but-present — background revalidate, return cached now.
    void backgroundRefresh(key, fetcher, storage, version);
    return cached.v;
  }

  // Cold cache — must await. Coalesce concurrent calls into one.
  let p = inflight.get(key) as Promise<T> | undefined;
  if (!p) {
    p = fetcher().then(v => {
      writeStorage(key, { v, t: Date.now(), ver: version }, storage);
      notify(key);
      return v;
    }).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

async function backgroundRefresh<T>(
  key: string,
  fetcher: () => Promise<T>,
  storage: 'memory' | 'localStorage',
  version?: string,
): Promise<void> {
  if (inflight.has(key)) return;
  const p = fetcher().then(v => {
    writeStorage(key, { v, t: Date.now(), ver: version }, storage);
    notify(key);
  }).catch(() => { /* swallow — we already returned the stale value */ })
   .finally(() => inflight.delete(key));
  inflight.set(key, p as Promise<unknown>);
}

/** Synchronous read — returns the cached value or null. Useful for
 *  initial render before swrGet's promise resolves. */
export function swrPeek<T>(key: string, storage: 'memory' | 'localStorage' = 'memory'): T | null {
  const c = readStorage<T>(key, storage);
  return c ? c.v : null;
}

/** Drop the cached value for `key`. Call this after a mutation so the
 *  next read fetches fresh. */
export function swrInvalidate(key: string, storage: 'memory' | 'localStorage' = 'memory'): void {
  if (storage === 'localStorage') {
    try { localStorage.removeItem(lsKey(key)); } catch { /* ignore */ }
  } else {
    memoryCache.delete(key);
  }
  notify(key);
}

/** Set a value directly (skip the fetcher). Useful for optimistic
 *  updates: write the new value, the next swrGet returns it instantly. */
export function swrSet<T>(key: string, value: T, opts: SwrOpts = {}): void {
  const storage = opts.storage ?? 'memory';
  writeStorage(key, { v: value, t: Date.now(), ver: opts.version }, storage);
  notify(key);
}

/** Subscribe to cache updates for a key. Returns an unsubscribe fn.
 *  Used by the React hook below to re-render on background updates. */
export function swrSubscribe(key: string, fn: () => void): () => void {
  let s = listeners.get(key);
  if (!s) { s = new Set(); listeners.set(key, s); }
  s.add(fn);
  return () => { s!.delete(fn); if (s!.size === 0) listeners.delete(key); };
}
