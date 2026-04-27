import React, { useState } from 'react';
import { ArrowLeft, Clock, MapPin } from 'lucide-react';
import { timetableService, DAYS, PERIOD_SLOTS, TimetableEntry, TDay } from '../../../services/timetable.service';

interface Props { onBack: () => void; }

// Student's class – in real app from auth context
const MY_CLASS = '10-A';

type SlotType = 'CLASS' | 'BREAK' | 'LUNCH' | 'ASSEMBLY' | 'FREE';

const periodColor = (type: SlotType) => {
  const map: Record<SlotType, string> = {
    CLASS: 'bg-blue-50 border-blue-200 text-blue-700',
    EXAM: 'bg-rose-50 border-rose-300 text-rose-700',
    FREE: 'bg-slate-50 border-slate-200 text-slate-400',
    LUNCH: 'bg-amber-50 border-amber-200 text-amber-700',
    ASSEMBLY: 'bg-violet-50 border-violet-200 text-violet-700',
    BREAK: 'bg-orange-50 border-orange-200 text-orange-600',
  } as Record<string, string>;
  return map[type] ?? 'bg-slate-50 border-slate-200 text-slate-400';
};

const periodDot = (type: SlotType) => {
  const map: Record<string, string> = {
    CLASS: 'bg-blue-500', FREE: 'bg-slate-300', LUNCH: 'bg-amber-400',
    ASSEMBLY: 'bg-violet-500', BREAK: 'bg-orange-400',
  };
  return map[type] ?? 'bg-slate-300';
};

const todayDayName = (): TDay => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const n = days[new Date().getDay()];
  return (n === 'Sunday' ? 'Monday' : n) as TDay;
};

const isCurrentPeriod = (startTime: string, endTime: string): boolean => {
  const now = new Date();
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  return nowMins >= sh * 60 + sm && nowMins < eh * 60 + em;
};

export const TimetableView: React.FC<Props> = ({ onBack }) => {
  const today = todayDayName();
  const [activeDay, setActiveDay] = useState<TDay>(today);

  const weeklyMap = timetableService.getClassWeeklyMap(MY_CLASS);
  const classEntries: TimetableEntry[] = weeklyMap[activeDay] ?? [];

  // Build combined list: fixed slots + class entries
  const combinedSlots = PERIOD_SLOTS.map(slot => ({
    slot,
    entry: classEntries.find(e => e.slotId === slot.slotId) ?? null,
  }));

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-0 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3 pb-3">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Timetable</h2>
            <p className="text-[10px] font-bold text-slate-400">Class {MY_CLASS} · Weekly Schedule</p>
          </div>
        </div>

        {/* Day tabs */}
        <div className="flex border-t border-slate-100 overflow-x-auto hide-scrollbar">
          {DAYS.map(day => (
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
          {([['CLASS', 'bg-blue-500'], ['LUNCH', 'bg-amber-400'], ['BREAK', 'bg-orange-400'], ['ASSEMBLY', 'bg-violet-500']] as [string, string][]).map(([type, dot]) => (
            <div key={type} className="flex items-center gap-1.5 shrink-0">
              <div className={`w-2 h-2 rounded-full ${dot}`} />
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">{type}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-2">
        {combinedSlots.map(({ slot, entry }) => {
          const live = activeDay === today && !slot.isFixed && entry
            ? isCurrentPeriod(slot.startTime, slot.endTime)
            : false;

          return (
            <div key={slot.slotId}
              className={`flex gap-4 p-4 rounded-2xl border transition-all ${
                live
                  ? 'bg-blue-50 border-blue-300 shadow-md shadow-blue-100'
                  : slot.isFixed
                    ? periodColor(slot.type as SlotType)
                    : entry
                      ? 'bg-white border-slate-100 shadow-sm'
                      : 'bg-slate-50 border-dashed border-slate-200 opacity-60'
              }`}>
              {/* Dot + line */}
              <div className="flex flex-col items-center gap-1 shrink-0 pt-1">
                <div className={`w-2 h-2 rounded-full ${
                  live ? 'bg-blue-500 animate-pulse' :
                  slot.isFixed ? periodDot(slot.type as SlotType) :
                  entry ? 'bg-blue-400' : 'bg-slate-300'
                }`} />
                <div className="w-px flex-1 bg-slate-200" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className={`font-extrabold text-sm ${live ? 'text-blue-900' : 'text-slate-900'}`}>
                      {slot.isFixed ? slot.label : entry ? entry.subject : `${slot.label} – Free`}
                    </div>
                    {entry && !slot.isFixed && (
                      <div className="text-[10px] font-bold text-slate-500 mt-0.5">{entry.teacherName}</div>
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
                    <Clock size={10} /> {slot.startTime} – {slot.endTime}
                  </div>
                  {entry?.room && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                      <MapPin size={9} /> {entry.room}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {classEntries.length === 0 && (
          <p className="text-center text-xs font-bold text-slate-400 py-4">
            Timetable not assigned for {activeDay} yet.
          </p>
        )}
      </div>
    </div>
  );
};
