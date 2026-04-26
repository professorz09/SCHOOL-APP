import React, { useEffect, useState } from 'react';
import { ArrowLeft, Clock } from 'lucide-react';
import { studentDashboardService } from '../../../services/student.service2';
import { TimetableDay, TimetablePeriod, PeriodType } from '../../../types/student.types';

interface Props { onBack: () => void; }

const periodColor = (type: PeriodType) => {
  const map: Record<PeriodType, string> = {
    CLASS: 'bg-blue-50 border-blue-200 text-blue-700',
    EXAM: 'bg-rose-50 border-rose-300 text-rose-700',
    FREE: 'bg-slate-50 border-slate-200 text-slate-400',
    LUNCH: 'bg-amber-50 border-amber-200 text-amber-700',
    ASSEMBLY: 'bg-violet-50 border-violet-200 text-violet-700',
  };
  return map[type];
};

const periodDot = (type: PeriodType) => {
  const map: Record<PeriodType, string> = {
    CLASS: 'bg-blue-500',
    EXAM: 'bg-rose-500',
    FREE: 'bg-slate-300',
    LUNCH: 'bg-amber-400',
    ASSEMBLY: 'bg-violet-500',
  };
  return map[type];
};

export const TimetableView: React.FC<Props> = ({ onBack }) => {
  const [days, setDays] = useState<TimetableDay[]>([]);
  const [activeDay, setActiveDay] = useState(0);

  useEffect(() => { studentDashboardService.getTimetable().then(setDays); }, []);

  const day = days[activeDay];

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-0 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3 pb-3">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20} /></button>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Timetable</h2>
        </div>
        {/* Day tabs */}
        <div className="flex border-t border-slate-100 overflow-x-auto hide-scrollbar">
          {days.map((d, i) => (
            <button key={d.day} onClick={() => setActiveDay(i)}
              className={`flex-shrink-0 px-4 py-3 text-[11px] font-black uppercase tracking-widest transition-colors border-b-2 ${activeDay === i ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400'}`}>
              {d.day.slice(0, 3)}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="px-4 py-3 bg-white border-b border-slate-100">
        <div className="flex gap-3 overflow-x-auto hide-scrollbar">
          {([['CLASS', 'bg-blue-500'], ['EXAM', 'bg-rose-500'], ['LUNCH', 'bg-amber-400'], ['FREE', 'bg-slate-300']] as [PeriodType, string][]).map(([type, dot]) => (
            <div key={type} className="flex items-center gap-1.5 shrink-0">
              <div className={`w-2 h-2 rounded-full ${dot}`} />
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">{type}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-2">
        {day?.periods.map(period => (
          <div key={period.id}
            className={`flex gap-4 p-4 rounded-2xl border ${periodColor(period.type)}`}>
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <div className={`w-2 h-2 rounded-full ${periodDot(period.type)}`} />
              <div className="w-px flex-1 bg-current opacity-20" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-extrabold text-slate-900 text-sm">{period.subject}</div>
                  {period.teacher && <div className="text-[10px] font-bold text-slate-500 mt-0.5">{period.teacher}</div>}
                </div>
                {period.type === 'EXAM' && (
                  <span className="text-[9px] font-black bg-rose-500 text-white px-2 py-0.5 rounded-full uppercase shrink-0">EXAM</span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-2">
                <div className="flex items-center gap-1 text-[10px] font-bold opacity-70">
                  <Clock size={10} /> {period.startTime} – {period.endTime}
                </div>
                {period.room && period.room !== '—' && (
                  <span className="text-[10px] font-bold opacity-70">{period.room}</span>
                )}
              </div>
            </div>
          </div>
        ))}
        {!day && (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <p className="font-bold text-sm">No timetable for this day</p>
          </div>
        )}
      </div>
    </div>
  );
};
