// School Weekly-Off configuration.
//
// Originally this screen also let principals declare specific dated
// holidays (Diwali, 15 Aug, etc.) but that turned out to be wasted UI
// surface — the dated holidays didn't feed into the timetable (which
// is a recurring weekly grid) and the attendance module's own
// "HOLIDAY" status covered the same need on demand. Trimmed back to
// just the weekly-off picker.
//
// Toggle ko Sunday-only banake principal kuch karne ki zaroorat hi nahi
// padti — defaults safe hain, screen sirf agar Saturday bhi off rakhni
// ho ya weekday switch karna ho tab chahiye.

import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { apiPrincipal } from '@/lib/apiClient';
import { useUIStore } from '@/store/uiStore';
import { logAudit } from '@/lib/audit';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_FULL  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface Props { onBack: () => void; }

export const HolidaysManager: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const [weeklyOff, setWeeklyOff] = useState<number[]>([0]);
  const [loading, setLoading] = useState(true);
  const [savingWeekly, setSavingWeekly] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const weekly = await apiPrincipal.weeklyOffGet().catch(() => ({ days: [0] }));
        setWeeklyOff(weekly.days ?? [0]);
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Failed to load', 'error');
      } finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleWeeklyDay = async (day: number) => {
    const next = weeklyOff.includes(day)
      ? weeklyOff.filter(d => d !== day)
      : [...weeklyOff, day].sort();
    if (next.length >= 7) {
      showToast('Cannot mark all 7 days as off', 'error');
      return;
    }
    setSavingWeekly(true);
    try {
      const res = await apiPrincipal.weeklyOffSet(next);
      setWeeklyOff(res.days);
      await logAudit('weekly_off_updated', 'school', null, { days: res.days });
      showToast('Weekly off updated');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to update', 'error');
    } finally { setSavingWeekly(false); }
  };

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 sticky top-0 z-10 shadow-sm flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0">
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Weekly Off</h2>
          <p className="text-[10px] font-bold text-slate-400 truncate">
            School ka weekly schedule
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-2xl mx-auto w-full">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-[11px] font-bold text-slate-500 mb-3 leading-relaxed">
            Jin dino school har hafte band rehta hai. Attendance grid me
            in dino ke cells gray hote hain aur timetable me un dino ki
            tab disabled rehti hai.
          </p>
          {loading ? (
            <p className="text-xs font-bold text-slate-400">Loading…</p>
          ) : (
            <div className="grid grid-cols-7 gap-1.5">
              {DAY_NAMES.map((label, idx) => {
                const on = weeklyOff.includes(idx);
                return (
                  <button
                    key={idx}
                    onClick={() => toggleWeeklyDay(idx)}
                    disabled={savingWeekly}
                    title={DAY_FULL[idx]}
                    className={`py-2.5 rounded-xl text-[11px] font-black transition-colors disabled:opacity-50 ${
                      on
                        ? 'bg-rose-500 text-white border-2 border-rose-500'
                        : 'bg-slate-50 text-slate-500 border-2 border-slate-200 hover:border-slate-300'
                    }`}>
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <p className="text-[11px] font-bold text-slate-400 text-center leading-relaxed">
          One-off holidays (Diwali, 15 Aug etc.) attendance screen se
          handle hote hain — yahaan sirf weekly pattern.
        </p>
      </div>
    </div>
  );
};

// ─── Timetable customization toggle key ────────────────────────────────────
// localStorage key — read by TimetableManager to gate the "Add Period"
// button. Per-browser intentionally; switching devices means the
// principal re-enables there.
export const TIMETABLE_CUSTOMIZE_STORAGE_KEY = 'edugrow.timetable.customize';

export function isTimetableCustomizeOn(): boolean {
  try { return localStorage.getItem(TIMETABLE_CUSTOMIZE_STORAGE_KEY) === '1'; }
  catch { return false; }
}
