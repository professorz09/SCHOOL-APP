import React, { useState, useCallback, useEffect } from 'react';
import { ArrowLeft, Plus, Trash2, ChevronDown, AlertTriangle, CheckCircle2, Edit3, Clock, BookOpen, Coffee, Sparkles, MapPin } from 'lucide-react';
import {
  timetableService, PERIOD_SLOTS, DAYS, TimetableEntry, TDay, TimetableTeacher,
} from '@/modules/timetable/timetable.service';
import { useUIStore } from '@/store/uiStore';
import { useAcademicYear } from '@/shared/context/AcademicYearContext';
import { useAuthStore } from '@/store/authStore';
import { useEditGuard } from '@/store/correctionStore';
import { supabase } from '@/lib/supabase';
import { stripClassPrefix } from '@/shared/utils/className';
import { apiPrincipal } from '@/lib/apiClient';

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
  const { currentYear } = useAcademicYear();
  const session = useAuthStore(s => s.session);
  const isYearClosed = !!currentYear && currentYear.status === 'LOCKED';
  const editGuard = useEditGuard(currentYear?.id, isYearClosed);
  // Real class list — fetched from `sections` for the active year. We keep
  // the original DB className alongside the stripped display label so the
  // save path can resolve the section_id correctly even when the DB stores
  // "Class 8" but the UI shows "8-A".
  type ClassRow = { label: string; className: string; section: string };
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState<ClassRow | null>(null);
  const [activeDay, setActiveDay] = useState<TDay>('Monday');
  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [slots, setSlots] = useState(() => [...PERIOD_SLOTS]);
  const [editModal, setEditModal] = useState<{ slotId: string; existing?: TimetableEntry } | null>(null);
  const [form, setForm] = useState<EntryFormState>({ subject: '', teacherId: '', room: '', startTime: '', endTime: '' });
  const [conflictMsg, setConflictMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  // Loading flags for the modal action buttons. Without these the buttons
  // looked stuck while the server round-trip was in flight (~half-second on
  // slow networks) and users would tap multiple times.
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [slotTimeModal, setSlotTimeModal] = useState<SlotTimeModal | null>(null);
  const [teachers, setTeachers] = useState<TimetableTeacher[]>([]);
  // School-wide subject suggestions (autocomplete). No managed list, no
  // setup screen — just "what's already been typed before".
  const [subjectSuggestions, setSubjectSuggestions] = useState<string[]>([]);
  useEffect(() => {
    apiPrincipal.subjectSuggestions().then(setSubjectSuggestions).catch(() => setSubjectSuggestions([]));
  }, []);

  const reload = useCallback((cls: ClassRow) => {
    // Service indexes entries by classId which is the "label" (e.g. "8-A")
    setEntries(timetableService.getClassTimetable(cls.label));
    setSlots([...PERIOD_SLOTS]);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await timetableService.refreshAll();
        setTeachers(timetableService.getTeachers());

        // Pull real sections for the active year + school
        if (session?.schoolId && currentYear?.id) {
          const { data, error } = await supabase
            .from('sections')
            .select('class_name, section')
            .eq('school_id', session.schoolId)
            .eq('academic_year_id', currentYear.id)
            .order('class_name')
            .order('section');
          if (error) throw error;
          const list: ClassRow[] = ((data ?? []) as { class_name: string; section: string }[])
            .map(r => ({
              label:     `${stripClassPrefix(r.class_name)}-${r.section}`,
              className: r.class_name,
              section:   r.section,
            }));
          setClasses(list);
          if (list.length > 0) {
            setSelectedClass(list[0]);
            reload(list[0]);
          }
        }
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Failed to load timetable', 'error');
      } finally {
        setClassesLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.schoolId, currentYear?.id]);

  const handleClassChange = (cls: ClassRow) => {
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
      subject: existing?.subject ?? '',
      teacherId: existing?.teacherId ?? teachers[0]?.id ?? '',
      room: existing?.room ?? '',
      startTime: slot.startTime,
      endTime: slot.endTime,
    });
    setConflictMsg('');
    setEditModal({ slotId, existing });
  };

  const handleSave = async () => {
    if (!selectedClass) return;
    if (!form.subject || !form.teacherId) return;
    if (!editGuard.canEdit) {
      showToast('Year closed — pehle Correction Mode enable karein', 'error');
      return;
    }
    const teacher = teachers.find(t => t.id === form.teacherId)!;

    // Update slot time if changed (apply BEFORE save so overlap check uses the new time)
    const slot = PERIOD_SLOTS.find(s => s.slotId === editModal!.slotId)!;
    if (form.startTime !== slot.startTime || form.endTime !== slot.endTime) {
      timetableService.updateSlotTime(editModal!.slotId, form.startTime, form.endTime);
    }

    setIsSaving(true);
    try {
      const r = await editGuard.gate(
        () => timetableService.saveEntry({
          id: editModal?.existing?.id,
          classId: selectedClass.label,
          className: selectedClass.className, // use the original DB class_name
          section: selectedClass.section,
          day: activeDay,
          slotId: editModal!.slotId,
          subject: form.subject,
          teacherId: form.teacherId,
          teacherName: teacher.name,
          room: form.room,
          // academicYearId is resolved server-side by timetable.service from the
          // active academic_year — passing a placeholder here would be ignored
          // and misleading. Service-side _activeYearId is the single source of
          // truth.
          academicYearId: '',
        }),
        {
          entityType: 'timetable_entry',
          entityId: editModal?.existing?.id ?? `${selectedClass.label}/${activeDay}/${editModal!.slotId}`,
        },
      );

      if (r === undefined) return; // user cancelled correction prompt
      if (!r.ok) {
        const c = r.conflict;
        const where = c ? `${c.className}-${c.section} · ${c.subject}` : '';
        setConflictMsg(r.reason ? `${r.reason}${where ? ` (${where})` : ''}` : 'Conflict detected');
        return;
      }
      reload(selectedClass);
      setEditModal(null);
      setSuccessMsg('Saved!');
      setTimeout(() => setSuccessMsg(''), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (editModal?.existing && selectedClass) {
      if (!editGuard.canEdit) {
        showToast('Year closed — pehle Correction Mode enable karein', 'error');
        return;
      }
      setIsDeleting(true);
      try {
        const result = await editGuard.gate(
          () => timetableService.deleteEntry(editModal.existing!.id),
          { entityType: 'timetable_entry', entityId: editModal.existing.id },
        );
        if (result === undefined) return; // user cancelled
        reload(selectedClass);
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Delete failed', 'error');
        return;
      } finally {
        setIsDeleting(false);
      }
    }
    setEditModal(null);
  };

  const handleSlotTimeSave = async () => {
    if (!slotTimeModal) return;
    if (!slotTimeModal.startTime || !slotTimeModal.endTime) {
      showToast('Start and end time required', 'error'); return;
    }
    if (!editGuard.canEdit) {
      showToast('Year closed — pehle Correction Mode enable karein', 'error');
      return;
    }
    const result = await editGuard.gate(
      () => {
        timetableService.updateSlotTime(slotTimeModal.slotId, slotTimeModal.startTime, slotTimeModal.endTime);
        return true;
      },
      { entityType: 'period_slot', entityId: slotTimeModal.slotId },
    );
    if (result === undefined) return; // user cancelled
    setSlots([...PERIOD_SLOTS]);
    setSlotTimeModal(null);
    showToast(`${slotTimeModal.label} time updated`);
  };

  const dayEntries = entries.filter(e => e.day === activeDay);
  const getEntry = (slotId: string) => dayEntries.find(e => e.slotId === slotId);

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 lg:px-6 pt-4 lg:pt-6 pb-0 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3 pb-3 lg:pb-4">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h2 className="text-xl lg:text-2xl font-black text-slate-900 uppercase tracking-tight">Timetable Manager</h2>
            <p className="text-[10px] lg:text-xs font-bold text-slate-400">Tap a period to assign · Tap Assembly/Break to change time</p>
          </div>
          {successMsg && (
            <div className="flex items-center gap-1 text-emerald-600 text-[10px] lg:text-xs font-black bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
              <CheckCircle2 size={14} /> {successMsg}
            </div>
          )}
        </div>

        {/* Class selector — show when classes load */}
        {classesLoading ? (
          <div className="pb-3 text-[10px] font-bold text-slate-400">Loading classes…</div>
        ) : classes.length === 0 ? (
          <div className="pb-3 flex items-center gap-2 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            <AlertTriangle size={12}/>
            No classes set up for the active year. Create classes from Settings → Classes first.
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-3 lg:pb-4">
            {classes.map(cls => (
              <button key={cls.label} onClick={() => handleClassChange(cls)}
                className={`shrink-0 px-4 py-1.5 lg:py-2 rounded-full text-[10px] lg:text-xs font-black uppercase tracking-widest border transition-colors ${
                  selectedClass?.label === cls.label
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                }`}>
                {cls.label}
              </button>
            ))}
          </div>
        )}

        {/* Day tabs */}
        {classes.length > 0 && (
          <div className="flex border-t border-slate-100 overflow-x-auto hide-scrollbar">
            {DAYS.map(day => (
              <button key={day} onClick={() => setActiveDay(day)}
                className={`shrink-0 px-3 lg:px-5 py-3 lg:py-3.5 text-[10px] lg:text-xs font-black uppercase tracking-widest border-b-2 transition-colors ${
                  activeDay === day ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}>
                <span className="lg:hidden">{day.slice(0, 3)}</span>
                <span className="hidden lg:inline">{day}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Timeline grid */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-6 lg:max-w-4xl lg:mx-auto lg:w-full">
        {classes.length === 0 && !classesLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <BookOpen size={40} className="mb-3 opacity-40"/>
            <p className="text-sm font-bold text-center">No classes available.</p>
            <p className="text-[11px] font-bold text-slate-300 mt-1 text-center">Set up classes for the active year first.</p>
          </div>
        ) : (
          <>
            <p className="text-[9px] lg:text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3 px-1">
              {selectedClass?.label} · {activeDay} — tap a period to assign
            </p>

            {/* Vertical timeline rail. Same visual language as teacher /
                student views — dot on rail, card to the right. Empty slots
                stay tappable so the principal can fill them. */}
            <div className="relative pl-8 lg:pl-10">
              <div className="absolute left-3 lg:left-4 top-1.5 bottom-1.5 w-px bg-slate-200" />

              <div className="space-y-3">
                {slots.map(slot => {
                  const entry = getEntry(slot.slotId);
                  const isFixed = slot.isFixed;
                  const filled = !!entry;

                  // Dot color encodes slot status:
                  //   filled class → blue
                  //   fixed (break/lunch/assembly) → amber/violet/violet
                  //   empty class slot → grey (dashed-border card prompts assign)
                  const dotColor = filled
                    ? 'bg-blue-500 ring-blue-100'
                    : isFixed
                      ? slot.type === 'LUNCH'
                        ? 'bg-amber-400 ring-amber-100'
                        : slot.type === 'ASSEMBLY'
                          ? 'bg-violet-400 ring-violet-100'
                          : 'bg-amber-300 ring-amber-100'
                      : 'bg-slate-300 ring-slate-100';
                  const cardClass = filled
                    ? 'bg-white border-slate-200 hover:border-blue-300'
                    : isFixed
                      ? slotBg[slot.type] + ' border'
                      : 'bg-white border-dashed border-slate-300 hover:border-blue-400';

                  return (
                    <div key={slot.slotId} className="relative">
                      {/* Dot on the rail */}
                      <div className={`absolute -left-[26px] lg:-left-[28px] top-3 w-4 h-4 rounded-full ring-4 ${dotColor}`} />

                      <button onClick={() => openEdit(slot.slotId)}
                        className={`w-full text-left rounded-2xl shadow-sm overflow-hidden transition-all active:scale-[0.98] ${cardClass}`}>
                        <div className="px-3 lg:px-4 py-3 flex items-center gap-3 lg:gap-4">
                          {/* Time block */}
                          <div className="shrink-0 w-20 lg:w-24">
                            <div className="text-[11px] lg:text-xs font-black text-slate-900 leading-none">
                              {slot.startTime}
                            </div>
                            <div className="text-[10px] lg:text-[11px] font-bold text-slate-400 leading-none mt-1">
                              {slot.endTime}
                            </div>
                          </div>

                          <div className="w-px self-stretch bg-slate-100" />

                          {/* Body */}
                          <div className="flex-1 min-w-0">
                            {isFixed ? (
                              <>
                                <div className="flex items-center gap-2 font-black text-sm lg:text-base uppercase tracking-tight">
                                  {slot.type === 'LUNCH'
                                    ? <Coffee size={14} className="text-amber-500" />
                                    : <Sparkles size={14} className="text-violet-500" />}
                                  {slot.label}
                                </div>
                                <div className="flex items-center gap-1 text-[10px] lg:text-[11px] font-bold text-slate-500 mt-1">
                                  <Clock size={10} /> Tap to edit time
                                </div>
                              </>
                            ) : entry ? (
                              <>
                                <div className="font-black text-sm lg:text-base uppercase tracking-tight truncate text-slate-900">
                                  {entry.subject}
                                </div>
                                <div className="flex items-center gap-2 lg:gap-3 mt-1 flex-wrap">
                                  {entry.teacherId && entry.teacherName ? (
                                    <span className="text-[10px] lg:text-[11px] font-bold text-slate-500 truncate">
                                      {entry.teacherName}
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-1 text-[10px] lg:text-[11px] font-black text-rose-600">
                                      <AlertTriangle size={10} /> Teacher suspended · reassign
                                    </span>
                                  )}
                                  {entry.room && (
                                    <span className="flex items-center gap-1 text-[10px] lg:text-[11px] font-bold text-slate-500">
                                      <MapPin size={10} /> {entry.room}
                                    </span>
                                  )}
                                </div>
                              </>
                            ) : (
                              <div className="flex items-center gap-2 text-slate-400">
                                <Plus size={14} />
                                <span className="text-[11px] lg:text-xs font-black uppercase tracking-widest">
                                  {slot.label} — assign
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Edit affordance for filled class slots */}
                          {!isFixed && entry && (
                            <div className="shrink-0">
                              <Edit3 size={14} className="text-slate-300" />
                            </div>
                          )}
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 px-1 pt-5 pb-2">
              {([
                ['Class', 'bg-blue-500'],
                ['Empty', 'bg-slate-300'],
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
                  {selectedClass?.label} · {activeDay}
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

              {/* Subject — free-text with autocomplete from school's existing subjects. */}
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Subject</label>
                <input
                  list="timetable-subject-suggestions"
                  value={form.subject}
                  onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                  placeholder="Type or pick (e.g. Mathematics)"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500"
                />
                <datalist id="timetable-subject-suggestions">
                  {subjectSuggestions.map(s => <option key={s} value={s} />)}
                </datalist>
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
                <button onClick={handleDelete} disabled={isDeleting || isSaving}
                  className="flex items-center gap-2 px-4 py-3 bg-rose-50 text-rose-600 border border-rose-200 rounded-xl text-xs font-black disabled:opacity-50 disabled:cursor-not-allowed">
                  <Trash2 size={14} /> {isDeleting ? 'Removing…' : 'Remove'}
                </button>
              )}
              <button onClick={handleSave} disabled={isSaving || isDeleting}
                className="flex-1 py-3 bg-slate-900 text-white rounded-xl text-sm font-black disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {isSaving && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                {isSaving ? 'Saving…' : 'Save Period'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
