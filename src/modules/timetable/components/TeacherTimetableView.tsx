import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Clock, MapPin, BookOpen } from 'lucide-react';
import { teacherService } from '@/roles/teacher/teacher.service';
import { useAuthStore } from '@/store/authStore';

interface Props { onBack: () => void; }

type TDay = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';
const DAYS: TDay[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface RawEntry {
  id: string; classId: string; className: string; section: string;
  day: string; slotId: string; subject: string; room: string;
}

interface Slot {
  slotId: string; label: string; startTime: string; endTime: string;
}

// Build the date for each weekday of the current week (Mon–Sat)
const buildWeekDates = (): Record<TDay, { date: string; dayNum: number; monthShort: string }> => {
  const today = new Date();
  const dow = today.getDay(); // 0=Sun
  const map = {} as Record<TDay, { date: string; dayNum: number; monthShort: string }>;
  for (let i = 0; i < 6; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + (i + 1 - (dow === 0 ? 7 : dow)));
    map[DAYS[i]] = {
      date: d.toISOString().split('T')[0],
      dayNum: d.getDate(),
      monthShort: d.toLocaleDateString('en-IN', { month: 'short' }),
    };
  }
  return map;
};

const WEEK_DATES = buildWeekDates();

const todayDayName = (): TDay => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const n = days[new Date().getDay()];
  return (n === 'Sunday' ? 'Monday' : n) as TDay;
};

const DAY_SHORT: Record<TDay, string> = {
  Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed',
  Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat',
};

const fmtTime = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
};

const isCurrentPeriod = (startTime: string, endTime: string): boolean => {
  const now = new Date();
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  return nowMins >= sh * 60 + sm && nowMins < eh * 60 + em;
};

const periodDuration = (startTime: string, endTime: string): number => {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
};

export const TeacherTimetableView: React.FC<Props> = ({ onBack }) => {
  const session = useAuthStore(s => s.session);
  const todayDay = todayDayName();
  const [activeDay, setActiveDay] = useState<TDay>(todayDay);
  const [entries, setEntries] = useState<RawEntry[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const stripRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [week, periods] = await Promise.all([
          teacherService.getMyTimetable(),
          teacherService.getPeriodSlots(),
        ]);
        if (cancelled) return;
        setEntries(week);
        setSlots(periods.map(p => ({
          slotId: p.slotId, label: p.label,
          startTime: p.startTime, endTime: p.endTime,
        })));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Scroll today's card into view
  useEffect(() => {
    if (!stripRef.current) return;
    const todayEl = stripRef.current.querySelector('[data-today="true"]');
    if (todayEl) (todayEl as HTMLElement).scrollIntoView({ behavior: 'auto', inline: 'center', block: 'nearest' });
  }, [isLoading]);

  const slotMap = useMemo(() => {
    const m = new Map<string, Slot>();
    for (const s of slots) m.set(s.slotId, s);
    return m;
  }, [slots]);

  const dayCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of entries) m[e.day] = (m[e.day] ?? 0) + 1;
    return m;
  }, [entries]);

  const dayEntries = useMemo(() =>
    entries
      .filter(e => e.day === activeDay)
      .map(e => ({ ...e, slot: slotMap.get(e.slotId) }))
      .filter((e): e is RawEntry & { slot: Slot } => !!e.slot)
      .sort((a, b) => a.slot.startTime.localeCompare(b.slot.startTime)),
    [entries, activeDay, slotMap],
  );

  const teacherName = session?.name ?? 'Teacher';

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">

      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">My Timetable</h2>
            <p className="text-[10px] font-bold text-slate-400">{teacherName} · {entries.length} periods this week</p>
          </div>
        </div>

        {/* ── Day strip ── */}
        <div ref={stripRef} className="flex gap-2.5 overflow-x-auto hide-scrollbar pb-0.5">
          {DAYS.map(day => {
            const isToday   = day === todayDay;
            const isActive  = day === activeDay;
            const count     = dayCounts[day] ?? 0;

            return (
              <button
                key={day}
                data-today={isToday}
                onClick={() => setActiveDay(day)}
                className={`flex-shrink-0 flex flex-col items-center px-3 pt-2.5 pb-2 rounded-2xl min-w-[60px] transition-all active:scale-95 ${
                  isActive
                    ? 'bg-indigo-600 shadow-lg shadow-indigo-200'
                    : isToday
                    ? 'bg-indigo-50 border border-indigo-200'
                    : 'bg-slate-50 border border-slate-100'
                }`}
              >
                {/* Day short name */}
                <span className={`text-[10px] font-black uppercase tracking-widest ${
                  isActive ? 'text-indigo-200' : isToday ? 'text-indigo-500' : 'text-slate-400'
                }`}>
                  {DAY_SHORT[day]}
                </span>

                {/* Date number — big */}
                <span className={`text-2xl font-black leading-none mt-0.5 ${
                  isActive ? 'text-white' : isToday ? 'text-indigo-700' : 'text-slate-800'
                }`}>
                  {WEEK_DATES[day].dayNum}
                </span>

                {/* Month */}
                <span className={`text-[9px] font-bold mt-0.5 ${
                  isActive ? 'text-indigo-200' : isToday ? 'text-indigo-400' : 'text-slate-400'
                }`}>
                  {WEEK_DATES[day].monthShort}
                </span>

                {/* Period count badge */}
                <div className={`mt-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[9px] font-black ${
                  count === 0
                    ? isActive ? 'bg-white/10 text-white/50' : 'bg-slate-100 text-slate-300'
                    : isActive ? 'bg-white text-indigo-600' : 'bg-indigo-100 text-indigo-600'
                }`}>
                  {count}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Period list ── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin mb-3" />
            <p className="font-bold text-sm">Loading…</p>
          </div>
        ) : dayEntries.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <BookOpen size={40} className="mb-3 opacity-30" />
            <p className="font-bold text-sm">No classes on {activeDay}</p>
            <p className="text-xs mt-1 opacity-60">
              {activeDay === 'Saturday' ? 'Weekend — enjoy the break!' : 'Free day this week'}
            </p>
          </div>
        ) : (
          dayEntries.map((entry, idx) => {
            const live = activeDay === todayDay && isCurrentPeriod(entry.slot.startTime, entry.slot.endTime);
            const dur  = periodDuration(entry.slot.startTime, entry.slot.endTime);
            return (
              <div key={entry.id} className={`rounded-2xl border overflow-hidden transition-all ${
                live ? 'border-blue-300 shadow-lg shadow-blue-100' : 'border-slate-100 shadow-sm'
              }`}>
                {/* Top accent strip + time row */}
                <div className={`flex items-center justify-between px-4 py-2.5 ${
                  live ? 'bg-blue-500' : 'bg-indigo-600'
                }`}>
                  <div className="flex items-center gap-2">
                    <Clock size={11} className="text-white/70" />
                    <span className="text-[11px] font-black text-white">
                      {fmtTime(entry.slot.startTime)} – {fmtTime(entry.slot.endTime)}
                    </span>
                    <span className="text-[9px] font-bold text-white/50">{entry.slot.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {live && (
                      <span className="text-[8px] font-black bg-white text-blue-600 px-2 py-0.5 rounded-full uppercase animate-pulse">
                        Live
                      </span>
                    )}
                    <span className="text-[9px] font-black text-white/70">{dur} min</span>
                  </div>
                </div>

                {/* Period body */}
                <div className={`px-4 py-3 flex items-center gap-3 ${live ? 'bg-blue-50' : 'bg-white'}`}>
                  {/* Period index circle */}
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-black text-sm ${
                    live ? 'bg-blue-100 text-blue-600' : 'bg-indigo-50 text-indigo-600'
                  }`}>
                    {idx + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className={`font-black text-base truncate ${live ? 'text-blue-900' : 'text-slate-900'}`}>
                      {entry.subject || 'Class'}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                        live ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {entry.className}-{entry.section}
                      </span>
                      {entry.room && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                          <MapPin size={9} /> {entry.room}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* ── Weekly summary card ── */}
        {!isLoading && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mt-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Weekly Load</p>
            <div className="space-y-2.5">
              {DAYS.map(day => {
                const count   = dayCounts[day] ?? 0;
                const isToday = day === todayDay;
                const maxPeriods = Math.max(...DAYS.map(d => dayCounts[d] ?? 0), 1);
                return (
                  <button key={day} onClick={() => setActiveDay(day)}
                    className="w-full flex items-center gap-3 active:scale-[0.98] transition-transform">
                    <span className={`text-[10px] font-black w-8 shrink-0 ${
                      isToday ? 'text-indigo-600' : 'text-slate-500'
                    }`}>
                      {DAY_SHORT[day]}
                    </span>
                    <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                      <div
                        className={`h-2.5 rounded-full transition-all ${
                          activeDay === day ? 'bg-indigo-500' : isToday ? 'bg-indigo-300' : 'bg-slate-300'
                        }`}
                        style={{ width: count > 0 ? `${Math.round((count / maxPeriods) * 100)}%` : '4px' }}
                      />
                    </div>
                    <span className={`text-[10px] font-black w-5 text-right shrink-0 ${
                      count > 0 ? 'text-slate-600' : 'text-slate-300'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
