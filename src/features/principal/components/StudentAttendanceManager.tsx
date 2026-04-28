import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, ChevronRight, AlertCircle, ShieldCheck, Hourglass,
  CheckCircle2, XCircle, Edit3, Save, Users,
} from 'lucide-react';
import { studentService } from '../../../services/student.service';
import { Student } from '../../../types/principal.types';
import { sharedAttendance, SharedAttendanceRecord, AttendanceStudentRecord } from '../../../services/sharedAttendance';
import { useUIStore } from '../../../store/uiStore';

interface Props { onBack: () => void; }

type View = 'OVERVIEW' | 'PENDING' | 'CLASSES' | 'SECTIONS' | 'STUDENTS' | 'EDIT_RECORD';

const ATT_COLOR = (pct: number) => pct >= 90 ? 'bg-emerald-500' : pct >= 75 ? 'bg-amber-400' : 'bg-rose-500';
const ATT_TEXT  = (pct: number) => pct >= 90 ? 'text-emerald-600' : pct >= 75 ? 'text-amber-600' : 'text-rose-600';
const ATT_BG    = (pct: number) => pct >= 90 ? 'bg-emerald-50' : pct >= 75 ? 'bg-amber-50' : 'bg-rose-50';
const avg       = (nums: number[]) => nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0;

export const StudentAttendanceManager: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const [students, setStudents]           = useState<Student[]>([]);
  const [records, setRecords]             = useState<SharedAttendanceRecord[]>([]);
  const [view, setView]                   = useState<View>('OVERVIEW');
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [editRecord, setEditRecord]       = useState<SharedAttendanceRecord | null>(null);
  const [editStudents, setEditStudents]   = useState<AttendanceStudentRecord[]>([]);

  useEffect(() => {
    studentService.getAll().then(setStudents);
    setRecords(sharedAttendance.getAll());
  }, []);

  const refreshRecords = () => setRecords(sharedAttendance.getAll());

  const pendingRecords  = records.filter(r => r.status === 'PENDING');
  const approvedRecords = records.filter(r => r.status === 'APPROVED');

  const classStats = useMemo(() => {
    const map = new Map<string, { students: Student[]; sections: Set<string> }>();
    for (const s of students) {
      if (!map.has(s.className)) map.set(s.className, { students: [], sections: new Set() });
      map.get(s.className)!.students.push(s);
      map.get(s.className)!.sections.add(s.section);
    }
    return Array.from(map.entries())
      .map(([name, { students: ss, sections }]) => ({
        name, count: ss.length, sections: [...sections].sort(),
        avgAtt: avg(ss.map(s => s.attendancePercent)),
        low: ss.filter(s => s.attendancePercent < 75).length,
      }))
      .sort((a, b) => parseInt(a.name.replace('Class ', '')) - parseInt(b.name.replace('Class ', '')));
  }, [students]);

  const sectionStudents = useMemo(() => {
    if (!selectedClass || !selectedSection) return [];
    return students
      .filter(s => s.className === selectedClass && s.section === selectedSection)
      .sort((a, b) => parseInt(a.rollNo) - parseInt(b.rollNo));
  }, [students, selectedClass, selectedSection]);

  const classSections = useMemo(() => {
    if (!selectedClass) return [];
    return classStats.find(c => c.name === selectedClass)?.sections ?? [];
  }, [classStats, selectedClass]);

  const overallAvg = avg(students.map(s => s.attendancePercent));
  const lowCount   = students.filter(s => s.attendancePercent < 75).length;

  const handleApprove = (id: string) => {
    sharedAttendance.approve(id);
    refreshRecords();
    showToast('Attendance approved');
  };

  const openEdit = (rec: SharedAttendanceRecord) => {
    setEditRecord(rec);
    setEditStudents(rec.students.map(s => ({ ...s })));
    setView('EDIT_RECORD');
  };

  const toggleEditStudent = (id: string) =>
    setEditStudents(prev => prev.map(s => s.id === id ? { ...s, isPresent: !s.isPresent } : s));

  const saveEdit = () => {
    if (!editRecord) return;
    sharedAttendance.updateStudents(editRecord.id, editStudents);
    refreshRecords();
    showToast('Attendance updated');
    setView('PENDING');
  };

  const approveAfterEdit = () => {
    if (!editRecord) return;
    sharedAttendance.updateStudents(editRecord.id, editStudents);
    sharedAttendance.approve(editRecord.id);
    refreshRecords();
    showToast('Attendance approved');
    setView('PENDING');
  };

  /* ── EDIT RECORD ──────────────────────────────────────────────── */
  if (view === 'EDIT_RECORD' && editRecord) {
    const editPresent = editStudents.filter(s => s.isPresent).length;
    const editAbsent  = editStudents.filter(s => !s.isPresent).length;
    return (
      <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 sticky top-0 z-10 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => setView('PENDING')} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
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
          <button onClick={saveEdit}
            className="flex-1 flex items-center justify-center gap-2 bg-slate-700 text-white font-black text-xs uppercase py-3.5 rounded-2xl active:scale-95 transition-transform">
            <Save size={14}/> Save Changes
          </button>
          <button onClick={approveAfterEdit}
            className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 text-white font-black text-xs uppercase py-3.5 rounded-2xl active:scale-95 transition-transform">
            <ShieldCheck size={14}/> Save &amp; Approve
          </button>
        </div>
      </div>
    );
  }

  /* ── PENDING APPROVALS ────────────────────────────────────────── */
  if (view === 'PENDING') return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 sticky top-0 z-10 shadow-sm flex items-center gap-3">
        <button onClick={() => setView('OVERVIEW')} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Pending Approvals</h2>
          <p className="text-[10px] font-bold text-slate-400">{pendingRecords.length} records awaiting approval</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-3">
        {pendingRecords.length === 0 && (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <ShieldCheck size={32} className="mb-3 opacity-40"/>
            <p className="font-bold text-sm">All caught up! No pending approvals.</p>
          </div>
        )}
        {pendingRecords.map(rec => {
          const pct = rec.totalStudents > 0 ? Math.round((rec.totalPresent / rec.totalStudents) * 100) : 0;
          return (
            <div key={rec.id} className="bg-white rounded-2xl border border-amber-100 shadow-sm overflow-hidden">
              <div className="px-4 pt-4 pb-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div>
                    <div className="font-extrabold text-slate-900 text-sm">{rec.className}-{rec.section} · {rec.subject}</div>
                    <div className="text-[10px] font-bold text-slate-400 mt-0.5">{rec.date} · Marked by {rec.markedBy}</div>
                  </div>
                  <span className="flex items-center gap-1 text-[9px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full shrink-0">
                    <Hourglass size={9}/> Pending
                  </span>
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
                  <button onClick={() => handleApprove(rec.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500 text-white font-black text-[11px] uppercase py-2.5 rounded-xl active:scale-95 transition-transform">
                    <ShieldCheck size={12}/> Approve
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* Also show recently approved */}
        {approvedRecords.length > 0 && (
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-2 mb-2 px-1">Recently Approved</p>
            {approvedRecords.slice(0, 3).map(rec => {
              const pct = rec.totalStudents > 0 ? Math.round((rec.totalPresent / rec.totalStudents) * 100) : 0;
              return (
                <div key={rec.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3 mb-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-bold text-slate-800 text-sm">{rec.className}-{rec.section} · {rec.subject}</div>
                      <div className="text-[10px] font-bold text-slate-400">{rec.date}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-black ${ATT_TEXT(pct)}`}>{pct}%</span>
                      <span className="flex items-center gap-0.5 text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                        <ShieldCheck size={9}/> Approved
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  /* ── SECTIONS ─────────────────────────────────────────────────── */
  if (view === 'SECTIONS' && selectedClass) {
    const cls = classStats.find(c => c.name === selectedClass)!;
    return (
      <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 sticky top-0 z-10 shadow-sm flex items-center gap-3">
          <button onClick={() => setView('CLASSES')} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20}/></button>
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">{selectedClass}</h2>
            <p className="text-[10px] font-bold text-slate-400">{cls?.count} students · Avg {cls?.avgAtt}%</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-2">
          {classSections.map(sec => {
            const secStudents = students.filter(s => s.className === selectedClass && s.section === sec);
            const secAvg = avg(secStudents.map(s => s.attendancePercent));
            const secLow = secStudents.filter(s => s.attendancePercent < 75).length;
            return (
              <button key={sec}
                onClick={() => { setSelectedSection(sec); setView('STUDENTS'); }}
                className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-left active:scale-[0.98] transition-transform">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-xl ${ATT_BG(secAvg)} flex items-center justify-center font-black text-base`}>
                    <span className={ATT_TEXT(secAvg)}>{sec}</span>
                  </div>
                  <div className="flex-1">
                    <div className="font-black text-slate-900 text-sm">Section {sec}</div>
                    <div className="text-[10px] font-bold text-slate-400">{secStudents.length} students</div>
                  </div>
                  <div className="text-right">
                    <div className={`font-black text-base ${ATT_TEXT(secAvg)}`}>{secAvg}%</div>
                    {secLow > 0 && <div className="text-[9px] font-black text-rose-500">{secLow} below 75%</div>}
                  </div>
                  <ChevronRight size={16} className="text-slate-300"/>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-2 rounded-full transition-all ${ATT_COLOR(secAvg)}`} style={{ width: `${secAvg}%` }}/>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  /* ── STUDENTS IN SECTION ──────────────────────────────────────── */
  if (view === 'STUDENTS' && selectedClass && selectedSection) return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 sticky top-0 z-10 shadow-sm flex items-center gap-3">
        <button onClick={() => setView('SECTIONS')} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20}/></button>
        <div>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">{selectedClass}-{selectedSection}</h2>
          <p className="text-[10px] font-bold text-slate-400">{sectionStudents.length} students · Avg {avg(sectionStudents.map(s => s.attendancePercent))}%</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-2">
        {sectionStudents.map(s => (
          <div key={s.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-xs shrink-0">
                {s.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
              </div>
              <div className="flex-1">
                <div className="font-bold text-slate-900 text-sm">{s.name}</div>
                <div className="text-[10px] font-bold text-slate-400">Roll {s.rollNo.padStart(2, '0')}</div>
              </div>
              <div className={`font-black text-sm ${ATT_TEXT(s.attendancePercent)}`}>{s.attendancePercent.toFixed(1)}%</div>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-2 rounded-full ${ATT_COLOR(s.attendancePercent)}`} style={{ width: `${s.attendancePercent}%` }}/>
            </div>
            {s.attendancePercent < 75 && (
              <div className="flex items-center gap-1 mt-2">
                <AlertCircle size={11} className="text-rose-500"/>
                <span className="text-[10px] font-black text-rose-500">Below minimum 75% attendance</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  /* ── CLASS LIST ───────────────────────────────────────────────── */
  if (view === 'CLASSES') return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 sticky top-0 z-10 shadow-sm flex items-center gap-3">
        <button onClick={() => setView('OVERVIEW')} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20}/></button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Student Attendance</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-2">
        {classStats.map(cls => (
          <button key={cls.name}
            onClick={() => { setSelectedClass(cls.name); setView('SECTIONS'); }}
            className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-left active:scale-[0.98] transition-transform">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-sm shrink-0">
                {cls.name.replace('Class ', '')}
              </div>
              <div className="flex-1">
                <div className="font-black text-slate-900 text-sm">{cls.name}</div>
                <div className="text-[10px] font-bold text-slate-400">{cls.count} students · {cls.sections.length} section{cls.sections.length !== 1 ? 's' : ''}</div>
              </div>
              <div className="text-right">
                <div className={`font-black text-base ${ATT_TEXT(cls.avgAtt)}`}>{cls.avgAtt}%</div>
                {cls.low > 0 && <div className="text-[9px] font-black text-rose-500 flex items-center gap-0.5 justify-end"><AlertCircle size={9}/>{cls.low} low</div>}
              </div>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-2 rounded-full transition-all ${ATT_COLOR(cls.avgAtt)}`} style={{ width: `${cls.avgAtt}%` }}/>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  /* ── OVERVIEW ─────────────────────────────────────────────────── */
  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 sticky top-0 z-10 shadow-sm flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20}/></button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Student Attendance</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-indigo-600 rounded-2xl p-3 text-white text-center">
            <div className="font-black text-xl">{students.length}</div>
            <div className="text-[9px] font-black uppercase tracking-widest opacity-80 mt-0.5">Total</div>
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

        {/* Pending Approvals banner */}
        {pendingRecords.length > 0 && (
          <button onClick={() => setView('PENDING')}
            className="w-full bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3.5 flex items-center gap-3 active:scale-[0.98] transition-transform">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
              <Hourglass size={18} className="text-amber-600"/>
            </div>
            <div className="flex-1 text-left">
              <div className="font-black text-amber-800 text-sm">{pendingRecords.length} Attendance Record{pendingRecords.length > 1 ? 's' : ''} Pending</div>
              <div className="text-[10px] font-bold text-amber-600 mt-0.5">Tap to review, edit &amp; approve</div>
            </div>
            <ChevronRight size={16} className="text-amber-400"/>
          </button>
        )}

        {pendingRecords.length === 0 && records.length > 0 && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 flex items-center gap-3">
            <ShieldCheck size={18} className="text-emerald-500 shrink-0"/>
            <span className="text-sm font-black text-emerald-700">All attendance records approved</span>
          </div>
        )}

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setView('PENDING')}
            className="bg-white border border-slate-100 rounded-2xl p-4 text-left shadow-sm active:scale-[0.98] transition-transform">
            <Hourglass size={20} className="text-amber-500 mb-2"/>
            <div className="font-black text-slate-800 text-sm">Pending</div>
            <div className="text-[10px] font-bold text-slate-400">{pendingRecords.length} to approve</div>
          </button>
          <button onClick={() => setView('CLASSES')}
            className="bg-white border border-slate-100 rounded-2xl p-4 text-left shadow-sm active:scale-[0.98] transition-transform">
            <Users size={20} className="text-blue-500 mb-2"/>
            <div className="font-black text-slate-800 text-sm">By Class</div>
            <div className="text-[10px] font-bold text-slate-400">Browse attendance</div>
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
