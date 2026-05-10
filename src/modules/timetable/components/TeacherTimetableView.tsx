import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Clock, MapPin, BookOpen, Coffee, Sparkles } from 'lucide-react';
import { teacherService } from '@/roles/teacher/teacher.service';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';

interface Props { onBack: () => void; }

type TDay = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';
const DAYS: TDay[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const DAY_SHORT: Record<TDay, string> = {
  Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed',
  Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat',
};

interface RawEntry {
  id: string; classId: string; className: string; section: string;
  day: string; slotId: string; subject: string; room: string;
}

interface Slot {
  slotId: string; label: string; startTime: string; endTime: string;
  type: string; sortOrder: number;
}

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

const isPast = (endTime: string): boolean => {
  const now = new Date();
  const [eh, em] = endTime.split(':').map(Number);
  return now.getHours() * 60 + now.getMinutes() > eh * 60 + em;
};

const todayDayName = (): TDay => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const n = days[new Date().getDay()];
  return (n === 'Sunday' ? 'Monday' : n) as TDay;
};

export const TeacherTimetableView: React.FC<Props> = ({ onBack }) => {
  const session = useAuthStore(s => s.session);
  const showToast = useUIStore(s => s.showToast);
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
          type: p.type, sortOrder: p.sortOrder,
        })));
      } catch (e) {
        // Surface — earlier this had try/finally only. A teacher
        // with bad network saw the spinner stop with no error and
        // an empty timetable, assuming they have no classes today.
        if (!cancelled) {
          showToast(e instanceof Error ? e.message : 'Could not load timetable', 'error');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Center today's pill in the day strip on first paint.
  useEffect(() => {
    if (!stripRef.current) return;
    const todayEl = stripRef.current.querySelector('[data-today="true"]');
    if (todayEl) (todayEl as HTMLElement).scrollIntoView({ behavior: 'auto', inline: 'center', block: 'nearest' });
  }, [isLoading]);

  // Map slotId → entry for the active day, so we can build a complete
  // timeline (every slot, even ones the teacher doesn't teach).
  const entriesBySlot = useMemo(() => {
    const m = new Map<string, RawEntry>();
    for (const e of entries) {
      if (e.day === activeDay) m.set(e.slotId, e);
    }
    return m;
  }, [entries, activeDay]);

  const dayCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of entries) m[e.day] = (m[e.day] ?? 0) + 1;
    return m;
  }, [entries]);

  // Slots in time-order. Each gets either an entry, a fixed-type label
  // (BREAK/LUNCH/ASSEMBLY), or "Free" for class slots without an entry.
  const orderedSlots = useMemo(() =>
    [...slots].sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [slots],
  );

  const teacherName = session?.name ?? 'Teacher';
  const teacherInitials = teacherName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const todayTeachingCount = dayCounts[todayDay] ?? 0;

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300 min-h-screen">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-100 px-4 lg:px-8 pt-4 lg:pt-6 pb-3 lg:pb-4 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3 mb-4 lg:max-w-5xl lg:mx-auto lg:w-full">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 border-2 border-blue-200 flex items-center justify-center font-black text-sm shrink-0">
            {teacherInitials}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl lg:text-2xl font-black text-slate-900 uppercase tracking-tight leading-none">
              My Timetable
            </h2>
            <p className="text-[10px] lg:text-xs font-bold text-slate-400 mt-1">
              {todayTeachingCount} period{todayTeachingCount === 1 ? '' : 's'} today · {entries.length} this week
            </p>
          </div>
        </div>

        {/* ── Day strip ── */}
        <div ref={stripRef} className="flex gap-2 overflow-x-auto hide-scrollbar lg:max-w-5xl lg:mx-auto lg:w-full pb-1">
          {DAYS.map(day => {
            const isToday  = day === todayDay;
            const isActive = day === activeDay;
            const count    = dayCounts[day] ?? 0;
            return (
              <button
                key={day}
                data-today={isToday}
                onClick={() => setActiveDay(day)}
                className={`shrink-0 flex flex-col items-center px-5 py-3 rounded-2xl min-w-[80px] transition-all active:scale-95 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                    : isToday
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'bg-slate-50 text-slate-600 border border-slate-100'
                }`}
              >
                <span className="text-sm font-black uppercase tracking-widest leading-none">
                  {DAY_SHORT[day]}
                </span>
                <span className={`text-[9px] font-black mt-1.5 leading-none ${
                  count === 0
                    ? isActive ? 'text-blue-200' : 'text-slate-300'
                    : isActive ? 'text-blue-100' : isToday ? 'text-blue-500' : 'text-slate-400'
                }`}>
                  {count > 0 ? `${count} cls` : '—'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Timeline ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-8 lg:max-w-5xl lg:mx-auto lg:w-full space-y-2">
        {isLoading ? (
          <div className="flex flex-col items-center py-20 text-slate-400">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin mb-3" />
            <p className="font-bold text-sm">Loading…</p>
          </div>
        ) : orderedSlots.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center">
            <BookOpen size={32} className="mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-black text-slate-500">No periods set up</p>
            <p className="text-[11px] font-bold text-slate-400 mt-1">Ask the principal to configure period slots first.</p>
          </div>
        ) : (
          <>
            <p className="text-[10px] lg:text-xs font-black uppercase tracking-widest text-slate-400 px-1 mb-3">
              {activeDay} schedule
            </p>

            {/* Vertical timeline rail. Each slot gets a dot on the left rail
                (color-coded by status) connected by a continuous line. The
                card body lives to the right. */}
            <div className="relative pl-8 lg:pl-10">
              <div className="absolute left-3 lg:left-4 top-1.5 bottom-1.5 w-px bg-slate-200" />

              <div className="space-y-3">
                {orderedSlots.map(slot => {
                  const entry = entriesBySlot.get(slot.slotId);
                  const isFixed = slot.type === 'BREAK' || slot.type === 'LUNCH' || slot.type === 'ASSEMBLY';
                  const hasClass = !!entry;
                  const live = activeDay === todayDay && isCurrentPeriod(slot.startTime, slot.endTime);
                  const past = activeDay === todayDay && isPast(slot.endTime);

                  const dotColor = live
                    ? 'bg-emerald-500 ring-emerald-100'
                    : hasClass
                      ? 'bg-blue-500 ring-blue-100'
                      : isFixed
                        ? slot.type === 'LUNCH'
                          ? 'bg-amber-400 ring-amber-100'
                          : 'bg-violet-400 ring-violet-100'
                        : 'bg-slate-300 ring-slate-100';
                  const cardClass = live
                    ? 'bg-emerald-50/40 border-emerald-200'
                    : hasClass
                      ? 'bg-white border-slate-100'
                      : isFixed
                        ? 'bg-amber-50/30 border-amber-100'
                        : 'bg-slate-50 border-slate-100';
                  const dimmed = past && !live;

                  return (
                    <div key={slot.slotId} className="relative">
                      {/* Dot on the rail */}
                      <div
                        className={`absolute -left-[26px] lg:-left-[28px] top-3 w-4 h-4 rounded-full ring-4 ${dotColor} ${live ? 'animate-pulse' : ''}`}
                      />
                      {/* Card */}
                      <div className={`rounded-2xl border shadow-sm overflow-hidden ${cardClass} ${dimmed ? 'opacity-60' : ''}`}>
                        <div className="px-3 lg:px-4 py-3 flex items-center gap-3 lg:gap-4">
                          {/* Time block */}
                          <div className="shrink-0 w-20 lg:w-24">
                            <div className="text-[11px] lg:text-xs font-black text-slate-900 leading-none">
                              {fmtTime(slot.startTime)}
                            </div>
                            <div className="text-[10px] lg:text-[11px] font-bold text-slate-400 leading-none mt-1">
                              {fmtTime(slot.endTime)}
                            </div>
                          </div>

                          <div className="w-px self-stretch bg-slate-100" />

                          {/* Body */}
                          <div className="flex-1 min-w-0">
                            {hasClass ? (
                              <>
                                <div className="font-black text-sm lg:text-base uppercase tracking-tight truncate text-slate-900">
                                  {entry.subject || 'Class'}
                                </div>
                                <div className="flex items-center gap-2 lg:gap-3 mt-1 flex-wrap">
                                  <span className="text-[10px] lg:text-[11px] font-black px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                                    {entry.className}-{entry.section}
                                  </span>
                                  {entry.room && (
                                    <span className="flex items-center gap-1 text-[10px] lg:text-[11px] font-bold text-slate-500">
                                      <MapPin size={10} /> {entry.room}
                                    </span>
                                  )}
                                </div>
                              </>
                            ) : isFixed ? (
                              <>
                                <div className="flex items-center gap-2 font-black text-sm lg:text-base uppercase tracking-tight text-slate-700">
                                  {slot.type === 'LUNCH'
                                    ? <Coffee size={14} className="text-amber-500" />
                                    : <Sparkles size={14} className="text-violet-500" />}
                                  {slot.label}
                                </div>
                                <div className="text-[10px] lg:text-[11px] font-bold text-slate-400 mt-1">
                                  {slot.type === 'LUNCH' ? 'Lunch break' : slot.type === 'BREAK' ? 'Short break' : 'Assembly'}
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="font-black text-sm lg:text-base uppercase tracking-tight text-slate-400">
                                  Free period
                                </div>
                                <div className="text-[10px] lg:text-[11px] font-bold text-slate-400 mt-1">
                                  {slot.label} · No class assigned to you
                                </div>
                              </>
                            )}
                          </div>

                          {/* Right badges */}
                          <div className="shrink-0 flex items-center">
                            {live ? (
                              <span className="text-[9px] font-black bg-emerald-500 text-white px-2.5 py-1 rounded-full uppercase tracking-widest animate-pulse">
                                Live
                              </span>
                            ) : past ? (
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                Done
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
