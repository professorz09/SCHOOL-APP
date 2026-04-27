import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, Users, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { studentService } from '../../../services/student.service';
import { Student } from '../../../types/principal.types';

interface Props { onBack: () => void; }

type View = 'CLASSES' | 'SECTIONS' | 'STUDENTS';

const ATT_COLOR = (pct: number) =>
  pct >= 90 ? 'bg-emerald-500' :
  pct >= 75 ? 'bg-amber-400' :
  'bg-rose-500';

const ATT_TEXT = (pct: number) =>
  pct >= 90 ? 'text-emerald-600' :
  pct >= 75 ? 'text-amber-600' :
  'text-rose-600';

const ATT_BG = (pct: number) =>
  pct >= 90 ? 'bg-emerald-50' :
  pct >= 75 ? 'bg-amber-50' :
  'bg-rose-50';

const avg = (nums: number[]) =>
  nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0;

export const StudentAttendanceManager: React.FC<Props> = ({ onBack }) => {
  const [students, setStudents] = useState<Student[]>([]);
  const [view, setView] = useState<View>('CLASSES');
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  useEffect(() => { studentService.getAll().then(setStudents); }, []);

  // aggregate by class
  const classStats = useMemo(() => {
    const map = new Map<string, { students: Student[]; sections: Set<string> }>();
    for (const s of students) {
      if (!map.has(s.className)) map.set(s.className, { students: [], sections: new Set() });
      map.get(s.className)!.students.push(s);
      map.get(s.className)!.sections.add(s.section);
    }
    return Array.from(map.entries())
      .map(([name, { students: ss, sections }]) => ({
        name,
        count: ss.length,
        sections: [...sections].sort(),
        avgAtt: avg(ss.map(s => s.attendancePercent)),
        low: ss.filter(s => s.attendancePercent < 75).length,
      }))
      .sort((a, b) => {
        const n = (s: string) => parseInt(s.replace('Class ', ''));
        return n(a.name) - n(b.name);
      });
  }, [students]);

  const sectionStudents = useMemo(() => {
    if (!selectedClass || !selectedSection) return [];
    return students
      .filter(s => s.className === selectedClass && s.section === selectedSection)
      .sort((a, b) => parseInt(a.rollNo) - parseInt(b.rollNo));
  }, [students, selectedClass, selectedSection]);

  const classSections = useMemo(() => {
    if (!selectedClass) return [];
    const cls = classStats.find(c => c.name === selectedClass);
    return cls?.sections ?? [];
  }, [classStats, selectedClass]);

  const overallAvg = avg(students.map(s => s.attendancePercent));
  const lowCount = students.filter(s => s.attendancePercent < 75).length;

  // ── CLASS LIST ──────────────────────────────────────────────────────────────
  if (view === 'CLASSES') return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-4 sticky top-0 z-10 shadow-sm flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Student Attendance</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">
        {/* Summary Cards */}
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

        {/* Overall Bar */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">School Attendance</span>
            <span className={`font-black text-sm ${ATT_TEXT(overallAvg)}`}>{overallAvg}%</span>
          </div>
          <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-3 rounded-full transition-all ${ATT_COLOR(overallAvg)}`} style={{ width: `${overallAvg}%` }} />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[9px] font-bold text-slate-400">0%</span>
            <span className="text-[9px] font-bold text-slate-400">75% (Min)</span>
            <span className="text-[9px] font-bold text-slate-400">100%</span>
          </div>
        </div>

        {/* Class List */}
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 px-1">Class-wise Attendance</p>
          <div className="space-y-2">
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
                    {cls.low > 0 && (
                      <div className="text-[9px] font-black text-rose-500 flex items-center gap-0.5 justify-end">
                        <AlertCircle size={9} />{cls.low} low
                      </div>
                    )}
                  </div>
                </div>
                {/* Bar */}
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-2 rounded-full transition-all ${ATT_COLOR(cls.avgAtt)}`} style={{ width: `${cls.avgAtt}%` }} />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // ── SECTIONS ────────────────────────────────────────────────────────────────
  if (view === 'SECTIONS' && selectedClass) {
    const cls = classStats.find(c => c.name === selectedClass)!;
    return (
      <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-4 sticky top-0 z-10 shadow-sm flex items-center gap-3">
          <button onClick={() => setView('CLASSES')} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
            <ArrowLeft size={20} />
          </button>
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
                    {secLow > 0 && (
                      <div className="text-[9px] font-black text-rose-500">{secLow} below 75%</div>
                    )}
                  </div>
                  <ChevronRight size={16} className="text-slate-300" />
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-2 rounded-full transition-all ${ATT_COLOR(secAvg)}`} style={{ width: `${secAvg}%` }} />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── STUDENT LIST IN SECTION ──────────────────────────────────────────────────
  if (view === 'STUDENTS' && selectedClass && selectedSection) {
    return (
      <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-4 sticky top-0 z-10 shadow-sm flex items-center gap-3">
          <button onClick={() => setView('SECTIONS')} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
            <ArrowLeft size={20} />
          </button>
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
                <div className={`font-black text-sm ${ATT_TEXT(s.attendancePercent)}`}>
                  {s.attendancePercent.toFixed(1)}%
                </div>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-2 rounded-full transition-all ${ATT_COLOR(s.attendancePercent)}`}
                  style={{ width: `${s.attendancePercent}%` }} />
              </div>
              {s.attendancePercent < 75 && (
                <div className="flex items-center gap-1 mt-2">
                  <AlertCircle size={11} className="text-rose-500" />
                  <span className="text-[10px] font-black text-rose-500">Below minimum 75% attendance</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
};
