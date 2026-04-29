import React, { useState, useCallback, useEffect } from 'react';
import { ArrowLeft, Plus, Trash2, ChevronDown, AlertTriangle, CheckCircle2, Edit3, Clock } from 'lucide-react';
import {
  timetableService, PERIOD_SLOTS, DAYS, TimetableEntry, TDay, TimetableTeacher,
} from '../../../services/timetable.service';
import { useUIStore } from '../../../store/uiStore';

const CLASSES = ['8-A', '8-B', '9-A', '9-B', '10-A', '10-B'];

const slotBg: Record<string, string> = {
  CLASS: 'bg-blue-50 border-blue-200 text-blue-800',
  BREAK: 'bg-amber-50 border-amber-200 text-amber-700',
  LUNCH: 'bg-orange-50 border-orange-200 text-orange-700',
  ASSEMBLY: 'bg-violet-50 border-violet-200 text-violet-700',
  FREE: 'bg-slate-50 border-slate-200 text-slate-400',
};

interface EntryFormState {
  subject: string;
  teacherId: string;
  room: string;
  startTime: string;
  endTime: string;
}

interface SlotTimeModal {
  slotId: string;
  label: string;
  startTime: string;
  endTime: string;
}

interface Props { onBack: () => void; }

export const TimetableManager: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const [selectedClass, setSelectedClass] = useState('10-A');
  const [activeDay, setActiveDay] = useState<TDay>('Monday');
  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [slots, setSlots] = useState(() => [...PERIOD_SLOTS]);
  const [editModal, setEditModal] = useState<{ slotId: string; existing?: TimetableEntry } | null>(null);
  const [form, setForm] = useState<EntryFormState>({ subject: '', teacherId: '', room: '', startTime: '', endTime: '' });
  const [conflictMsg, setConflictMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [slotTimeModal, setSlotTimeModal] = useState<SlotTimeModal | null>(null);
  const [teachers, setTeachers] = useState<TimetableTeacher[]>([]);

  const subjects = timetableService.getSubjectsForClass(selectedClass);

  const reload = useCallback((cls: string) => {
    setEntries(timetableService.getClassTimetable(cls));
    setSlots([...PERIOD_SLOTS]);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await timetableService.refreshAll();
        setTeachers(timetableService.getTeachers());
        reload(selectedClass);
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Failed to load timetable', 'error');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClassChange = (cls: string) => {
    setSelectedClass(cls);
    reload(cls);
    setEditModal(null);
  };

  const openEdit = (slotId: string) => {
    const slot = PERIOD_SLOTS.find(s => s.slotId === slotId)!;
    // Fixed slots (assembly, break, lunch) open time-edit modal
    if (slot.isFixed) {
      setSlotTimeModal({ slotId: slot.slotId, label: slot.label, startTime: slot.startTime, endTime: slot.endTime });
      return;
    }
    const existing = entries.find(e => e.day === activeDay && e.slotId === slotId);
    setForm({
      subject: existing?.subject ?? subjects[0] ?? '',
      teacherId: existing?.teacherId ?? teachers[0]?.id ?? '',
      room: existing?.room ?? '',
      startTime: slot.startTime,
      endTime: slot.endTime,
    });
    setConflictMsg('');
    setEditModal({ slotId, existing });
  };

  const handleSave = async () => {
    if (!form.subject || !form.teacherId) return;
    const teacher = teachers.find(t => t.id === form.teacherId)!;
    const [className, section] = selectedClass.split('-');

    // Update slot time if changed
    const slot = PERIOD_SLOTS.find(s => s.slotId === editModal!.slotId)!;
    if (form.startTime !== slot.startTime || form.endTime !== slot.endTime) {
      timetableService.updateSlotTime(editModal!.slotId, form.startTime, form.endTime);
    }

    const result = timetableService.saveEntry({
      id: editModal?.existing?.id,
      classId: selectedClass,
      className,
      section,
      day: activeDay,
      slotId: editModal!.slotId,
      subject: form.subject,
      teacherId: form.teacherId,
      teacherName: teacher.name,
      room: form.room,
      // academicYearId is resolved server-side by timetable.service from the
      // active academic_year — passing a placeholder here would be ignored and
      // misleading. Service-side _activeYearId is the single source of truth.
      academicYearId: '',
    });

    const r = await result;
    if (!r.ok) {
      setConflictMsg(`Conflict! ${r.conflict?.teacherName ?? r.reason ?? ''} is already assigned at this time.`);
      return;
    }
    reload(selectedClass);
    setEditModal(null);
    setSuccessMsg('Saved!');
    setTimeout(() => setSuccessMsg(''), 2000);
  };

  const handleDelete = async () => {
    if (editModal?.existing) {
      try {
        await timetableService.deleteEntry(editModal.existing.id);
        reload(selectedClass);
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Delete failed', 'error');
        return;
      }
    }
    setEditModal(null);
  };

  const handleSlotTimeSave = () => {
    if (!slotTimeModal) return;
    if (!slotTimeModal.startTime || !slotTimeModal.endTime) {
      showToast('Start and end time required', 'error'); return;
    }
    timetableService.updateSlotTime(slotTimeModal.slotId, slotTimeModal.startTime, slotTimeModal.endTime);
    setSlots([...PERIOD_SLOTS]);
    setSlotTimeModal(null);
    showToast(`${slotTimeModal.label} time updated`);
  };

  const dayEntries = entries.filter(e => e.day === activeDay);
  const getEntry = (slotId: string) => dayEntries.find(e => e.slotId === slotId);

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-0 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3 pb-3">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Timetable Manager</h2>
            <p className="text-[10px] font-bold text-slate-400">Tap a period to assign · Tap Assembly/Break to change time</p>
          </div>
          {successMsg && (
            <div className="flex items-center gap-1 text-emerald-600 text-[10px] font-black">
              <CheckCircle2 size={14} /> {successMsg}
            </div>
          )}
        </div>

        {/* Class selector */}
        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-3">
          {CLASSES.map(cls => (
            <button key={cls} onClick={() => handleClassChange(cls)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-colors ${
                selectedClass === cls
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-500 border-slate-200'
              }`}>
              {cls}
            </button>
          ))}
        </div>

        {/* Day tabs */}
        <div className="flex border-t border-slate-100 overflow-x-auto hide-scrollbar">
          {DAYS.map(day => (
            <button key={day} onClick={() => setActiveDay(day)}
              className={`shrink-0 px-3 py-3 text-[10px] font-black uppercase tracking-widest border-b-2 transition-colors ${
                activeDay === day ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400'
              }`}>
              {day.slice(0, 3)}
            </button>
          ))}
        </div>
      </div>

      {/* Timetable grid */}
      <div className="flex-1 overflow-y-auto p-4  space-y-2">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">
          {selectedClass} · {activeDay} — tap a period to assign
        </p>

        {slots.map(slot => {
          const entry = getEntry(slot.slotId);
          const isFixed = slot.isFixed;

          return (
            <button key={slot.slotId}
              onClick={() => openEdit(slot.slotId)}
              className={`w-full flex items-stretch gap-3 p-3.5 rounded-2xl border text-left transition-all active:scale-[0.98] ${
                isFixed
                  ? slotBg[slot.type] + ' opacity-90'
                  : entry
                    ? 'bg-white border-slate-200 hover:border-blue-300 shadow-sm'
                    : 'bg-white border-dashed border-slate-300 hover:border-blue-400'
              }`}>
              {/* Time column */}
              <div className="w-16 shrink-0 flex flex-col justify-center">
                <div className="text-[9px] font-black text-slate-400">{slot.startTime}</div>
                <div className="w-4 h-px bg-slate-300 my-0.5" />
                <div className="text-[9px] font-black text-slate-400">{slot.endTime}</div>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                {isFixed ? (
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-xs">{slot.label}</span>
                    <div className="flex items-center gap-1 text-[9px] font-black opacity-60">
                      <Clock size={10} /> Edit Time
                    </div>
                  </div>
                ) : entry ? (
                  <>
                    <div className="font-extrabold text-slate-900 text-sm">{entry.subject}</div>
                    <div className="text-[10px] font-bold text-slate-400 mt-0.5">{entry.teacherName}</div>
                    {entry.room && <div className="text-[9px] font-bold text-slate-300 mt-0.5">{entry.room}</div>}
                  </>
                ) : (
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <Plus size={12} />
                    <span className="text-[10px] font-black uppercase tracking-widest">{slot.label} – Tap to assign</span>
                  </div>
                )}
              </div>

              {!isFixed && entry && (
                <div className="shrink-0 self-center">
                  <Edit3 size={14} className="text-slate-300" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Slot Time Edit Modal (for Assembly / Break / Lunch) */}
      {slotTimeModal && (
        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-end">
          <div className="w-full bg-white rounded-t-3xl p-6 pb-8 animate-in slide-in-from-bottom-8 duration-300">
            <div className="flex justify-between items-center mb-5">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Edit Time Slot</p>
                <h3 className="text-lg font-black text-slate-900 mt-0.5">{slotTimeModal.label}</h3>
              </div>
              <button onClick={() => setSlotTimeModal(null)} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500">✕</button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-5">
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Start Time</label>
                <input
                  type="time"
                  value={slotTimeModal.startTime}
                  onChange={e => setSlotTimeModal(m => m ? { ...m, startTime: e.target.value } : m)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-violet-500"
                />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">End Time</label>
                <input
                  type="time"
                  value={slotTimeModal.endTime}
                  onChange={e => setSlotTimeModal(m => m ? { ...m, endTime: e.target.value } : m)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-violet-500"
                />
              </div>
            </div>

            <button onClick={handleSlotTimeSave}
              className="w-full py-3 bg-violet-600 text-white rounded-xl text-sm font-black">
              Save Time
            </button>
          </div>
        </div>
      )}

      {/* Period Edit Modal */}
      {editModal && (
        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-end">
          <div className="w-full bg-white rounded-t-3xl p-6 pb-8 animate-in slide-in-from-bottom-8 duration-300 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                  {selectedClass} · {activeDay}
                </p>
                <h3 className="text-lg font-black text-slate-900 mt-0.5">
                  {slots.find(s => s.slotId === editModal.slotId)?.label}
                </h3>
              </div>
              <button onClick={() => setEditModal(null)} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500">✕</button>
            </div>

            {conflictMsg && (
              <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-2xl p-3 mb-4">
                <AlertTriangle size={14} className="text-rose-500 mt-0.5 shrink-0" />
                <p className="text-[11px] font-bold text-rose-700">{conflictMsg}</p>
              </div>
            )}

            <div className="space-y-3">
              {/* Time Range */}
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Time Range</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[8px] font-black text-slate-400 mb-1 block">From</label>
                    <input
                      type="time"
                      value={form.startTime}
                      onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[8px] font-black text-slate-400 mb-1 block">To</label>
                    <input
                      type="time"
                      value={form.endTime}
                      onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Subject</label>
                <div className="relative">
                  <select value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 appearance-none pr-8">
                    {subjects.map(s => <option key={s}>{s}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Teacher */}
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Teacher</label>
                <div className="relative">
                  <select value={form.teacherId} onChange={e => { setForm(f => ({ ...f, teacherId: e.target.value })); setConflictMsg(''); }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 appearance-none pr-8">
                    {teachers.map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.subject})</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Room */}
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Room (optional)</label>
                <input value={form.room} onChange={e => setForm(f => ({ ...f, room: e.target.value }))}
                  placeholder="e.g. Room 12, Lab, Hall A"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500" />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              {editModal.existing && (
                <button onClick={handleDelete}
                  className="flex items-center gap-2 px-4 py-3 bg-rose-50 text-rose-600 border border-rose-200 rounded-xl text-xs font-black">
                  <Trash2 size={14} /> Remove
                </button>
              )}
              <button onClick={handleSave}
                className="flex-1 py-3 bg-slate-900 text-white rounded-xl text-sm font-black">
                Save Period
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
