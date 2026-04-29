import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { useEditingYearStore } from '../store/editingYearStore';
import { logAudit } from '../lib/audit';
import type { AcademicYearStatus } from '../types/yearClosing.types';

export interface AcademicYear {
  id: string;
  name: string;          // e.g., '2024-2025' (DB column: label)
  startDate: string;
  endDate: string;
  isActive: boolean;
  status: AcademicYearStatus;  // 'ACTIVE' | 'LOCKED'
  board: string;
  closedDate?: string;
}

interface AcademicYearContextType {
  academicYears: AcademicYear[];
  activeYear: AcademicYear | null;
  /**
   * The year that editing surfaces (attendance, tests, timetable, staff
   * attendance) should bind to. Equals `activeYear` by default. When
   * Correction Mode is turned ON for a closed year, callers set this to
   * that closed year via setCurrentEditingYear() so the same edit
   * surfaces operate on closed-year data — gated by useEditGuard.
   */
  currentYear: AcademicYear | null;
  currentEditingYearId: string | null;
  setCurrentEditingYear: (id: string | null) => void;
  isLoading: boolean;
  refresh: () => Promise<void>;
  addAcademicYear: (year: Omit<AcademicYear, 'id' | 'isActive' | 'status'>) => Promise<string>;
  setActiveYear: (id: string) => Promise<void>;
  lockYear: (id: string) => Promise<void>;
  removeAcademicYear: (id: string) => Promise<void>;
  isYearLocked: (id: string) => boolean;
}

const AcademicYearContext = createContext<AcademicYearContextType | undefined>(undefined);

interface AYRow {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  is_closed: boolean;
  board: string | null;
}

function rowToYear(r: AYRow): AcademicYear {
  return {
    id: r.id,
    name: r.label,
    startDate: r.start_date,
    endDate: r.end_date,
    isActive: r.is_active,
    status: r.is_closed ? 'LOCKED' : 'ACTIVE',
    board: r.board ?? 'CBSE',
    closedDate: r.is_closed ? r.end_date : undefined,
  };
}

export const AcademicYearProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const session = useAuthStore((s) => s.session);
  const schoolId = session?.schoolId ?? null;
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!schoolId) {
      setAcademicYears([]);
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('academic_years')
        .select('id, label, start_date, end_date, is_active, is_closed, board')
        .eq('school_id', schoolId)
        .order('start_date', { ascending: false });
      if (error) throw new Error(error.message);
      setAcademicYears(((data ?? []) as AYRow[]).map(rowToYear));
    } finally {
      setIsLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activeYear = academicYears.find(y => y.isActive) ?? null;

  const [currentEditingYearId, setCurrentEditingYearIdState] = useState<string | null>(null);
  // The year all edit surfaces should bind to. When Correction Mode is on
  // for a closed year, that year overrides activeYear here AND in the
  // editingYearStore (consumed by service-layer year resolvers).
  const currentYear =
    (currentEditingYearId
      ? academicYears.find(y => y.id === currentEditingYearId) ?? null
      : null) ?? activeYear;
  const setCurrentEditingYear = useCallback((id: string | null) => {
    setCurrentEditingYearIdState(id);
    useEditingYearStore.getState().setEditingYear(id);
  }, []);
  // Auto-clear the override if the selected year disappears from the
  // school's year list (e.g. deleted in another tab).
  useEffect(() => {
    if (currentEditingYearId && !academicYears.find(y => y.id === currentEditingYearId)) {
      setCurrentEditingYear(null);
    }
  }, [academicYears, currentEditingYearId, setCurrentEditingYear]);

  const addAcademicYear = useCallback(async (
    newYear: Omit<AcademicYear, 'id' | 'isActive' | 'status'>,
  ): Promise<string> => {
    const { data, error } = await supabase.rpc('create_academic_year', {
      p_label: newYear.name,
      p_start: newYear.startDate,
      p_end: newYear.endDate,
      p_board: newYear.board ?? 'CBSE',
      p_medium: 'English',
    });
    if (error) throw new Error(error.message);
    await refresh();
    return data as string;
  }, [refresh]);

  const setActiveYear = useCallback(async (id: string) => {
    const { error } = await supabase.rpc('set_active_academic_year', { p_year_id: id });
    if (error) throw new Error(error.message);
    await refresh();
  }, [refresh]);

  const lockYear = useCallback(async (id: string) => {
    const { error } = await supabase.rpc('close_academic_year', { p_year_id: id });
    if (error) throw new Error(error.message);
    await refresh();
  }, [refresh]);

  const removeAcademicYear = useCallback(async (id: string) => {
    const target = academicYears.find(y => y.id === id);
    if (!target) return;
    if (target.status === 'LOCKED') throw new Error('Cannot delete a locked year');
    const { error } = await supabase.from('academic_years').delete().eq('id', id);
    if (error) throw new Error(error.message);
    await logAudit('delete_academic_year', 'academic_year', id, { name: target.name });
    await refresh();
  }, [academicYears, refresh]);

  const isYearLocked = useCallback((id: string): boolean => {
    const year = academicYears.find(y => y.id === id);
    return year?.status === 'LOCKED';
  }, [academicYears]);

  return (
    <AcademicYearContext.Provider
      value={{
        academicYears, activeYear, currentYear, currentEditingYearId,
        setCurrentEditingYear, isLoading, refresh,
        addAcademicYear, setActiveYear, lockYear, removeAcademicYear, isYearLocked,
      }}
    >
      {children}
    </AcademicYearContext.Provider>
  );
};

export const useAcademicYear = () => {
  const context = useContext(AcademicYearContext);
  if (context === undefined) {
    throw new Error('useAcademicYear must be used within an AcademicYearProvider');
  }
  return context;
};
