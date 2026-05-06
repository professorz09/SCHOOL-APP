import React, { useEffect, useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { sharedAttendance, SharedAttendanceRecord, AttendanceCellStatus } from '@/modules/attendance/attendance.service';
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

  const [gridYM, setGridYM] = useState(currentYearMonth());
  const [gridDates, setGridDates] = useState<string[]>([]);
  const [allRecords, setAllRecords] = useState<SharedAttendanceRecord[]>([]);
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

  const loadMonth = async (ym: string) => {
    if (!currentYear) return;
    setGridLoading(true);
    try {
      const dates = buildMonthDates(ym, currentYear.startDate, currentYear.endDate);
      setGridDates(dates);

      const records = await sharedAttendance.getAll();
      setAllRecords(records);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load attendance', 'error');
    } finally {
      setGridLoading(false);
    }
  };

  useEffect(() => {
    loadMonth(gridYM);
  }, [gridYM, studentId, currentYear?.id]);

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

  // Filter records for this student in this month
  const monthRecords = useMemo(() => {
    const monthStart = gridYM + '-01';
    // Real last-day for the month; previously hardcoded '-31' silently
    // included invalid dates and disagreed with the grid on 30-day months.
    const [y, m] = gridYM.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const monthEnd = `${gridYM}-${String(lastDay).padStart(2, '0')}`;
    return allRecords.filter(r => {
      const match = r.students.find(s => s.id === studentId);
      return match && r.date >= monthStart && r.date <= monthEnd;
    });
  }, [allRecords, studentId, gridYM]);

  // Build date-to-status map for this student
  const dateStatusMap = useMemo(() => {
    const map: Record<string, AttendanceCellStatus> = {};
    for (const record of monthRecords) {
      const student = record.students.find(s => s.id === studentId);
      if (student) {
        map[record.date] = student.status;
      }
    }
    return map;
  }, [monthRecords, studentId]);

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

      {/* Grid */}
      <div className="px-4 pb-4">
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          {/* Header with dates */}
          <div className="flex overflow-x-auto hide-scrollbar">
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
          <div className="flex border-t border-slate-100 overflow-x-auto hide-scrollbar">
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
