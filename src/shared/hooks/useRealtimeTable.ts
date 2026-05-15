import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

/**
 * Subscribe to Postgres changes on `table` and call `onRefresh` on any
 * INSERT / UPDATE / DELETE that's relevant to the current school.
 *
 * Two improvements over the original implementation:
 *   1. Server-side filter on `school_id`, so we don't wake up every tenant's
 *      subscriber for unrelated row changes (the realtime channel itself
 *      respects RLS, but you still pay the WebSocket round-trip for every
 *      event the publication emits — filtering at the source slashes that
 *      noise on busy multi-tenant tables).
 *   2. Debounce the callback so a burst of changes (e.g. attendance bulk
 *      upsert) only triggers one refetch instead of N.
 *
 * Pass `opts.schoolColumn = false` for the rare table without a school_id
 * column (legacy `broadcasts`, etc.) to fall back to unfiltered behaviour.
 */
interface RealtimeOpts {
  /** Debounce window in ms (default 250). Set to 0 to disable. */
  debounceMs?: number;
  /** Set false to skip the school_id filter (legacy unscoped tables). */
  schoolColumn?: boolean;
}

export function useRealtimeTable(table: string, onRefresh: () => void, opts: RealtimeOpts = {}) {
  const { debounceMs = 250, schoolColumn = true } = opts;
  const cbRef = useRef(onRefresh);
  cbRef.current = onRefresh;

  // Subscribe to schoolId via the store selector so a super-admin switching
  // schools (or any login/logout that changes tenancy without unmounting
  // the consumer) re-runs the effect. Previously we read it once with
  // getState(), which pinned the channel to the first-render schoolId —
  // every consumer kept streaming the old tenant's events forever.
  const schoolId = useAuthStore(s => s.session?.schoolId ?? null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const trigger = () => {
      if (debounceMs <= 0) { cbRef.current(); return; }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; cbRef.current(); }, debounceMs);
    };

    const channel = supabase.channel(`rt-${table}-${Math.random().toString(36).slice(2, 8)}`);
    const filter = schoolColumn && schoolId ? `school_id=eq.${schoolId}` : undefined;
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
      trigger,
    );
    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [table, schoolId, debounceMs, schoolColumn]);
}
