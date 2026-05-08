// React hook around studentService.getList(). Encapsulates pagination,
// debounced server-side search, and Load-More state so any list view
// can drop it in without re-implementing the dance.
//
// Usage:
//   const { items, total, loading, hasMore, loadMore, search, setSearch } =
//     useStudentList({ pageSize: 50 });

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  studentService,
  type StudentListItem,
} from '@/modules/students/student.service';

export interface UseStudentListOptions {
  /** Rows per fetch. Default 50. Capped server-side at 200. */
  pageSize?: number;
  /** Initial search query. Useful for restoring state from URL/router. */
  initialSearch?: string;
  /** Optional class-section filter "10-A". Server applies post-page (see service). */
  classFilter?: string;
  /** Debounce window for the search input → server fetch (ms). Default 250. */
  searchDebounceMs?: number;
}

export interface UseStudentListResult {
  items: StudentListItem[];
  total: number;
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  search: string;
  setSearch: (q: string) => void;
  /** Append the next page. No-op when already fetching or hasMore=false. */
  loadMore: () => Promise<void>;
  /** Drop everything and re-fetch page 1 with current filters. Use after writes. */
  refresh: () => Promise<void>;
}

export function useStudentList(opts: UseStudentListOptions = {}): UseStudentListResult {
  const pageSize = opts.pageSize ?? 50;
  const debounceMs = opts.searchDebounceMs ?? 250;

  const [items, setItems]   = useState<StudentListItem[]>([]);
  const [total, setTotal]   = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [search, setSearch] = useState(opts.initialSearch ?? '');

  // Track the active search/classFilter so a slow first-page response
  // doesn't overwrite a faster later request. Each fetch tags its
  // result with a token; only the latest token's result is committed.
  const tokenRef = useRef(0);
  const offsetRef = useRef(0);

  const fetchPage = useCallback(async (
    offset: number, q: string, cls: string | undefined,
  ) => {
    const token = ++tokenRef.current;
    setLoading(true);
    setError(null);
    try {
      const page = await studentService.getList({
        offset, limit: pageSize, search: q || undefined, classFilter: cls,
      });
      if (token !== tokenRef.current) return; // a newer query has started — drop
      setTotal(page.total);
      setHasMore(page.hasMore);
      offsetRef.current = page.nextOffset;
      setItems(prev => offset === 0 ? page.items : [...prev, ...page.items]);
    } catch (e) {
      if (token !== tokenRef.current) return;
      setError(e instanceof Error ? e.message : 'Failed to load students');
    } finally {
      if (token === tokenRef.current) setLoading(false);
    }
  }, [pageSize]);

  // First page + reload when the search/classFilter changes. Debounce
  // the search so every keystroke doesn't fire a request.
  useEffect(() => {
    const handle = setTimeout(() => {
      offsetRef.current = 0;
      void fetchPage(0, search, opts.classFilter);
    }, debounceMs);
    return () => clearTimeout(handle);
  }, [search, opts.classFilter, fetchPage, debounceMs]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    await fetchPage(offsetRef.current, search, opts.classFilter);
  }, [loading, hasMore, fetchPage, search, opts.classFilter]);

  const refresh = useCallback(async () => {
    offsetRef.current = 0;
    await fetchPage(0, search, opts.classFilter);
  }, [fetchPage, search, opts.classFilter]);

  return { items, total, hasMore, loading, error, search, setSearch, loadMore, refresh };
}
