import React, { useEffect, useState } from 'react';
import { ArrowLeft, Users, Search, Phone } from 'lucide-react';
import { teacherService } from '@/roles/teacher/teacher.service';

interface StudentProfile {
  id: string; name: string; rollNo: string; admissionNo: string;
  className: string; section: string; phone: string; fatherName: string;
}

interface Props {
  onBack: () => void;
}

const PAGE_SIZE = 50;

export const TeacherStudentList: React.FC<Props> = ({ onBack }) => {
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedClass, setSelectedClass] = useState<string>('ALL');
  const [shown, setShown] = useState(PAGE_SIZE);

  useEffect(() => {
    teacherService.getStudentProfiles()
      .then(setStudents)
      .catch(() => setStudents([]))
      .finally(() => setLoading(false));
  }, []);

  // Unique class+section labels
  const classOptionsMap = new Map<string, { className: string; section: string }>();
  students.forEach(s => {
    classOptionsMap.set(`${s.className}-${s.section}`, { className: s.className, section: s.section });
  });
  const classOptions: Array<{ label: string; className: string; section: string }> = [];
  classOptionsMap.forEach((val, label) => classOptions.push({ label, ...val }));

  const q = search.trim().toLowerCase();
  const filtered = students.filter(s => {
    const matchesClass = selectedClass === 'ALL' || `${s.className}-${s.section}` === selectedClass;
    const matchesSearch = !q ||
      s.name.toLowerCase().includes(q) ||
      s.rollNo.includes(q) ||
      s.admissionNo.toLowerCase().includes(q) ||
      s.fatherName.toLowerCase().includes(q);
    return matchesClass && matchesSearch;
  });

  // Reset visible count when the filter narrows (avoids showing a stale
  // higher offset on a smaller filtered list).
  useEffect(() => { setShown(PAGE_SIZE); }, [search, selectedClass]);
  const visible = filtered.slice(0, shown);
  const remaining = filtered.length - visible.length;

  return (
    <div className="w-full lg:max-w-5xl lg:mx-auto bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">My Students</h2>
        </div>
        <div className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-full text-[10px] font-black">
          <Users size={12} />
          {filtered.length}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-slate-100 px-4 py-3 space-y-2 sticky top-[73px] z-10">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, roll no. or admission no."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-indigo-400 transition-colors"
          />
        </div>
        {classOptions.length > 1 && (
          <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-0.5">
            <button
              onClick={() => setSelectedClass('ALL')}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest transition-all ${
                selectedClass === 'ALL' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
              }`}>
              All
            </button>
            {classOptions.map(c => (
              <button
                key={c.label}
                onClick={() => setSelectedClass(c.label)}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest transition-all ${
                  selectedClass === c.label ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                }`}>
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin mb-3" />
            <p className="text-sm font-bold">Loading students…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <Users size={32} className="mb-3 opacity-40" />
            <p className="font-bold text-sm">No students found</p>
            {q && <p className="text-xs font-bold mt-1 opacity-60">Try a different search</p>}
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map(student => (
              <div key={student.id}
                className="flex items-center gap-3 bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-400 to-violet-500 text-white flex items-center justify-center font-black text-sm shrink-0">
                  {student.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold text-slate-900 text-sm truncate">{student.name}</div>
                  <div className="text-[10px] font-bold text-slate-400 mt-0.5">
                    {student.className}-{student.section}
                    {student.rollNo && ` · Roll #${student.rollNo}`}
                    {student.admissionNo && ` · Adm. ${student.admissionNo}`}
                  </div>
                  {student.fatherName && (
                    <div className="text-[10px] font-bold text-slate-400">
                      Father: {student.fatherName}
                    </div>
                  )}
                  {student.phone && (
                    <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                      <Phone size={9} className="shrink-0" />
                      {student.phone}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {remaining > 0 && (
              <button onClick={() => setShown(s => s + PAGE_SIZE)}
                className="w-full mt-1 py-3 bg-white border border-slate-200 rounded-2xl font-black text-xs text-indigo-700 hover:bg-indigo-50 transition-colors">
                Load More ({remaining} remaining)
              </button>
            )}
            <p className="text-center text-[10px] font-bold text-slate-300 pt-2">
              Showing {visible.length} of {filtered.length} student{filtered.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
