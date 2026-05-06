import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Clock, MapPin, BookOpen, Coffee, Sparkles, Sun } from 'lucide-react';
import { studentDashboardService } from '@/modules/students/studentDashboard.service';
import { TimetableDay, TimetablePeriod, PeriodType } from '@/roles/student/student-role.types';
import { useUIStore } from '@/store/uiStore';

interface Props { onBack: () => void; }

// Sunday is treated as a fixed weekly holiday — most schools in India follow
// this. The day strip shows it as "OFF" so students aren't confused about
// missing periods.
const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
type WeekDay = typeof WEEK_DAYS[number];

const DAY_SHORT: Record<WeekDay, string> = {
  Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed',
  Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun',
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

const isPast = (endTime: string): boolean => {
  const now = new Date();
  const [eh, em] = endTime.split(':').map(Number);
  return now.getHours() * 60 + now.getMinutes() > eh * 60 + em;
};

const todayDayName = (): WeekDay => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[new Date().getDay()] as WeekDay;
};

export const TimetableView: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const today = todayDayName();
  const initialDay: WeekDay = today === 'Sunday' ? 'Monday' : today;
  const [activeDay, setActiveDay] = useState<WeekDay>(initialDay);
  const [days, setDays] = useState<TimetableDay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const stripRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tt = await studentDashboardService.getTimetable();
        if (!cancelled) setDays(tt);
      } catch (e) {
        if (!cancelled) showToast((e as Error).message || 'Failed to load timetable', 'error');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [showToast]);

  // Center today in the day strip on first paint.
  useEffect(() => {
    if (!stripRef.current) return;
    const todayEl = stripRef.current.querySelector('[data-today="true"]');
    if (todayEl) (todayEl as HTMLElement).scrollIntoView({ behavior: 'auto', inline: 'center', block: 'nearest' });
  }, [isLoading]);

  // Per-day period count for the day strip subtitle.
  const dayCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of days) {
      m[d.day] = d.periods.filter(p => p.type === 'CLASS' && p.subject && p.subject !== 'Free').length;
    }
    return m;
  }, [days]);

  const dayData = days.find(d => d.day === activeDay);
  const periods: TimetablePeriod[] = dayData?.periods ?? [];

  const renderHeader = () => (
    <div className="bg-white border-b border-slate-100 px-4 lg:px-8 pt-4 lg:pt-6 pb-3 lg:pb-4 sticky top-0 z-10 shadow-sm">
      <div className="flex items-center gap-3 mb-4 lg:max-w-5xl lg:mx-auto lg:w-full">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl lg:text-2xl font-black text-slate-900 uppercase tracking-tight leading-none">
            Timetable
          </h2>
          <p className="text-[10px] lg:text-xs font-bold text-slate-400 mt-1">
            Weekly schedule · Sunday is a holiday
          </p>
        </div>
      </div>

      {/* Day strip */}
      <div ref={stripRef} className="flex gap-2 overflow-x-auto hide-scrollbar lg:max-w-5xl lg:mx-auto lg:w-full pb-1">
        {WEEK_DAYS.map(day => {
          const isToday   = day === today;
          const isActive  = day === activeDay;
          const isHoliday = day === 'Sunday';
          const count     = dayCounts[day] ?? 0;
          return (
            <button
              key={day}
              data-today={isToday}
              onClick={() => setActiveDay(day)}
              className={`shrink-0 flex flex-col items-center px-5 py-3 rounded-2xl min-w-[80px] transition-all active:scale-95 ${
                isActive
                  ? isHoliday
                    ? 'bg-amber-500 text-white shadow-md shadow-amber-200'
                    : 'bg-blue-600 text-white shadow-md shadow-blue-200'
                  : isToday
                    ? isHoliday
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'bg-slate-50 text-slate-600 border border-slate-100'
              }`}
            >
              <span className="text-sm font-black uppercase tracking-widest leading-none">
                {DAY_SHORT[day]}
              </span>
              <span className={`text-[9px] font-black mt-1.5 leading-none ${
                isActive ? 'text-white/70'
                  : isHoliday ? (isToday ? 'text-amber-500' : 'text-amber-600')
                  : count === 0 ? 'text-slate-300'
                  : isToday ? 'text-blue-500' : 'text-slate-400'
              }`}>
                {isHoliday ? 'OFF' : count > 0 ? `${count} cls` : '—'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  // Sunday view: show a clean holiday card, no periods.
  if (activeDay === 'Sunday') {
    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300 min-h-screen">
        {renderHeader()}
        <div className="flex-1 overflow-y-auto p-4 lg:p-8 lg:max-w-5xl lg:mx-auto lg:w-full">
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-8 lg:p-12 text-center">
            <div className="w-16 h-16 mx-auto bg-amber-100 rounded-2xl flex items-center justify-center mb-4">
              <Sun size={28} className="text-amber-500" />
            </div>
            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Sunday Holiday</h3>
            <p className="text-sm font-bold text-slate-500 mt-2">No classes today — enjoy your weekend!</p>
          </div>
        </div>
      </div>
    );
  }

  // Class & break detection helpers shared with the timeline below.
  const periodVariant = (p: TimetablePeriod): { type: 'live'|'class'|'free'|'break'|'lunch'|'assembly'|'exam' } => {
    if (activeDay === today && isCurrentPeriod(p.startTime, p.endTime) && p.type === 'CLASS' && p.subject && p.subject !== 'Free') {
      return { type: 'live' };
    }
    if (p.type === 'CLASS' && (!p.subject || p.subject === 'Free')) return { type: 'free' };
    if (p.type === 'CLASS') return { type: 'class' };
    if (p.type === 'LUNCH') return { type: 'lunch' };
    if (p.type === 'ASSEMBLY') return { type: 'assembly' };
    if (p.type === 'EXAM') return { type: 'exam' };
    return { type: 'break' };
  };

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300 min-h-screen">
      {renderHeader()}

      <div className="flex-1 overflow-y-auto p-4 lg:p-8 lg:max-w-5xl lg:mx-auto lg:w-full space-y-2">
        {isLoading ? (
          <div className="flex flex-col items-center py-20 text-slate-400">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin mb-3" />
            <p className="font-bold text-sm">Loading…</p>
          </div>
        ) : periods.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center">
            <BookOpen size={32} className="mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-black text-slate-500">No timetable for {activeDay} yet</p>
            <p className="text-[11px] font-bold text-slate-400 mt-1">Ask your class teacher to confirm with the principal.</p>
          </div>
        ) : (
          <>
            <p className="text-[10px] lg:text-xs font-black uppercase tracking-widest text-slate-400 px-1 mb-3">
              {activeDay} schedule
            </p>

            {/* Vertical timeline rail. */}
            <div className="relative pl-8 lg:pl-10">
              <div className="absolute left-3 lg:left-4 top-1.5 bottom-1.5 w-px bg-slate-200" />

              <div className="space-y-3">
                {periods.map((p, idx) => {
                  const v = periodVariant(p);
                  const past = activeDay === today && isPast(p.endTime) && v.type !== 'live';
                  const dotColor =
                    v.type === 'live'    ? 'bg-emerald-500 ring-emerald-100' :
                    v.type === 'class'   ? 'bg-blue-500 ring-blue-100'       :
                    v.type === 'lunch'   ? 'bg-amber-400 ring-amber-100'     :
                    v.type === 'assembly'? 'bg-violet-400 ring-violet-100'   :
                    v.type === 'exam'    ? 'bg-rose-500 ring-rose-100'       :
                    v.type === 'break'   ? 'bg-slate-300 ring-slate-100'     :
                                           'bg-slate-300 ring-slate-100';
                  const cardClass =
                    v.type === 'live'    ? 'bg-emerald-50/40 border-emerald-200' :
                    v.type === 'class'   ? 'bg-white border-slate-100'           :
                    v.type === 'lunch'   ? 'bg-amber-50/30 border-amber-100'     :
                    v.type === 'assembly'? 'bg-violet-50/30 border-violet-100'   :
                    v.type === 'exam'    ? 'bg-rose-50/30 border-rose-100'       :
                    v.type === 'break'   ? 'bg-slate-50 border-slate-100'        :
                                           'bg-slate-50 border-slate-100';

                  return (
                    <div key={`${p.id}-${idx}`} className="relative">
                      <div
                        className={`absolute -left-[26px] lg:-left-[28px] top-3 w-4 h-4 rounded-full ring-4 ${dotColor} ${v.type === 'live' ? 'animate-pulse' : ''}`}
                      />
                      <div className={`rounded-2xl border shadow-sm overflow-hidden ${cardClass} ${past ? 'opacity-60' : ''}`}>
                        <div className="px-3 lg:px-4 py-3 flex items-center gap-3 lg:gap-4">
                          {/* Time block */}
                          <div className="shrink-0 w-20 lg:w-24">
                            <div className="text-[11px] lg:text-xs font-black text-slate-900 leading-none">
                              {fmtTime(p.startTime)}
                            </div>
                            <div className="text-[10px] lg:text-[11px] font-bold text-slate-400 leading-none mt-1">
                              {fmtTime(p.endTime)}
                            </div>
                          </div>

                          <div className="w-px self-stretch bg-slate-100" />

                          {/* Body */}
                          <div className="flex-1 min-w-0">
                            {v.type === 'class' || v.type === 'live' ? (
                              <>
                                <div className="font-black text-sm lg:text-base uppercase tracking-tight truncate text-slate-900">
                                  {p.subject}
                                </div>
                                <div className="flex items-center gap-2 lg:gap-3 mt-1 flex-wrap">
                                  {p.teacher && (
                                    <span className="text-[10px] lg:text-[11px] font-bold text-slate-500 truncate">
                                      {p.teacher}
                                    </span>
                                  )}
                                  {p.room && (
                                    <span className="flex items-center gap-1 text-[10px] lg:text-[11px] font-bold text-slate-500">
                                      <MapPin size={10} /> {p.room}
                                    </span>
                                  )}
                                </div>
                              </>
                            ) : v.type === 'lunch' ? (
                              <>
                                <div className="flex items-center gap-2 font-black text-sm lg:text-base uppercase tracking-tight text-slate-700">
                                  <Coffee size={14} className="text-amber-500" />
                                  Lunch break
                                </div>
                                <div className="text-[10px] lg:text-[11px] font-bold text-slate-400 mt-1">
                                  Eat well!
                                </div>
                              </>
                            ) : v.type === 'assembly' ? (
                              <>
                                <div className="flex items-center gap-2 font-black text-sm lg:text-base uppercase tracking-tight text-slate-700">
                                  <Sparkles size={14} className="text-violet-500" />
                                  Assembly
                                </div>
                                <div className="text-[10px] lg:text-[11px] font-bold text-slate-400 mt-1">
                                  Be on time
                                </div>
                              </>
                            ) : v.type === 'exam' ? (
                              <>
                                <div className="font-black text-sm lg:text-base uppercase tracking-tight text-rose-700">
                                  Exam · {p.subject || 'Test'}
                                </div>
                                <div className="text-[10px] lg:text-[11px] font-bold text-slate-500 mt-1">
                                  Best of luck
                                </div>
                              </>
                            ) : v.type === 'break' ? (
                              <>
                                <div className="font-black text-sm lg:text-base uppercase tracking-tight text-slate-600">
                                  Short break
                                </div>
                                <div className="text-[10px] lg:text-[11px] font-bold text-slate-400 mt-1">
                                  Stretch · hydrate
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="font-black text-sm lg:text-base uppercase tracking-tight text-slate-400">
                                  Free period
                                </div>
                                <div className="text-[10px] lg:text-[11px] font-bold text-slate-400 mt-1">
                                  No class scheduled
                                </div>
                              </>
                            )}
                          </div>

                          {/* Right badges */}
                          <div className="shrink-0 flex items-center">
                            {v.type === 'live' ? (
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

            {/* Period legend */}
            <div className="flex flex-wrap gap-3 px-1 pt-4">
              {([
                ['Live', 'bg-emerald-500'],
                ['Class', 'bg-blue-500'],
                ['Lunch', 'bg-amber-400'],
                ['Assembly', 'bg-violet-400'],
              ] as [string, string][]).map(([label, dot]) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${dot}`} />
                  <span className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
