import React, { useState } from 'react';
import { ArrowLeft, Clock, MapPin, BookOpen } from 'lucide-react';
import { timetableService, DAYS, PERIOD_SLOTS, TimetableEntry, TDay } from '../../../services/timetable.service';

interface Props { onBack: () => void; }

// Teacher's ID – in real app comes from auth context
const MY_TEACHER_ID = 'st1';
const MY_NAME = 'Aarti Desai';

const DAY_DATES: Record<TDay, string> = (() => {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ...
  const map = {} as Record<TDay, string>;
  const dayNames: TDay[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  for (let i = 0; i < 6; i++) {
    const d = new Date(today);
    // offset from today to that day
    const offset = i + 1 - dayOfWeek; // Mon=1
    d.setDate(today.getDate() + offset);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    map[dayNames[i]] = `${dd}/${mm}`;
  }
  return map;
})();

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

export const TeacherTimetableView: React.FC<Props> = ({ onBack }) => {
  const [activeDay, setActiveDay] = useState<TDay>(todayDayName());

  const allEntries: TimetableEntry[] = timetableService.getTeacherSchedule(MY_TEACHER_ID);
  const dayEntries = allEntries
    .filter(e => e.day === activeDay)
    .map(e => ({ ...e, slot: PERIOD_SLOTS.find(s => s.slotId === e.slotId)! }))
    .filter(e => e.slot)
    .sort((a, b) => a.slot.startTime.localeCompare(b.slot.startTime));

  // Weekly summary
  const weekSummary = DAYS.map(day => ({
    day,
    count: allEntries.filter(e => e.day === day).length,
  }));

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-0 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3 pb-3">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">My Timetable</h2>
            <p className="text-[10px] font-bold text-slate-400">{MY_NAME} · Weekly Schedule</p>
          </div>
        </div>

        {/* Day tabs with date */}
        <div className="flex overflow-x-auto hide-scrollbar border-t border-slate-100">
          {DAYS.map(day => {
            const count = weekSummary.find(w => w.day === day)?.count ?? 0;
            const isToday = day === todayDayName();
            return (
              <button key={day} onClick={() => setActiveDay(day)}
                className={`shrink-0 flex flex-col items-center px-3 py-2 border-b-2 transition-colors min-w-[52px] ${
                  activeDay === day ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400'
                }`}>
                <span className={`text-[9px] font-black uppercase tracking-widest ${isToday ? 'text-emerald-500' : ''}`}>
                  {day.slice(0, 3)}
                </span>
                <span className="text-[10px] font-bold text-slate-500">{DAY_DATES[day]}</span>
                {count > 0 && (
                  <span className="mt-0.5 text-[8px] font-black bg-blue-100 text-blue-600 px-1.5 rounded-full">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Weekly load bar */}
      <div className="bg-white border-b border-slate-100 px-4 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
            This week: {allEntries.length} periods
          </span>
          <span className="text-[9px] font-black text-blue-600">
            {dayEntries.length} period{dayEntries.length !== 1 ? 's' : ''} on {activeDay}
          </span>
        </div>
      </div>

      {/* Period list */}
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-3">
        {dayEntries.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <BookOpen size={40} className="mb-3 opacity-40" />
            <p className="font-bold text-sm">No classes on {activeDay}</p>
            <p className="text-xs mt-1 opacity-70">Enjoy your free day!</p>
          </div>
        ) : (
          dayEntries.map(entry => {
            const live = activeDay === todayDayName() && isCurrentPeriod(entry.slot.startTime, entry.slot.endTime);
            return (
              <div key={entry.id}
                className={`rounded-2xl border p-4 transition-all ${
                  live
                    ? 'bg-blue-50 border-blue-300 shadow-md shadow-blue-100'
                    : 'bg-white border-slate-100 shadow-sm'
                }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    {/* Time */}
                    <div className="flex items-center gap-2 mb-2">
                      <Clock size={11} className={live ? 'text-blue-500' : 'text-slate-400'} />
                      <span className={`text-[11px] font-black ${live ? 'text-blue-600' : 'text-slate-500'}`}>
                        {entry.slot.startTime} – {entry.slot.endTime}
                      </span>
                      <span className="text-[9px] font-bold text-slate-300">
                        {PERIOD_SLOTS.find(s => s.slotId === entry.slotId)?.label}
                      </span>
                      {live && (
                        <span className="ml-auto text-[8px] font-black bg-blue-500 text-white px-2 py-0.5 rounded-full uppercase animate-pulse">
                          Live
                        </span>
                      )}
                    </div>

                    {/* Subject */}
                    <div className="font-black text-slate-900 text-base">{entry.subject}</div>

                    {/* Class */}
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-[10px] font-black bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                        Class {entry.classId}
                      </span>
                      {entry.room && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                          <MapPin size={9} /> {entry.room}
                        </span>
                      )}
                    </div>

                    {/* Date info */}
                    <div className="mt-1.5 text-[9px] font-bold text-slate-300">
                      {activeDay} · {DAY_DATES[activeDay]}
                    </div>
                  </div>

                  {/* Duration badge */}
                  <div className="shrink-0 text-center">
                    <div className={`text-lg font-black ${live ? 'text-blue-600' : 'text-slate-300'}`}>
                      {(() => {
                        const [sh, sm] = entry.slot.startTime.split(':').map(Number);
                        const [eh, em] = entry.slot.endTime.split(':').map(Number);
                        return (eh * 60 + em) - (sh * 60 + sm);
                      })()}
                    </div>
                    <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">min</div>
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Full week summary */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4 mt-4">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Weekly Load</p>
          <div className="space-y-2">
            {weekSummary.map(({ day, count }) => (
              <div key={day} className="flex items-center gap-3">
                <span className="text-[10px] font-black text-slate-500 w-8">{day.slice(0, 3)}</span>
                <div className="flex-1 bg-slate-100 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(100, count * 16.6)}%` }}
                  />
                </div>
                <span className="text-[10px] font-black text-slate-400 w-6 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
