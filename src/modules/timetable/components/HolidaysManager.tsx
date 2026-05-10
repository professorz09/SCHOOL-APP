// School Holidays calendar — principal declares specific dates
// (Diwali, 15 Aug, founder's day, etc.) for the active academic year
// and configures the school's weekly off days (Sunday by default).
//
// MVP scope: list / add / delete dated holidays + toggle weekly-off
// pattern. Attendance integration (auto-fill HOLIDAY status, exclude
// from %) is wired through the existing 'HOLIDAY' attendance status
// — principals can use the bulk "All Holiday" button on each holiday
// date until automatic prefill lands.

import React, { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Calendar, Trash2, X, AlertCircle } from 'lucide-react';
import { apiPrincipal } from '@/lib/apiClient';
import { useAcademicYear } from '@/shared/context/AcademicYearContext';
import { useUIStore } from '@/store/uiStore';
import { logAudit } from '@/lib/audit';

interface Holiday {
  id: string;
  academic_year_id: string;
  date: string;          // YYYY-MM-DD
  name: string;
  notes: string | null;
  created_at: string;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_FULL  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface Props { onBack: () => void; }

export const HolidaysManager: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const { currentYear } = useAcademicYear();

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [weeklyOff, setWeeklyOff] = useState<number[]>([0]);
  const [loading, setLoading] = useState(true);
  const [savingWeekly, setSavingWeekly] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [addDate, setAddDate] = useState('');
  const [addName, setAddName] = useState('');
  const [addNotes, setAddNotes] = useState('');
  const [adding, setAdding] = useState(false);
  // Custom delete-confirmation modal — replaces window.confirm() which
  // exposed the dev hostname as the dialog title on Codespaces.
  const [deleteTarget, setDeleteTarget] = useState<Holiday | null>(null);
  const [deleting, setDeleting] = useState(false);

  const reload = React.useCallback(async () => {
    if (!currentYear?.id) { setHolidays([]); setLoading(false); return; }
    setLoading(true);
    try {
      const [list, weekly] = await Promise.all([
        apiPrincipal.holidaysList(currentYear.id),
        apiPrincipal.weeklyOffGet().catch(() => ({ days: [0] })),
      ]);
      setHolidays(list);
      setWeeklyOff(weekly.days ?? [0]);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load holidays', 'error');
    } finally { setLoading(false); }
  }, [currentYear?.id, showToast]);

  useEffect(() => { void reload(); }, [reload]);

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

  const handleAdd = async () => {
    if (!currentYear?.id) return;
    if (!addDate) { showToast('Pick a date', 'error'); return; }
    if (!addName.trim()) { showToast('Name required', 'error'); return; }
    setAdding(true);
    try {
      await apiPrincipal.holidayAdd({
        academicYearId: currentYear.id,
        date: addDate,
        name: addName.trim(),
        notes: addNotes.trim() || undefined,
      });
      await logAudit('holiday_added', 'school_holiday', null, { date: addDate, name: addName.trim() });
      setAddDate(''); setAddName(''); setAddNotes(''); setShowAdd(false);
      await reload();
      showToast('Holiday added');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to add holiday', 'error');
    } finally { setAdding(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiPrincipal.holidayDelete(deleteTarget.id);
      await logAudit('holiday_deleted', 'school_holiday', deleteTarget.id, { date: deleteTarget.date, name: deleteTarget.name });
      setHolidays(prev => prev.filter(x => x.id !== deleteTarget.id));
      showToast('Holiday removed');
      setDeleteTarget(null);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to delete', 'error');
    } finally { setDeleting(false); }
  };

  // Group holidays by month for a scannable list.
  const grouped = React.useMemo(() => {
    const m = new Map<string, Holiday[]>();
    for (const h of holidays) {
      const ym = h.date.slice(0, 7);
      const arr = m.get(ym) ?? [];
      arr.push(h);
      m.set(ym, arr);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [holidays]);

  const monthLabel = (ym: string) => {
    const [y, mo] = ym.split('-').map(Number);
    return new Date(y, mo - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  };

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 sticky top-0 z-10 shadow-sm flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Holidays</h2>
            <p className="text-[10px] font-bold text-slate-400 truncate">
              {currentYear?.name ?? 'No active year'}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          disabled={!currentYear}
          className="p-2 bg-rose-500 hover:bg-rose-600 text-white rounded-full shadow-md disabled:opacity-50">
          <Plus size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-2xl mx-auto w-full">
        {/* Weekly off picker */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
            Weekly Off Days
          </p>
          <p className="text-[11px] font-bold text-slate-500 mb-3 leading-relaxed">
            Days the school is closed every week. Used to grey out cells in
            attendance grids and exclude from "% present".
          </p>
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
        </div>

        {/* Add holiday inline form */}
        {showAdd && (
          <div className="bg-white rounded-2xl border border-rose-200 shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-widest text-rose-700">Add holiday</p>
              <button onClick={() => setShowAdd(false)} className="p-1 text-slate-400">
                <X size={16} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <label className="block">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Date *</span>
                <input
                  type="date"
                  value={addDate}
                  min={currentYear?.startDate}
                  max={currentYear?.endDate}
                  onChange={e => setAddDate(e.target.value)}
                  className="w-full mt-1 border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-rose-500" />
              </label>
              <label className="block">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Name *</span>
                <input
                  type="text"
                  value={addName}
                  onChange={e => setAddName(e.target.value)}
                  placeholder="e.g. Diwali, Independence Day"
                  maxLength={80}
                  className="w-full mt-1 border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-rose-500" />
              </label>
            </div>
            <label className="block">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Notes (optional)</span>
              <input
                type="text"
                value={addNotes}
                onChange={e => setAddNotes(e.target.value)}
                placeholder="Any extra detail for the records"
                className="w-full mt-1 border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-rose-500" />
            </label>
            <button
              onClick={handleAdd}
              disabled={adding || !addDate || !addName.trim()}
              className="w-full py-3 bg-rose-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl active:scale-95 disabled:opacity-50">
              {adding ? 'Saving…' : 'Save Holiday'}
            </button>
          </div>
        )}

        {/* Holiday list */}
        {loading ? (
          <div className="text-center py-12 text-slate-400 text-sm font-bold">Loading…</div>
        ) : !currentYear ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-2">
            <AlertCircle size={16} className="text-amber-600 mt-0.5 shrink-0" />
            <p className="text-[12px] font-bold text-amber-800">
              Pick an academic year first — holidays are scoped per year.
            </p>
          </div>
        ) : grouped.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Calendar size={32} className="mx-auto mb-2 opacity-40" />
            <p className="font-bold text-sm">No holidays declared yet</p>
            <p className="text-[10px] font-bold text-slate-300 mt-1">Tap + to add Diwali, 15 Aug, etc.</p>
          </div>
        ) : (
          grouped.map(([ym, arr]) => (
            <div key={ym} className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">
                {monthLabel(ym)}
              </p>
              {arr.map(h => {
                const dt = new Date(h.date);
                const dayName = DAY_FULL[dt.getDay()];
                return (
                  <div key={h.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-700 flex flex-col items-center justify-center shrink-0">
                      <span className="text-[8px] font-black uppercase tracking-widest leading-none">{dayName.slice(0, 3)}</span>
                      <span className="font-black text-base leading-none mt-0.5">{dt.getDate()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-extrabold text-slate-900 text-sm truncate">{h.name}</div>
                      <div className="text-[10px] font-bold text-slate-400 mt-0.5">
                        {h.date} · {dayName}
                      </div>
                      {h.notes && (
                        <div className="text-[10px] font-bold text-slate-500 mt-0.5 truncate">{h.notes}</div>
                      )}
                    </div>
                    <button onClick={() => setDeleteTarget(h)}
                      className="p-2 text-slate-400 hover:text-rose-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end lg:items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => !deleting && setDeleteTarget(null)}>
          <div onClick={e => e.stopPropagation()}
            className="bg-white rounded-3xl w-full lg:max-w-md p-5 lg:p-6 shadow-2xl animate-in slide-in-from-bottom-4 lg:zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 size={20}/>
              </div>
              <div className="min-w-0">
                <p className="text-base font-black text-slate-900">Delete this holiday?</p>
                <p className="text-[11px] font-bold text-slate-400 mt-0.5 truncate">
                  {deleteTarget.name} · {deleteTarget.date}
                </p>
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 mb-4">
              <p className="text-[12px] font-bold text-slate-600 leading-relaxed">
                Attendance grids me yeh date phir se "school open" treat hogi. Kabhi bhi wapas add kar sakte hain.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 py-3 bg-slate-100 text-slate-700 font-black rounded-2xl text-sm uppercase tracking-widest active:scale-95 transition-transform disabled:opacity-50">
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-1.5 py-3 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-2xl text-sm uppercase tracking-widest active:scale-95 transition-transform disabled:opacity-60">
                {deleting ? 'Deleting…' : <><Trash2 size={14}/> Delete</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
