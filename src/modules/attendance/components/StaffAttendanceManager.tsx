import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  ArrowLeft, CheckCircle2, Lock, Save, Search, ChevronLeft, ChevronRight,
  Unlock, AlertTriangle, Pencil, LayoutGrid, Download, RefreshCw,
} from 'lucide-react';
import { staffAttendanceService, StaffAttendanceRow, StaffAttendanceStatus }
  from '@/modules/attendance/attendance.service';
import { exportCsv } from '@/shared/utils/csv';
import { useUIStore } from '@/store/uiStore';
import { useAcademicYear } from '@/shared/context/AcademicYearContext';
import { useEditGuard } from '@/store/correctionStore';
import { useEditorModeStore } from '@/store/editorModeStore';

export type AttendanceStatus = StaffAttendanceStatus;

interface DayRecord {
  date: string;
  rows: StaffAttendanceRow[];
  isLocked: boolean;
  savedAt: string | null;
  modifiedAt: string | null;
}

interface HistoryData {
  staffId: string; name: string; role: string;
  days: Array<{ date: string; status: StaffAttendanceStatus }>;
  counts: Record<StaffAttendanceStatus, number>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<AttendanceStatus, { label: string; color: string; dot: string; short: string }> = {
  PRESENT:  { label: 'Present',  color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', short: 'P' },
  ABSENT:   { label: 'Absent',   color: 'bg-rose-50 text-rose-700 border-rose-200',          dot: 'bg-rose-500',    short: 'A' },
  HALF_DAY: { label: 'Half Day', color: 'bg-amber-50 text-amber-700 border-amber-200',       dot: 'bg-amber-400',   short: 'H' },
  LEAVE:    { label: 'Leave',    color: 'bg-violet-50 text-violet-700 border-violet-200',    dot: 'bg-violet-400',  short: 'L' },
  LATE:     { label: 'Late',     color: 'bg-orange-50 text-orange-700 border-orange-200',    dot: 'bg-orange-400',  short: 'LT' },
  HOLIDAY:  { label: 'Holiday',  color: 'bg-sky-50 text-sky-700 border-sky-200',             dot: 'bg-sky-400',     short: 'H' },
};

const ROLE_LABEL: Record<string, string> = {
  TEACHER: 'Teacher', VICE_PRINCIPAL: 'V. Principal', ACCOUNTANT: 'Accountant',
  LIBRARIAN: 'Librarian', LAB_INCHARGE: 'Lab', DRIVER: 'Driver', PEON: 'Peon', SECURITY: 'Security',
};

// IST-anchored "today" — using toISOString() returns UTC, which after
// 18:30 IST flips to the next day and creates an off-by-one in the
// date strip. en-CA gives ISO format (YYYY-MM-DD) when locked to the
// Asia/Kolkata zone.
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

const dayShort = (d: string) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short' });
const dayNum   = (d: string) => new Date(d).getDate();
const monthShort = (d: string) => new Date(d).toLocaleDateString('en-IN', { month: 'short' });
const isToday  = (d: string) => d === today();
const monthYearLabel = (ym: string) => {
  const [y, m] = ym.split('-');
  return new Date(`${y}-${m}-01`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

// Builds a clamped 14-day strip honouring the active academic year
// window. Anchored on today if today is inside the year; otherwise
// on yearEnd (correction-mode-on-closed-year case) so the strip
// shows the last 14 days of THAT year, not phantom dates after it.
// Dates outside [yearStart, yearEnd] are filtered out.
const buildDateStrip = (
  yearStart?: string | null,
  yearEnd?: string | null,
  count = 14,
): string[] => {
  const todayIso = today();
  let anchor = todayIso;
  if (yearEnd && todayIso > yearEnd) anchor = yearEnd;
  if (yearStart && todayIso < yearStart) return [];
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(anchor);
    d.setDate(d.getDate() - i);
    const iso = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    if (yearStart && iso < yearStart) continue;
    if (yearEnd && iso > yearEnd) continue;
    out.push(iso);
  }
  return out;
};

const getCurrentMonthYM = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const addMonths = (ym: string, n: number): string => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// ─── Component ────────────────────────────────────────────────────────────────
// OVERVIEW = the 2-card landing screen (Attendance · History) — mirrors the
// student attendance pattern. ATTENDANCE is mark-today, HISTORY is the grid.
type TabType = 'OVERVIEW' | 'ATTENDANCE' | 'HISTORY';

interface Props { onBack: () => void; startTab?: TabType; }

export const StaffAttendanceManager: React.FC<Props> = ({ onBack, startTab = 'OVERVIEW' }) => {
  const { showToast } = useUIStore();
  const { currentYear } = useAcademicYear();
  const isYearClosed = !!currentYear && currentYear.status === 'LOCKED';
  const editGuard = useEditGuard(currentYear?.id, isYearClosed);
  const editorModeActive = useEditorModeStore(s => s.isActive());
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [tab, setTab] = useState<TabType>(startTab);
  const [selectedDate, setSelectedDate] = useState<string>(today());
  const [record, setRecord] = useState<DayRecord | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [snapshot, setSnapshot] = useState<Map<string, AttendanceStatus>>(new Map());
  const [activeStatus, setActiveStatus] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // staffIds whose status the principal has cleared this session. These rows
  // render as "Unmarked" in the list and, on save, the corresponding
  // staff_attendance row is DELETED on the server (not upserted to PRESENT).
  // This is how we keep "Clear" semantically distinct from "All Present".
  const [clearedIds, setClearedIds] = useState<Set<string>>(new Set());
  const [historyMonth, setHistoryMonth] = useState<string>(getCurrentMonthYM());
  const [historyData, setHistoryData] = useState<HistoryData[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  // Role filter for the history grid — 'ALL' shows everyone, otherwise narrow
  // to the picked role. Built from the loaded data so we never offer roles that
  // don't actually exist for this school.
  const [historyRole, setHistoryRole] = useState<string>('ALL');
  const dateStrip = useMemo(
    () => buildDateStrip(currentYear?.startDate, currentYear?.endDate, 14),
    [currentYear?.startDate, currentYear?.endDate],
  );

  const loadDate = async (date: string) => {
    setSelectedDate(date);
    setRecord(null);
    setSnapshot(new Map());
    setActiveStatus(null);
    setClearedIds(new Set());
    try {
      const data = await staffAttendanceService.getForDate(date);
      setRecord({ date, rows: data.rows, isLocked: data.isLocked, savedAt: data.savedAt, modifiedAt: data.modifiedAt });
      setSnapshot(new Map(data.rows.map(r => [r.staffId, r.status])));
    } catch (e) {
      showToast((e as Error).message || 'Failed to load staff attendance', 'error');
    }
  };

  const loadHistory = async (ym: string) => {
    setHistoryMonth(ym);
    setHistoryData(null);
    setHistoryLoading(true);
    try {
      const data = await staffAttendanceService.getMonth(ym);
      setHistoryData(data);
    } catch (e) {
      showToast((e as Error).message || 'Failed to load attendance history', 'error');
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => { void loadDate(today()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => { void loadHistory(getCurrentMonthYM()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const isDirty = useMemo(() => {
    if (!record) return false;
    if (clearedIds.size > 0) return true;
    return record.rows.some(r => snapshot.get(r.staffId) !== r.status);
  }, [record, clearedIds, snapshot]);

  const counts = useMemo(() => {
    const c: Record<AttendanceStatus, number> = { PRESENT: 0, ABSENT: 0, HALF_DAY: 0, LEAVE: 0, LATE: 0, HOLIDAY: 0 };
    if (!record) return c;
    // Cleared rows are intentionally excluded from every status bucket so
    // the summary chips reflect "marked" rows only.
    for (const row of record.rows) {
      if (clearedIds.has(row.staffId)) continue;
      c[row.status]++;
    }
    return c;
  }, [record, clearedIds]);

  const filtered = useMemo(() =>
    record ? record.rows.filter(s =>
      s.name.toLowerCase().includes(search.toLowerCase()) || s.role.toLowerCase().includes(search.toLowerCase())
    ) : []
  , [record, search]);

  useEffect(() => {
    if (!stripRef.current) return;
    const todayEl = stripRef.current.querySelector('[data-today="true"]');
    if (todayEl && 'scrollIntoView' in todayEl) {
      (todayEl as HTMLElement).scrollIntoView({ behavior: 'auto', inline: 'end', block: 'nearest' });
    }
  }, [dateStrip]);

  // hardLocked = salary generated OR year closed without correction mode
  const hardLocked = (record?.isLocked ?? false) || !editGuard.canEdit;
  // softLocked = attendance saved at least once, editor mode not active
  const savedOnce  = !!record?.savedAt;
  const softLocked = savedOnce && !editorModeActive;
  const isLocked   = hardLocked || softLocked;

  const bulkSet = (status: AttendanceStatus) => {
    if (isLocked) return;
    // Warn before clobbering already-marked LEAVE / LATE / HALF_DAY
    // rows. "All Present" / "All Holiday" should not silently flip
    // a manually-set LEAVE to PRESENT — that loses real data the
    // marker entered.
    const distinctOverride = (record?.rows ?? []).filter(r =>
      r.status !== 'PRESENT' && r.status !== status,
    );
    if (distinctOverride.length > 0) {
      const ok = window.confirm(
        `${distinctOverride.length} staff already have a different status set ` +
        `(LEAVE / LATE / HALF_DAY etc). Overwriting all to ${status}?`,
      );
      if (!ok) return;
    }
    setRecord(r => r ? ({ ...r, rows: r.rows.map(row => ({ ...row, status })) }) : r);
    setClearedIds(new Set());
  };

  const clearAll = () => {
    if (isLocked || !record) return;
    setClearedIds(new Set(record.rows.map(r => r.staffId)));
    setActiveStatus(null);
  };

  const setRowStatus = (staffId: string, status: AttendanceStatus) => {
    if (isLocked) return;
    setRecord(r => r ? ({
      ...r,
      rows: r.rows.map(row => row.staffId === staffId ? { ...row, status } : row),
    }) : r);
    setClearedIds(prev => {
      if (!prev.has(staffId)) return prev;
      const next = new Set(prev); next.delete(staffId); return next;
    });
    setActiveStatus(null);
  };

  const handleSave = async () => {
    if (isLocked || !record || isSaving) return;
    if (!editGuard.canEdit) {
      showToast('Year closed — pehle Correction Mode enable karein', 'error');
      return;
    }
    const wasAlreadySaved = !!record.savedAt;
    setIsSaving(true);
    try {
      const toUpsert = record.rows.filter(r => !clearedIds.has(r.staffId));
      const toClear: string[] = Array.from(clearedIds.values());
      const result = await editGuard.gate(
        () => staffAttendanceService.save(record.date, toUpsert, toClear, editorModeActive),
        { entityType: 'staff_attendance', entityId: record.date },
      );
      if (result === undefined) return;
      setRecord(r => r ? { ...r, savedAt: result.savedAt, modifiedAt: result.modifiedAt } : r);
      // Reset snapshot to current rows so isDirty returns false immediately
      setSnapshot(new Map(record.rows.filter(r => !clearedIds.has(r.staffId)).map(r => [r.staffId, r.status])));
      setClearedIds(new Set());
      showToast(wasAlreadySaved ? 'Attendance updated (Editor Mode)' : 'Attendance saved');
    } catch (e) {
      showToast((e as Error).message || 'Failed to save', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const ROW_STATUSES: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'LATE'];

  // ── OVERVIEW: 2-card landing (matches student attendance UX) ───────────────
  if (tab === 'OVERVIEW') {
    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        <div className="bg-white border-b border-slate-100 px-4 lg:px-6 pt-4 lg:pt-6 pb-4 sticky top-0 z-10 shadow-sm flex items-center gap-3">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-xl lg:text-2xl font-black text-slate-900 uppercase tracking-tight">Staff Attendance</h2>
            <p className="text-[10px] lg:text-xs font-bold text-slate-400">Mark today · Date-range history with export</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4 lg:max-w-4xl lg:mx-auto lg:w-full">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button onClick={() => setTab('ATTENDANCE')}
              className="flex flex-col items-start gap-3 bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-2xl p-5 shadow-md hover:shadow-lg active:scale-[0.98] transition-all text-left">
              <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur-sm border border-white/30 flex items-center justify-center">
                <Save size={22}/>
              </div>
              <div>
                <div className="font-black text-lg">Attendance</div>
                <div className="text-[11px] font-bold text-blue-100 mt-0.5">Mark today's staff attendance</div>
              </div>
            </button>
            <button onClick={() => setTab('HISTORY')}
              className="flex flex-col items-start gap-3 bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-indigo-200 active:scale-[0.98] transition-all text-left">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <LayoutGrid size={22}/>
              </div>
              <div>
                <div className="font-black text-lg text-slate-900">History</div>
                <div className="text-[11px] font-bold text-slate-400 mt-0.5">Date × Staff grid · CSV export</div>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!record && tab === 'ATTENDANCE') {
    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-3 shadow-sm sticky top-0 z-20 flex items-center gap-3">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full">
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Staff Attendance</h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // ── ATTENDANCE TAB ──────────────────────────────────────────────────────────
  if (tab === 'ATTENDANCE' && record) {
    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300 lg:max-w-5xl lg:mx-auto">
        {/* Header */}
        <div className="bg-white border-b border-slate-100 px-4 lg:px-6 pt-4 lg:pt-6 pb-0 sticky top-0 z-10 shadow-sm">
          <div className="flex items-center gap-3 pb-3 lg:pb-4">
            <button onClick={() => setTab('OVERVIEW')} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h2 className="text-xl lg:text-2xl font-black text-slate-900 uppercase tracking-tight">Staff Attendance</h2>
              <p className="text-[10px] lg:text-xs font-bold text-slate-400">Mark & Save attendance</p>
            </div>
          </div>

          {/* Date strip + "older" date picker. The strip shows the
              last 14 days for the common "mark today / fix yesterday"
              flow. For any date older than that, the picker on the
              right jumps straight to it — lock rules apply
              automatically (saved + not editor mode = softLocked, and
              the server hard-rejects edits to is_locked rows). */}
          <div className="flex items-center gap-2 border-t border-slate-100 -mx-4 lg:-mx-6 px-4 lg:px-6 pt-1.5 lg:pt-2 pb-1 lg:pb-2">
            <div ref={stripRef} className="flex flex-1 overflow-x-auto hide-scrollbar">
              {dateStrip.map(d => {
                const isSelected = selectedDate === d;
                const today_flag = isToday(d);
                return (
                  <button key={d}
                    data-today={today_flag ? 'true' : 'false'}
                    onClick={() => { loadDate(d); setSearch(''); }}
                    className={`shrink-0 flex flex-col items-center mx-0.5 lg:mx-1 px-2.5 lg:px-3.5 py-1.5 lg:py-2 rounded-xl border-2 transition-colors ${
                      isSelected
                        ? today_flag ? 'bg-blue-600 border-blue-600 text-white' : 'bg-slate-800 border-slate-800 text-white'
                        : today_flag ? 'border-blue-200 text-blue-600 bg-blue-50' : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}>
                    <span className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest">{dayShort(d)}</span>
                    <span className="text-base lg:text-lg font-black tabular-nums leading-none my-0.5">{dayNum(d)}</span>
                    <span className="text-[8px] lg:text-[9px] font-bold uppercase tracking-wide opacity-75">{monthShort(d)}</span>
                  </button>
                );
              })}
            </div>
            {/* Native date picker — simplest, mobile-friendly. Jumps
                the grid to the picked date; if it's outside the strip,
                lock rules still gate edits. Capped at today so a typo
                can't put attendance into the future. */}
            <label className="shrink-0 flex flex-col items-center justify-center w-12 lg:w-14 px-1 py-1.5 lg:py-2 rounded-xl border-2 border-dashed border-slate-200 text-slate-500 hover:border-blue-300 hover:text-blue-600 cursor-pointer transition-colors"
              title="Pick any older date">
              <input type="date" value={selectedDate}
                max={today()}
                onChange={e => { if (e.target.value) loadDate(e.target.value); setSearch(''); }}
                className="absolute opacity-0 w-12 lg:w-14 h-14 cursor-pointer" />
              <span className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest pointer-events-none">Pick</span>
              <span className="text-base lg:text-lg font-black leading-none my-0.5 pointer-events-none">📅</span>
              <span className="text-[8px] lg:text-[9px] font-bold uppercase tracking-wide opacity-75 pointer-events-none">Date</span>
            </label>
          </div>

        </div>

        {/* Status bar */}
        <div className="bg-white border-b border-slate-100 px-4 lg:px-6 py-3 lg:py-4">
          <div className="flex items-center justify-between mb-3 lg:mb-4">
            <div>
              <div className="font-black text-slate-900 text-sm lg:text-base">
                {new Date(selectedDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
              <div className="text-[10px] lg:text-xs font-bold text-slate-400 mt-0.5">
                {hardLocked ? 'Salary generated — record locked'
                  : softLocked ? 'Saved · Editor Mode required to edit'
                  : editorModeActive && savedOnce ? 'Editor Mode ON — changes will overwrite saved attendance'
                  : 'Mark and save'}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {isDirty && !hardLocked && (
                <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full">
                  <AlertTriangle size={10} className="text-amber-500" />
                  <span className="text-[8px] lg:text-[10px] font-black text-amber-700">UNSAVED</span>
                </div>
              )}
              {hardLocked && (
                <div className="flex items-center gap-1 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-full">
                  <Lock size={11} className="text-rose-500" />
                  <span className="text-[9px] lg:text-[10px] font-black text-rose-700">LOCKED</span>
                </div>
              )}
              {softLocked && !hardLocked && (
                <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full">
                  <Lock size={11} className="text-slate-500" />
                  <span className="text-[9px] lg:text-[10px] font-black text-slate-600">SAVED</span>
                </div>
              )}
              {editorModeActive && savedOnce && !hardLocked && (
                <div className="flex items-center gap-1 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-full">
                  <Unlock size={11} className="text-indigo-500" />
                  <span className="text-[9px] lg:text-[10px] font-black text-indigo-700">EDITOR</span>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 lg:gap-3">
            <div className="text-center bg-emerald-50 rounded-xl py-2 lg:py-3">
              <div className="text-base lg:text-2xl font-black text-emerald-600 tabular-nums">{counts.PRESENT}</div>
              <div className="text-[8px] lg:text-[10px] font-black text-emerald-500 uppercase tracking-wide">Present</div>
            </div>
            <div className="text-center bg-rose-50 rounded-xl py-2 lg:py-3">
              <div className="text-base lg:text-2xl font-black text-rose-500 tabular-nums">{counts.ABSENT}</div>
              <div className="text-[8px] lg:text-[10px] font-black text-rose-400 uppercase tracking-wide">Absent</div>
            </div>
            <div className="text-center bg-slate-100 rounded-xl py-2 lg:py-3">
              <div className="text-base lg:text-2xl font-black text-slate-600 tabular-nums">{record.rows.length}</div>
              <div className="text-[8px] lg:text-[10px] font-black text-slate-500 uppercase tracking-wide">Total</div>
            </div>
          </div>
        </div>

        {/* Quick actions */}
        {!isLocked && (
          <div className="bg-white border-b border-slate-100 px-4 lg:px-6 py-3 lg:py-4 space-y-3 lg:space-y-0 lg:flex lg:items-center lg:gap-3">
            <div className="flex gap-2 lg:flex-1">
              <button onClick={() => bulkSet('PRESENT')}
                className="flex-1 py-2 lg:py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] lg:text-xs font-black rounded-xl active:scale-95 transition-all">
                All Present
              </button>
              <button onClick={() => bulkSet('HOLIDAY')}
                className="flex-1 py-2 lg:py-2.5 bg-sky-500 hover:bg-sky-600 text-white text-[11px] lg:text-xs font-black rounded-xl active:scale-95 transition-all">
                Holiday
              </button>
              <button onClick={clearAll}
                className="flex-1 py-2 lg:py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-[11px] lg:text-xs font-black rounded-xl active:scale-95 transition-all">
                Clear
              </button>
            </div>
            <div className="relative lg:w-72">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search staff…"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 lg:py-2.5 font-bold text-sm outline-none focus:border-indigo-500"/>
            </div>
          </div>
        )}

        {/* Staff list — single col mobile, 2-col desktop for better space use */}
        <div className="flex-1 overflow-y-auto pb-44 lg:pb-32">
          {record.rows.length > 0 && (
            <div className="p-4 lg:p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
                {filtered.map((row) => {
                  const cfg = STATUS_CONFIG[row.status];
                  const isCleared = clearedIds.has(row.staffId);
                  return (
                    <div key={row.staffId}
                      className={`flex items-center gap-3 px-4 lg:px-5 py-3 lg:py-3.5 rounded-2xl border shadow-sm transition-colors ${
                        isCleared
                          ? 'bg-white border-slate-100'
                          : row.status === 'PRESENT' ? 'bg-emerald-50/60 border-emerald-100'
                          : row.status === 'ABSENT' ? 'bg-rose-50/60 border-rose-100'
                          : 'bg-slate-50 border-slate-100'
                      }`}>
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${isCleared ? 'bg-slate-300' : cfg.dot}`} />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-900 text-sm lg:text-base truncate">{row.name}</div>
                        <div className="text-[10px] lg:text-[11px] font-bold text-slate-400 mt-0.5">{ROLE_LABEL[row.role] ?? row.role}</div>
                      </div>
                      {isLocked ? (
                        <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg ${cfg.color} border`}>{cfg.label}</span>
                      ) : isCleared ? (
                        <button
                          onClick={() => setActiveStatus(prev => prev === row.staffId ? null : row.staffId)}
                          className="flex items-center gap-1.5 text-[10px] lg:text-[11px] font-black px-3 py-1.5 rounded-full border bg-slate-50 text-slate-500 border-slate-200 border-dashed active:scale-95 hover:border-slate-400 transition-all">
                          Unmarked
                          <span className="text-[8px] opacity-60">▾</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => setActiveStatus(prev => prev === row.staffId ? null : row.staffId)}
                          className={`flex items-center gap-1.5 text-[10px] lg:text-[11px] font-black px-3 py-1.5 rounded-full border active:scale-95 hover:opacity-80 transition-all ${cfg.color}`}>
                          {cfg.label}
                          <span className="text-[8px] opacity-60">▾</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {(record.savedAt || record.modifiedAt) && (
            <div className="text-center mt-4 space-y-1">
              {record.savedAt && !record.modifiedAt && (
                <p className="text-[9px] font-bold text-slate-400">
                  Last saved: {new Date(record.savedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
              {record.modifiedAt && (
                <>
                  <p className="text-[9px] font-bold text-slate-400">
                    First saved: {record.savedAt ? new Date(record.savedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                  </p>
                  <p className="flex items-center justify-center gap-1 text-[9px] font-black text-indigo-500">
                    <Pencil size={9} /> Modified: {new Date(record.modifiedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} (Editor Mode)
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer — fixed on mobile, sticky-within-container on desktop so it
            doesn't bleed across the sidebar */}
        <div className="fixed bottom-0 left-0 right-0 lg:sticky lg:left-auto lg:right-auto lg:bottom-0 p-4 lg:p-6 bg-white border-t border-slate-100 z-30 lg:rounded-t-2xl lg:shadow-lg">

          {/* Hard locked (salary generated) */}
          {hardLocked && (
            <div className="w-full py-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-center gap-2">
              <Lock size={16} className="text-rose-500" />
              <span className="font-black text-rose-700 text-sm">Salary generated — record locked</span>
            </div>
          )}

          {/* Soft locked — saved, editor mode OFF */}
          {!hardLocked && softLocked && !editorModeActive && (
            <div className="w-full py-3 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-1">
              <div className="flex items-center gap-2">
                <Lock size={15} className="text-slate-500" />
                <span className="font-black text-slate-700 text-sm">
                  Attendance Saved
                  {record?.savedAt ? ` · ${new Date(record.savedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}
                </span>
              </div>
              <span className="text-[9px] font-bold text-slate-400">Edit karne ke liye Settings → Editor Mode ON karein</span>
            </div>
          )}

          {/* Editor Mode active, no unsaved changes yet */}
          {!hardLocked && editorModeActive && savedOnce && !isDirty && (
            <div className="w-full py-3 bg-indigo-50 border border-indigo-200 rounded-2xl flex items-center justify-center gap-2">
              <Unlock size={15} className="text-indigo-500" />
              <span className="font-black text-indigo-700 text-sm">Editor Mode ON — changes will overwrite saved attendance</span>
            </div>
          )}

          {/* Save button — first save OR editor mode with dirty changes */}
          {!hardLocked && (!softLocked || (editorModeActive && isDirty)) && (
            <button onClick={handleSave} disabled={isSaving}
              className={`w-full py-4 font-black text-base rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60 ${
                editorModeActive && savedOnce
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-900 text-white'
              }`}>
              {isSaving
                ? <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving…</>
                : editorModeActive && savedOnce
                  ? <><Save size={20} /> Save Changes (Editor Mode)</>
                  : <><Save size={20} /> Save Attendance</>
              }
            </button>
          )}
        </div>

        {/* Fixed bottom sheet for status picker */}
        {activeStatus && (() => {
          const activeRow = record.rows.find(r => r.staffId === activeStatus);
          if (!activeRow) return null;
          return (
            <>
              <div className="fixed inset-0 z-40 bg-slate-900/40" onClick={() => setActiveStatus(null)} />
              <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl p-5 pb-8 animate-in slide-in-from-bottom-4">
                <div className="mb-3">
                  <p className="font-black text-slate-900 text-base">{activeRow.name}</p>
                  <p className="text-[10px] font-bold text-slate-400">{ROLE_LABEL[activeRow.role] ?? activeRow.role}</p>
                </div>
                <div className="space-y-1">
                  {ROW_STATUSES.map(s => (
                    <button key={s} onClick={() => setRowStatus(activeRow.staffId, s)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-black text-left transition-colors ${
                        activeRow.status === s ? 'bg-slate-100' : 'hover:bg-slate-50'
                      }`}>
                      <div className={`w-3 h-3 rounded-full shrink-0 ${STATUS_CONFIG[s].dot}`} />
                      {STATUS_CONFIG[s].label}
                      {activeRow.status === s && <CheckCircle2 size={14} className="ml-auto text-emerald-500" />}
                    </button>
                  ))}
                </div>
              </div>
            </>
          );
        })()}
      </div>
    );
  }

  // ── HISTORY TAB — Date × Staff grid (mirrors student attendance grid) ─────
  // Build the list of dates in the selected month for the column headers.
  const [hy, hm] = historyMonth.split('-').map(Number);
  const histDates: string[] = [];
  if (hy && hm) {
    const dim = new Date(hy, hm, 0).getDate();
    for (let d = 1; d <= dim; d++) {
      histDates.push(`${historyMonth}-${String(d).padStart(2, '0')}`);
    }
  }
  // Distinct roles present in this month's data — drives the filter pills.
  // Sort alphabetically so the order is stable across months.
  const histRoles: string[] = Array.from(
    new Set<string>((historyData ?? []).map(s => s.role))
  ).sort();
  // Apply the role filter before render. 'ALL' is a no-op pass-through.
  const filteredHistory = (historyData ?? []).filter(s =>
    historyRole === 'ALL' || s.role === historyRole
  );
  // Pre-index each staff member's days for O(1) lookup at the (staff, date) cell.
  const histLookup: Map<string, Map<string, StaffAttendanceStatus>> = new Map();
  for (const s of filteredHistory) {
    histLookup.set(s.staffId, new Map(s.days.map(d => [d.date, d.status])));
  }

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300 h-full">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 lg:px-6 pt-4 lg:pt-6 pb-3 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => setTab('OVERVIEW')} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h2 className="text-xl lg:text-2xl font-black text-slate-900 uppercase tracking-tight">Staff Attendance Grid</h2>
            <p className="text-[10px] lg:text-xs font-bold text-slate-400 mt-0.5">{filteredHistory.length} staff · {histDates.length} days{historyRole !== 'ALL' ? ` · ${ROLE_LABEL[historyRole] ?? historyRole}` : ''}</p>
          </div>
          {historyLoading && <RefreshCw size={16} className="text-slate-400 animate-spin"/>}
          {filteredHistory.length > 0 && (
            <button
              onClick={() => {
                const rows: Record<string, unknown>[] = [];
                for (const staff of filteredHistory) {
                  const dayMap = new Map(staff.days.map(d => [d.date, d.status] as const));
                  for (const d of histDates) {
                    rows.push({
                      date: d,
                      staff_name: staff.name,
                      role: ROLE_LABEL[staff.role] ?? staff.role,
                      status: dayMap.get(d) ?? 'NOT_MARKED',
                    });
                  }
                }
                const suffix = historyRole === 'ALL' ? '' : `_${historyRole.toLowerCase()}`;
                exportCsv(`staff_attendance_${historyMonth}${suffix}`, rows);
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black active:scale-95 transition-transform">
              <Download size={13}/> CSV
            </button>
          )}
        </div>

        {/* Month navigator */}
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => loadHistory(addMonths(historyMonth, -1))}
            className="p-1.5 bg-slate-100 rounded-xl text-slate-600 active:scale-95">
            <ChevronLeft size={15} />
          </button>
          <div className="font-black text-slate-900 text-sm">
            {monthYearLabel(historyMonth)}
          </div>
          <button onClick={() => loadHistory(addMonths(historyMonth, 1))}
            disabled={historyMonth >= getCurrentMonthYM()}
            className="p-1.5 bg-slate-100 rounded-xl text-slate-600 active:scale-95 disabled:opacity-30">
            <ChevronRight size={15} />
          </button>
        </div>

        {/* Role filter pills — only show when more than one role exists */}
        {histRoles.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto hide-scrollbar pt-3 -mx-1 px-1">
            <button onClick={() => setHistoryRole('ALL')}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-colors ${
                historyRole === 'ALL'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              }`}>
              All ({historyData?.length ?? 0})
            </button>
            {histRoles.map(r => {
              const count = (historyData ?? []).filter(s => s.role === r).length;
              return (
                <button key={r} onClick={() => setHistoryRole(r)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-colors ${
                    historyRole === r
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                  }`}>
                  {ROLE_LABEL[r] ?? r} ({count})
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto bg-white">
        {historyLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
          </div>
        ) : !historyData || historyData.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <p className="text-sm font-bold">No attendance records for this month</p>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <p className="text-sm font-bold">No staff in this role for the month</p>
            <button onClick={() => setHistoryRole('ALL')} className="mt-3 text-[11px] font-black text-blue-600 underline">Show all staff</button>
          </div>
        ) : (
          <table className="min-w-max w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 shadow-sm">
              <tr>
                <th className="sticky left-0 z-20 bg-slate-50 border-b border-r border-slate-100 text-left px-3 py-2 font-black text-[10px] uppercase tracking-widest text-slate-500 min-w-[160px]">
                  Staff
                </th>
                {histDates.map(d => {
                  const dt = new Date(d);
                  const isSun = dt.getDay() === 0;
                  const isToday = d === today();
                  return (
                    <th key={d} className={`border-b border-r border-slate-100 px-1 py-1 text-center min-w-[28px] ${isSun ? 'bg-rose-50/30' : ''}`}>
                      <div className={`text-[8px] font-black uppercase ${isSun ? 'text-rose-400' : 'text-slate-400'}`}>{dayShort(d).slice(0,1)}</div>
                      <div className={`font-black text-[10px] tabular-nums ${isSun ? 'text-rose-400' : isToday ? 'text-blue-600' : 'text-slate-700'}`}>{dt.getDate()}</div>
                    </th>
                  );
                })}
                <th className="sticky right-0 bg-slate-50 border-b border-l border-slate-100 px-2 py-2 text-center font-black text-[10px] uppercase tracking-widest text-slate-500 min-w-[60px]">
                  P / A
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.map((staff, sidx) => {
                const dayMap = histLookup.get(staff.staffId) ?? new Map();
                return (
                  <tr key={staff.staffId} className={`${sidx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                    <td className={`sticky left-0 z-10 border-b border-r border-slate-100 px-3 py-2 ${sidx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                      <div className="font-bold text-slate-900 text-xs truncate max-w-[150px]">{staff.name}</div>
                      <div className="text-[9px] font-bold text-slate-400">{ROLE_LABEL[staff.role] ?? staff.role}</div>
                    </td>
                    {histDates.map(d => {
                      const st = dayMap.get(d);
                      const cfg = st ? STATUS_CONFIG[st] : null;
                      return (
                        <td key={d} className="border-b border-r border-slate-100 text-center px-0.5 py-1">
                          <span
                            title={st ? `${new Date(d).toLocaleDateString('en-IN')} · ${cfg!.label}` : 'Not marked'}
                            className={`inline-flex items-center justify-center w-6 h-6 rounded text-[9px] font-black ${cfg ? cfg.color + ' border' : 'text-slate-300'}`}>
                            {cfg ? cfg.short : '—'}
                          </span>
                        </td>
                      );
                    })}
                    <td className="sticky right-0 bg-white border-b border-l border-slate-100 text-center px-2 py-1">
                      <div className="text-[10px] font-black text-emerald-600 tabular-nums">{staff.counts.PRESENT}</div>
                      <div className="text-[10px] font-black text-rose-500 tabular-nums">{staff.counts.ABSENT}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Legend */}
      {historyData && historyData.length > 0 && !historyLoading && (
        <div className="bg-white border-t border-slate-100 px-4 py-2 flex items-center gap-3 flex-wrap">
          {(['PRESENT','ABSENT','HALF_DAY','LEAVE','LATE','HOLIDAY'] as StaffAttendanceStatus[]).map(s => (
            <span key={s} className="flex items-center gap-1.5 text-[10px] font-black text-slate-600">
              <span className={`inline-block w-3 h-3 rounded ${STATUS_CONFIG[s].color} border`}/>
              {STATUS_CONFIG[s].label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
