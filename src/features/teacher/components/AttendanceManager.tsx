import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, Users, Save, History, ChevronRight, Search,
  CheckCircle2, XCircle, Clock, ShieldCheck, Hourglass,
} from 'lucide-react';
import { teacherService } from '../../../services/teacher.service';
import { TeacherClass, AttendanceStudent } from '../../../types/teacher.types';
import { useUIStore } from '../../../store/uiStore';
import { sharedAttendance, SharedAttendanceRecord } from '../../../services/sharedAttendance';

type View = 'CLASSES' | 'MARK' | 'HISTORY';

interface Props { onBack: () => void; }

export const AttendanceManager: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const [view, setView]               = useState<View>('CLASSES');
  const [classes, setClasses]         = useState<TeacherClass[]>([]);
  const [selectedClass, setSelectedClass] = useState<TeacherClass | null>(null);
  const [students, setStudents]       = useState<AttendanceStudent[]>([]);
  const [history, setHistory]         = useState<SharedAttendanceRecord[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [search, setSearch]           = useState('');

  useEffect(() => {
    teacherService.getClasses().then(setClasses);
    setHistory(sharedAttendance.getAll());
  }, []);

  const presentCount  = students.filter(s => s.isPresent === true).length;
  const absentCount   = students.filter(s => s.isPresent === false).length;
  const unmarkedCount = students.filter(s => s.isPresent === null).length;

  const toggleStudent = (id: string) =>
    setStudents(prev => prev.map(s => s.id === id ? { ...s, isPresent: s.isPresent === true ? false : true } : s));

  const markAll = (present: boolean) =>
    setStudents(prev => prev.map(s => ({ ...s, isPresent: present })));

  const handleSubmit = async () => {
    if (unmarkedCount > 0) { showToast(`${unmarkedCount} students still unmarked`, 'error'); return; }
    if (!selectedClass) return;
    setIsSubmitting(true);
    try {
      const studentRecords = students.map(s => ({
        id: s.id, name: s.name, rollNo: s.rollNo, isPresent: s.isPresent ?? false,
      }));
      const record = sharedAttendance.submit({
        classId:      selectedClass.id,
        className:    selectedClass.className,
        section:      selectedClass.section,
        subject:      selectedClass.subject,
        date:         new Date().toISOString().split('T')[0],
        totalPresent: presentCount,
        totalAbsent:  absentCount,
        totalStudents: students.length,
        markedBy:     'Teacher',
        students:     studentRecords,
      });
      setHistory(sharedAttendance.getAll());
      showToast(`Attendance submitted — ${record.totalPresent}P / ${record.totalAbsent}A — Pending Principal Approval`);
      setView('HISTORY');
    } finally { setIsSubmitting(false); }
  };

  const filteredStudents = students.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.rollNo.includes(search),
  );

  const renderHeader = (title: string, back: () => void, sub?: string, action?: React.ReactNode) => (
    <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 sticky top-0 z-10 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={back} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">{title}</h2>
            {sub && <p className="text-[10px] font-bold text-slate-400">{sub}</p>}
          </div>
        </div>
        {action}
      </div>
    </div>
  );

  /* ── CLASS SELECTION ─────────────────────────────────────────── */
  if (view === 'CLASSES') return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Attendance', onBack, undefined,
        <button onClick={() => setView('HISTORY')}
          className="flex items-center gap-1.5 text-[11px] font-black text-blue-600 bg-blue-50 px-3 py-1.5 rounded-xl">
          <History size={13} /> History
        </button>,
      )}
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Select Class to Mark Attendance</p>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {classes.map((cls, idx) => (
            <button key={cls.id}
              onClick={() => {
                setSelectedClass(cls);
                setStudents(cls.students.map(s => ({ ...s, isPresent: null })));
                setView('MARK');
              }}
              className={`w-full flex items-center gap-4 px-4 py-4 text-left active:bg-slate-50 transition-colors ${idx < classes.length - 1 ? 'border-b border-slate-100' : ''}`}>
              <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-sm shrink-0">
                {cls.className.replace('Class ', '')}
              </div>
              <div className="flex-1">
                <div className="font-extrabold text-slate-900 text-sm">{cls.className}-{cls.section}</div>
                <div className="text-[10px] font-bold text-slate-400 mt-0.5">{cls.subject} · {cls.studentCount} students</div>
              </div>
              <div className="bg-blue-50 text-blue-700 text-[9px] font-black px-2.5 py-1 rounded-lg uppercase">Mark</div>
              <ChevronRight size={16} className="text-slate-300" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  /* ── MARK ATTENDANCE ─────────────────────────────────────────── */
  if (view === 'MARK' && selectedClass) return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader(
        `${selectedClass.className}-${selectedClass.section}`,
        () => setView('CLASSES'),
        `${selectedClass.subject} · Today's Attendance`,
      )}

      {/* Summary bar */}
      <div className="bg-white border-b border-slate-100 px-4 py-3 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center bg-emerald-50 rounded-xl py-2">
            <div className="text-lg font-black text-emerald-600">{presentCount}</div>
            <div className="text-[9px] font-black text-emerald-500 uppercase">Present</div>
          </div>
          <div className="text-center bg-rose-50 rounded-xl py-2">
            <div className="text-lg font-black text-rose-500">{absentCount}</div>
            <div className="text-[9px] font-black text-rose-400 uppercase">Absent</div>
          </div>
          <div className="text-center bg-slate-100 rounded-xl py-2">
            <div className="text-lg font-black text-slate-500">{unmarkedCount}</div>
            <div className="text-[9px] font-black text-slate-400 uppercase">Unmarked</div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => markAll(true)}
            className="flex-1 py-2 bg-emerald-500 text-white text-[11px] font-black rounded-xl active:scale-95 transition-transform">
            All Present
          </button>
          <button onClick={() => markAll(false)}
            className="flex-1 py-2 bg-rose-500 text-white text-[11px] font-black rounded-xl active:scale-95 transition-transform">
            All Absent
          </button>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search students..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 font-bold text-sm outline-none focus:border-indigo-500" />
        </div>
      </div>

      {/* Student list */}
      <div className="flex-1 overflow-y-auto pb-32">
        <div className="p-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            {filteredStudents.map((student, idx) => (
              <button key={student.id}
                onClick={() => toggleStudent(student.id)}
                className={`w-full flex items-center gap-4 px-4 py-3.5 text-left transition-colors ${
                  idx < filteredStudents.length - 1 ? 'border-b border-slate-100' : ''
                } ${
                  student.isPresent === true  ? 'bg-emerald-50' :
                  student.isPresent === false ? 'bg-rose-50' : 'bg-white'
                }`}>
                <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-sm shrink-0">
                  {student.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1">
                  <div className="font-extrabold text-slate-900 text-sm">{student.name}</div>
                  <div className="text-[10px] font-bold text-slate-400 mt-0.5">ROLL: {student.rollNo.padStart(2, '0')}</div>
                </div>
                {student.isPresent === true  && <div className="bg-emerald-100 text-emerald-700 text-[10px] font-black px-3 py-1 rounded-lg uppercase">PRESENT</div>}
                {student.isPresent === false && <div className="bg-rose-100 text-rose-600 text-[10px] font-black px-3 py-1 rounded-lg uppercase">ABSENT</div>}
                {student.isPresent === null  && <div className="bg-slate-100 text-slate-400 text-[10px] font-black px-3 py-1 rounded-lg uppercase">—</div>}
                <ChevronRight size={14} className="text-slate-300" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Submit */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-100">
        <button onClick={handleSubmit} disabled={isSubmitting || unmarkedCount > 0}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-black text-sm uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-50">
          {isSubmitting ? 'Submitting…' : <><Save size={16} /> Submit Attendance</>}
        </button>
      </div>
    </div>
  );

  /* ── HISTORY ─────────────────────────────────────────────────── */
  if (view === 'HISTORY') return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Attendance History', () => setView('CLASSES'),
        undefined,
        <button onClick={() => setView('CLASSES')}
          className="flex items-center gap-1.5 text-[11px] font-black text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl">
          <Users size={13} /> Mark New
        </button>,
      )}

      {/* Status legend */}
      <div className="px-4 py-2.5 bg-white border-b border-slate-100 flex gap-3">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-amber-400"/>
          <span className="text-[9px] font-black text-slate-500 uppercase">Pending Approval</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-emerald-500"/>
          <span className="text-[9px] font-black text-slate-500 uppercase">Principal Approved</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-3">
        {history.map(rec => {
          const pct      = rec.totalStudents > 0 ? Math.round((rec.totalPresent / rec.totalStudents) * 100) : 0;
          const isPending = rec.status === 'PENDING';
          return (
            <div key={rec.id} className={`bg-white rounded-2xl border shadow-sm p-4 ${isPending ? 'border-amber-100' : 'border-slate-100'}`}>
              {/* Status badge row */}
              <div className="flex items-center justify-between mb-2">
                <div className="font-extrabold text-slate-900 text-sm">{rec.className}-{rec.section} · {rec.subject}</div>
                {isPending
                  ? <span className="flex items-center gap-1 text-[9px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                      <Hourglass size={9}/> Pending
                    </span>
                  : <span className="flex items-center gap-1 text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                      <ShieldCheck size={9}/> Approved
                    </span>
                }
              </div>
              <div className="text-[10px] font-bold text-slate-400 mb-3">{rec.date}</div>
              <div className="flex gap-3 mb-3">
                <div className="flex items-center gap-1 text-[10px] font-black text-emerald-600">
                  <CheckCircle2 size={12} /> {rec.totalPresent} Present
                </div>
                <div className="flex items-center gap-1 text-[10px] font-black text-rose-500">
                  <XCircle size={12} /> {rec.totalAbsent} Absent
                </div>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full ${pct >= 75 ? 'bg-emerald-500' : 'bg-rose-400'}`}
                  style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
        {history.length === 0 && (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <Clock size={32} className="mb-3 opacity-40" />
            <p className="font-bold text-sm">No attendance records yet</p>
            <button onClick={() => setView('CLASSES')} className="mt-3 text-[11px] font-black text-blue-600 bg-blue-50 px-4 py-2 rounded-xl">
              Mark Attendance
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return null;
};
