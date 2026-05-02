import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Save, ChevronRight, Search, Lock,
  ShieldCheck, Hourglass, AlertCircle,
} from 'lucide-react';
import { teacherService } from '@/roles/teacher/teacher.service';
import { TeacherClass } from '@/shared/types/teacher.types';
import { useUIStore } from '@/shared/store/uiStore';
import type { DateAttendanceStatus } from '@/modules/attendance/attendance.service';

type View = 'CLASSES' | 'CLASS_DETAIL';

interface Props { onBack: () => void; }

interface AttendanceStudentRow {
  id: string; name: string; rollNo: string; isPresent: boolean;
}

interface ClassRecord {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  isLocked: boolean;
  students: AttendanceStudentRow[];
  totalPresent: number;
  totalAbsent: number;
  totalStudents: number;
}

const todayStr = () => new Date().toISOString().split('T')[0];

const buildDateStrip = (count = 14): string[] => {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().split('T')[0]);
  }
  return out;
};

const dayShort = (d: string) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short' });
const dayNum   = (d: string) => new Date(d).getDate();
const monthShort = (d: string) => new Date(d).toLocaleDateString('en-IN', { month: 'short' });
const isToday  = (d: string) => d === todayStr();
const isPast   = (d: string) => d < todayStr();

const STATUS_DOT: Record<DateAttendanceStatus, string> = {
  NOT_MARKED: 'bg-slate-300',
  PENDING:    'bg-amber-400',
  APPROVED:   'bg-emerald-500',
};

export const AttendanceManager: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();

  const [view, setView]               = useState<View>('CLASSES');
  const [classes, setClasses]         = useState<TeacherClass[]>([]);
  const [todayStatuses, setTodayStatuses] = useState<Record<string, DateAttendanceStatus>>({});
  const [selectedClass, setSelectedClass] = useState<TeacherClass | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr());
  const [search, setSearch]           = useState('');
  const [editStudents, setEditStudents] = useState<AttendanceStudentRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [dateStatuses, setDateStatuses] = useState<Record<string, DateAttendanceStatus>>({});
  const [selectedRecord, setSelectedRecord] = useState<ClassRecord | null>(null);
  const [isLoadingDate, setIsLoadingDate] = useState(false);

  const dateStrip = useMemo(() => buildDateStrip(14), []);

  // Initial class list + today's status badge per class
  useEffect(() => {
    teacherService.getClasses().then(async cs => {
      setClasses(cs);
      // Fetch today's status for all classes in one batch (per class).
      const today = todayStr();
      const entries = await Promise.all(cs.map(async c => {
        const map = await teacherService.getStatusForClass(c.id, [today]);
        return [c.id, map[today] ?? 'NOT_MARKED'] as const;
      }));
      const status: Record<string, DateAttendanceStatus> = {};
      for (const [id, s] of entries) status[id] = s;
      setTodayStatuses(status);
    }).catch(() => setClasses([]));
  }, []);

  // Load date strip statuses + selected-date record whenever class/date changes.
  useEffect(() => {
    if (!selectedClass) return;
    let cancelled = false;
    setIsLoadingDate(true);
    teacherService.getStatusForClass(selectedClass.id, dateStrip)
      .then(map => { if (!cancelled) setDateStatuses(map); })
      .catch(() => { if (!cancelled) setDateStatuses({}); });

    teacherService.getRecordByClassAndDate(selectedClass.id, selectedDate, {
      className: selectedClass.className, section: selectedClass.section, subject: selectedClass.subject,
    })
      .then(rec => {
        if (cancelled) return;
        if (rec) {
          setSelectedRecord({
            id: rec.id, status: rec.status, isLocked: rec.isLocked,
            students: rec.students,
            totalPresent: rec.totalPresent, totalAbsent: rec.totalAbsent, totalStudents: rec.totalStudents,
          });
          setEditStudents([]);
        } else {
          setSelectedRecord(null);
          if (isToday(selectedDate)) {
            setEditStudents(selectedClass.students.map(s => ({
              id: s.id, name: s.name, rollNo: s.rollNo, isPresent: false,
            })));
          } else {
            setEditStudents([]);
          }
        }
      })
      .catch(() => { if (!cancelled) { setSelectedRecord(null); setEditStudents([]); } })
      .finally(() => { if (!cancelled) setIsLoadingDate(false); });

    return () => { cancelled = true; };
  }, [selectedClass, selectedDate, dateStrip]);

  // Auto-scroll date strip to today on enter
  const stripRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (view !== 'CLASS_DETAIL' || !stripRef.current) return;
    const todayEl = stripRef.current.querySelector('[data-today="true"]');
    if (todayEl && 'scrollIntoView' in todayEl) {
      (todayEl as HTMLElement).scrollIntoView({ behavior: 'auto', inline: 'end', block: 'nearest' });
    }
  }, [view]);

  /* ── Toggle editing buffer ──────────────────────────────────────── */
  const toggleEditStudent = (id: string) => {
    setEditStudents(prev => prev.map(s => s.id === id ? { ...s, isPresent: !s.isPresent } : s));
  };
  const setAll = (present: boolean) => {
    setEditStudents(prev => prev.map(s => ({ ...s, isPresent: present })));
  };

  /* ── Submit (only for today, no record yet) ───────────────────── */
  const handleSubmit = async () => {
    if (!selectedClass) return;
    setIsSubmitting(true);
    try {
      await teacherService.submitAttendance(
        selectedClass.id,
        selectedDate,
        editStudents.map(s => ({ id: s.id, isPresent: s.isPresent })),
      );
      // Re-fetch the just-submitted record so the view becomes read-only.
      const rec = await teacherService.getRecordByClassAndDate(selectedClass.id, selectedDate, {
        className: selectedClass.className, section: selectedClass.section, subject: selectedClass.subject,
      });
      if (rec) {
        setSelectedRecord({
          id: rec.id, status: rec.status, isLocked: rec.isLocked,
          students: rec.students, totalPresent: rec.totalPresent,
          totalAbsent: rec.totalAbsent, totalStudents: rec.totalStudents,
        });
        setEditStudents([]);
      }
      const map = await teacherService.getStatusForClass(selectedClass.id, dateStrip);
      setDateStatuses(map);
      setTodayStatuses(t => ({ ...t, [selectedClass.id]: map[selectedDate] ?? 'PENDING' }));
      showToast('Attendance submitted — Pending Principal Approval');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Submit failed', 'error');
    } finally { setIsSubmitting(false); }
  };

  /* ── Helpers ──────────────────────────────────────────────────── */
  const renderHeader = (title: string, back: () => void, sub?: string) => (
    <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-3 sticky top-0 z-10 shadow-sm">
      <div className="flex items-center gap-3">
        <button onClick={back} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">{title}</h2>
          {sub && <p className="text-[10px] font-bold text-slate-400">{sub}</p>}
        </div>
      </div>
    </div>
  );

  /* ════════════════ CLASSES VIEW ══════════════════════════════════ */
  if (view === 'CLASSES') return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Attendance', onBack, 'Select a class to view or mark attendance')}

      <div className="flex-1 overflow-y-auto p-4  space-y-3">
        {classes.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
            <p className="text-xs font-bold text-slate-400">No classes assigned to you yet.</p>
            <p className="text-[10px] font-bold text-slate-300 mt-1">Ask your principal to grant section permissions.</p>
          </div>
        )}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {classes.map((cls, idx) => {
            const status = todayStatuses[cls.id] ?? 'NOT_MARKED';
            return (
              <button key={cls.id}
                onClick={() => { setSelectedClass(cls); setSelectedDate(todayStr()); setView('CLASS_DETAIL'); }}
                className={`w-full flex items-center gap-3 px-4 py-4 text-left active:bg-slate-50 transition-colors ${idx < classes.length - 1 ? 'border-b border-slate-100' : ''}`}>
                <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-sm shrink-0">
                  {cls.className.replace('Class ', '')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold text-slate-900 text-sm">{cls.className}-{cls.section}</div>
                  <div className="text-[10px] font-bold text-slate-400 mt-0.5">{cls.subject} · {cls.studentCount} students</div>
                </div>
                {status === 'NOT_MARKED' && (
                  <span className="text-[9px] font-black text-blue-700 bg-blue-50 border border-blue-100 px-2 py-1 rounded-full uppercase">
                    Mark Today
                  </span>
                )}
                {status === 'PENDING' && (
                  <span className="flex items-center gap-1 text-[9px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full uppercase">
                    <Hourglass size={9}/> Pending
                  </span>
                )}
                {status === 'APPROVED' && (
                  <span className="flex items-center gap-1 text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full uppercase">
                    <ShieldCheck size={9}/> Approved
                  </span>
                )}
                <ChevronRight size={16} className="text-slate-300" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  /* ════════════════ CLASS DETAIL ══════════════════════════════════ */
  if (view === 'CLASS_DETAIL' && selectedClass) {
    const isTodayDate = isToday(selectedDate);
    const isPastDate  = isPast(selectedDate);
    const isFutureDate = !isTodayDate && !isPastDate;

    // Decide what to render in the body
    const displayStudents = selectedRecord ? selectedRecord.students : editStudents;
    const filtered = displayStudents.filter(s =>
      s.name.toLowerCase().includes(search.toLowerCase()) || s.rollNo.includes(search),
    );
    const present = displayStudents.filter(s => s.isPresent).length;
    const absent  = displayStudents.length - present;
    const pct     = displayStudents.length > 0 ? Math.round((present / displayStudents.length) * 100) : 0;

    // Teacher can only mark today if no record exists yet. Once submitted, the
    // record is read-only — only the principal can approve/reject/edit.
    const canEdit = isTodayDate && !selectedRecord;

    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        {/* Header */}
        <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-0 sticky top-0 z-10 shadow-sm">
          <div className="flex items-center gap-3 pb-3">
            <button onClick={() => { setView('CLASSES'); setEditStudents([]); setSelectedRecord(null); }} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">{selectedClass.className}-{selectedClass.section}</h2>
              <p className="text-[10px] font-bold text-slate-400">{selectedClass.subject} · {selectedClass.studentCount} students</p>
            </div>
          </div>

          {/* Date strip */}
          <div ref={stripRef} className="flex border-t border-slate-100 overflow-x-auto hide-scrollbar -mx-4 px-4 pt-1.5 pb-1">
            {dateStrip.map(d => {
              const isSelected = selectedDate === d;
              const status     = dateStatuses[d] ?? 'NOT_MARKED';
              const today      = isToday(d);
              return (
                <button key={d}
                  data-today={today ? 'true' : 'false'}
                  onClick={() => { setSelectedDate(d); setEditStudents([]); setSearch(''); }}
                  className={`shrink-0 flex flex-col items-center mx-0.5 px-2.5 py-1.5 rounded-xl border-2 transition-colors ${
                    isSelected
                      ? today ? 'bg-blue-600 border-blue-600 text-white' : 'bg-slate-800 border-slate-800 text-white'
                      : today ? 'border-blue-200 text-blue-600 bg-blue-50' : 'border-transparent text-slate-400'
                  }`}>
                  <span className="text-[9px] font-black uppercase tracking-widest">{dayShort(d)}</span>
                  <span className="text-base font-black tabular-nums leading-none my-0.5">{dayNum(d)}</span>
                  <span className="text-[8px] font-bold uppercase tracking-wide opacity-75">{monthShort(d)}</span>
                  <div className={`w-1.5 h-1.5 rounded-full mt-1 ${isSelected ? 'bg-white' : STATUS_DOT[status]}`}/>
                </button>
              );
            })}
          </div>
        </div>

        {/* Status bar for selected date */}
        <div className="bg-white border-b border-slate-100 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-black text-slate-900 text-sm">
                {new Date(selectedDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
              <div className="text-[10px] font-bold text-slate-400 mt-0.5">
                {selectedRecord
                  ? (selectedRecord.status === 'PENDING' ? 'Pending Principal Approval'
                    : selectedRecord.status === 'APPROVED' ? 'Approved by Principal'
                    : 'Rejected — please re-submit')
                  : isTodayDate ? 'Not yet marked' : isFutureDate ? 'Future date' : 'No attendance recorded'}
              </div>
            </div>
            {selectedRecord && selectedRecord.status === 'PENDING' && (
              <span className="flex items-center gap-1 text-[9px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full uppercase">
                <Hourglass size={9}/> Pending
              </span>
            )}
            {selectedRecord && selectedRecord.status === 'APPROVED' && (
              <span className="flex items-center gap-1 text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full uppercase">
                <ShieldCheck size={9}/> Approved
              </span>
            )}
            {selectedRecord && selectedRecord.status === 'REJECTED' && (
              <span className="flex items-center gap-1 text-[9px] font-black text-rose-700 bg-rose-50 border border-rose-200 px-2 py-1 rounded-full uppercase">
                Rejected
              </span>
            )}
          </div>

          {/* Stats (when there is data) */}
          {(selectedRecord || canEdit) && (
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="text-center bg-emerald-50 rounded-xl py-2">
                <div className="text-base font-black text-emerald-600 tabular-nums">{present}</div>
                <div className="text-[8px] font-black text-emerald-500 uppercase tracking-wide">Present</div>
              </div>
              <div className="text-center bg-rose-50 rounded-xl py-2">
                <div className="text-base font-black text-rose-500 tabular-nums">{absent}</div>
                <div className="text-[8px] font-black text-rose-400 uppercase tracking-wide">Absent</div>
              </div>
              <div className="text-center bg-slate-100 rounded-xl py-2">
                <div className={`text-base font-black tabular-nums ${pct >= 75 ? 'text-emerald-600' : 'text-rose-500'}`}>{pct}%</div>
                <div className="text-[8px] font-black text-slate-500 uppercase tracking-wide">Rate</div>
              </div>
            </div>
          )}
        </div>

        {/* Edit/Submit toolbar (only when canEdit) */}
        {canEdit && (
          <div className="bg-white border-b border-slate-100 px-4 py-3 space-y-3">
            <div className="flex gap-2">
              <button onClick={() => setAll(true)}
                className="flex-1 py-2 bg-emerald-500 text-white text-[11px] font-black rounded-xl active:scale-95 transition-transform">
                All Present
              </button>
              <button onClick={() => setAll(false)}
                className="flex-1 py-2 bg-rose-500 text-white text-[11px] font-black rounded-xl active:scale-95 transition-transform">
                All Absent
              </button>
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search students…"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 font-bold text-sm outline-none focus:border-indigo-500"/>
            </div>
          </div>
        )}

        {/* Body banners */}
        {isLoadingDate && (
          <div className="mx-4 mt-3 text-center text-[11px] font-bold text-slate-400">Loading…</div>
        )}
        {!isLoadingDate && isPastDate && !selectedRecord && (
          <div className="mx-4 mt-3 bg-slate-100 border border-slate-200 rounded-xl px-3 py-2.5 flex items-center gap-2">
            <Lock size={14} className="text-slate-400 shrink-0"/>
            <span className="text-[11px] font-bold text-slate-500">No attendance was marked for this day. Past dates cannot be edited.</span>
          </div>
        )}
        {!isLoadingDate && isFutureDate && (
          <div className="mx-4 mt-3 bg-slate-100 border border-slate-200 rounded-xl px-3 py-2.5 flex items-center gap-2">
            <Lock size={14} className="text-slate-400 shrink-0"/>
            <span className="text-[11px] font-bold text-slate-500">Cannot mark attendance for future dates.</span>
          </div>
        )}
        {!isLoadingDate && isPastDate && selectedRecord && (
          <div className="mx-4 mt-3 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 flex items-center gap-2">
            <AlertCircle size={14} className="text-amber-500 shrink-0"/>
            <span className="text-[11px] font-bold text-amber-700">This is a past record. Only the Principal can edit/approve it.</span>
          </div>
        )}
        {!isLoadingDate && isTodayDate && selectedRecord && selectedRecord.status === 'PENDING' && (
          <div className="mx-4 mt-3 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 flex items-center gap-2">
            <Hourglass size={14} className="text-blue-500 shrink-0"/>
            <span className="flex-1 text-[11px] font-bold text-blue-700">Submitted — pending principal approval. Only the principal can edit now.</span>
          </div>
        )}
        {!isLoadingDate && isTodayDate && selectedRecord && selectedRecord.status === 'APPROVED' && (
          <div className="mx-4 mt-3 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5 flex items-center gap-2">
            <ShieldCheck size={14} className="text-emerald-600 shrink-0"/>
            <span className="text-[11px] font-bold text-emerald-700">Already approved — locked.</span>
          </div>
        )}

        {/* Student list (read-only OR editable based on canEdit) */}
        <div className="flex-1 overflow-y-auto pb-40">
          {(selectedRecord || canEdit) && (
            <div className="p-4">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                {filtered.map((stu, idx) => {
                  const onClick = canEdit ? () => toggleEditStudent(stu.id) : undefined;
                  return (
                    <div key={stu.id}
                      onClick={onClick}
                      className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                        idx < filtered.length - 1 ? 'border-b border-slate-100' : ''
                      } ${stu.isPresent ? 'bg-emerald-50/40' : 'bg-rose-50/40'} ${canEdit ? 'cursor-pointer active:bg-slate-100' : ''}`}>
                      <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-xs shrink-0">
                        {stu.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-900 text-sm">{stu.name}</div>
                        <div className="text-[10px] font-bold text-slate-400 mt-0.5">Roll {stu.rollNo.padStart(2, '0')}</div>
                      </div>
                      {stu.isPresent
                        ? <span className="text-[9px] font-black text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-lg uppercase">Present</span>
                        : <span className="text-[9px] font-black text-rose-700 bg-rose-100 px-2.5 py-1 rounded-lg uppercase">Absent</span>
                      }
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Submit button */}
        {canEdit && (
          <div className="fixed bottom-16 left-0 right-0 p-4 bg-white border-t border-slate-100 z-30">
            <button onClick={handleSubmit} disabled={isSubmitting || editStudents.length === 0}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-black text-sm uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-50">
              {isSubmitting ? 'Submitting…' : <><Save size={16}/> Submit For Review</>}
            </button>
          </div>
        )}
      </div>
    );
  }

  return null;
};
