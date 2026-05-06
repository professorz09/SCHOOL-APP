// correctionStore.ts — per-academic-year "Correction Mode" flag.
//
// Closed academic years are read-only by default. The principal can flip
// Correction Mode ON for a specific closed year to perform a targeted
// edit (attendance / result / timetable / staff attendance). Every
// gated save then prompts for a reason and writes a YEAR_CORRECTION
// row to audit_logs via recordCorrection().
//
// State is intentionally in-memory only — turning Correction Mode ON is a
// transient, session-scoped intent. Closing the tab snaps the year back
// to read-only, which is the safe default. Audit counts are hydrated on
// demand from audit_logs by AcademicYearManager.

import { create } from 'zustand';
import { logAuditStrict } from '@/lib/audit';

interface State {
  enabledByYear: Record<string, boolean>;
  countsByYear: Record<string, number>;
}

interface Actions {
  enable(yearId: string): void;
  disable(yearId: string): void;
  toggle(yearId: string): void;
  isOn(yearId: string): boolean;
  getCount(yearId: string): number;
  setCount(yearId: string, n: number): void;
  bumpCount(yearId: string): void;
  resetAll(): void;
}

export const useCorrectionStore = create<State & Actions>((set, get) => ({
  enabledByYear: {},
  countsByYear: {},

  enable(yearId) {
    set((s) => ({ enabledByYear: { ...s.enabledByYear, [yearId]: true } }));
  },
  disable(yearId) {
    set((s) => ({ enabledByYear: { ...s.enabledByYear, [yearId]: false } }));
  },
  toggle(yearId) {
    const current = get().enabledByYear[yearId] ?? false;
    set((s) => ({ enabledByYear: { ...s.enabledByYear, [yearId]: !current } }));
  },
  isOn(yearId) {
    return !!get().enabledByYear[yearId];
  },
  getCount(yearId) {
    return get().countsByYear[yearId] ?? 0;
  },
  setCount(yearId, n) {
    set((s) => ({ countsByYear: { ...s.countsByYear, [yearId]: n } }));
  },
  bumpCount(yearId) {
    set((s) => ({
      countsByYear: { ...s.countsByYear, [yearId]: (s.countsByYear[yearId] ?? 0) + 1 },
    }));
  },
  resetAll() {
    set({ enabledByYear: {}, countsByYear: {} });
  },
}));

export interface CorrectionContext {
  entityType: string;
  entityId: string;
  yearId: string;
  field?: string;
  oldValue?: unknown;
  newValue?: unknown;
}

/**
 * Append a YEAR_CORRECTION audit-log row and bump the in-memory counter
 * (so the badge in AcademicYearManager updates without a refetch).
 *
 * The row is keyed by entity_type='academic_year' + entity_id=yearId so
 * that getCorrectionCount() can count corrections per-year with a simple
 * indexed query. The original target entity is preserved inside details.
 *
 * Throws on audit-write failure so the caller (useEditGuard.gate) can
 * abort the closed-year mutation instead of letting it persist without
 * an audit trail.
 */
export async function recordCorrection(
  ctx: CorrectionContext,
  reason: string,
): Promise<void> {
  await logAuditStrict('YEAR_CORRECTION', 'academic_year', ctx.yearId, {
    academic_year_id: ctx.yearId,
    target_entity_type: ctx.entityType,
    target_entity_id: ctx.entityId,
    field: ctx.field,
    old_value: ctx.oldValue,
    new_value: ctx.newValue,
    reason,
  });
  useCorrectionStore.getState().bumpCount(ctx.yearId);
}

/**
 * Hook used by editing surfaces (attendance, results, timetable) to gate
 * mutations behind year-closed + correction-mode rules.
 *
 * Returns:
 *   canEdit         — false if the active year is closed AND correction is OFF
 *   isCorrectionOn  — true when corrections are currently allowed
 *   gate(action, ctx) — runs `action`; if year is closed prompts for a
 *                       reason and records the correction; returns the
 *                       action's return value, or `undefined` if the user
 *                       cancelled the prompt.
 */
export function useEditGuard(
  activeYearId: string | null | undefined,
  isYearClosed: boolean,
) {
  const isCorrectionOn = useCorrectionStore((s) =>
    activeYearId ? !!s.enabledByYear[activeYearId] : false,
  );
  const canEdit = !isYearClosed || isCorrectionOn;

  async function gate<T>(
    action: () => Promise<T> | T,
    ctx?: Omit<CorrectionContext, 'yearId'>,
  ): Promise<T | undefined> {
    if (!isYearClosed) return action();
    if (!isCorrectionOn || !activeYearId) return undefined;
    const reason = (window.prompt('Reason for correction (required):') ?? '').trim();
    if (!reason) return undefined;
    // Record the correction BEFORE running the mutation. If the audit
    // write fails (RPC error / RLS / network), the mutation is aborted
    // so closed-year data can never change without a durable audit row.
    // If the mutation itself fails after the audit succeeds, the audit
    // row remains as a record of intent-to-correct — which is the safer
    // failure mode than the inverse (silent mutation, no audit).
    await recordCorrection(
      {
        entityType: ctx?.entityType ?? 'unknown',
        entityId: ctx?.entityId ?? '-',
        yearId: activeYearId,
        field: ctx?.field,
        oldValue: ctx?.oldValue,
        newValue: ctx?.newValue,
      },
      reason,
    );
    return await action();
  }

  return { canEdit, isCorrectionOn, gate };
}
