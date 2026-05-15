import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AttendanceCellStatus } from '@/modules/attendance/attendance.service';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { useAcademicYear } from '@/shared/context/AcademicYearContext';
import { todayIST } from '@/shared/utils/date';

interface Props {
  studentId: string;
}

// Half-day was removed from the student attendance flow (principal can no
// longer mark a student as half-day). The 'half' key is still part of the
// shared type because staff attendance uses it. Any legacy 'half' rows for
// students are rendered as PRESENT here so percentages don't surprise.
const CELL_LABEL: Record<AttendanceCellStatus, string> = {
  present: 'P', absent: 'A', holiday: 'H', half: 'P',
};
const CELL_BG: Record<AttendanceCellStatus, string> = {
  present: 'bg-emerald-500 text-white',
  absent: 'bg-rose-500 text-white',
  holiday: 'bg-slate-200 text-slate-600',
  half: 'bg-emerald-500 text-white',
};

// IST-aware today; UTC-based was rolling forward late evening.
const todayStr = () => todayIST();
function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function buildMonthDates(ym: string, yearStart?: string, yearEnd?: string): string[] {
  const [y, m] = ym.split('-').map(Number);
  const today = todayStr();
  const ceiling = yearEnd && yearEnd < today ? yearEnd : today;
  const floor = yearStart ?? '0000-01-01';
  const out: string[] = [];
  const dim = new Date(y, m, 0).getDate();
  for (let d = 1; d <= dim; d++) {
    const ds = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (ds >= floor && ds <= ceiling) out.push(ds);
  }
  return out;
}
function fmtDay(d: string) {
  return String(new Date(d).getDate());
}
function fmtDayShort(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { weekday: 'narrow' });
}
function fmtMonthLabel(ym: string) {
  return new Date(ym + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export const StudentAttendanceTab: React.FC<Props> = ({ studentId }) => {
  const { showToast } = useUIStore();
  const { currentYear } = useAcademicYear();
  const session = useAuthStore(s => s.session);

  const [gridYM, setGridYM] = useState(currentYearMonth());
  const [gridDates, setGridDates] = useState<string[]>([]);
  // Pre-built map: ISO date → cell status. Populated by a direct query to
  // attendance_student_details for this student. Earlier this component used
  // sharedAttendance.getAll() and tried to find the student inside the
  // returned record — but that API only returns header rows (totals), so
  // r.students was always empty and every cell rendered as "—" no matter
  // how much real attendance had been marked.
  const [dateStatusMap, setDateStatusMap] = useState<Record<string, AttendanceCellStatus>>({});
  const [gridLoading, setGridLoading] = useState(false);

  // Clamp gridYM to academic year bounds
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

  // Request token so a slower load (e.g. tapping month-back twice
  // quickly) can't land its results onto a newer month's column header.
  // Without this, older month's per-day P/A statuses ended up displayed
  // under the newer month's dates.
  const monthLoadIdRef = React.useRef(0);

  const loadMonth = async (ym: string, requestId: number) => {
    const dates = currentYear
      ? buildMonthDates(ym, currentYear.startDate, currentYear.endDate)
      : buildMonthDates(ym);
    if (requestId !== monthLoadIdRef.current) return;
    setGridDates(dates);

    if (!currentYear || !studentId || !session?.schoolId) {
      setDateStatusMap({});
      return;
    }

    setGridLoading(true);
    try {
      const [y, m] = ym.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const monthStart = `${ym}-01`;
      const monthEnd   = `${ym}-${String(lastDay).padStart(2, '0')}`;

      const { data: records, error: recErr } = await supabase
        .from('attendance_records')
        .select('id, date')
        .eq('school_id', session.schoolId)
        .eq('academic_year_id', currentYear.id)
        .gte('date', monthStart)
        .lte('date', monthEnd);
      if (recErr) throw new Error(recErr.message);
      if (requestId !== monthLoadIdRef.current) return;

      const recRows = (records ?? []) as Array<{ id: string; date: string }>;
      if (recRows.length === 0) {
        setDateStatusMap({});
        return;
      }

      const idToDate = new Map<string, string>();
      recRows.forEach(r => idToDate.set(r.id, r.date));

      const { data: details, error: detErr } = await supabase
        .from('attendance_student_details')
        .select('attendance_id, is_present, status')
        .eq('student_id', studentId)
        .in('attendance_id', recRows.map(r => r.id));
      if (detErr) throw new Error(detErr.message);
      if (requestId !== monthLoadIdRef.current) return;

      const next: Record<string, AttendanceCellStatus> = {};
      for (const r of (details ?? []) as Array<{
        attendance_id: string; is_present: boolean; status: string | null;
      }>) {
        const date = idToDate.get(r.attendance_id);
        if (!date) continue;
        const cell: AttendanceCellStatus =
          (r.status as AttendanceCellStatus | null) ??
          (r.is_present ? 'present' : 'absent');
        next[date] = cell;
      }
      setDateStatusMap(next);
    } catch (e) {
      if (requestId !== monthLoadIdRef.current) return;
      showToast(e instanceof Error ? e.message : 'Failed to load attendance', 'error');
    } finally {
      if (requestId === monthLoadIdRef.current) setGridLoading(false);
    }
  };

  useEffect(() => {
    const id = ++monthLoadIdRef.current;
    loadMonth(gridYM, id);
  }, [gridYM, studentId, currentYear?.id, session?.schoolId]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeMonth = (delta: number) => {
    const [y, m] = gridYM.split('-').map(Number);
    const nd = new Date(y, m - 1 + delta, 1);
    const nm = `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}`;
    if (nm > currentYearMonth()) return;
    if (currentYear?.startDate) {
      const yearStartYM = currentYear.startDate.slice(0, 7);
      if (nm < yearStartYM) return;
    }
    setGridYM(nm);
  };

  // dateStatusMap is now populated directly inside loadMonth() from a
  // single query against attendance_student_details. Earlier this section
  // re-derived it from sharedAttendance.getAll() rows that never carried
  // student-level data — the lookup always missed and every cell rendered
  // as "—".

  // Calculate monthly stats. Legacy 'half' rows count as PRESENT — see
  // CELL_LABEL comment above. Half-day is no longer a student concept.
  const monthStats = gridDates.reduce(
    (acc, date) => {
      const status = dateStatusMap[date];
      if (!status) {
        acc.notMarked++;
      } else if (status === 'present' || status === 'half') {
        acc.present++;
      } else if (status === 'absent') {
        acc.absent++;
      } else if (status === 'holiday') {
        acc.holiday++;
      }
      return acc;
    },
    { present: 0, absent: 0, holiday: 0, notMarked: 0 }
  );

  const workingDays = gridDates.length - monthStats.holiday;
  const attendancePercent = workingDays > 0 ? Math.round((monthStats.present / workingDays) * 100) : 0;

  if (gridLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-6 h-6 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Month selector */}
      <div className="flex items-center justify-between px-4 py-3 bg-white rounded-2xl border border-slate-100">
        <button onClick={() => changeMonth(-1)} className="p-1 hover:bg-slate-50 rounded-lg">
          <ChevronLeft size={18} className="text-slate-600" />
        </button>
        <div className="text-sm font-black text-slate-900">{fmtMonthLabel(gridYM)}</div>
        <button onClick={() => changeMonth(1)} className="p-1 hover:bg-slate-50 rounded-lg">
          <ChevronRight size={18} className="text-slate-600" />
        </button>
      </div>

      {/* Stats row — Half-day chip removed; students don't get half-day. */}
      <div className="grid grid-cols-4 gap-2 px-4">
        <div className="bg-white rounded-xl border border-emerald-100 p-3 text-center">
          <div className="text-lg font-black text-emerald-600">{monthStats.present}</div>
          <div className="text-[9px] font-bold text-slate-400">Present</div>
        </div>
        <div className="bg-white rounded-xl border border-rose-100 p-3 text-center">
          <div className="text-lg font-black text-rose-600">{monthStats.absent}</div>
          <div className="text-[9px] font-bold text-slate-400">Absent</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 p-3 text-center">
          <div className="text-lg font-black text-slate-600">{monthStats.holiday}</div>
          <div className="text-[9px] font-bold text-slate-400">Holiday</div>
        </div>
        <div className={`bg-white rounded-xl border p-3 text-center ${
          attendancePercent >= 75 ? 'border-emerald-100' : 'border-rose-100'
        }`}>
          <div className={`text-lg font-black ${
            attendancePercent >= 75 ? 'text-emerald-600' : 'text-rose-600'
          }`}>{attendancePercent}%</div>
          <div className="text-[9px] font-bold text-slate-400">Attend.</div>
        </div>
      </div>

      {/* Grid — single horizontal scroll container so the date strip and
          the status row scroll in lockstep. Earlier they sat in two
          separate `overflow-x-auto` divs and drifted apart on touch
          scroll, making it impossible to tell which date a status belonged
          to. */}
      <div className="px-4 pb-4">
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto hide-scrollbar">
            {/* Inner shrink-wrap forces both rows to the same width so they
                share the parent's scroll position. */}
            <div className="inline-block min-w-full">
              {/* Header with dates */}
              <div className="flex">
                <div className="w-12 border-r border-slate-100 bg-slate-50 flex items-center justify-center font-bold text-[9px] text-slate-400 shrink-0 py-2">
                  Day
                </div>
                {gridDates.map(date => (
                  <div key={date} className="w-10 border-r border-slate-100 flex flex-col items-center justify-center py-2 shrink-0 last:border-r-0">
                    <div className="text-[9px] font-bold text-slate-600">{fmtDay(date)}</div>
                    <div className="text-[8px] font-bold text-slate-400">{fmtDayShort(date)}</div>
                  </div>
                ))}
              </div>

              {/* Data row */}
              <div className="flex border-t border-slate-100">
                <div className="w-12 border-r border-slate-100 bg-slate-50 flex items-center justify-center shrink-0 py-3" />
                {gridDates.map(date => {
                  const status = dateStatusMap[date];
                  return (
                    <div key={date} className="w-10 border-r border-slate-100 flex items-center justify-center shrink-0 last:border-r-0 py-3">
                      {status ? (
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black ${CELL_BG[status]}`}>
                          {CELL_LABEL[status]}
                        </div>
                      ) : (
                        <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center text-[10px] font-bold">—</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="px-4 flex gap-2 flex-wrap text-[10px]">
        {[
          { label: 'Present', color: 'bg-emerald-500' },
          { label: 'Absent', color: 'bg-rose-500' },
          { label: 'Holiday', color: 'bg-slate-200' },
          { label: 'Half Day', color: 'bg-amber-400' },
        ].map(({ label, color }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded ${color}`} />
            <span className="font-bold text-slate-500">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
