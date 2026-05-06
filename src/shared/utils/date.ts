/**
 * Shared date helpers — single source of truth for IST-day boundaries.
 *
 * The whole app treats Asia/Kolkata calendar dates as the user-visible day,
 * even though servers run UTC. Inline `toLocaleDateString('en-CA', …)` calls
 * were duplicated in 5+ places; route them through here so future tweaks
 * (DST, locale, school-configurable timezone) only need one edit.
 */

/** Today's date in IST as `YYYY-MM-DD`. */
export function todayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/** Convert a Date / ISO string into its IST `YYYY-MM-DD` calendar date. */
export function istDateOf(d: string | Date | null | undefined): string | null {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/** ISO timestamp for IST midnight of `dateYmd` — useful as a `>=` filter. */
export function istDayStart(dateYmd: string): string {
  return new Date(`${dateYmd}T00:00:00+05:30`).toISOString();
}
