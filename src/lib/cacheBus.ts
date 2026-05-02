// Tiny pub/sub used by services that hold per-school / per-year in-memory
// caches (fee.service, transport.service, principal.service, etc.). When the
// principal switches the active academic year, those caches must be flushed so
// reads after the switch reflect the new year's data instead of the previous
// year's stale rows.
//
// Services register a reset callback once at module load. AcademicYearContext
// fires `resetAllCaches()` after a successful `set_active_academic_year` RPC.

type Resetter = () => void | Promise<void>;

const _resetters = new Set<Resetter>();

export function registerCacheResetter(fn: Resetter): () => void {
  _resetters.add(fn);
  return () => { _resetters.delete(fn); };
}

export async function resetAllCaches(): Promise<void> {
  await Promise.allSettled(Array.from(_resetters).map(fn => fn()));
}
