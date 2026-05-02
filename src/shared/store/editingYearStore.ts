// editingYearStore.ts — single-source override for "which academic year
// am I currently editing?" so closed-year Correction Mode can actually
// reach closed-year data.
//
// Default: null → services fall back to the school's is_active=true year.
// When AcademicYearManager turns Correction Mode ON for a closed year X,
// it calls setEditingYear(X). All service helpers (sharedAttendance,
// timetable, principal, student) consult this store before falling back
// to the is_active query, so reads/writes flow against year X for the
// duration of the correction session. Toggling correction OFF clears it.
//
// Module-level (zustand) so non-React code (services) can read it
// synchronously via useEditingYearStore.getState().getEditingYearId().

import { create } from 'zustand';
import { useAuthStore } from '@/shared/store/authStore';
import { useCorrectionStore } from '@/shared/store/correctionStore';

interface State {
  editingYearId: string | null;
}

interface Actions {
  setEditingYear(id: string | null): void;
  getEditingYearId(): string | null;
  reset(): void;
}

export const useEditingYearStore = create<State & Actions>((set, get) => ({
  editingYearId: null,
  setEditingYear(id) {
    set({ editingYearId: id });
  },
  getEditingYearId() {
    return get().editingYearId;
  },
  reset() {
    set({ editingYearId: null });
  },
}));

// ─── Lifecycle: clear correction state on logout / school change ───────────
// Without this, a stale editing-year override would persist across
// sign-out/sign-in or a school switch in the same SPA tab and silently
// misroute year lookups in services. We also wipe per-year correction
// flags (kept in correctionStore) so the next session starts neutral.
let _lastSchoolId: string | null = useAuthStore.getState().session?.schoolId ?? null;
useAuthStore.subscribe((state) => {
  const nextSchoolId = state.session?.schoolId ?? null;
  if (nextSchoolId !== _lastSchoolId) {
    useEditingYearStore.getState().reset();
    useCorrectionStore.getState().resetAll?.();
    _lastSchoolId = nextSchoolId;
  }
});
