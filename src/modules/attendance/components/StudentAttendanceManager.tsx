import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, ChevronRight, AlertCircle, ShieldCheck, Hourglass,
  CheckCircle2, XCircle, Edit3, Save, Users, Plus, Calendar,
  ClipboardList, LayoutGrid, Download,
} from 'lucide-react';
import { studentService } from '@/modules/students/student.service';
import { Student } from '@/shared/types/principal.types';
import { sharedAttendance, SharedAttendanceRecord, AttendanceStudentRecord } from '@/modules/attendance/attendance.service';
import { useUIStore } from '@/store/uiStore';
import { useAcademicYear } from '@/shared/context/AcademicYearContext';
import { useEditGuard } from '@/store/correctionStore';

interface Props { onBack: () => void; }

type View = 'OVERVIEW' | 'RECORDS' | 'MARK' | 'EDIT_RECORD' | 'GRID';
type RecordFilter = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED';

const ATT_COLOR = (pct: number) => pct >= 90 ? 'bg-emerald-500' : pct >= 75 ? 'bg-amber-400' : 'bg-rose-500';
const ATT_TEXT  = (pct: number) => pct >= 90 ? 'text-emerald-600' : pct >= 75 ? 'text-amber-600' : 'text-rose-600';
const ATT_BG    = (pct: number) => pct >= 90 ? 'bg-emerald-50' : pct >= 75 ? 'bg-amber-50' : 'bg-rose-50';
const avg       = (nums: number[]) => nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0;
const todayStr  = () => new Date().toISOString().split('T')[0];
const dayShort = (d: string) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short' });
const dayNum   = (d: string) => new Date(d).getDate();
const monthShort = (d: string) => new Date(d).toLocaleDateString('en-IN', { month: 'short' });
const isToday  = (d: string) => d === todayStr();
const buildDateStrip = (count = 14): string[] => {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().split('T')[0]);
  }
  return out;
};

export const StudentAttendanceManager: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const { currentYear } = useAcademicYear();
  const isYearClosed = !!currentYear && currentYear.status === 'LOCKED';
  const editGuard = useEditGuard(currentYear?.id, isYearClosed);
  const [students, setStudents] = useState<Student[]>([]);
  const [records, setRecords]   = useState<SharedAttendanceRecord[]>([]);
  const [view, setView]         = useState<View>('OVERVIEW');

  // Edit flow
  const [editRecord, setEditRecord]   = useState<SharedAttendanceRecord | null>(null);
  const [editStudents, setEditStudents] = useState<AttendanceStudentRecord[]>([]);

  // Records filter
  const [recFilter, setRecFilter] = useState<RecordFilter>('ALL');

  // Mark flow
  const [markClass, setMarkClass]     = useState('');
  const [markSection, setMarkSection] = useState('');
  const [markDate, setMarkDate]       = useState(todayStr());
  const dateStrip = useMemo(() => buildDateStrip(14), []);
  const [markStudents, setMarkStudents] = useState<AttendanceStudentRecord[]>([]);
  const [markConflict, setMarkConflict] = useState<SharedAttendanceRecord | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [studs, recs] = await Promise.all([
          studentService.getAll(),
          sharedAttendance.getAll(),
        ]);
        if (!cancelled) { setStudents(studs); setRecords(recs); }
      } catch (e) {
        if (!cancelled) showToast((e as Error).message || 'Failed to load attendance', 'error');
      }
    })();
    return () => { cancelled = true; };
  }, [showToast]);

  const refreshRecords = async () => {
    try { setRecords(await sharedAttendance.getAll()); }
    catch (e) { showToast((e as Error).message || 'Failed to refresh', 'error'); }
  };

  // Derived data
  const classOptions = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const s of students) {
      if (!map.has(s.className)) map.set(s.className, new Set());
      map.get(s.className)!.add(s.section);
    }
    return Array.from(map.entries())
      .map(([name, sections]) => ({ name, sections: [...sections].sort() }))
      .sort((a, b) => parseInt(a.name.replace('Class ', '')) - parseInt(b.name.replace('Class ', '')));
  }, [students]);

  const sectionOptions = useMemo(() => {
    return classOptions.find(c => c.name === markClass)?.sections ?? [];
  }, [classOptions, markClass]);

  const pendingCount = records.filter(r => r.status === 'PENDING').length;
  const overallAvg = avg(students.map(s => s.attendancePercent));
  const lowCount   = students.filter(s => s.attendancePercent < 75).length;

  // Check for conflict and load students when class/section/date change
  const checkConflict = async (className: string, section: string, date: string) => {
    try {
      const existing = await sharedAttendance.getByClassNameSectionDate(className, section, date);
      setMarkConflict(existing);
      if (!existing && className && section) {
        const sectionStudents = students.filter(s => s.className === className && s.section === section)
          .sort((a, b) => parseInt(a.rollNo) - parseInt(b.rollNo));
        setMarkStudents(sectionStudents.map(s => ({
          id: s.id, name: s.name, rollNo: s.rollNo, isPresent: true,
        })));
      } else {
        setMarkStudents([]);
      }
    } catch (e) {
      showToast((e as Error).message || 'Failed to check existing attendance', 'error');
    }
  };

  const handleMarkClassChange = (cls: string) => {
    setMarkClass(cls);
    setMarkSection('');
    setMarkConflict(null);
    setMarkStudents([]);
  };

  const handleMarkSectionChange = (sec: string) => {
    setMarkSection(sec);
    if (markClass && sec && markDate) void checkConflict(markClass, sec, markDate);
  };

  const handleMarkDateChange = (date: string) => {
    setMarkDate(date);
    if (markClass && markSection && date) void checkConflict(markClass, markSection, date);
  };

  const toggleMarkStudent = (id: string) =>
    setMarkStudents(prev => prev.map(s => s.id === id ? { ...s, isPresent: !s.isPresent } : s));

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Grid view state
  const [gridClass,   setGridClass]   = useState('');
  const [gridSection, setGridSection] = useState('');
  const [gridMonth,   setGridMonth]   = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  // Map: date → { studentId → isPresent }
  const [gridData, setGridData] = useState<Record<string, Record<string, boolean>>>({});
  // Ordered student list for grid rows
  const [gridStudents, setGridStudents] = useState<{ id: string; name: string; rollNo: string }[]>([]);
  const [gridLoading,  setGridLoading]  = useState(false);
  // Map: date → attendance record id (for status badge)
  const [gridRecordMap, setGridRecordMap] = useState<Record<string, { id: string; status: string; isLocked: boolean }>>({});

  const loadGridData = useCallback(async (cls: string, sec: string, month: string) => {
    if (!cls || !sec || !month) return;
    setGridLoading(true);
    setGridData({});
    setGridStudents([]);
    setGridRecordMap({});
    try {
      // All records for this class/section
      const allRecs = await sharedAttendance.getAll();
      const monthRecs = allRecs.filter(r =>
        r.className === cls && r.section === sec && r.date.startsWith(month),
      );
      // Build students list from local store
      const sectionStudents = students
        .filter(s => s.className === cls && s.section === sec)
        .sort((a, b) => parseInt(a.rollNo || '0') - parseInt(b.rollNo || '0'))
        .map(s => ({ id: s.id, name: s.name, rollNo: s.rollNo }));
      setGridStudents(sectionStudents);

      // Fetch per-student data for each record in parallel (max 31 calls)
      const entries = await Promise.all(
        monthRecs.map(async rec => {
          const studs = await sharedAttendance.getStudents(rec.id);
          return { date: rec.date, studs, rec };
        }),
      );
      const data: Record<string, Record<string, boolean>> = {};
      const recMap: Record<string, { id: string; status: string; isLocked: boolean }> = {};
      for (const { date, studs, rec } of entries) {
        data[date] = {};
        for (const s of studs) data[date][s.id] = s.isPresent;
        recMap[date] = { id: rec.id, status: rec.status, isLocked: rec.isLocked };
      }
      setGridData(data);
      setGridRecordMap(recMap);
    } catch (e) {
      showToast((e as Error).message || 'Failed to load grid', 'error');
    } finally {
      setGridLoading(false);
    }
  }, [students, showToast]);

  // CSV export for grid
  const exportGridCSV = () => {
    if (gridStudents.length === 0) return;
    const dates = Object.keys(gridData).sort();
    const header = ['Roll No', 'Name', ...dates.map(d => new Date(d).getDate().toString()), 'Total P', 'Total A', '%'];
    const rows = gridStudents.map(s => {
      const prArr = dates.map(d => (gridData[d]?.[s.id] === true ? 'P' : gridData[d]?.[s.id] === false ? 'A' : '-'));
      const totalP = prArr.filter(x => x === 'P').length;
      const totalA = prArr.filter(x => x === 'A').length;
      const pct = totalP + totalA > 0 ? Math.round((totalP / (totalP + totalA)) * 100) : 0;
      return [s.rollNo, s.name, ...prArr, totalP, totalA, `${pct}%`];
    });
    const csv = [header, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Attendance_${gridClass}_${gridSection}_${gridMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const submitMark = async () => {
    if (!markClass || !markSection || !markDate || markStudents.length === 0) return;
    if (!editGuard.canEdit) {
      showToast('Year closed — pehle Correction Mode enable karein', 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await editGuard.gate(
        () => sharedAttendance.submitPrincipal(markClass, markSection, markDate, markStudents),
        { entityType: 'student_attendance', entityId: `${markClass}/${markSection}/${markDate}` },
      );
      if (result === undefined) return; // user cancelled correction prompt
      await refreshRecords();
      showToast('Attendance marked & approved');
      setView('RECORDS');
      setRecFilter('APPROVED');
    } catch (e) {
      showToast((e as Error).message || 'Failed to mark attendance', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Edit flow — fetch per-student rows lazily.
  const openEdit = async (rec: SharedAttendanceRecord) => {
    setEditRecord(rec);
    setEditStudents([]);
    setView('EDIT_RECORD');
    try {
      const stus = await sharedAttendance.getStudents(rec.id);
      setEditStudents(stus);
    } catch (e) {
      showToast((e as Error).message || 'Failed to load students', 'error');
    }
  };

  const toggleEditStudent = (id: string) =>
    setEditStudents(prev => prev.map(s => s.id === id ? { ...s, isPresent: !s.isPresent } : s));

  const saveEdit = async () => {
    if (!editRecord) return;
    if (!editGuard.canEdit) {
      showToast('Year closed — pehle Correction Mode enable karein', 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await editGuard.gate(
        () => sharedAttendance.updateStudents(editRecord.id, editStudents),
        { entityType: 'student_attendance', entityId: editRecord.id },
      );
      if (result === undefined) return; // user cancelled correction prompt
      await refreshRecords();
      showToast('Attendance updated');
      setView('RECORDS');
    } catch (e) {
      showToast((e as Error).message || 'Failed to update attendance', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const approveAfterEdit = async () => {
    if (!editRecord) return;
    if (!editGuard.canEdit) {
      showToast('Year closed — pehle Correction Mode enable karein', 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await editGuard.gate(
        async () => {
          await sharedAttendance.updateStudents(editRecord.id, editStudents);
          await sharedAttendance.approve(editRecord.id);
          return true;
        },
        { entityType: 'student_attendance', entityId: editRecord.id },
      );
      if (result === undefined) return; // user cancelled correction prompt
      await refreshRecords();
      showToast('Attendance approved');
      setView('RECORDS');
    } catch (e) {
      showToast((e as Error).message || 'Failed to approve', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async (id: string) => {
    if (!editGuard.canEdit) {
      showToast('Year closed — pehle Correction Mode enable karein', 'error');
      return;
    }
    try {
      const result = await editGuard.gate(
        () => sharedAttendance.approve(id),
        { entityType: 'student_attendance', entityId: id },
      );
      if (result === undefined) return;
      await refreshRecords();
      showToast('Attendance approved');
    } catch (e) {
      showToast((e as Error).message || 'Failed to approve', 'error');
    }
  };

  const handleReject = async (id: string) => {
    if (!editGuard.canEdit) {
      showToast('Year closed — pehle Correction Mode enable karein', 'error');
      return;
    }
    const reason = window.prompt('Reason for rejection (optional):') ?? undefined;
    try {
      const result = await editGuard.gate(
        () => sharedAttendance.reject(id, reason || undefined),
        { entityType: 'student_attendance', entityId: id, field: 'reject_reason', newValue: reason },
      );
      if (result === undefined) return;
      await refreshRecords();
      showToast('Attendance rejected');
    } catch (e) {
      showToast((e as Error).message || 'Failed to reject', 'error');
    }
  };

  // Filtered records
  const filteredRecords = useMemo(() => {
    if (recFilter === 'PENDING')  return records.filter(r => r.status === 'PENDING');
    if (recFilter === 'APPROVED') return records.filter(r => r.status === 'APPROVED');
    if (recFilter === 'REJECTED') return records.filter(r => r.status === 'REJECTED');
    return records;
  }, [records, recFilter]);

  /* ── EDIT RECORD ──────────────────────────────────────────────── */
  if (view === 'EDIT_RECORD' && editRecord) {
    const editPresent = editStudents.filter(s => s.isPresent).length;
    const editAbsent  = editStudents.filter(s => !s.isPresent).length;
    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 sticky top-0 z-10 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => setView('RECORDS')} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Edit Attendance</h2>
              <p className="text-[10px] font-bold text-slate-400">{editRecord.className}-{editRecord.section} · {editRecord.date}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="text-center bg-emerald-50 rounded-xl py-2">
              <div className="text-lg font-black text-emerald-600">{editPresent}</div>
              <div className="text-[9px] font-black text-emerald-500 uppercase">Present</div>
            </div>
            <div className="text-center bg-rose-50 rounded-xl py-2">
              <div className="text-lg font-black text-rose-500">{editAbsent}</div>
              <div className="text-[9px] font-black text-rose-400 uppercase">Absent</div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-36">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            {editStudents.map((s, idx) => (
              <button key={s.id}
                onClick={() => toggleEditStudent(s.id)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${
                  idx < editStudents.length - 1 ? 'border-b border-slate-100' : ''
                } ${s.isPresent ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-xs shrink-0">
                  {s.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1">
                  <div className="font-bold text-slate-900 text-sm">{s.name}</div>
                  <div className="text-[10px] font-bold text-slate-400">Roll {s.rollNo.padStart(2, '0')}</div>
                </div>
                {s.isPresent
                  ? <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-lg">PRESENT</span>
                  : <span className="text-[10px] font-black text-rose-700 bg-rose-100 px-2.5 py-1 rounded-lg">ABSENT</span>
                }
              </button>
            ))}
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-100 flex gap-2">
          <button onClick={saveEdit} disabled={isSubmitting || editStudents.length === 0}
            className="flex-1 flex items-center justify-center gap-2 bg-slate-700 text-white font-black text-xs uppercase py-3.5 rounded-2xl active:scale-95 transition-transform disabled:opacity-60">
            <Save size={14}/> {isSubmitting ? 'Saving…' : 'Save Changes'}
          </button>
          {editRecord.status === 'PENDING' && (
            <button onClick={approveAfterEdit} disabled={isSubmitting || editStudents.length === 0}
              className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 text-white font-black text-xs uppercase py-3.5 rounded-2xl active:scale-95 transition-transform disabled:opacity-60">
              <ShieldCheck size={14}/> {isSubmitting ? 'Saving…' : 'Save & Approve'}
            </button>
          )}
        </div>
      </div>
    );
  }

  /* ── MARK ATTENDANCE ────────────────────────────────────────────– */
  if (view === 'MARK') {
    const markPresent = markStudents.filter(s => s.isPresent).length;
    const markAbsent  = markStudents.filter(s => !s.isPresent).length;
    const canSubmit   = markClass && markSection && markDate && markStudents.length > 0 && !markConflict;

    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 sticky top-0 z-10 shadow-sm">
          <div className="flex items-center gap-3">
            <button onClick={() => setView('OVERVIEW')} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Mark Attendance</h2>
              <p className="text-[10px] font-bold text-slate-400">Select class, section &amp; date</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-36 space-y-4">
          {/* Selectors */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Details</p>

            {/* Class */}
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Class</label>
              <select
                value={markClass}
                onChange={e => handleMarkClassChange(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-400 bg-white"
              >
                <option value="">Select class...</option>
                {classOptions.map(c => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Section */}
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Section</label>
              <select
                value={markSection}
                onChange={e => handleMarkSectionChange(e.target.value)}
                disabled={!markClass}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-400 bg-white disabled:opacity-50"
              >
                <option value="">Select section...</option>
                {sectionOptions.map(sec => (
                  <option key={sec} value={sec}>Section {sec}</option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Date</label>
              <div className="flex overflow-x-auto hide-scrollbar border border-slate-100 rounded-xl p-1">
                {dateStrip.map(d => {
                  const sel = markDate === d;
                  const t = isToday(d);
                  return (
                    <button key={d}
                      onClick={() => handleMarkDateChange(d)}
                      className={`shrink-0 flex flex-col items-center mx-0.5 px-2.5 py-1.5 rounded-xl border-2 transition-colors ${
                        sel
                          ? t ? 'bg-blue-600 border-blue-600 text-white' : 'bg-slate-800 border-slate-800 text-white'
                          : t ? 'border-blue-200 text-blue-600 bg-blue-50' : 'border-transparent text-slate-400'
                      }`}>
                      <span className="text-[9px] font-black uppercase tracking-widest">{dayShort(d)}</span>
                      <span className="text-base font-black leading-none my-0.5">{dayNum(d)}</span>
                      <span className="text-[8px] font-bold uppercase tracking-wide opacity-75">{monthShort(d)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Conflict warning */}
          {markConflict && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <div className="flex items-start gap-2 mb-3">
                <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5"/>
                <div>
                  <div className="font-black text-amber-800 text-sm">Attendance Already Marked</div>
                  <div className="text-[10px] font-bold text-amber-600 mt-0.5">
                    By {markConflict.markedBy} · {markConflict.totalPresent}P / {markConflict.totalAbsent}A
                  </div>
                </div>
              </div>
              <button
                onClick={() => openEdit(markConflict)}
                className="w-full flex items-center justify-center gap-2 bg-amber-600 text-white font-black text-xs uppercase py-3 rounded-xl active:scale-95 transition-transform"
              >
                <Edit3 size={13}/> Edit Existing Record
              </button>
            </div>
          )}

          {/* Student list */}
          {markStudents.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Students ({markStudents.length})</p>
                <div className="flex gap-2 text-[10px] font-black">
                  <span className="text-emerald-600">{markPresent}P</span>
                  <span className="text-rose-500">{markAbsent}A</span>
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                {markStudents.map((s, idx) => (
                  <button key={s.id}
                    onClick={() => toggleMarkStudent(s.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${
                      idx < markStudents.length - 1 ? 'border-b border-slate-100' : ''
                    } ${s.isPresent ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                    <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-xs shrink-0">
                      {s.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-slate-900 text-sm">{s.name}</div>
                      <div className="text-[10px] font-bold text-slate-400">Roll {s.rollNo.padStart(2, '0')}</div>
                    </div>
                    {s.isPresent
                      ? <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-lg">PRESENT</span>
                      : <span className="text-[10px] font-black text-rose-700 bg-rose-100 px-2.5 py-1 rounded-lg">ABSENT</span>
                    }
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Submit button */}
        {markStudents.length > 0 && !markConflict && (
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-100">
            <button
              onClick={submitMark}
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white font-black text-sm uppercase py-4 rounded-2xl active:scale-95 transition-transform disabled:opacity-60"
            >
              <ShieldCheck size={16}/> {isSubmitting ? 'Submitting…' : `Mark & Approve (${markPresent}P, ${markAbsent}A)`}
            </button>
          </div>
        )}
      </div>
    );
  }

  /* ── GRID VIEW ────────────────────────────────────────────────── */
  if (view === 'GRID') {
    const sortedDates = Object.keys(gridData).sort();

    // Per-student totals
    const studentStats = gridStudents.map(s => {
      let p = 0, a = 0;
      for (const d of sortedDates) {
        const v = gridData[d]?.[s.id];
        if (v === true) p++;
        else if (v === false) a++;
      }
      const pct = p + a > 0 ? Math.round((p / (p + a)) * 100) : null;
      return { ...s, p, a, pct };
    });

    const gridSections = classOptions.find(c => c.name === gridClass)?.sections ?? [];

    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        {/* Header */}
        <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-3 sticky top-0 z-10 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => setView('OVERVIEW')} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
              <ArrowLeft size={20} />
            </button>
            <div className="flex-1">
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Attendance Grid</h2>
              <p className="text-[10px] font-bold text-slate-400">Month-wise student view</p>
            </div>
            {gridStudents.length > 0 && Object.keys(gridData).length > 0 && (
              <button onClick={exportGridCSV}
                className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 font-black text-[10px] uppercase px-3 py-2 rounded-xl active:scale-95 transition-transform">
                <Download size={12}/> CSV
              </button>
            )}
          </div>

          {/* Selectors */}
          <div className="flex gap-2">
            <select value={gridClass}
              onChange={e => { setGridClass(e.target.value); setGridSection(''); setGridData({}); setGridStudents([]); }}
              className="flex-1 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-400 bg-white">
              <option value="">Class…</option>
              {classOptions.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
            <select value={gridSection}
              onChange={e => { setGridSection(e.target.value); setGridData({}); setGridStudents([]); }}
              disabled={!gridClass}
              className="flex-1 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-400 bg-white disabled:opacity-50">
              <option value="">Sec…</option>
              {gridSections.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input type="month" value={gridMonth}
              onChange={e => { setGridMonth(e.target.value); setGridData({}); setGridStudents([]); }}
              className="flex-1 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-400 bg-white" />
            <button
              onClick={() => loadGridData(gridClass, gridSection, gridMonth)}
              disabled={!gridClass || !gridSection || !gridMonth || gridLoading}
              className="bg-indigo-600 text-white font-black text-xs uppercase px-3 py-2 rounded-xl active:scale-95 transition-transform disabled:opacity-50">
              {gridLoading ? '…' : 'Go'}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          {gridLoading && (
            <div className="flex items-center justify-center h-40 text-slate-400">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin mr-3" />
              <span className="font-bold text-sm">Loading grid…</span>
            </div>
          )}

          {!gridLoading && !gridClass && (
            <div className="flex flex-col items-center py-16 text-slate-400">
              <LayoutGrid size={32} className="mb-3 opacity-30" />
              <p className="font-bold text-sm">Select class, section &amp; month</p>
            </div>
          )}

          {!gridLoading && gridClass && gridSection && Object.keys(gridData).length === 0 && gridStudents.length === 0 && (
            <div className="flex flex-col items-center py-16 text-slate-400">
              <Calendar size={28} className="mb-3 opacity-30" />
              <p className="font-bold text-sm">No attendance data for this period</p>
              <p className="text-xs mt-1">Tap <span className="font-black text-indigo-500">Go</span> to load</p>
            </div>
          )}

          {!gridLoading && gridStudents.length > 0 && (
            <div className="overflow-auto h-full">
              {/* Sticky header row with date columns */}
              <table className="border-collapse text-[10px] font-bold" style={{ minWidth: `${180 + sortedDates.length * 36}px` }}>
                <thead className="sticky top-0 z-20">
                  <tr className="bg-slate-900 text-white">
                    <th className="sticky left-0 z-30 bg-slate-900 text-left pl-3 pr-2 py-2.5 font-black text-[9px] uppercase tracking-widest w-36 min-w-36">
                      Student
                    </th>
                    {sortedDates.map(d => {
                      const rec = gridRecordMap[d];
                      const day = new Date(d).getDate();
                      const dow = new Date(d).toLocaleDateString('en-IN', { weekday: 'short' });
                      const isSun = new Date(d).getDay() === 0;
                      return (
                        <th key={d} className={`text-center py-2 px-0.5 w-9 min-w-9 font-black ${isSun ? 'text-rose-300' : 'text-white/80'}`}>
                          <div className="text-[8px] font-black uppercase">{dow}</div>
                          <div className="text-sm leading-tight">{day}</div>
                          {rec && (
                            <div className={`mt-0.5 mx-auto w-1.5 h-1.5 rounded-full ${
                              rec.status === 'APPROVED' ? 'bg-emerald-400' :
                              rec.status === 'PENDING'  ? 'bg-amber-400'   : 'bg-rose-400'
                            }`} title={rec.status} />
                          )}
                        </th>
                      );
                    })}
                    <th className="text-center py-2 px-1.5 min-w-16 text-white/70 font-black text-[9px]">P/A/%</th>
                  </tr>
                </thead>
                <tbody>
                  {studentStats.map((s, idx) => (
                    <tr key={s.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                      {/* Student name — sticky left */}
                      <td className={`sticky left-0 z-10 pl-3 pr-2 py-2 border-r border-slate-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                        <div className="font-black text-slate-900 truncate max-w-[130px] text-[10px]">{s.name}</div>
                        <div className="text-[8px] font-bold text-slate-400">Roll {s.rollNo.padStart(2, '0')}</div>
                      </td>
                      {/* Date cells */}
                      {sortedDates.map(d => {
                        const val = gridData[d]?.[s.id];
                        const isSun = new Date(d).getDay() === 0;
                        return (
                          <td key={d} className={`text-center py-1 px-0 ${isSun ? 'bg-rose-50/60' : ''}`}>
                            {val === true  && <span className="inline-block w-7 h-5 leading-5 text-center rounded-md bg-emerald-100 text-emerald-700 font-black text-[9px]">P</span>}
                            {val === false && <span className="inline-block w-7 h-5 leading-5 text-center rounded-md bg-rose-100 text-rose-700 font-black text-[9px]">A</span>}
                            {val === undefined && <span className="inline-block w-7 h-5 leading-5 text-center text-slate-300 font-bold text-[9px]">—</span>}
                          </td>
                        );
                      })}
                      {/* Totals */}
                      <td className="text-center px-1.5 py-2 border-l border-slate-200">
                        <div className={`font-black text-[9px] ${s.pct !== null ? (s.pct >= 75 ? 'text-emerald-600' : 'text-rose-600') : 'text-slate-400'}`}>
                          {s.p}P/{s.a}A
                        </div>
                        {s.pct !== null && (
                          <div className={`text-[9px] font-black ${s.pct >= 75 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {s.pct}%
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Legend */}
              <div className="flex items-center gap-4 px-4 py-3 border-t border-slate-100 bg-white sticky bottom-0">
                <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-500">
                  <span className="w-5 h-4 bg-emerald-100 text-emerald-700 rounded text-[8px] font-black flex items-center justify-center">P</span>
                  Present
                </div>
                <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-500">
                  <span className="w-5 h-4 bg-rose-100 text-rose-700 rounded text-[8px] font-black flex items-center justify-center">A</span>
                  Absent
                </div>
                <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-500">
                  <span className="w-5 h-4 rounded text-slate-300 font-bold flex items-center justify-center text-[8px]">—</span>
                  Not Marked
                </div>
                <div className="flex items-center gap-1.5 ml-auto text-[9px] font-bold text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> Approved
                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block ml-1" /> Pending
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── RECORDS (All + Filter) ──────────────────────────────────── */
  if (view === 'RECORDS') {
    const FILTER_TABS: { key: RecordFilter; label: string; count: number }[] = [
      { key: 'ALL',      label: 'All',      count: records.length },
      { key: 'PENDING',  label: 'Pending',  count: records.filter(r => r.status === 'PENDING').length },
      { key: 'APPROVED', label: 'Approved', count: records.filter(r => r.status === 'APPROVED').length },
      { key: 'REJECTED', label: 'Rejected', count: records.filter(r => r.status === 'REJECTED').length },
    ];

    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 sticky top-0 z-10 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => setView('OVERVIEW')} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
              <ArrowLeft size={20} />
            </button>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Attendance Records</h2>
          </div>
          {/* Filter tabs */}
          <div className="flex gap-2">
            {FILTER_TABS.map(t => (
              <button key={t.key} onClick={() => setRecFilter(t.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${
                  recFilter === t.key ? 'bg-slate-900 text-white' : 'bg-white text-slate-400 border border-slate-200'
                }`}>
                {t.label}
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${recFilter === t.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4  space-y-3">
          {filteredRecords.length === 0 && (
            <div className="flex flex-col items-center py-16 text-slate-400">
              <ClipboardList size={32} className="mb-3 opacity-40"/>
              <p className="font-bold text-sm">No records found</p>
            </div>
          )}
          {filteredRecords.map(rec => {
            const pct = rec.totalStudents > 0 ? Math.round((rec.totalPresent / rec.totalStudents) * 100) : 0;
            const isPending  = rec.status === 'PENDING';
            const isRejected = rec.status === 'REJECTED';
            const cardBorder = isPending ? 'border-amber-100' : isRejected ? 'border-rose-100' : 'border-slate-100';
            return (
              <div key={rec.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${cardBorder}`}>
                <div className="px-4 pt-4 pb-3">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div>
                      <div className="font-extrabold text-slate-900 text-sm">{rec.className}-{rec.section} · {rec.subject}</div>
                      <div className="text-[10px] font-bold text-slate-400 mt-0.5">{rec.date} · by {rec.markedBy}</div>
                    </div>
                    {isPending && (
                      <span className="flex items-center gap-1 text-[9px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full shrink-0">
                        <Hourglass size={9}/> Pending
                      </span>
                    )}
                    {!isPending && !isRejected && (
                      <span className="flex items-center gap-0.5 text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full shrink-0">
                        <ShieldCheck size={9}/> Approved
                      </span>
                    )}
                    {isRejected && (
                      <span className="flex items-center gap-1 text-[9px] font-black text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full shrink-0">
                        <XCircle size={9}/> Rejected
                      </span>
                    )}
                  </div>
                  <div className="flex gap-3 my-2.5">
                    <span className="flex items-center gap-1 text-[10px] font-black text-emerald-600">
                      <CheckCircle2 size={11}/> {rec.totalPresent} Present
                    </span>
                    <span className="flex items-center gap-1 text-[10px] font-black text-rose-500">
                      <XCircle size={11}/> {rec.totalAbsent} Absent
                    </span>
                    <span className={`ml-auto text-sm font-black ${ATT_TEXT(pct)}`}>{pct}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 mb-3">
                    <div className={`h-1.5 rounded-full ${ATT_COLOR(pct)}`} style={{ width: `${pct}%` }}/>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(rec)}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-slate-100 text-slate-700 font-black text-[11px] uppercase py-2.5 rounded-xl active:scale-95 transition-transform">
                      <Edit3 size={12}/> Edit
                    </button>
                    {isPending && (
                      <>
                        <button onClick={() => handleApprove(rec.id)}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500 text-white font-black text-[11px] uppercase py-2.5 rounded-xl active:scale-95 transition-transform">
                          <ShieldCheck size={12}/> Approve
                        </button>
                        <button onClick={() => handleReject(rec.id)}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-rose-500 text-white font-black text-[11px] uppercase py-2.5 rounded-xl active:scale-95 transition-transform">
                          <XCircle size={12}/> Reject
                        </button>
                      </>
                    )}
                    {isRejected && (
                      <button onClick={() => handleApprove(rec.id)}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500 text-white font-black text-[11px] uppercase py-2.5 rounded-xl active:scale-95 transition-transform">
                        <ShieldCheck size={12}/> Re-approve
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ── OVERVIEW ─────────────────────────────────────────────────── */
  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 sticky top-0 z-10 shadow-sm flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20}/></button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Attendance</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4  space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-indigo-600 rounded-2xl p-3 text-white text-center">
            <div className="font-black text-xl">{students.length}</div>
            <div className="text-[9px] font-black uppercase tracking-widest opacity-80 mt-0.5">Students</div>
          </div>
          <div className={`${overallAvg >= 75 ? 'bg-emerald-50' : 'bg-amber-50'} rounded-2xl p-3 text-center`}>
            <div className={`font-black text-xl ${overallAvg >= 75 ? 'text-emerald-700' : 'text-amber-700'}`}>{overallAvg}%</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">Avg Att.</div>
          </div>
          <div className={`${lowCount > 0 ? 'bg-rose-50' : 'bg-emerald-50'} rounded-2xl p-3 text-center`}>
            <div className={`font-black text-xl ${lowCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{lowCount}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">Below 75%</div>
          </div>
        </div>

        {/* Pending banner */}
        {pendingCount > 0 && (
          <button onClick={() => { setRecFilter('PENDING'); setView('RECORDS'); }}
            className="w-full bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3.5 flex items-center gap-3 active:scale-[0.98] transition-transform">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
              <Hourglass size={18} className="text-amber-600"/>
            </div>
            <div className="flex-1 text-left">
              <div className="font-black text-amber-800 text-sm">{pendingCount} Record{pendingCount > 1 ? 's' : ''} Awaiting Approval</div>
              <div className="text-[10px] font-bold text-amber-600 mt-0.5">Tap to review, edit &amp; approve</div>
            </div>
            <ChevronRight size={16} className="text-amber-400"/>
          </button>
        )}

        {pendingCount === 0 && records.length > 0 && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 flex items-center gap-3">
            <ShieldCheck size={18} className="text-emerald-500 shrink-0"/>
            <span className="text-sm font-black text-emerald-700">All records approved</span>
          </div>
        )}

        {/* Action grid */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => {
              setMarkClass(''); setMarkSection(''); setMarkDate(todayStr());
              setMarkStudents([]); setMarkConflict(null);
              setView('MARK');
            }}
            className="bg-blue-600 rounded-2xl p-4 text-left shadow-sm active:scale-[0.98] transition-transform">
            <Plus size={20} className="text-white mb-2"/>
            <div className="font-black text-white text-sm">Mark Attendance</div>
            <div className="text-[10px] font-bold text-blue-200 mt-0.5">Any class, any date</div>
          </button>
          <button
            onClick={() => { setRecFilter('ALL'); setView('RECORDS'); }}
            className="bg-white border border-slate-100 rounded-2xl p-4 text-left shadow-sm active:scale-[0.98] transition-transform">
            <ClipboardList size={20} className="text-indigo-500 mb-2"/>
            <div className="font-black text-slate-800 text-sm">All Records</div>
            <div className="text-[10px] font-bold text-slate-400 mt-0.5">{records.length} total</div>
          </button>
          <button
            onClick={() => setView('GRID')}
            className="col-span-2 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-2xl p-4 text-left shadow-sm active:scale-[0.98] transition-transform">
            <LayoutGrid size={20} className="text-white mb-2"/>
            <div className="font-black text-white text-sm">Monthly Grid View</div>
            <div className="text-[10px] font-bold text-white/60 mt-0.5">Students × Dates — with CSV export</div>
          </button>
        </div>

        {/* Overall bar */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">School Attendance</span>
            <span className={`font-black text-sm ${ATT_TEXT(overallAvg)}`}>{overallAvg}%</span>
          </div>
          <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-3 rounded-full transition-all ${ATT_COLOR(overallAvg)}`} style={{ width: `${overallAvg}%` }}/>
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[9px] font-bold text-slate-400">0%</span>
            <span className="text-[9px] font-bold text-slate-400">75% (Min)</span>
            <span className="text-[9px] font-bold text-slate-400">100%</span>
          </div>
        </div>
      </div>
    </div>
  );
};
