import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, XCircle, MinusCircle, TrendingUp } from 'lucide-react';
import { studentDashboardService, AttendanceWeekDay, AttendanceMonth } from '@/modules/students/studentDashboard.service';
import { useUIStore } from '@/store/uiStore';

type DayStatus = AttendanceWeekDay['status'];

const STATUS_CFG: Record<DayStatus, { icon: React.ReactNode; label: string; bg: string; text: string; ring: string }> = {
  PRESENT:  { icon: <CheckCircle2 size={14}/>, label: 'P', bg: 'bg-emerald-500', text: 'text-white',    ring: 'ring-emerald-200' },
  ABSENT:   { icon: <XCircle size={14}/>,      label: 'A', bg: 'bg-rose-500',    text: 'text-white',    ring: 'ring-rose-200' },
  HALF_DAY: { icon: <MinusCircle size={14}/>,  label: 'H', bg: 'bg-amber-400',   text: 'text-white',    ring: 'ring-amber-200' },
  HOLIDAY:  { icon: <MinusCircle size={14}/>,  label: '—', bg: 'bg-slate-100',   text: 'text-slate-400',ring: 'ring-slate-200' },
};

interface Props { onBack: () => void; }

export const AttendanceView: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [weekDays, setWeekDays] = useState<AttendanceWeekDay[]>([]);
  const [months, setMonths] = useState<AttendanceMonth[]>([]);
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await studentDashboardService.getMyAttendance();
        if (!alive) return;
        setWeekDays(data.weekDays);
        setMonths(data.months);
      } catch (e) {
        if (alive) showToast((e as Error).message || 'Failed to load attendance', 'error');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [showToast]);

  const weekPresent  = weekDays.filter(d => d.status === 'PRESENT').length;
  const weekAbsent   = weekDays.filter(d => d.status === 'ABSENT').length;
  const weekHalf     = weekDays.filter(d => d.status === 'HALF_DAY').length;
  const weekWorkDays = weekDays.filter(d => d.status !== 'HOLIDAY').length;
  const weekPct      = weekWorkDays > 0 ? Math.round(((weekPresent + weekHalf * 0.5) / weekWorkDays) * 100) : 0;

  const totalPresent  = months.reduce((a, m) => a + m.present, 0);
  const totalAbsent   = months.reduce((a, m) => a + m.absent, 0);
  const totalWorkDays = months.reduce((a, m) => a + m.present + m.absent, 0);
  const overallPct    = totalWorkDays > 0 ? Math.round((totalPresent / totalWorkDays) * 100) : 0;

  const pctColor = (p: number) => p >= 85 ? 'text-emerald-600' : p >= 75 ? 'text-amber-600' : 'text-rose-500';
  const barColor = (p: number) => p >= 85 ? 'bg-emerald-500' : p >= 75 ? 'bg-amber-400' : 'bg-rose-400';

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
          <ArrowLeft size={20}/>
        </button>
        <div>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight leading-none">Attendance</h2>
          <p className="text-[10px] font-bold text-slate-400 mt-0.5">This Week &amp; Monthly Summary</p>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center py-16">
          <div className="text-slate-400 font-bold text-sm">Loading attendance…</div>
        </div>
      ) : (
      <div className="flex-1 overflow-y-auto  p-4 space-y-5">

        {/* ── Overall Stats Card ── */}
        <div className="bg-[#0d1b3e] rounded-3xl p-5 text-white">
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-300 mb-3">
            Session Attendance
          </p>
          <div className="flex items-end gap-4 mb-4">
            <div className={`text-6xl font-black leading-none tabular-nums ${overallPct >= 75 ? 'text-white' : 'text-rose-300'}`}>
              {overallPct}<span className="text-3xl text-blue-300">%</span>
            </div>
            <div className="pb-1">
              <div className="text-sm font-black text-blue-100">
                {totalWorkDays === 0 ? 'No Records Yet' :
                  overallPct >= 90 ? 'Excellent' :
                  overallPct >= 75 ? 'Good Standing' : 'Needs Improvement'}
              </div>
              <div className="text-[10px] font-bold text-blue-300 mt-0.5">
                {totalPresent} present · {totalAbsent} absent
              </div>
            </div>
          </div>
          <div className="bg-white/10 rounded-full h-2 mb-4">
            <div
              className={`h-2 rounded-full transition-all duration-700 ${overallPct >= 75 ? 'bg-gradient-to-r from-emerald-400 to-blue-400' : 'bg-gradient-to-r from-rose-400 to-amber-400'}`}
              style={{ width: `${overallPct}%` }}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Present', val: String(totalPresent) },
              { label: 'Absent',  val: String(totalAbsent) },
              { label: 'Overall', val: `${overallPct}%` },
            ].map(({ label, val }) => (
              <div key={label} className="bg-white/10 rounded-xl p-2.5 text-center">
                <div className="font-black text-white text-base">{val}</div>
                <div className="text-[9px] font-black uppercase tracking-widest text-blue-300 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
          {totalWorkDays > 0 && overallPct < 75 && (
            <div className="mt-3 bg-rose-500/20 border border-rose-400/30 rounded-xl px-3 py-2">
              <p className="text-[10px] font-black text-rose-300 uppercase tracking-wide">
                Attendance below 75% — risk of being barred from exams
              </p>
            </div>
          )}
        </div>

        {/* ── This Week ── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-5 bg-blue-500 rounded-full"/>
            <h3 className="font-black text-slate-800 text-sm uppercase tracking-widest">This Week</h3>
            <span className="ml-auto text-[10px] font-bold text-slate-400">{weekPresent}/{weekWorkDays} days present</span>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            {/* Day circles */}
            <div className="grid grid-cols-7 gap-1.5 mb-4">
              {weekDays.map(wd => {
                const cfg     = STATUS_CFG[wd.status];
                const isToday = wd.date === today;
                return (
                  <div key={wd.day} className="flex flex-col items-center gap-1.5">
                    <span className={`text-[9px] font-black uppercase tracking-wide ${isToday ? 'text-blue-600' : 'text-slate-400'}`}>
                      {wd.day}
                    </span>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-xs
                      ${cfg.bg} ${cfg.text}
                      ${isToday ? `ring-2 ring-offset-1 ${cfg.ring}` : ''}
                    `}>
                      {cfg.label}
                    </div>
                    {isToday && (
                      <span className="text-[8px] font-black text-blue-600 uppercase">Today</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Week progress bar */}
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-slate-100 rounded-full h-2">
                <div className={`h-2 rounded-full transition-all ${barColor(weekPct)}`} style={{ width: `${weekPct}%` }}/>
              </div>
              <span className={`text-sm font-black tabular-nums shrink-0 ${pctColor(weekPct)}`}>{weekPct}%</span>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              {([
                { label: 'Present',  bg: 'bg-emerald-500' },
                { label: 'Absent',   bg: 'bg-rose-500' },
                { label: 'Half Day', bg: 'bg-amber-400' },
                { label: 'Holiday',  bg: 'bg-slate-200' },
              ] as const).map(l => (
                <div key={l.label} className="flex items-center gap-1">
                  <div className={`w-2.5 h-2.5 rounded-full ${l.bg}`}/>
                  <span className="text-[9px] font-bold text-slate-500">{l.label}</span>
                </div>
              ))}
            </div>

            {/* Week stats pills */}
            <div className="flex gap-2 mt-3 flex-wrap">
              {[
                { label: 'Present',  val: weekPresent,  color: 'text-emerald-700 bg-emerald-50 border-emerald-100' },
                { label: 'Absent',   val: weekAbsent,   color: 'text-rose-700 bg-rose-50 border-rose-100' },
                { label: 'Half Day', val: weekHalf,     color: 'text-amber-700 bg-amber-50 border-amber-100' },
              ].map(s => (
                <div key={s.label} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-black ${s.color}`}>
                  <span className="text-base font-black">{s.val}</span>
                  <span className="text-[9px] font-black uppercase tracking-wide">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Monthly Summary ── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-5 bg-violet-500 rounded-full"/>
            <h3 className="font-black text-slate-800 text-sm uppercase tracking-widest">Monthly Summary</h3>
            <TrendingUp size={14} className="text-violet-500 ml-1"/>
          </div>

          {months.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 text-center">
              <p className="text-sm font-bold text-slate-400">No attendance recorded yet</p>
            </div>
          ) : (
          <div className="space-y-2.5">
            {months.map(m => {
              const workDays = m.present + m.absent;
              const pct      = workDays > 0 ? Math.round((m.present / workDays) * 100) : 0;
              return (
                <div key={m.month} className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3.5">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div>
                      <div className="font-black text-slate-900 text-sm">{m.month}</div>
                      <div className="text-[10px] font-bold text-slate-400 mt-0.5">
                        {m.present}P · {m.absent}A · {m.holiday} holidays
                      </div>
                    </div>
                    <div className={`text-xl font-black tabular-nums shrink-0 ${pctColor(pct)}`}>
                      {pct}%
                    </div>
                  </div>

                  {/* Stacked bar */}
                  <div className="flex rounded-full h-2 overflow-hidden bg-slate-100">
                    <div
                      className="bg-emerald-500 h-full transition-all duration-500"
                      style={{ width: `${m.total > 0 ? (m.present / m.total) * 100 : 0}%` }}
                    />
                    <div
                      className="bg-rose-400 h-full transition-all duration-500"
                      style={{ width: `${m.total > 0 ? (m.absent / m.total) * 100 : 0}%` }}
                    />
                    <div
                      className="bg-slate-200 h-full transition-all duration-500"
                      style={{ width: `${m.total > 0 ? (m.holiday / m.total) * 100 : 0}%` }}
                    />
                  </div>

                  {/* Mini stat pills */}
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    <span className="text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                      {m.present} Present
                    </span>
                    <span className="text-[9px] font-black text-rose-700 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-full">
                      {m.absent} Absent
                    </span>
                    {m.holiday > 0 && (
                      <span className="text-[9px] font-black text-slate-500 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-full">
                        {m.holiday} Holidays
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>

      </div>
      )}
    </div>
  );
};
