import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  ArrowLeft, Save, ChevronRight, Search, Lock,
  ShieldCheck, AlertCircle, ChevronLeft, RefreshCw,
} from 'lucide-react';
import { teacherService } from '@/roles/teacher/teacher.service';
import { TeacherClass } from '@/roles/teacher/teacher.types';
import { useUIStore } from '@/store/uiStore';
import { SkeletonRow } from '@/shared/components/ui/Skeleton';
import type { DateAttendanceStatus, AttendanceCellStatus, GridDateRecord, GridStudentDetails } from '@/modules/attendance/attendance.service';
import { useAcademicYear } from '@/shared/context/AcademicYearContext';
import { stripClassPrefix } from '@/shared/utils/className';
import { todayIST } from '@/shared/utils/date';

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

// Shared util — earlier this file inlined `toISOString().split('T')[0]`
// which returns UTC. For India between 00:00 and 05:30 IST, UTC is
// still the previous day, so a teacher opening "Mark Attendance" at
// 4 AM would land on yesterday's record. todayIST handles the
// timezone correctly via toLocaleDateString('en-CA', {timeZone:'Asia/Kolkata'}).
const todayStr = () => todayIST();
const currentYearMonth = () => todayStr().slice(0, 7);
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

// Build last N days strip (newest last = rightmost = today). IST-based
// so the "today" tile lines up with `todayStr()`. Earlier the loop used
// `.toISOString()` for each day which would shift everything by one
// for early-morning IST opens.
const buildDateStrip = (count = 14): string[] => {
  const out: string[] = [];
  // Anchor at IST today, then walk back N-1 calendar days. We do the
  // walk on a Date constructed from IST today's YYYY-MM-DD so the
  // browser's local timezone never enters the math.
  const todayIst = todayStr();
  const [y, m, d] = todayIst.split('-').map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)); // noon UTC = stable across TZs
  for (let i = count - 1; i >= 0; i--) {
    const dt = new Date(anchor);
    dt.setUTCDate(anchor.getUTCDate() - i);
    out.push(`${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`);
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
  // Inside the grid view, teachers can toggle between two marking styles:
  //   - 'ROSTER': simple per-student rows with big P / A / H buttons
  //     (default — fast for daily marking on phone)
  //   - 'GRID':   full month-long calendar grid (overview / read-only past)
  const [markMode, setMarkMode]       = useState<'ROSTER' | 'GRID'>('ROSTER');
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

  // Scroll date strip to today on mount. Earlier this used a single
  // useEffect + scrollIntoView which sometimes fired before the
  // strip's tile widths had settled, leaving the user pinned to the
  // oldest end of the range. useLayoutEffect + double-rAF gives the
  // layout two paint frames to stabilise; the sync set before that
  // covers the fast-layout case so the strip never visibly snaps.
  useLayoutEffect(() => {
    if (!stripRef.current) return;
    const el = stripRef.current;
    el.scrollLeft = el.scrollWidth;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!stripRef.current) return;
        const todayEl = stripRef.current.querySelector('[data-today="true"]') as HTMLElement | null;
        if (todayEl) {
          todayEl.scrollIntoView({ behavior: 'auto', inline: 'end', block: 'nearest' });
        } else {
          stripRef.current.scrollLeft = stripRef.current.scrollWidth;
        }
      });
    });
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

  // Per-student setter used by the ROSTER mode buttons. Same edit-window
  // rule as toggleCell: only today, only when the day isn't already
  // approved/pending. Different from toggleCell which advances through
  // present → absent → … via NEXT_STATUS — here we set explicitly so
  // each button maps to a single status.
  const setCellStatus = (stuId: string, status: AttendanceCellStatus) => {
    if (!canMarkToday) return;
    setEditBuffer(prev => ({
      ...prev,
      [todayDateStr]: { ...(prev[todayDateStr] ?? {}), [stuId]: status },
    }));
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
      showToast('Attendance saved & locked');
      setEditBuffer(prev => { const n = { ...prev }; delete n[todayDateStr]; return n; });
      // Refresh today's status badge BEFORE navigating away so the
      // class card's pill flips to "Marked" without the user having
      // to open the class again.
      const map = await teacherService.getStatusForClass(selectedClass.id, [todayDateStr]);
      setTodayStatuses(t => ({ ...t, [selectedClass.id]: map[todayDateStr] ?? 'APPROVED' }));
      // Bounce back to the class list — earlier we re-loaded the
      // grid here, which left the teacher staring at a month-grid
      // they had no business editing (it's auto-locked the moment
      // they saved). Class list shows "Marked" on the card so they
      // know the save landed; grid was just visual noise post-save.
      setView('CLASSES');
      setSelectedClass(null);
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
    <div className="w-full lg:max-w-6xl lg:mx-auto bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-3 pt-2 pb-2 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="p-1.5 -ml-1 bg-slate-100 rounded-full text-slate-600">
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0">
            <h2 className="text-base font-black text-slate-900 uppercase tracking-tight">Attendance</h2>
            <p className="text-[9px] font-bold text-slate-400">Today's column is editable</p>
          </div>
        </div>

        {/* Date strip — same style as principal's staff attendance */}
        <div ref={stripRef} className="flex gap-2 overflow-x-auto hide-scrollbar pt-2 pb-0.5">
          {dateStrip.map(d => {
            const isToday = d === todayStr();
            const isPicked = d === targetDate;
            return (
              <button
                key={d}
                data-today={isToday}
                onClick={() => {
                  // Only TODAY auto-opens the grid in single-class mode.
                  // Tapping a past date used to launch the editable grid
                  // and confused teachers into thinking they could fix
                  // missed marks — corrections actually go through the
                  // principal in Editor Mode. Past tap is now a no-op for
                  // selection only; teacher still taps the class card if
                  // they want to view the month's grid read-only.
                  setTargetDate(d);
                  if (classes.length === 1 && isToday) {
                    setSelectedClass(classes[0]);
                    setGridYM(d.slice(0, 7));
                    setView('GRID');
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
                  {stripClassPrefix(cls.className)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold text-slate-900 text-sm">{cls.className}-{cls.section}</div>
                  <div className="text-[10px] font-bold text-slate-400 mt-0.5">{cls.subject} · {cls.studentCount} students</div>
                </div>
                {status === 'NOT_MARKED' && (
                  <span className="text-[9px] font-black text-blue-700 bg-blue-50 border border-blue-100 px-2 py-1 rounded-full uppercase">Mark Today</span>
                )}
                {(status === 'PENDING' || status === 'APPROVED') && (
                  <span className="flex items-center gap-1 text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full uppercase">
                    <Lock size={9}/> Locked
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
        {/* Header — compact so the grid gets more vertical space. */}
        <div className="bg-white border-b border-slate-100 px-3 pt-2 pb-1.5 sticky top-0 z-10 shadow-sm">
          <div className="flex items-center gap-2 mb-1.5">
            <button onClick={() => { setView('CLASSES'); setEditBuffer({}); }} className="p-1.5 -ml-1 bg-slate-100 rounded-full text-slate-600">
              <ArrowLeft size={16} />
            </button>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-black text-slate-900 uppercase tracking-tight truncate">{selectedClass.className}-{selectedClass.section}</h2>
              <p className="text-[9px] font-bold text-slate-400">{selectedClass.subject} · {selectedClass.studentCount} students</p>
            </div>
            {gridLoading && <RefreshCw size={14} className="text-slate-400 animate-spin"/>}
          </div>

          {/* Mode toggle + month nav in one compact row */}
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="inline-flex bg-slate-100 rounded-lg p-0.5 text-[10px] font-black">
              <button onClick={() => setMarkMode('ROSTER')}
                className={`px-2.5 py-1 rounded-md uppercase tracking-widest transition-colors ${markMode === 'ROSTER' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
                Today
              </button>
              <button onClick={() => setMarkMode('GRID')}
                className={`px-2.5 py-1 rounded-md uppercase tracking-widest transition-colors ${markMode === 'GRID' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
                Month
              </button>
            </div>
            {markMode === 'GRID' && (
              <div className="flex items-center gap-1.5">
                <button onClick={() => changeMonth(-1)} className="p-1 bg-slate-100 rounded-lg text-slate-600 active:scale-95">
                  <ChevronLeft size={13} />
                </button>
                <div className="font-black text-slate-900 text-xs tabular-nums">{fmtMonthLabel(gridYM)}</div>
                <button onClick={() => changeMonth(1)} disabled={gridYM >= currentYearMonth()}
                  className="p-1 bg-slate-100 rounded-lg text-slate-600 active:scale-95 disabled:opacity-30">
                  <ChevronRight size={13} />
                </button>
              </div>
            )}
          </div>

          {/* Bulk actions — small inline pills with subtle tinted backgrounds
              instead of full-width slab buttons. Saves vertical space and
              reads as "shortcuts" rather than the dominant action (which is
              the per-student row buttons below). */}
          {gridYM === currentYearMonth() && (!todayRec || todayRec.approvalStatus === 'REJECTED') && (
            <div className="pb-1 flex items-center gap-1.5">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 mr-0.5">Set all:</span>
              <button onClick={() => { initTodayBuffer(); bulkSetToday('present'); }}
                className="flex items-center gap-1 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-[10px] font-black rounded-full active:scale-95 transition-all">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"/>Present
              </button>
              <button onClick={() => { initTodayBuffer(); bulkSetToday('absent'); }}
                className="flex items-center gap-1 px-2.5 py-1 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-[10px] font-black rounded-full active:scale-95 transition-all">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"/>Absent
              </button>
              <button onClick={() => { initTodayBuffer(); bulkSetToday('holiday'); }}
                className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 text-[10px] font-black rounded-full active:scale-95 transition-all">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"/>Holiday
              </button>
            </div>
          )}

          {/* Rejection banner stays — it's an actionable state, not a
              passive "already locked" hint. */}
          {todayRec && todayRec.approvalStatus === 'REJECTED' && (
            <div className="pb-1 flex items-center gap-2 bg-rose-50 border border-rose-100 rounded-lg px-2.5 py-1.5">
              <AlertCircle size={11} className="text-rose-500 shrink-0"/>
              <span className="text-[10px] font-bold text-rose-700 flex-1">Rejected — please re-submit</span>
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

        {/* Body — ROSTER (per-student rows) or GRID (month table). The
            two modes share the same editBuffer + submit flow, so saving
            and the bottom Save & Lock bar work identically. */}
        <div className="flex-1 overflow-hidden">
          {gridLoading ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden m-3">
              <SkeletonRow count={6} />
            </div>
          ) : markMode === 'ROSTER' ? (
            <div className="overflow-auto h-full">
              {filteredStudents.length === 0 ? (
                <div className="flex items-center justify-center py-16 text-slate-400 font-bold text-sm">No students</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredStudents.map(stu => {
                    const status = cellStatus(todayDateStr, stu.id);
                    const isPresent = status === 'present';
                    const isAbsent  = status === 'absent';
                    const isHoliday = status === 'holiday';
                    const lockedToday = !canMarkToday;
                    return (
                      <div key={stu.id} className="flex items-center gap-2.5 px-3 py-2.5 bg-white">
                        <div className="flex-1 min-w-0">
                          <div className="font-extrabold text-slate-900 text-sm truncate">{stu.name}</div>
                          <div className="text-[10px] font-bold text-slate-400">Roll {stu.rollNo || '—'}</div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => setCellStatus(stu.id, 'present')} disabled={lockedToday}
                            className={`w-10 h-10 rounded-xl font-black text-sm flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 ${
                              isPresent
                                ? 'bg-emerald-500 text-white shadow-md ring-2 ring-emerald-300'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                            }`}>P</button>
                          <button onClick={() => setCellStatus(stu.id, 'absent')} disabled={lockedToday}
                            className={`w-10 h-10 rounded-xl font-black text-sm flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 ${
                              isAbsent
                                ? 'bg-rose-500 text-white shadow-md ring-2 ring-rose-300'
                                : 'bg-rose-50 text-rose-700 border border-rose-100'
                            }`}>A</button>
                          <button onClick={() => setCellStatus(stu.id, 'holiday')} disabled={lockedToday}
                            className={`w-10 h-10 rounded-xl font-black text-sm flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 ${
                              isHoliday
                                ? 'bg-slate-500 text-white shadow-md ring-2 ring-slate-300'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}>H</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
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
                              // Locked columns get cursor-default + a faint
                              // striped tint so the teacher reads the column
                              // as "view only" before they ever try to tap.
                              className={`border-b border-r border-slate-100 text-center px-0.5 py-1 min-w-[34px] ${
                                editable ? 'cursor-pointer active:scale-90' : 'cursor-default bg-slate-50/40'
                              }`}
                              title={locked ? 'View only — past attendance' : ''}
                              onClick={() => toggleCell(d, stu.id)}>
                              <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-[9px] font-black transition-colors ${bg} ${locked && st ? 'opacity-70 grayscale-[0.15]' : ''}`}>
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
              {isSubmitting ? 'Saving…' : <><Save size={16}/> Save &amp; Lock</>}
            </button>
          </div>
        )}
      </div>
    );
  }

  return null;
};
