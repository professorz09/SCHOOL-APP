import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, XCircle, Users, Save, History, ChevronRight } from 'lucide-react';
import { teacherService } from '../../../services/teacher.service';
import { TeacherClass, AttendanceStudent, AttendanceRecord } from '../../../types/teacher.types';
import { useUIStore } from '../../../store/uiStore';

type View = 'CLASSES' | 'MARK' | 'HISTORY';

interface Props { onBack: () => void; }

export const AttendanceManager: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const [view, setView] = useState<View>('CLASSES');
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [selectedClass, setSelectedClass] = useState<TeacherClass | null>(null);
  const [students, setStudents] = useState<AttendanceStudent[]>([]);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    teacherService.getClasses().then(setClasses);
    teacherService.getAttendanceHistory().then(setHistory);
  }, []);

  const presentCount = students.filter(s => s.isPresent === true).length;
  const absentCount = students.filter(s => s.isPresent === false).length;
  const unmarkedCount = students.filter(s => s.isPresent === null).length;

  const toggleStudent = (id: string) => {
    setStudents(prev => prev.map(s => s.id === id ? { ...s, isPresent: s.isPresent === true ? false : true } : s));
  };

  const markAll = (present: boolean) => {
    setStudents(prev => prev.map(s => ({ ...s, isPresent: present })));
  };

  const handleSubmit = async () => {
    if (unmarkedCount > 0) { showToast(`${unmarkedCount} students still unmarked`, 'error'); return; }
    if (!selectedClass) return;
    setIsSubmitting(true);
    try {
      const presentIds = students.filter(s => s.isPresent).map(s => s.id);
      const absentIds = students.filter(s => !s.isPresent).map(s => s.id);
      const record = await teacherService.submitAttendance(selectedClass.id, presentIds, absentIds);
      setHistory(prev => [record, ...prev]);
      showToast(`Attendance submitted: ${presentIds.length}P / ${absentIds.length}A`);
      setView('CLASSES');
    } finally { setIsSubmitting(false); }
  };

  const renderHeader = (title: string, back: () => void, action?: React.ReactNode) => (
    <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
      <div className="flex items-center gap-3">
        <button onClick={back} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20} /></button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">{title}</h2>
      </div>
      {action}
    </div>
  );

  // Class selection
  if (view === 'CLASSES') return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Attendance', onBack,
        <button onClick={() => setView('HISTORY')} className="flex items-center gap-1.5 text-[11px] font-black text-blue-600 bg-blue-50 px-3 py-1.5 rounded-xl">
          <History size={13} /> History
        </button>
      )}
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Select Class to Mark Attendance</p>
        {classes.map(cls => (
          <button key={cls.id}
            onClick={() => { setSelectedClass(cls); setStudents(cls.students.map(s => ({ ...s, isPresent: null }))); setView('MARK'); }}
            className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-left active:scale-95 transition-transform">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-extrabold text-slate-900 text-sm">{cls.className}-{cls.section}</div>
                <div className="text-[10px] font-bold text-slate-400 mt-0.5">{cls.subject} · {cls.studentCount} students</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-[9px] font-black bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full uppercase">Mark</div>
                <ChevronRight size={16} className="text-slate-300" />
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  // Mark attendance
  if (view === 'MARK' && selectedClass) return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader(`${selectedClass.className}-${selectedClass.section}`, () => setView('CLASSES'))}

      {/* Sticky summary + actions */}
      <div className="bg-white border-b border-slate-100 px-4 py-3 space-y-2">
        <div className="flex gap-2">
          <div className="flex-1 text-center bg-emerald-50 rounded-xl py-2">
            <div className="text-lg font-black text-emerald-600">{presentCount}</div>
            <div className="text-[9px] font-black text-emerald-500 uppercase">Present</div>
          </div>
          <div className="flex-1 text-center bg-rose-50 rounded-xl py-2">
            <div className="text-lg font-black text-rose-500">{absentCount}</div>
            <div className="text-[9px] font-black text-rose-400 uppercase">Absent</div>
          </div>
          <div className="flex-1 text-center bg-slate-100 rounded-xl py-2">
            <div className="text-lg font-black text-slate-500">{unmarkedCount}</div>
            <div className="text-[9px] font-black text-slate-400 uppercase">Unmarked</div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => markAll(true)} className="flex-1 py-2 bg-emerald-500 text-white text-[11px] font-black rounded-xl active:scale-95 transition-transform">All Present</button>
          <button onClick={() => markAll(false)} className="flex-1 py-2 bg-rose-500 text-white text-[11px] font-black rounded-xl active:scale-95 transition-transform">All Absent</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-32">
        <div className="p-4 space-y-2">
          {students.map(student => (
            <button key={student.id} onClick={() => toggleStudent(student.id)}
              className={`w-full flex items-center gap-4 p-4 rounded-2xl border text-left transition-all active:scale-95 ${
                student.isPresent === true ? 'bg-emerald-50 border-emerald-200' :
                student.isPresent === false ? 'bg-rose-50 border-rose-200' :
                'bg-white border-slate-100 shadow-sm'
              }`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm shrink-0 ${
                student.isPresent === true ? 'bg-emerald-500 text-white' :
                student.isPresent === false ? 'bg-rose-500 text-white' :
                'bg-slate-200 text-slate-500'
              }`}>
                {student.isPresent === true ? '✓' : student.isPresent === false ? '✗' : student.rollNo}
              </div>
              <div className="flex-1">
                <div className="font-extrabold text-slate-900 text-sm">{student.name}</div>
                <div className="text-[10px] font-bold text-slate-400">Roll No. {student.rollNo}</div>
              </div>
              <div className={`text-[10px] font-black uppercase tracking-widest ${
                student.isPresent === true ? 'text-emerald-600' :
                student.isPresent === false ? 'text-rose-500' : 'text-slate-300'
              }`}>
                {student.isPresent === true ? 'P' : student.isPresent === false ? 'A' : '—'}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-100">
        <button onClick={handleSubmit} disabled={isSubmitting || unmarkedCount > 0}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-black text-sm uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-50">
          {isSubmitting ? 'Submitting…' : <><Save size={16} /> Submit Attendance</>}
        </button>
      </div>
    </div>
  );

  // History
  if (view === 'HISTORY') return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Attendance History', () => setView('CLASSES'))}
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-3">
        {history.map(rec => {
          const pct = rec.totalStudents > 0 ? Math.round((rec.totalPresent / rec.totalStudents) * 100) : 0;
          return (
            <div key={rec.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <div className="font-extrabold text-slate-900 text-sm">{rec.className}-{rec.section} · {rec.subject}</div>
                  <div className="text-[10px] font-bold text-slate-400 mt-0.5">{rec.date}</div>
                </div>
                <div className={`text-sm font-black ${pct >= 75 ? 'text-emerald-600' : 'text-rose-500'}`}>{pct}%</div>
              </div>
              <div className="flex gap-3">
                <div className="flex items-center gap-1 text-[10px] font-black text-emerald-600">
                  <CheckCircle2 size={12} /> {rec.totalPresent} Present
                </div>
                <div className="flex items-center gap-1 text-[10px] font-black text-rose-500">
                  <XCircle size={12} /> {rec.totalAbsent} Absent
                </div>
              </div>
              <div className="mt-2 w-full bg-slate-100 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full ${pct >= 75 ? 'bg-emerald-500' : 'bg-rose-400'}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
        {history.length === 0 && (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <Users size={32} className="mb-3 opacity-40" />
            <p className="font-bold text-sm">No attendance records yet</p>
          </div>
        )}
      </div>
    </div>
  );

  return null;
};
