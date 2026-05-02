import { useEffect, useRef } from 'react';
import { supabase } from '@/shared/lib/supabase';

/**
 * Subscribe to Postgres changes on `table` and call `onRefresh` on any
 * INSERT / UPDATE / DELETE. Cleans up the channel on unmount.
 *
 * RLS still applies to all follow-up queries, so no school_id filter is
 * needed here — only the current school's data will be returned on reload.
 */
export function useRealtimeTable(table: string, onRefresh: () => void) {
  const cbRef = useRef(onRefresh);
  cbRef.current = onRefresh;

  useEffect(() => {
    const channel = supabase
      .channel(`rt-${table}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => cbRef.current(),
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [table]);
}
