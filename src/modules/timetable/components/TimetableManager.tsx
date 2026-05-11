import React, { useState, useCallback, useEffect } from 'react';
import { ArrowLeft, Plus, Trash2, ChevronDown, AlertTriangle, CheckCircle2, Edit3, Clock, BookOpen, Coffee, Sparkles, MapPin, Calendar } from 'lucide-react';
import { HolidaysManager, TIMETABLE_CUSTOMIZE_STORAGE_KEY, isTimetableCustomizeOn } from '@/modules/timetable/components/HolidaysManager';
import {
  timetableService, PERIOD_SLOTS, DAYS, TDay, TimetableEntry, TimetableTeacher,
  NON_TEACHING_TYPES, SlotType,
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

// Unified slot editor state. Replaces the earlier 2-modal split
// (slotTimeModal for activities + editModal for teaching). A single
// modal with a Teaching ↔ Non-teaching toggle at the top — switching
// the toggle reveals different field sets but the underlying state
// is one object. Save dispatches to the right backend based on mode.
interface SlotTimeModal {
  slotId: string;
  label: string;
  startTime: string;
  endTime: string;
  type: SlotType;
  // Teaching-mode fields (used only when mode === Teaching). Pre-filled
  // from any existing timetable_entry for the active day so principal
  // can edit/clear/save in place.
  subject: string;
  teacherId: string;
  room: string;
  existingEntryId: string | null;
  // Tracks whether this is a brand-new slot the principal is adding
  // via "Add Period". In that case we INSERT instead of UPDATE.
  isNew?: boolean;
}

// Non-teaching activity presets — shown as quick chips inside the
// "Non-teaching" branch of the editor. Picking one auto-fills label +
// type so principal doesn't have to type common cases. CUSTOM = blank
// label, principal types whatever.
const ACTIVITY_PRESETS: Array<{ type: SlotType; label: string; defaultName: string }> = [
  { type: 'PRAYER',        label: 'Prayer',       defaultName: 'Prayer' },
  { type: 'ASSEMBLY',      label: 'Assembly',     defaultName: 'Assembly' },
  { type: 'SHORT_BREAK',   label: 'Short Break',  defaultName: 'Short Break' },
  { type: 'LUNCH',         label: 'Lunch',        defaultName: 'Lunch Break' },
  { type: 'SPORTS_BREAK',  label: 'Sports',       defaultName: 'Sports Break' },
  { type: 'NO_TEACHING',   label: 'No Teaching',  defaultName: 'Free Period' },
  { type: 'CUSTOM',        label: 'Custom',       defaultName: '' },
];

interface Props { onBack: () => void; }

export const TimetableManager: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const { currentYear } = useAcademicYear();
  const session = useAuthStore(s => s.session);
  // Inline detour to the Holidays panel — opens / closes without
  // unmounting TimetableManager so state (selected class, edits)
  // is preserved on return. Early return moved to AFTER all the hook
  // calls below; otherwise toggling showHolidays changes the hook
  // count between renders and React throws "Rendered fewer/more hooks
  // than during the previous render" → app crash.
  const [showHolidays, setShowHolidays] = useState(false);
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
  const [customizeOn, setCustomizeOn] = useState<boolean>(() => isTimetableCustomizeOn());
  // Per-class slot resolution lives in reload() now; no separate effect
  // so we don't flash the school default between renders.

  // Toggle the customize flag — persists in localStorage so the
  // principal's preference survives reloads. Drives the Delete button
  // on slot edit + the "+ Add Period" tile at the bottom of the day.
  const toggleCustomize = () => {
    const next = !customizeOn;
    setCustomizeOn(next);
    try { localStorage.setItem(TIMETABLE_CUSTOMIZE_STORAGE_KEY, next ? '1' : '0'); } catch { /* quota / private mode */ }
    showToast(next ? 'Customize mode ON — Add / Delete periods' : 'Customize mode OFF');
  };
  const [conflictMsg, setConflictMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  // Loading flags for the modal action buttons. Without these the buttons
  // looked stuck while the server round-trip was in flight (~half-second on
  // slow networks) and users would tap multiple times.
  const [isSaving, setIsSaving] = useState(false);
  const [slotTimeModal, setSlotTimeModal] = useState<SlotTimeModal | null>(null);
  const [teachers, setTeachers] = useState<TimetableTeacher[]>([]);
  // School-wide subject suggestions (autocomplete). No managed list, no
  // setup screen — just "what's already been typed before".
  const [subjectSuggestions, setSubjectSuggestions] = useState<string[]>([]);
  useEffect(() => {
    apiPrincipal.subjectSuggestions().then(setSubjectSuggestions).catch(() => setSubjectSuggestions([]));
  }, []);

  // Weekly-off days (0=Sun…6=Sat) from the school's holiday config. Pulled
  // once on mount + whenever the user comes back from the Holidays panel
  // (so toggling Sunday on/off there reflects here without a hard refresh).
  // Used to grey-out / block period assignment on those days.
  const [weeklyOff, setWeeklyOff] = useState<number[]>([0]);
  useEffect(() => {
    apiPrincipal.weeklyOffGet()
      .then(r => setWeeklyOff(r.days ?? [0]))
      .catch(() => setWeeklyOff([0]));
  }, [showHolidays]);

  const reload = useCallback((cls: ClassRow) => {
    // Service indexes entries by classId which is the "label" (e.g. "8-A").
    // Slots are CLASS-SPECIFIC — earlier this used the global PERIOD_SLOTS
    // which briefly flashed the school default before the [selectedClass]
    // useEffect overwrote it, making the row appear to "disappear" on
    // class switch. Resolve per-class up front so there's no flicker.
    setEntries(timetableService.getClassTimetable(cls.label));
    setSlots(timetableService.getSlotsForClass(cls.label));
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
    setSlotTimeModal(null);
  };

  // Day-name → 0-6 index used by the weekly_off config (Sun=0 … Sat=6).
  const DAY_TO_IDX: Record<string, number> = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
    Thursday: 4, Friday: 5, Saturday: 6,
  };
  const isOffDay = (d: string) => weeklyOff.includes(DAY_TO_IDX[d] ?? -1);

  const openEdit = (slotId: string) => {
    if (isOffDay(activeDay)) {
      showToast(`${activeDay} school holiday hai — Weekly Off se hatao agar class lagani hai`, 'info');
      return;
    }
    // Edit gating: any change (assign teacher, switch type, change
    // time, delete) requires Customize mode to be ON. This protects
    // the recurring schedule from accidental edits during routine
    // viewing — principal flips the chip top-right when actually
    // editing, then locks it back.
    if (!customizeOn) {
      showToast('Edit karne ke liye top-right ka "Customize" chip on karein', 'info');
      return;
    }
    // Use the local per-class `slots` array — NOT the global
    // PERIOD_SLOTS. Per-class slots (added via Add Period) only
    // live in the resolved state, not the global default.
    const slot = slots.find(s => s.slotId === slotId);
    if (!slot) {
      showToast('Slot data refresh ho raha hai — ek baar dobara try karein', 'error');
      return;
    }
    const existing = entries.find(e => e.day === activeDay && e.slotId === slotId);
    setSlotTimeModal({
      slotId: slot.slotId,
      label: slot.label,
      startTime: slot.startTime,
      endTime: slot.endTime,
      type: slot.type,
      subject:         existing?.subject ?? '',
      teacherId:       existing?.teacherId ?? teachers[0]?.id ?? '',
      room:            existing?.room ?? '',
      existingEntryId: existing?.id ?? null,
    });
    setConflictMsg('');
  };

  // Unified save — routes to the right service call based on whether
  // the modal is in Teaching (saves an entry for the active day) or
  // Non-teaching mode (saves the slot config). Handles new-slot
  // creation in both modes too.
  const handleUnifiedSlotSave = async () => {
    if (!slotTimeModal || !selectedClass) return;
    if (!editGuard.canEdit) {
      showToast('Year closed — pehle Correction Mode enable karein', 'error');
      return;
    }
    if (!slotTimeModal.startTime || !slotTimeModal.endTime) {
      showToast('Start and end time required', 'error'); return;
    }
    if (slotTimeModal.startTime >= slotTimeModal.endTime) {
      showToast('Start time end time se pehle hona chahiye', 'error'); return;
    }

    const isTeaching = slotTimeModal.type === 'CLASS';

    if (isTeaching) {
      if (!slotTimeModal.subject.trim()) { showToast('Subject zaroori hai', 'error'); return; }
      if (!slotTimeModal.teacherId)      { showToast('Teacher select karein', 'error'); return; }
    } else {
      if (!slotTimeModal.label.trim())   { showToast('Activity ka naam zaroori hai', 'error'); return; }
    }

    setIsSaving(true);
    setConflictMsg('');
    try {
      let slotId = slotTimeModal.slotId;
      // ── Step 1: ensure the slot row exists with the right type/time.
      // addCustomSlot returns the new row's UUID directly — earlier we
      // tried to "find" the fresh slot by matching start_time + label
      // which mis-identified the wrong row when two slots had the same
      // start time, then the entry insert hit the (section,day,slot)
      // unique constraint with a duplicate.
      if (slotTimeModal.isNew) {
        slotId = await timetableService.addCustomSlot({
          className: selectedClass.label,
          name:      slotTimeModal.label || (isTeaching ? `Period ${slots.length + 1}` : 'Activity'),
          startTime: slotTimeModal.startTime,
          endTime:   slotTimeModal.endTime,
          type:      slotTimeModal.type,
        });
      } else {
        await timetableService.updateSlot(slotTimeModal.slotId, {
          name: slotTimeModal.label,
          startTime: slotTimeModal.startTime,
          endTime: slotTimeModal.endTime,
          type: slotTimeModal.type,
        });
      }

      // ── Step 2: handle the entry side (teaching mode only)
      if (isTeaching) {
        const teacher = teachers.find(t => t.id === slotTimeModal.teacherId);
        if (!teacher) throw new Error('Teacher not found');
        const result = await timetableService.saveEntry({
          id:             slotTimeModal.existingEntryId ?? undefined,
          academicYearId: currentYear?.id ?? '',
          className:      selectedClass.className,
          section:        selectedClass.section,
          classId:        selectedClass.label,
          day:            activeDay,
          slotId,
          subject:        slotTimeModal.subject.trim(),
          teacherId:      teacher.id,
          teacherName:    teacher.name,
          room:           slotTimeModal.room.trim(),
        });
        if (!result.ok) {
          setConflictMsg(result.reason ?? 'Save failed');
          return;
        }
      } else if (slotTimeModal.existingEntryId) {
        // Switched from teaching → non-teaching: drop the entry on
        // this slot for the active day so the cell renders cleanly
        // as the new activity.
        await timetableService.deleteEntry(slotTimeModal.existingEntryId);
      }

      setSlots(timetableService.getSlotsForClass(selectedClass.label));
      setEntries(timetableService.getClassTimetable(selectedClass.label));
      setSlotTimeModal(null);
      showToast(slotTimeModal.isNew ? 'Period added' : 'Saved');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSlotDelete = async () => {
    if (!slotTimeModal || slotTimeModal.isNew) return;
    if (!editGuard.canEdit) { showToast('Year closed — pehle Correction Mode enable karein', 'error'); return; }
    const ok = await useUIStore.getState().askConfirm({
      title: 'Slot delete karein?',
      message: `${slotTimeModal.label} hata diya jayega. Agar koi class is slot pe assigned hai, server reject karega — pehle assignments hatao.`,
      destructive: true,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await timetableService.deleteSlot(slotTimeModal.slotId);
      setSlots([...PERIOD_SLOTS]);
      setSlotTimeModal(null);
      showToast('Slot deleted');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Delete failed', 'error');
    }
  };

  const dayEntries = entries.filter(e => e.day === activeDay);
  const getEntry = (slotId: string) => dayEntries.find(e => e.slotId === slotId);

  // Holidays panel detour — render now that every hook above has run
  // for this render pass, so flipping back-and-forth doesn't change
  // the hook order on subsequent renders.
  if (showHolidays) return <HolidaysManager onBack={() => setShowHolidays(false)} />;

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {/* Header.
          Mobile: title row + actions row stacked, so 3-button overflow
          is impossible. Desktop (lg+): single row with full labels.
          Earlier the row tried to fit Title + Customize + Holidays in
          one line and Holidays got truncated. */}
      <div className="bg-white border-b border-slate-100 px-4 lg:px-6 pt-4 lg:pt-6 pb-0 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3 pb-2 lg:pb-4">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors shrink-0">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg lg:text-2xl font-black text-slate-900 uppercase tracking-tight leading-tight truncate">Timetable</h2>
            <p className="text-[10px] lg:text-xs font-bold text-slate-400 truncate">Tap any period to assign / edit</p>
          </div>
          {successMsg && (
            <div className="hidden lg:flex items-center gap-1 text-emerald-600 text-xs font-black bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full shrink-0">
              <CheckCircle2 size={14} /> {successMsg}
            </div>
          )}
          {/* Desktop action buttons — full labels. Mobile uses the
              second row below to avoid overflow. */}
          <div className="hidden lg:flex items-center gap-2 shrink-0">
            <button
              onClick={toggleCustomize}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wide active:scale-95 transition-transform ${
                customizeOn
                  ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}>
              <Edit3 size={13} /> Customize {customizeOn && '· ON'}
            </button>
            <button
              onClick={() => setShowHolidays(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-black uppercase tracking-wide active:scale-95 transition-transform">
              <Calendar size={13} /> Weekly Off
            </button>
          </div>
        </div>

        {/* Mobile-only action row — same buttons, full width below
            the title so neither overflows. Hidden on desktop where
            both fit in the header row already. */}
        <div className="flex lg:hidden items-center gap-2 pb-3">
          <button
            onClick={toggleCustomize}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wide active:scale-95 transition-transform ${
              customizeOn
                ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
            }`}>
            <Edit3 size={13} /> Customize {customizeOn && '· ON'}
          </button>
          <button
            onClick={() => setShowHolidays(true)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-[11px] font-black uppercase tracking-wide active:scale-95 transition-transform">
            <Calendar size={13} /> Weekly Off
          </button>
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

        {/* Day pills — same visual language as the filter chips on
            the Students screen: rounded, scrollable, clearly active.
            Off-days carry a faint rose tint + "OFF" badge so a
            principal can see at a glance which days the school is
            closed. Earlier this was a flat underline-tabs row that
            blended in with the header. */}
        {classes.length > 0 && (
          <div className="flex gap-2 px-3 pb-3 pt-1 border-t border-slate-100 overflow-x-auto hide-scrollbar">
            {DAYS.map(day => {
              const off = isOffDay(day);
              const active = activeDay === day;
              return (
                <button
                  key={day}
                  onClick={() => setActiveDay(day)}
                  className={`shrink-0 flex items-center gap-1.5 px-3.5 lg:px-4 py-2 rounded-full text-[10px] lg:text-xs font-black uppercase tracking-widest transition-colors border ${
                    active
                      ? off
                        ? 'bg-rose-600 text-white border-rose-600 shadow-sm shadow-rose-200'
                        : 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-200'
                      : off
                        ? 'bg-rose-50 text-rose-600 border-rose-100 hover:bg-rose-100'
                        : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span className="lg:hidden">{day.slice(0, 3)}</span>
                  <span className="hidden lg:inline">{day}</span>
                  {off && (
                    <span className={`text-[7.5px] lg:text-[8.5px] font-black px-1.5 py-px rounded-full ${
                      active ? 'bg-white/25 text-white' : 'bg-rose-100 text-rose-600'
                    }`}>
                      OFF
                    </span>
                  )}
                </button>
              );
            })}
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
        ) : isOffDay(activeDay) ? (
          /* Weekly-off day — show a clear "school closed" panel instead
             of a period grid the principal can't actually use. The
             open-edit handler also blocks taps as a defence in depth. */
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center mb-4">
              <Calendar size={28} />
            </div>
            <p className="text-base font-black text-slate-700">{activeDay} — School Holiday</p>
            <p className="text-xs font-bold text-slate-400 mt-1 max-w-xs text-center">
              Is din school band hai. Class assign nahi kar sakte. Holidays se {activeDay} ka weekly-off hatao agar lagani hai.
            </p>
            <button
              onClick={() => setShowHolidays(true)}
              className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-[11px] font-black uppercase tracking-widest rounded-xl active:scale-95 transition-transform">
              <Calendar size={13}/> Manage Holidays
            </button>
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

                      <button
                        onClick={() => openEdit(slot.slotId)}
                        className={`w-full text-left rounded-2xl shadow-sm overflow-hidden transition-all ${
                          customizeOn ? 'active:scale-[0.98]' : 'cursor-default opacity-95'
                        } ${cardClass}`}>
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
                                {customizeOn && (
                                  <div className="flex items-center gap-1 text-[10px] lg:text-[11px] font-bold text-slate-500 mt-1">
                                    <Clock size={10} /> Tap to edit time
                                  </div>
                                )}
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

                          {/* Edit affordance for filled class slots —
                              shown only when Customize is ON (cards are
                              read-only otherwise so the pencil icon
                              would be misleading). */}
                          {!isFixed && entry && customizeOn && (
                            <div className="shrink-0">
                              <Edit3 size={14} className="text-slate-300" />
                            </div>
                          )}
                        </div>
                      </button>
                    </div>
                  );
                })}

                {/* Add Period — only when Holidays → Customize Timetable
                    toggle is ON. Lets the principal add an extra slot
                    to THIS class without touching the school default. */}
                {customizeOn && (
                  <div className="relative">
                    <div className="absolute -left-[26px] lg:-left-[28px] top-3 w-4 h-4 rounded-full ring-4 bg-blue-300 ring-blue-100" />
                    <button
                      onClick={async () => {
                        // Confirm first — adding a class-scoped slot
                        // creates a custom row in timetable_periods that
                        // diverges this class from the school default,
                        // so we make the principal acknowledge it.
                        const ok = await useUIStore.getState().askConfirm({
                          title: 'Naya period add karein?',
                          message: `${selectedClass?.label} ke liye ek naya slot banega. Aap iska type (Teaching / Non-teaching), label aur time set kar sakte ho. Continue?`,
                          confirmLabel: 'Add',
                          cancelLabel:  'Cancel',
                        });
                        if (!ok) return;
                        // Stack the new slot just after the last existing
                        // one. Default end = start + 40 min so principal
                        // doesn't see a half-empty form.
                        const last = slots[slots.length - 1];
                        const startTime = last?.endTime ?? '14:00';
                        const [h, m] = startTime.split(':').map(Number);
                        const endTotal = (h * 60 + m + 40) % (24 * 60);
                        const endTime = `${String(Math.floor(endTotal / 60)).padStart(2, '0')}:${String(endTotal % 60).padStart(2, '0')}`;
                        setSlotTimeModal({
                          slotId: 'new-' + Date.now(),
                          label: `Period ${slots.filter(s => s.type === 'CLASS').length + 1}`,
                          startTime,
                          endTime,
                          type: 'CLASS',
                          subject: '',
                          teacherId: teachers[0]?.id ?? '',
                          room: '',
                          existingEntryId: null,
                          isNew: true,
                        });
                      }}
                      className="w-full text-left rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50/40 hover:bg-blue-50 hover:border-blue-400 active:scale-[0.98] transition-all px-4 py-3 flex items-center justify-center gap-2 text-blue-700 font-black text-xs uppercase tracking-widest">
                      <Plus size={14} /> Add Period
                    </button>
                  </div>
                )}
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

      {/* Unified slot editor.
          Top toggle: Teaching ↔ Non-teaching.
          • Teaching: subject + teacher + time → saves a timetable_entry
            for the active day AND, if needed, flips the slot's type to
            CLASS so it stops rendering as an activity row.
          • Non-teaching: label + activity preset + time → saves the
            slot row (timetable_periods) and clears any teaching entry
            that was on this slot for the active day.
          • Delete button visible whenever the Customize toggle is ON
            (in Holidays) — for both modes. */}
      {slotTimeModal && (() => {
        const isTeachingMode = slotTimeModal.type === 'CLASS';
        return (
        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-end">
          <div className="w-full bg-white rounded-t-3xl p-6 pb-8 animate-in slide-in-from-bottom-8 duration-300 max-h-[92vh] overflow-y-auto">
            {/* Header: just context (class + day + new/edit) — slot
                label lives in the input below, no need to echo it as a
                big H3 too. Earlier "Period 8" appeared twice — title +
                label field — which read like a bug. */}
            <div className="flex items-start justify-between mb-4">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  {slotTimeModal.isNew ? 'Add Period' : 'Edit Period'}
                </p>
                <p className="text-[11px] font-bold text-slate-400 mt-0.5">
                  {selectedClass?.label}
                  {' · '}{activeDay}
                </p>
              </div>
              <button onClick={() => setSlotTimeModal(null)} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 shrink-0">✕</button>
            </div>

            {/* Mode toggle — Teaching vs Non-teaching. The choice
                drives which fields appear below and which save path
                runs. Switching modes preserves time + label. */}
            <div className="grid grid-cols-2 gap-2 mb-4 p-1 bg-slate-100 rounded-2xl">
              <button
                onClick={() => setSlotTimeModal(m => m ? {
                  ...m,
                  type: 'CLASS',
                  // Reset label to a sensible default if user is leaving
                  // an activity preset (Lunch/Prayer) for teaching.
                  label: ACTIVITY_PRESETS.some(p => p.defaultName === m.label) || !m.label.trim()
                    ? `Period ${slots.filter(s => s.type === 'CLASS').length + (m.isNew ? 1 : 0)}`
                    : m.label,
                } : m)}
                className={`py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-colors ${
                  isTeachingMode ? 'bg-blue-600 text-white shadow-sm' : 'bg-transparent text-slate-500'
                }`}>
                Teaching
              </button>
              <button
                onClick={() => setSlotTimeModal(m => m ? {
                  ...m,
                  type: m.type === 'CLASS' ? 'SHORT_BREAK' : m.type,
                  label: m.type === 'CLASS' || m.label.startsWith('Period ') ? 'Short Break' : m.label,
                } : m)}
                className={`py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-colors ${
                  !isTeachingMode ? 'bg-amber-500 text-white shadow-sm' : 'bg-transparent text-slate-500'
                }`}>
                Non-Teaching
              </button>
            </div>

            {/* Common: time range */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Start</label>
                <input
                  type="time"
                  value={slotTimeModal.startTime}
                  onChange={e => setSlotTimeModal(m => m ? { ...m, startTime: e.target.value } : m)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">End</label>
                <input
                  type="time"
                  value={slotTimeModal.endTime}
                  onChange={e => setSlotTimeModal(m => m ? { ...m, endTime: e.target.value } : m)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {isTeachingMode ? (
              <>
                {/* Period label (e.g. "Period 1") — small, optional. */}
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Period Label</label>
                <input
                  type="text"
                  value={slotTimeModal.label}
                  onChange={e => setSlotTimeModal(m => m ? { ...m, label: e.target.value } : m)}
                  placeholder="e.g. Period 1"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 mb-3"
                />

                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Subject</label>
                <input
                  list="timetable-subject-suggestions"
                  value={slotTimeModal.subject}
                  onChange={e => setSlotTimeModal(m => m ? { ...m, subject: e.target.value } : m)}
                  placeholder="e.g. Mathematics"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 mb-3"
                />
                <datalist id="timetable-subject-suggestions">
                  {subjectSuggestions.map(s => <option key={s} value={s} />)}
                </datalist>

                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Teacher</label>
                <div className="relative mb-3">
                  <select
                    value={slotTimeModal.teacherId}
                    onChange={e => setSlotTimeModal(m => m ? { ...m, teacherId: e.target.value } : m)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 appearance-none pr-8">
                    {teachers.map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.subject})</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>

                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Room (optional)</label>
                <input
                  value={slotTimeModal.room}
                  onChange={e => setSlotTimeModal(m => m ? { ...m, room: e.target.value } : m)}
                  placeholder="e.g. Room 12 / Lab"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 mb-3" />

                {conflictMsg && (
                  <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-xl p-3 mb-3">
                    <AlertTriangle size={14} className="text-rose-500 mt-0.5 shrink-0" />
                    <p className="text-[11px] font-bold text-rose-700">{conflictMsg}</p>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Activity preset chips — quick-pick common labels. */}
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Activity type</p>
                <div className="grid grid-cols-3 gap-1.5 mb-3">
                  {ACTIVITY_PRESETS.map(p => (
                    <button key={p.type}
                      onClick={() => setSlotTimeModal(m => m ? {
                        ...m,
                        type: p.type,
                        label: ACTIVITY_PRESETS.some(x => x.defaultName === m.label) || !m.label.trim()
                          ? p.defaultName
                          : m.label,
                      } : m)}
                      className={`px-2 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-colors ${
                        slotTimeModal.type === p.type
                          ? 'bg-amber-500 text-white border-amber-500'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
                      }`}>
                      {p.label}
                    </button>
                  ))}
                </div>

                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Activity name</label>
                <input
                  type="text"
                  value={slotTimeModal.label}
                  onChange={e => setSlotTimeModal(m => m ? { ...m, label: e.target.value } : m)}
                  placeholder="e.g. Prayer / Lunch / Yoga"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-amber-500 mb-3"
                />

                <p className="text-[10px] font-bold text-slate-500 bg-slate-50 rounded-xl p-2.5 mb-3">
                  Non-teaching slot — koi teacher allot karne ki zaroorat nahi.
                </p>
              </>
            )}

            <div className="flex gap-2">
              {/* Delete shown for existing slots only when Customize toggle
                  is ON — protects accidental deletes on the default
                  schedule. */}
              {!slotTimeModal.isNew && customizeOn && (
                <button onClick={handleSlotDelete}
                  className="px-4 py-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-sm font-black active:scale-95 transition-transform">
                  Delete
                </button>
              )}
              <button
                onClick={handleUnifiedSlotSave}
                disabled={isSaving}
                className={`flex-1 py-3 text-white rounded-xl text-sm font-black active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed ${
                  isTeachingMode ? 'bg-blue-600 hover:bg-blue-700' : 'bg-amber-600 hover:bg-amber-700'
                }`}>
                {isSaving && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                {isSaving ? 'Saving…' : slotTimeModal.isNew ? 'Create' : 'Save'}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

    </div>
  );
};
