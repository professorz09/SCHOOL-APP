import React, { useEffect, useState } from 'react';
import { ArrowLeft, Clock, MapPin } from 'lucide-react';
import { studentDashboardService } from '@/modules/students/studentDashboard.service';
import { TimetableDay, TimetablePeriod, PeriodType } from '@/shared/types/student.types';
import { useUIStore } from '@/store/uiStore';

interface Props { onBack: () => void; }

const DAY_TABS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const periodColor = (type: PeriodType) => {
  const map: Record<PeriodType, string> = {
    CLASS:    'bg-blue-50 border-blue-200 text-blue-700',
    EXAM:     'bg-rose-50 border-rose-300 text-rose-700',
    FREE:     'bg-slate-50 border-slate-200 text-slate-400',
    LUNCH:    'bg-amber-50 border-amber-200 text-amber-700',
    ASSEMBLY: 'bg-violet-50 border-violet-200 text-violet-700',
  };
  return map[type] ?? 'bg-slate-50 border-slate-200 text-slate-400';
};

const periodDot = (type: PeriodType) => {
  const map: Record<PeriodType, string> = {
    CLASS:    'bg-blue-500',
    EXAM:     'bg-rose-500',
    FREE:     'bg-slate-300',
    LUNCH:    'bg-amber-400',
    ASSEMBLY: 'bg-violet-500',
  };
  return map[type] ?? 'bg-slate-300';
};

const todayDayName = (): string => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[new Date().getDay()];
};

const isCurrentPeriod = (startTime: string, endTime: string): boolean => {
  const now = new Date();
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  return nowMins >= sh * 60 + sm && nowMins < eh * 60 + em;
};

export const TimetableView: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const today = todayDayName();
  const [activeDay, setActiveDay] = useState<string>(
    DAY_TABS.includes(today) ? today : 'Monday',
  );
  const [days, setDays] = useState<TimetableDay[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

  const dayData = days.find(d => d.day === activeDay);
  const periods: TimetablePeriod[] = dayData?.periods ?? [];

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-0 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3 pb-3">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Timetable</h2>
            <p className="text-[10px] font-bold text-slate-400">Weekly Schedule</p>
          </div>
        </div>

        {/* Day tabs */}
        <div className="flex border-t border-slate-100 overflow-x-auto hide-scrollbar">
          {DAY_TABS.map(day => (
            <button key={day} onClick={() => setActiveDay(day)}
              className={`shrink-0 flex flex-col items-center px-3 py-2.5 border-b-2 transition-colors ${
                activeDay === day ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400'
              }`}>
              <span className={`text-[10px] font-black uppercase tracking-widest ${day === today ? 'text-emerald-500' : ''}`}>
                {day.slice(0, 3)}
              </span>
              {day === today && (
                <span className="text-[8px] font-black text-emerald-500">Today</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="px-4 py-2.5 bg-white border-b border-slate-100">
        <div className="flex gap-3 overflow-x-auto hide-scrollbar">
          {([['CLASS', 'bg-blue-500'], ['LUNCH', 'bg-amber-400'], ['ASSEMBLY', 'bg-violet-500'], ['EXAM', 'bg-rose-500']] as [string, string][]).map(([type, dot]) => (
            <div key={type} className="flex items-center gap-1.5 shrink-0">
              <div className={`w-2 h-2 rounded-full ${dot}`} />
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">{type}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {isLoading && (
          <p className="text-center text-xs font-bold text-slate-400 py-8">Loading timetable…</p>
        )}

        {!isLoading && periods.map(p => {
          const live = activeDay === today && isCurrentPeriod(p.startTime, p.endTime);
          const isFixed = p.type !== 'CLASS';
          return (
            <div key={p.id}
              className={`flex gap-4 p-4 rounded-2xl border transition-all ${
                live
                  ? 'bg-blue-50 border-blue-300 shadow-md shadow-blue-100'
                  : isFixed
                    ? periodColor(p.type)
                    : 'bg-white border-slate-100 shadow-sm'
              }`}>
              {/* Dot + line */}
              <div className="flex flex-col items-center gap-1 shrink-0 pt-1">
                <div className={`w-2 h-2 rounded-full ${
                  live ? 'bg-blue-500 animate-pulse' : periodDot(p.type)
                }`} />
                <div className="w-px flex-1 bg-slate-200" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className={`font-extrabold text-sm ${live ? 'text-blue-900' : 'text-slate-900'}`}>
                      {p.subject || 'Free'}
                    </div>
                    {p.teacher && !isFixed && (
                      <div className="text-[10px] font-bold text-slate-500 mt-0.5">{p.teacher}</div>
                    )}
                  </div>
                  {live && (
                    <span className="text-[8px] font-black bg-blue-500 text-white px-2 py-0.5 rounded-full uppercase animate-pulse shrink-0">
                      Now
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 mt-2">
                  <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                    <Clock size={10} /> {p.startTime} – {p.endTime}
                  </div>
                  {p.room && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                      <MapPin size={9} /> {p.room}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {!isLoading && periods.length === 0 && (
          <p className="text-center text-xs font-bold text-slate-400 py-4">
            Timetable not assigned for {activeDay} yet.
          </p>
        )}
      </div>
    </div>
  );
};
