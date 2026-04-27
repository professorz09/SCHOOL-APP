import React, { useEffect, useState } from 'react';
import { ArrowLeft, Plus, ClipboardList, Calendar, Clock } from 'lucide-react';
import { teacherService } from '../../../services/teacher.service';
import { TestSchedule, TestType, TeacherClass } from '../../../types/teacher.types';
import { useUIStore } from '../../../store/uiStore';

type View = 'LIST' | 'CREATE';

const TEST_TYPES: TestType[] = ['UNIT_TEST', 'MID_TERM', 'FINAL', 'QUIZ', 'PRACTICAL'];

const typeColor = (t: TestType) => {
  const map: Record<TestType, string> = {
    UNIT_TEST: 'bg-blue-50 text-blue-700',
    MID_TERM: 'bg-violet-50 text-violet-700',
    FINAL: 'bg-rose-50 text-rose-700',
    QUIZ: 'bg-emerald-50 text-emerald-700',
    PRACTICAL: 'bg-amber-50 text-amber-700',
  };
  return map[t];
};

interface Props { onBack: () => void; }

export const TestsManager: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const [view, setView] = useState<View>('LIST');
  const [tests, setTests] = useState<TestSchedule[]>([]);
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    classId: 'tc1', className: 'Class 10', section: 'A', subject: 'Mathematics',
    testType: 'UNIT_TEST' as TestType, title: '', scheduledDate: '', duration: 60, maxMarks: 25, syllabus: '',
  });

  useEffect(() => {
    teacherService.getTests().then(setTests);
    teacherService.getClasses().then(setClasses);
  }, []);

  const handleCreate = async () => {
    if (!form.title || !form.scheduledDate) { showToast('Title and date required', 'error'); return; }
    setIsSubmitting(true);
    try {
      const test = await teacherService.createTest(form);
      setTests(prev => [test, ...prev]);
      showToast(`${form.testType.replace('_', ' ')} scheduled`);
      setForm({ classId: 'tc1', className: 'Class 10', section: 'A', subject: 'Mathematics', testType: 'UNIT_TEST', title: '', scheduledDate: '', duration: 60, maxMarks: 25, syllabus: '' });
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
      {renderHeader('Schedule Test', () => setView('LIST'))}
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Class</label>
            <select value={form.classId}
              onChange={e => {
                const cls = classes.find(c => c.id === e.target.value);
                if (cls) setForm(f => ({ ...f, classId: cls.id, className: cls.className, section: cls.section, subject: cls.subject }));
              }}
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none">
              {classes.map(c => <option key={c.id} value={c.id}>{c.className}-{c.section} · {c.subject}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Test Type</label>
            <div className="flex flex-wrap gap-2">
              {TEST_TYPES.map(t => (
                <button key={t} onClick={() => setForm(f => ({ ...f, testType: t }))}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${form.testType === t ? typeColor(t) + ' ring-1 ring-current' : 'bg-slate-50 border border-slate-200 text-slate-400'}`}>
                  {t.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Test Title *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Algebra & Trigonometry"
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Syllabus / Topics</label>
            <textarea value={form.syllabus} onChange={e => setForm(f => ({ ...f, syllabus: e.target.value }))} rows={3}
              placeholder="Chapter numbers, topics covered…"
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Date *</label>
              <input type="date" value={form.scheduledDate} onChange={e => setForm(f => ({ ...f, scheduledDate: e.target.value }))}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Duration (min)</label>
              <input type="number" value={form.duration} onChange={e => setForm(f => ({ ...f, duration: +e.target.value }))}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Max Marks</label>
            <input type="number" value={form.maxMarks} onChange={e => setForm(f => ({ ...f, maxMarks: +e.target.value }))}
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
          </div>
        </div>
        <button onClick={handleCreate} disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-60">
          {isSubmitting ? 'Scheduling…' : <><Plus size={16} /> Schedule Test</>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Tests', onBack,
        <button onClick={() => setView('CREATE')} className="p-2 bg-indigo-500 text-white rounded-full shadow-md"><Plus size={18} /></button>
      )}
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Scheduled', val: tests.length, c: 'text-slate-900' },
            { label: 'Upcoming', val: tests.filter(t => new Date(t.scheduledDate) >= new Date()).length, c: 'text-blue-600' },
            { label: 'Results Pending', val: tests.filter(t => !t.resultsUploaded).length, c: 'text-amber-600' },
          ].map(({ label, val, c }) => (
            <div key={label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 text-center">
              <div className={`text-xl font-black ${c}`}>{val}</div>
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
        {tests.map(test => (
          <div key={test.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${typeColor(test.testType)}`}>{test.testType.replace('_', ' ')}</span>
              <span className="text-[10px] font-bold text-slate-400">{test.className}-{test.section}</span>
            </div>
            <div className="font-extrabold text-slate-900 text-sm">{test.title}</div>
            <div className="text-[11px] font-bold text-slate-400 mt-1 line-clamp-1">{test.syllabus}</div>
            <div className="flex gap-4 mt-3 pt-3 border-t border-slate-50">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600">
                <Calendar size={11} className="text-slate-400" /> {test.scheduledDate}
              </div>
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600">
                <Clock size={11} className="text-slate-400" /> {test.duration}m
              </div>
              <div className="ml-auto text-[10px] font-black text-slate-700">{test.maxMarks} marks</div>
            </div>
            {!test.resultsUploaded && (
              <div className="mt-2 text-[10px] font-black text-amber-600 bg-amber-50 px-2 py-1 rounded-lg inline-block">Results pending</div>
            )}
          </div>
        ))}
        {tests.length === 0 && (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <ClipboardList size={32} className="mb-3 opacity-40" />
            <p className="font-bold text-sm">No tests scheduled</p>
          </div>
        )}
      </div>
    </div>
  );
};
