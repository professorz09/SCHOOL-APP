import { useMemo } from 'react';
import { istDateOf, todayIST } from '@/shared/utils/date';

/**
 * Compute today's submission count + cap state for a list of dated rows.
 * Used by the parent/student daily-3 caps for fee submissions, leave
 * applications and complaints. Single source of truth so all four views
 * format the budget chip identically.
 *
 * @param rows  array of objects with a date-like field
 * @param getDate  selector returning a `YYYY-MM-DD` string or full ISO timestamp
 * @param cap  daily cap (default 3)
 */
export function useDailyCap<T>(
  rows: T[],
  getDate: (row: T) => string | null | undefined,
  cap = 3,
): { todayCount: number; cap: number; reached: boolean } {
  return useMemo(() => {
    const today = todayIST();
    const todayCount = rows.reduce((acc, r) => {
      const d = istDateOf(getDate(r) ?? null);
      return d === today ? acc + 1 : acc;
    }, 0);
    return { todayCount, cap, reached: todayCount >= cap };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, cap]);
}
