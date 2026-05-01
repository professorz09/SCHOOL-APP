import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  ArrowLeft, CheckCircle2, Lock, Save, Search, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { principalService, StaffAttendanceRow, StaffAttendanceStatus }
  from '../../../services/principal.service';
import { useUIStore } from '../../../store/uiStore';
import { useAcademicYear } from '../../../context/AcademicYearContext';
import { useEditGuard } from '../../../store/correctionStore';

export type AttendanceStatus = StaffAttendanceStatus;

interface DayRecord {
  date: string;
  rows: StaffAttendanceRow[];
  isLocked: boolean;
  savedAt: string | null;
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

const today = () => new Date().toISOString().split('T')[0];

const dayShort = (d: string) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short' });
const dayNum   = (d: string) => new Date(d).getDate();
const monthShort = (d: string) => new Date(d).toLocaleDateString('en-IN', { month: 'short' });
const isToday  = (d: string) => d === today();
const monthYearLabel = (ym: string) => {
  const [y, m] = ym.split('-');
  return new Date(`${y}-${m}-01`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

const buildDateStrip = (count = 14): string[] => {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().split('T')[0]);
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
type TabType = 'ATTENDANCE' | 'HISTORY';

interface Props { onBack: () => void; }

export const StaffAttendanceManager: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const { currentYear } = useAcademicYear();
  const isYearClosed = !!currentYear && currentYear.status === 'LOCKED';
  const editGuard = useEditGuard(currentYear?.id, isYearClosed);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [tab, setTab] = useState<TabType>('ATTENDANCE');
  const [selectedDate, setSelectedDate] = useState<string>(today());
  const [record, setRecord] = useState<DayRecord | null>(null);
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
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
  const dateStrip = useMemo(() => buildDateStrip(14), []);

  const loadDate = async (date: string) => {
    setSelectedDate(date);
    setRecord(null);
    setSaved(false);
    setActiveStatus(null);
    setClearedIds(new Set());
    try {
      const data = await principalService.getStaffAttendance(date);
      setRecord({ date, rows: data.rows, isLocked: data.isLocked, savedAt: data.savedAt });
    } catch (e) {
      showToast((e as Error).message || 'Failed to load staff attendance', 'error');
    }
  };

  const loadHistory = async (ym: string) => {
    setHistoryMonth(ym);
    setHistoryData(null);
    setHistoryLoading(true);
    try {
      const data = await principalService.getStaffAttendanceMonth(ym);
      setHistoryData(data);
    } catch (e) {
      showToast((e as Error).message || 'Failed to load attendance history', 'error');
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => { void loadDate(today()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => { void loadHistory(getCurrentMonthYM()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

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

  const isLocked = (record?.isLocked ?? false) || !editGuard.canEdit;

  const bulkSet = (status: AttendanceStatus) => {
    if (isLocked) return;
    setRecord(r => r ? ({ ...r, rows: r.rows.map(row => ({ ...row, status })) }) : r);
    // Any prior "cleared" marks are overridden by an explicit bulk action.
    setClearedIds(new Set());
    setSaved(false);
  };

  // "Clear" wipes every row's mark for the current view. Cleared rows render
  // as "Unmarked" and, when saved, their server-side staff_attendance row is
  // DELETED — making Clear semantically distinct from All Present. The
  // principal must still tap Save to persist the change.
  const clearAll = () => {
    if (isLocked || !record) return;
    setClearedIds(new Set(record.rows.map(r => r.staffId)));
    setSaved(false);
    setActiveStatus(null);
  };

  const setRowStatus = (staffId: string, status: AttendanceStatus) => {
    if (isLocked) return;
    setRecord(r => r ? ({
      ...r,
      rows: r.rows.map(row => row.staffId === staffId ? { ...row, status } : row),
    }) : r);
    // Marking a cleared row removes it from the cleared set so it gets
    // upserted again on the next save.
    setClearedIds(prev => {
      if (!prev.has(staffId)) return prev;
      const next = new Set(prev);
      next.delete(staffId);
      return next;
    });
    setActiveStatus(null);
    setSaved(false);
  };

  const handleSave = async () => {
    if (isLocked || !record || isSaving) return;
    if (!editGuard.canEdit) {
      showToast('Year closed — pehle Correction Mode enable karein', 'error');
      return;
    }
    setIsSaving(true);
    try {
      // Partition rows into "to-upsert" and "to-delete" before sending.
      const toUpsert = record.rows.filter(r => !clearedIds.has(r.staffId));
      const toClear: string[] = Array.from(clearedIds.values());
      const result = await editGuard.gate(
        () => principalService.saveStaffAttendance(record.date, toUpsert, toClear),
        { entityType: 'staff_attendance', entityId: record.date },
      );
      if (result === undefined) return;
      setRecord(r => r ? { ...r, savedAt: result } : r);
      // Cleared rows have been persisted (deleted on the server). The next
      // load will show them as default PRESENT again, so locally we reset
      // both flags to keep the UI consistent without a round-trip.
      setClearedIds(new Set());
      setSaved(true);
      showToast(toClear.length ? 'Attendance saved (cleared rows reset)' : 'Attendance saved');
    } catch (e) {
      showToast((e as Error).message || 'Failed to save', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const ROW_STATUSES: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'LATE'];

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
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        {/* Header */}
        <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-0 sticky top-0 z-10 shadow-sm">
          <div className="flex items-center justify-between gap-3 pb-3">
            <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Staff Attendance</h2>
              <p className="text-[10px] font-bold text-slate-400">Mark & Save attendance</p>
            </div>
            </div>
            <button
              onClick={() => { setTab('HISTORY'); loadHistory(getCurrentMonthYM()); }}
              className="text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-700 px-3 py-2 rounded-lg shrink-0"
            >
              History
            </button>
          </div>

          {/* Date strip */}
          <div ref={stripRef} className="flex border-t border-slate-100 overflow-x-auto hide-scrollbar -mx-4 px-4 pt-1.5 pb-1">
            {dateStrip.map(d => {
              const isSelected = selectedDate === d;
              const today_flag = isToday(d);
              return (
                <button key={d}
                  data-today={today_flag ? 'true' : 'false'}
                  onClick={() => { loadDate(d); setSearch(''); }}
                  className={`shrink-0 flex flex-col items-center mx-0.5 px-2.5 py-1.5 rounded-xl border-2 transition-colors ${
                    isSelected
                      ? today_flag ? 'bg-blue-600 border-blue-600 text-white' : 'bg-slate-800 border-slate-800 text-white'
                      : today_flag ? 'border-blue-200 text-blue-600 bg-blue-50' : 'border-transparent text-slate-400'
                  }`}>
                  <span className="text-[9px] font-black uppercase tracking-widest">{dayShort(d)}</span>
                  <span className="text-base font-black tabular-nums leading-none my-0.5">{dayNum(d)}</span>
                  <span className="text-[8px] font-bold uppercase tracking-wide opacity-75">{monthShort(d)}</span>
                </button>
              );
            })}
          </div>

        </div>

        {/* Status bar */}
        <div className="bg-white border-b border-slate-100 px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="font-black text-slate-900 text-sm">
                {new Date(selectedDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
              <div className="text-[10px] font-bold text-slate-400 mt-0.5">
                {isLocked ? 'Salary generated — record locked' : 'Edit and save'}
              </div>
            </div>
            {isLocked && (
              <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                <Lock size={11} className="text-amber-500" />
                <span className="text-[9px] font-black text-amber-700">LOCKED</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="text-center bg-emerald-50 rounded-xl py-2">
              <div className="text-base font-black text-emerald-600 tabular-nums">{counts.PRESENT}</div>
              <div className="text-[8px] font-black text-emerald-500 uppercase tracking-wide">Present</div>
            </div>
            <div className="text-center bg-rose-50 rounded-xl py-2">
              <div className="text-base font-black text-rose-500 tabular-nums">{counts.ABSENT}</div>
              <div className="text-[8px] font-black text-rose-400 uppercase tracking-wide">Absent</div>
            </div>
            <div className="text-center bg-slate-100 rounded-xl py-2">
              <div className="text-base font-black text-slate-600 tabular-nums">{record.rows.length}</div>
              <div className="text-[8px] font-black text-slate-500 uppercase tracking-wide">Total</div>
            </div>
          </div>
        </div>

        {/* Quick actions */}
        {!isLocked && (
          <div className="bg-white border-b border-slate-100 px-4 py-3 space-y-3">
            <div className="flex gap-2">
              <button onClick={() => bulkSet('PRESENT')}
                className="flex-1 py-2 bg-emerald-500 text-white text-[11px] font-black rounded-xl active:scale-95 transition-transform">
                All Present
              </button>
              <button onClick={() => bulkSet('HOLIDAY')}
                className="flex-1 py-2 bg-sky-500 text-white text-[11px] font-black rounded-xl active:scale-95 transition-transform">
                Holiday
              </button>
              <button onClick={clearAll}
                className="flex-1 py-2 bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-black rounded-xl active:scale-95 transition-transform">
                Clear
              </button>
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search staff…"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 font-bold text-sm outline-none focus:border-indigo-500"/>
            </div>
          </div>
        )}

        {/* Staff list */}
        <div className="flex-1 overflow-y-auto pb-44">
          {record.rows.length > 0 && (
            <div className="p-4">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                {filtered.map((row, idx) => {
                  const cfg = STATUS_CONFIG[row.status];
                  const isCleared = clearedIds.has(row.staffId);
                  return (
                    <div key={row.staffId}
                      className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                        idx < filtered.length - 1 ? 'border-b border-slate-100' : ''
                      } ${isCleared ? 'bg-white' : row.status === 'PRESENT' ? 'bg-emerald-50/40' : row.status === 'ABSENT' ? 'bg-rose-50/40' : 'bg-slate-50/40'}`}>
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${isCleared ? 'bg-slate-300' : cfg.dot}`} />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-900 text-sm">{row.name}</div>
                        <div className="text-[10px] font-bold text-slate-400 mt-0.5">{ROLE_LABEL[row.role] ?? row.role}</div>
                      </div>
                      {isLocked ? (
                        <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg ${cfg.color} border`}>{cfg.label}</span>
                      ) : isCleared ? (
                        <button
                          onClick={() => setActiveStatus(prev => prev === row.staffId ? null : row.staffId)}
                          className="relative flex items-center gap-1.5 text-[10px] font-black px-3 py-1.5 rounded-full border bg-slate-50 text-slate-500 border-slate-200 border-dashed active:scale-95 transition-transform">
                          Unmarked
                          <span className="text-[8px] opacity-60">▾</span>
                        </button>
                      ) : (
                        <div className="relative shrink-0">
                          <button
                            onClick={() => setActiveStatus(prev => prev === row.staffId ? null : row.staffId)}
                            className={`flex items-center gap-1.5 text-[10px] font-black px-3 py-1.5 rounded-full border active:scale-95 transition-transform ${cfg.color}`}>
                            {cfg.label}
                            <span className="text-[8px] opacity-60">▾</span>
                          </button>

                          {activeStatus === row.staffId && (
                            <div className="absolute right-0 top-full mt-1 bg-white rounded-2xl border border-slate-200 shadow-lg z-30 overflow-hidden min-w-[130px]">
                              {ROW_STATUSES.map(s => (
                                <button key={s} onClick={() => setRowStatus(row.staffId, s)}
                                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-[11px] font-black text-left hover:bg-slate-50 transition-colors ${
                                    row.status === s ? 'bg-slate-50' : ''
                                  }`}>
                                  <div className={`w-2 h-2 rounded-full ${STATUS_CONFIG[s].dot}`} />
                                  {STATUS_CONFIG[s].label}
                                  {row.status === s && <CheckCircle2 size={11} className="ml-auto text-emerald-500" />}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {record.savedAt && (
            <p className="text-center text-[9px] font-bold text-slate-400 mt-4">
              Last saved: {new Date(record.savedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>

        {/* Floating Save button */}
        {!isLocked && (
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-100 z-30">
            <button onClick={handleSave} disabled={isSaving}
              className={`w-full py-4 font-black text-base rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-60 ${
                saved
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-900 text-white active:scale-95'
              }`}>
              {isSaving ? (
                <><Save size={20} /> Saving…</>
              ) : saved ? (
                <><CheckCircle2 size={20} /> Attendance Saved!</>
              ) : (
                <><Save size={20} /> Save Attendance</>
              )}
            </button>
          </div>
        )}

        {isLocked && (
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-100 z-30">
            <div className="w-full py-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-center gap-2">
              <Lock size={16} className="text-amber-500" />
              <span className="font-black text-amber-700 text-sm">Salary generated — record locked</span>
            </div>
          </div>
        )}

        {activeStatus && (
          <div className="absolute inset-0 z-20" onClick={() => setActiveStatus(null)} />
        )}
      </div>
    );
  }

  // ── HISTORY TAB ─────────────────────────────────────────────────────────────
  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-3 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3 pb-3">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Staff Attendance History</h2>
        </div>

        {/* Month selector */}
        <div className="flex items-center justify-between gap-3 pb-3 pt-2">
          <button onClick={() => loadHistory(addMonths(historyMonth, -1))}
            className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600 active:scale-95">
            <ChevronLeft size={18} />
          </button>
          <div className="font-black text-slate-900 text-sm text-center flex-1">
            {monthYearLabel(historyMonth)}
          </div>
          <button onClick={() => loadHistory(addMonths(historyMonth, 1))}
            className="p-2 -mr-2 bg-slate-100 rounded-full text-slate-600 active:scale-95">
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-t border-slate-100 px-0 pt-1">
          <button onClick={() => { setTab('ATTENDANCE'); loadDate(today()); }}
            className="px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all bg-slate-100 text-slate-600 hover:bg-slate-200">
            Mark Attendance
          </button>
          <button onClick={() => setTab('HISTORY')}
            className="px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all bg-indigo-600 text-white">
            History
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-20">
        {historyLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
          </div>
        ) : historyData && historyData.length > 0 ? (
          <div className="p-4 space-y-3">
            {historyData.map(staff => (
              <div key={staff.staffId} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <div className="mb-3">
                  <div className="font-black text-slate-900 text-sm">{staff.name}</div>
                  <div className="text-[10px] font-bold text-slate-400 mt-0.5">
                    {ROLE_LABEL[staff.role] ?? staff.role} · ID: {staff.staffId.slice(0, 8)}
                  </div>
                </div>

                {/* Summary counts */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="text-center bg-emerald-50 rounded-lg py-1.5">
                    <div className="text-sm font-black text-emerald-600">{staff.counts.PRESENT}</div>
                    <div className="text-[8px] font-bold text-emerald-500 uppercase">Present</div>
                  </div>
                  <div className="text-center bg-rose-50 rounded-lg py-1.5">
                    <div className="text-sm font-black text-rose-600">{staff.counts.ABSENT}</div>
                    <div className="text-[8px] font-bold text-rose-500 uppercase">Absent</div>
                  </div>
                  <div className="text-center bg-slate-100 rounded-lg py-1.5">
                    <div className="text-sm font-black text-slate-600">{staff.days.length}</div>
                    <div className="text-[8px] font-bold text-slate-500 uppercase">Total Days</div>
                  </div>
                </div>

                {/* Day dots */}
                {staff.days.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {staff.days.map(d => {
                      const cfg = STATUS_CONFIG[d.status];
                      const dayOfMonth = new Date(d.date).getDate();
                      return (
                        <div key={d.date} title={`${new Date(d.date).toLocaleDateString('en-IN')}: ${cfg.label}`}
                          className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-black ${cfg.color} border`}>
                          {dayOfMonth}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 text-slate-400">
            <p className="text-sm font-bold">No attendance records for this month</p>
          </div>
        )}
      </div>
    </div>
  );
};
