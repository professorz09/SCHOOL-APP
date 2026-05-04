import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  ArrowLeft, Save, ChevronRight, Search, Lock,
  ShieldCheck, Hourglass, AlertCircle, ChevronLeft, RefreshCw,
} from 'lucide-react';
import { teacherService } from '@/roles/teacher/teacher.service';
import { TeacherClass } from '@/roles/teacher/teacher.types';
import { useUIStore } from '@/store/uiStore';
import type { DateAttendanceStatus, AttendanceCellStatus, GridDateRecord, GridStudentDetails } from '@/modules/attendance/attendance.service';
import { useAcademicYear } from '@/shared/context/AcademicYearContext';

type View = 'CLASSES' | 'GRID';

interface Props { onBack: () => void; }

// Per-cell click only toggles present ↔ absent. Holiday is a class-wide
// state set via the bulk "Holiday" button. Half-day removed entirely.
// Existing 'half' / 'holiday' rows from history still render with their
// label so old data isn't visually broken.
const CELL_CYCLE: AttendanceCellStatus[] = ['present', 'absent'];
const NEXT_STATUS = (s: AttendanceCellStatus): AttendanceCellStatus => {
  // From any non-P/A status (holiday/half), default to present so the user
  // can switch a previously-bulk-marked holiday cell to P then A.
  if (s !== 'present' && s !== 'absent') return 'present';
  return s === 'present' ? 'absent' : 'present';
};
const CELL_LABEL: Record<AttendanceCellStatus, string> = {
  present: 'P', absent: 'A', holiday: 'H', half: 'HD',
};
const CELL_BG: Record<AttendanceCellStatus, string> = {
  present: 'bg-emerald-500 text-white',
  absent:  'bg-rose-500 text-white',
  holiday: 'bg-slate-200 text-slate-600',
  half:    'bg-amber-400 text-white',
};

const todayStr = () => new Date().toISOString().split('T')[0];
const currentYearMonth = () => {
  const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const buildMonthDates = (ym: string, yearStart?: string, yearEnd?: string): string[] => {
  const [y, m] = ym.split('-').map(Number);
  const today = todayStr();
  const ceiling = yearEnd && yearEnd < today ? yearEnd : today;
  // Only enforce yearStart floor if it's not in the future
  const floor = yearStart && yearStart <= today ? yearStart : '0000-01-01';
  const out: string[] = [];
  const dim = new Date(y, m, 0).getDate();
  for (let d = 1; d <= dim; d++) {
    const ds = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if (ds >= floor && ds <= ceiling) out.push(ds);
  }
  return out;
};

// Build last N days strip (newest last = rightmost = today)
const buildDateStrip = (count = 14): string[] => {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().split('T')[0]);
  }
  return out;
};

const fmtDay       = (d: string) => String(new Date(d + 'T12:00:00').getDate());
const fmtDayShort  = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short' });
const fmtMonthShort = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-IN', { month: 'short' });
const fmtMonthLabel = (ym: string) =>
  new Date(ym + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

const STATUS_DOT: Record<DateAttendanceStatus, string> = {
  NOT_MARKED: 'bg-slate-300',
  PENDING:    'bg-amber-400',
  APPROVED:   'bg-emerald-500',
};

export const AttendanceManager: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const { currentYear } = useAcademicYear();

  const [view, setView]               = useState<View>('CLASSES');
  const [classes, setClasses]         = useState<TeacherClass[]>([]);
  const [todayStatuses, setTodayStatuses] = useState<Record<string, DateAttendanceStatus>>({});
  const [selectedClass, setSelectedClass] = useState<TeacherClass | null>(null);
  // Date picked from the top date strip — drives the month a newly-opened
  // class grid lands on. Defaults to today.
  const [targetDate, setTargetDate]   = useState<string>(todayStr());
  const stripRef = useRef<HTMLDivElement | null>(null);
  const dateStrip = useMemo(() => buildDateStrip(14), []);

  // Grid state
  const [gridYM,        setGridYM]       = useState(currentYearMonth());
  const [gridDates,     setGridDates]    = useState<string[]>([]);
  const [gridRecords,   setGridRecords]  = useState<GridDateRecord[]>([]);
  const [gridDetails,   setGridDetails]  = useState<GridStudentDetails>({});
  const [gridLoading,   setGridLoading]  = useState(false);
  const [gridSearch,    setGridSearch]   = useState('');
  const [editBuffer,    setEditBuffer]   = useState<Record<string, Record<string, AttendanceCellStatus>>>({});
  const [isSubmitting,  setIsSubmitting] = useState(false);

  // Clamp gridYM to academic year bounds so we don't start on a month with no dates
  useEffect(() => {
    if (!currentYear) return;
    const endYM   = currentYear.endDate   ? currentYear.endDate.slice(0, 7)   : currentYearMonth();
    const startYM = currentYear.startDate ? currentYear.startDate.slice(0, 7) : currentYearMonth();
    setGridYM(prev => {
      if (prev > endYM)   return endYM;
      if (prev < startYM) return startYM;
      return prev;
    });
  }, [currentYear?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll date strip to today on mount
  useEffect(() => {
    if (!stripRef.current) return;
    const todayEl = stripRef.current.querySelector('[data-today="true"]');
    if (todayEl) (todayEl as HTMLElement).scrollIntoView({ behavior: 'auto', inline: 'end', block: 'nearest' });
  }, [dateStrip]);

  // Load class list once
  useEffect(() => {
    teacherService.getClasses().then(async cs => {
      setClasses(cs);
      const today = todayStr();
      const entries = await Promise.all(cs.map(async c => {
        const map = await teacherService.getStatusForClass(c.id, [today]);
        return [c.id, map[today] ?? 'NOT_MARKED'] as const;
      }));
      const status: Record<string, DateAttendanceStatus> = {};
      for (const [id, s] of entries) status[id] = s;
      setTodayStatuses(status);
    }).catch(() => setClasses([]));
  }, []);

  const loadGrid = useCallback(async (cls: TeacherClass, ym: string) => {
    const dates = buildMonthDates(ym, currentYear?.startDate, currentYear?.endDate);
    setGridDates(dates);
    setGridRecords([]);
    setGridDetails({});
    setEditBuffer({});
    if (dates.length === 0) return;
    setGridLoading(true);
    try {
      const { records, studentDetails } = await teacherService.getGridForClass(cls.id, dates[0], dates[dates.length - 1]);
      setGridRecords(records);
      setGridDetails(studentDetails);
    } catch (e) {
      showToast((e as Error).message || 'Failed to load grid', 'error');
    } finally {
      setGridLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (view === 'GRID' && selectedClass) loadGrid(selectedClass, gridYM);
  }, [view, selectedClass, gridYM, loadGrid]);

  const recordMap = useMemo(() => {
    const m: Record<string, GridDateRecord> = {};
    for (const r of gridRecords) m[r.date] = r;
    return m;
  }, [gridRecords]);

  const todayDateStr = todayStr();
  const canMarkToday = useMemo(() => {
    const rec = recordMap[todayDateStr];
    return !rec || rec.approvalStatus === 'REJECTED';
  }, [recordMap, todayDateStr]);

  const cellStatus = (date: string, stuId: string): AttendanceCellStatus | null => {
    if (editBuffer[date]?.[stuId] !== undefined) return editBuffer[date][stuId];
    return gridDetails[date]?.[stuId] ?? null;
  };

  const toggleCell = (date: string, stuId: string) => {
    // Teacher can only edit today if no approved/pending record exists
    if (date !== todayDateStr) return;
    const rec = recordMap[date];
    if (rec && rec.approvalStatus !== 'REJECTED') return;
    setEditBuffer(prev => {
      const cur = prev[date]?.[stuId] ?? gridDetails[date]?.[stuId] ?? 'absent';
      return { ...prev, [date]: { ...(prev[date] ?? {}), [stuId]: NEXT_STATUS(cur) } };
    });
  };

  const bulkSetToday = (status: AttendanceCellStatus) => {
    if (!selectedClass || !canMarkToday) return;
    const entries: Record<string, AttendanceCellStatus> = {};
    for (const s of selectedClass.students) entries[s.id] = status;
    setEditBuffer(prev => ({ ...prev, [todayDateStr]: entries }));
  };

  const handleSubmitToday = async () => {
    if (!selectedClass || !canMarkToday) return;
    const edits = editBuffer[todayDateStr];
    if (!edits || Object.keys(edits).length === 0) {
      showToast('No changes to submit', 'error'); return;
    }
    setIsSubmitting(true);
    try {
      const students = selectedClass.students.map(s => ({
        id: s.id,
        status: edits[s.id] ?? 'absent' as AttendanceCellStatus,
      }));
      await teacherService.submitAttendance(selectedClass.id, todayDateStr, students);
      showToast('Attendance submitted — Pending Principal Approval');
      setEditBuffer(prev => { const n = { ...prev }; delete n[todayDateStr]; return n; });
      await loadGrid(selectedClass, gridYM);
      // Refresh today status badge
      const map = await teacherService.getStatusForClass(selectedClass.id, [todayDateStr]);
      setTodayStatuses(t => ({ ...t, [selectedClass.id]: map[todayDateStr] ?? 'PENDING' }));
    } catch (e) {
      showToast((e as Error).message || 'Submit failed', 'error');
    } finally { setIsSubmitting(false); }
  };

  const initTodayBuffer = () => {
    if (!selectedClass) return;
    // Pre-fill today with all absent if no buffer yet
    if (!editBuffer[todayDateStr] || Object.keys(editBuffer[todayDateStr]).length === 0) {
      const entries: Record<string, AttendanceCellStatus> = {};
      for (const s of selectedClass.students) entries[s.id] = 'absent';
      setEditBuffer(prev => ({ ...prev, [todayDateStr]: entries }));
    }
  };

  const filteredStudents = useMemo(() =>
    (selectedClass?.students ?? []).filter(s =>
      s.name.toLowerCase().includes(gridSearch.toLowerCase()),
    ), [selectedClass, gridSearch]);

  const changeMonth = (delta: number) => {
    const [y, m] = gridYM.split('-').map(Number);
    const nd = new Date(y, m - 1 + delta, 1);
    const nm = `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2,'0')}`;
    if (nm > currentYearMonth()) return;
    if (currentYear?.startDate) {
      const yearStartYM = currentYear.startDate.slice(0, 7);
      if (nm < yearStartYM) return;
    }
    setGridYM(nm);
  };

  const hasEditToday = !!(editBuffer[todayDateStr] && Object.keys(editBuffer[todayDateStr]).length > 0);

  // Live counts for today's edit buffer
  const todayCounts = useMemo(() => {
    const buf = editBuffer[todayDateStr] ?? {};
    let p = 0, a = 0, h = 0, total = 0;
    for (const stu of (selectedClass?.students ?? [])) {
      const st = buf[stu.id];
      if (!st) continue;
      total++;
      if (st === 'present') p++;
      else if (st === 'absent') a++;
      else if (st === 'holiday') h++;
    }
    return { p, a, h, total };
  }, [editBuffer, selectedClass, todayDateStr]);

  /* ════════════════ CLASSES VIEW ══════════════════════════════════ */
  if (view === 'CLASSES') return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-3 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Attendance</h2>
            <p className="text-[10px] font-bold text-slate-400">Select a class to open the grid</p>
          </div>
        </div>

        {/* Date strip — same style as principal's staff attendance */}
        <div ref={stripRef} className="flex gap-2 overflow-x-auto hide-scrollbar pt-3 pb-0.5">
          {dateStrip.map(d => {
            const isToday = d === todayStr();
            const isPicked = d === targetDate;
            return (
              <button
                key={d}
                data-today={isToday}
                onClick={() => {
                  // Single class → jump straight into grid for that date.
                  // Multiple classes → pick the date and let the user tap a
                  // class card below to open the grid scrolled to that month.
                  if (classes.length === 1) {
                    setSelectedClass(classes[0]);
                    setGridYM(d.slice(0, 7));
                    setTargetDate(d);
                    setView('GRID');
                  } else {
                    setTargetDate(d);
                  }
                }}
                className={`flex-shrink-0 flex flex-col items-center px-3 py-2 rounded-2xl min-w-[52px] transition-all ${
                  isPicked
                    ? 'bg-indigo-600 text-white shadow-md'
                    : isToday
                      ? 'bg-indigo-50 border border-indigo-200 text-indigo-700'
                      : 'bg-slate-50 border border-slate-100 text-slate-600'
                }`}>
                <span className={`text-[9px] font-black uppercase tracking-widest ${isPicked ? 'text-indigo-200' : isToday ? 'text-indigo-400' : 'text-slate-400'}`}>
                  {fmtDayShort(d)}
                </span>
                <span className={`text-lg font-black leading-none mt-0.5 ${isPicked ? 'text-white' : isToday ? 'text-indigo-700' : 'text-slate-800'}`}>
                  {fmtDay(d)}
                </span>
                <span className={`text-[9px] font-bold mt-0.5 ${isPicked ? 'text-indigo-200' : isToday ? 'text-indigo-400' : 'text-slate-400'}`}>
                  {fmtMonthShort(d)}
                </span>
                {classes.length > 0 && (
                  <div className={`w-1.5 h-1.5 rounded-full mt-1 ${
                    isPicked
                      ? (todayStatuses[classes[0]?.id] === 'APPROVED' ? 'bg-emerald-300'
                        : todayStatuses[classes[0]?.id] === 'PENDING' ? 'bg-amber-300'
                        : 'bg-white/40')
                      : 'bg-slate-200'
                  }`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {classes.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
            <p className="text-xs font-bold text-slate-400">No classes assigned to you yet.</p>
            <p className="text-[10px] font-bold text-slate-300 mt-1">Ask your principal to grant section permissions.</p>
          </div>
        )}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {classes.map((cls, idx) => {
            const status = todayStatuses[cls.id] ?? 'NOT_MARKED';
            return (
              <button key={cls.id}
                onClick={() => { setSelectedClass(cls); setGridYM(targetDate.slice(0, 7)); setView('GRID'); }}
                className={`w-full flex items-center gap-3 px-4 py-4 text-left active:bg-slate-50 transition-colors ${idx < classes.length - 1 ? 'border-b border-slate-100' : ''}`}>
                <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-sm shrink-0">
                  {cls.className.replace('Class ', '')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold text-slate-900 text-sm">{cls.className}-{cls.section}</div>
                  <div className="text-[10px] font-bold text-slate-400 mt-0.5">{cls.subject} · {cls.studentCount} students</div>
                </div>
                {status === 'NOT_MARKED' && (
                  <span className="text-[9px] font-black text-blue-700 bg-blue-50 border border-blue-100 px-2 py-1 rounded-full uppercase">Mark Today</span>
                )}
                {status === 'PENDING' && (
                  <span className="flex items-center gap-1 text-[9px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full uppercase">
                    <Hourglass size={9}/> Pending
                  </span>
                )}
                {status === 'APPROVED' && (
                  <span className="flex items-center gap-1 text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full uppercase">
                    <ShieldCheck size={9}/> Approved
                  </span>
                )}
                <ChevronRight size={16} className="text-slate-300" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  /* ════════════════ GRID VIEW ══════════════════════════════════════ */
  if (view === 'GRID' && selectedClass) {
    const todayRec = recordMap[todayDateStr];
    const todayEditable = canMarkToday;

    return (
      <div className="w-full bg-slate-50 flex flex-col h-full animate-in slide-in-from-right-8 duration-300">
        {/* Header */}
        <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-2 sticky top-0 z-10 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <button onClick={() => { setView('CLASSES'); setEditBuffer({}); }} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
              <ArrowLeft size={20} />
            </button>
            <div className="flex-1">
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">{selectedClass.className}-{selectedClass.section}</h2>
              <p className="text-[10px] font-bold text-slate-400">{selectedClass.subject} · {selectedClass.studentCount} students</p>
            </div>
            {gridLoading && <RefreshCw size={16} className="text-slate-400 animate-spin"/>}
          </div>

          {/* Month navigator */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <button onClick={() => changeMonth(-1)} className="p-1.5 bg-slate-100 rounded-xl text-slate-600 active:scale-95">
              <ChevronLeft size={15} />
            </button>
            <div className="font-black text-slate-900 text-sm">{fmtMonthLabel(gridYM)}</div>
            <button onClick={() => changeMonth(1)} disabled={gridYM >= currentYearMonth()}
              className="p-1.5 bg-slate-100 rounded-xl text-slate-600 active:scale-95 disabled:opacity-30">
              <ChevronRight size={15} />
            </button>
          </div>

          {/* Today actions */}
          {gridYM === currentYearMonth() && (
            <div className="pb-1 space-y-1.5">
              {!todayRec && (
                <div className="flex gap-2">
                  <button onClick={() => { initTodayBuffer(); bulkSetToday('present'); }}
                    className="flex-1 py-1.5 bg-emerald-500 text-white text-[10px] font-black rounded-xl active:scale-95 transition-transform">
                    All Present
                  </button>
                  <button onClick={() => { initTodayBuffer(); bulkSetToday('absent'); }}
                    className="flex-1 py-1.5 bg-rose-500 text-white text-[10px] font-black rounded-xl active:scale-95 transition-transform">
                    All Absent
                  </button>
                  <button onClick={() => { initTodayBuffer(); bulkSetToday('holiday'); }}
                    className="flex-1 py-1.5 bg-slate-400 text-white text-[10px] font-black rounded-xl active:scale-95 transition-transform">
                    Holiday
                  </button>
                </div>
              )}
              {todayRec && todayRec.approvalStatus === 'PENDING' && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                  <Hourglass size={12} className="text-amber-500 shrink-0"/>
                  <span className="text-[10px] font-bold text-amber-700 flex-1">Submitted — pending principal approval</span>
                </div>
              )}
              {todayRec && todayRec.approvalStatus === 'APPROVED' && (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                  <ShieldCheck size={12} className="text-emerald-500 shrink-0"/>
                  <span className="text-[10px] font-bold text-emerald-700 flex-1">Approved — locked by principal</span>
                </div>
              )}
              {todayRec && todayRec.approvalStatus === 'REJECTED' && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
                    <AlertCircle size={12} className="text-rose-500 shrink-0"/>
                    <span className="text-[10px] font-bold text-rose-700 flex-1">Rejected — please re-submit</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { initTodayBuffer(); bulkSetToday('present'); }}
                      className="flex-1 py-1.5 bg-emerald-500 text-white text-[10px] font-black rounded-xl active:scale-95">All Present</button>
                    <button onClick={() => { initTodayBuffer(); bulkSetToday('absent'); }}
                      className="flex-1 py-1.5 bg-rose-500 text-white text-[10px] font-black rounded-xl active:scale-95">All Absent</button>
                    <button onClick={() => { initTodayBuffer(); bulkSetToday('holiday'); }}
                      className="flex-1 py-1.5 bg-slate-400 text-white text-[10px] font-black rounded-xl active:scale-95">Holiday</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Search */}
        <div className="bg-white border-b border-slate-100 px-4 py-2">
          <div className="relative">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input value={gridSearch} onChange={e => setGridSearch(e.target.value)}
              placeholder="Search students…"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 font-bold text-xs outline-none focus:border-indigo-500"/>
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-hidden">
          {gridLoading ? (
            <div className="flex items-center justify-center py-16 text-slate-400 font-bold text-sm">Loading…</div>
          ) : gridDates.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-slate-400 font-bold text-sm">No dates in this month</div>
          ) : (
            <div className="overflow-auto h-full">
              <table className="min-w-max w-full border-collapse text-xs">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-white">
                    <th className="sticky left-0 z-30 bg-white border-b border-r border-slate-100 px-3 py-2 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest min-w-[110px]">
                      Student
                    </th>
                    {gridDates.map(d => {
                      const rec = recordMap[d];
                      const isSun = new Date(d).getDay() === 0;
                      const isToday = d === todayDateStr;
                      let colBg = 'bg-white';
                      if (isToday)                               colBg = 'bg-blue-50';
                      else if (rec?.approvalStatus === 'APPROVED') colBg = 'bg-emerald-50/60';
                      else if (rec?.approvalStatus === 'PENDING')  colBg = 'bg-amber-50/60';
                      else if (isSun)                             colBg = 'bg-slate-50';
                      return (
                        <th key={d} className={`border-b border-r border-slate-100 px-0.5 py-1 text-center min-w-[34px] ${colBg}`}>
                          <div className={`text-[8px] font-bold ${isSun ? 'text-rose-400' : isToday ? 'text-blue-600' : 'text-slate-400'}`}>{fmtDayShort(d)}</div>
                          <div className={`font-black text-[10px] tabular-nums ${isSun ? 'text-rose-400' : isToday ? 'text-blue-600' : 'text-slate-700'}`}>{fmtDay(d)}</div>
                          <div className="flex items-center justify-center mt-0.5">
                            {rec?.approvalStatus === 'APPROVED' && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"/>}
                            {rec?.approvalStatus === 'PENDING'  && <div className="w-1.5 h-1.5 rounded-full bg-amber-400"/>}
                            {(!rec || rec.approvalStatus === 'REJECTED') && isToday && hasEditToday && <div className="w-1.5 h-1.5 rounded-full bg-blue-500"/>}
                            {(!rec || rec.approvalStatus === 'REJECTED') && !hasEditToday && <div className="w-1.5 h-1.5 rounded-full bg-slate-200"/>}
                          </div>
                        </th>
                      );
                    })}
                    <th className="sticky right-0 bg-white border-b border-l border-slate-100 px-2 py-2 text-center text-[10px] font-black text-slate-500 min-w-[40px]">%</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((stu, sidx) => {
                    let totalP = 0, totalA = 0, totalHalf = 0;
                    for (const d of gridDates) {
                      const st = cellStatus(d, stu.id);
                      if (!st) continue;
                      if (st === 'present') totalP++;
                      else if (st === 'absent') totalA++;
                      else if (st === 'half') totalHalf++;
                    }
                    const workDays = totalP + totalA + totalHalf;
                    const pct = workDays > 0 ? Math.round(((totalP + totalHalf * 0.5) / workDays) * 100) : null;
                    return (
                      <tr key={stu.id} className={`${sidx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                        <td className={`sticky left-0 z-10 border-b border-r border-slate-100 px-3 py-2 ${sidx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                          <div className="font-bold text-slate-900 text-xs truncate max-w-[100px]">{stu.name}</div>
                          <div className="text-[9px] font-bold text-slate-400">Roll {stu.rollNo.padStart(2,'0')}</div>
                        </td>
                        {gridDates.map(d => {
                          const rec = recordMap[d];
                          const st = cellStatus(d, stu.id);
                          const isToday = d === todayDateStr;
                          const editable = isToday && todayEditable;
                          const locked   = !editable;
                          const bg = st ? CELL_BG[st] : (isToday && !rec ? 'bg-blue-100 text-blue-400' : 'bg-slate-100 text-slate-300');
                          return (
                            <td key={d}
                              className={`border-b border-r border-slate-100 text-center px-0.5 py-1 ${editable ? 'cursor-pointer active:scale-90' : ''}`}
                              onClick={() => toggleCell(d, stu.id)}>
                              <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-[9px] font-black transition-colors ${bg} ${locked && st ? 'opacity-80' : ''}`}>
                                {st ? CELL_LABEL[st] : (isToday && !rec ? '?' : '—')}
                              </span>
                            </td>
                          );
                        })}
                        <td className="sticky right-0 bg-white border-b border-l border-slate-100 text-center px-1 py-1">
                          {pct !== null
                            ? <span className={`text-[10px] font-black tabular-nums ${pct >= 75 ? 'text-emerald-600' : 'text-rose-500'}`}>{pct}%</span>
                            : <span className="text-[10px] text-slate-300">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Submit today's attendance */}
        {gridYM === currentYearMonth() && todayEditable && hasEditToday && (
          <div className="bg-white border-t border-slate-100 p-4 space-y-2.5">
            {/* Live summary chips */}
            <div className="flex items-center gap-2 justify-center">
              <span className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-100 text-emerald-700 text-[10px] font-black px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"/>P {todayCounts.p}
              </span>
              <span className="inline-flex items-center gap-1 bg-rose-50 border border-rose-100 text-rose-700 text-[10px] font-black px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"/>A {todayCounts.a}
              </span>
              <span className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 text-slate-600 text-[10px] font-black px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"/>H {todayCounts.h}
              </span>
              <span className="text-[10px] font-bold text-slate-400">
                {todayCounts.total}/{selectedClass.students.length}
              </span>
            </div>
            <button onClick={handleSubmitToday} disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-black text-sm uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-50">
              {isSubmitting ? 'Submitting…' : <><Save size={16}/> Submit For Review</>}
            </button>
            <p className="text-center text-[10px] font-bold text-slate-400">
              After submit, attendance becomes <span className="text-amber-600">read-only</span> until principal approves
            </p>
          </div>
        )}
      </div>
    );
  }

  return null;
};
