import React, { useEffect, useState } from 'react';
import { ArrowLeft, Plus, BookOpen, CheckCircle2 } from 'lucide-react';
import { teacherService } from '../../../services/teacher.service';
import { HomeworkItem, TeacherClass } from '../../../types/teacher.types';
import { useUIStore } from '../../../store/uiStore';

type View = 'LIST' | 'CREATE';

interface Props { onBack: () => void; }

export const HomeworkManager: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const [view, setView] = useState<View>('LIST');
  const [homework, setHomework] = useState<HomeworkItem[]>([]);
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    classId: '', className: '', section: '', subject: '',
    title: '', description: '', assignedDate: new Date().toISOString().split('T')[0],
    dueDate: '', totalStudents: 0,
  });

  useEffect(() => {
    teacherService.getHomework().then(setHomework);
    teacherService.getClasses().then(loaded => {
      setClasses(loaded);
      if (loaded.length > 0) {
        const c = loaded[0];
        setForm(f => ({ ...f, classId: c.id, className: c.className, section: c.section, subject: c.subject, totalStudents: c.studentCount }));
      }
    });
  }, []);

  const handleCreate = async () => {
    if (!form.title || !form.dueDate) { showToast('Title and due date required', 'error'); return; }
    setIsSubmitting(true);
    try {
      const hw = await teacherService.createHomework(form);
      setHomework(prev => [hw, ...prev]);
      showToast('Homework assigned');
      const first = classes[0];
      setForm(first
        ? { classId: first.id, className: first.className, section: first.section, subject: first.subject, title: '', description: '', assignedDate: new Date().toISOString().split('T')[0], dueDate: '', totalStudents: first.studentCount }
        : { classId: '', className: '', section: '', subject: '', title: '', description: '', assignedDate: new Date().toISOString().split('T')[0], dueDate: '', totalStudents: 0 }
      );
      setView('LIST');
    } finally { setIsSubmitting(false); }
  };

  const renderHeader = (title: string, back: () => void, action?: React.ReactNode) => (
    <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
      <div className="flex items-center gap-3">
        <button onClick={back} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20} /></button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">{title}</h2>
      </div>
      {action}
    </div>
  );

  if (view === 'CREATE') return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Assign Homework', () => setView('LIST'))}
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Class</label>
            <select value={form.classId}
              onChange={e => {
                const cls = classes.find(c => c.id === e.target.value);
                if (cls) setForm(f => ({ ...f, classId: cls.id, className: cls.className, section: cls.section, subject: cls.subject, totalStudents: cls.studentCount }));
              }}
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none">
              {classes.map(c => <option key={c.id} value={c.id}>{c.className}-{c.section} · {c.subject}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Title *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Exercise 5.3 — Quadratic Equations"
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-purple-500" />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Description</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={4}
              placeholder="Detailed instructions for students…"
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-purple-500 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Assigned Date</label>
              <input type="date" value={form.assignedDate} onChange={e => setForm(f => ({ ...f, assignedDate: e.target.value }))}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none" />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Due Date *</label>
              <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-purple-500" />
            </div>
          </div>
        </div>
        <button onClick={handleCreate} disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 bg-purple-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-60">
          {isSubmitting ? 'Assigning…' : <><Plus size={16} /> Assign Homework</>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Homework', onBack,
        <button onClick={() => setView('CREATE')} className="p-2 bg-purple-500 text-white rounded-full shadow-md"><Plus size={18} /></button>
      )}
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-3">
        {homework.map(hw => {
          const submittedPct = hw.totalStudents > 0 ? Math.round((hw.submittedCount / hw.totalStudents) * 100) : 0;
          const isOverdue = new Date(hw.dueDate) < new Date();
          return (
            <div key={hw.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="text-[9px] font-black bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full uppercase">{hw.className}-{hw.section}</span>
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${isOverdue ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500'}`}>
                  Due {hw.dueDate}
                </span>
              </div>
              <div className="font-extrabold text-slate-900 text-sm">{hw.title}</div>
              <div className="text-[11px] font-bold text-slate-400 mt-1 line-clamp-2">{hw.description}</div>
              <div className="mt-3 pt-3 border-t border-slate-50">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1 text-[10px] font-black text-slate-600">
                    <CheckCircle2 size={11} className="text-emerald-500" /> {hw.submittedCount}/{hw.totalStudents} submitted
                  </div>
                  <span className="text-[10px] font-black text-slate-500">{submittedPct}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5">
                  <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${submittedPct}%` }} />
                </div>
              </div>
            </div>
          );
        })}
        {homework.length === 0 && (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <BookOpen size={32} className="mb-3 opacity-40" />
            <p className="font-bold text-sm">No homework assigned</p>
          </div>
        )}
      </div>
    </div>
  );
};
