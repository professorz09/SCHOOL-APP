import React, { useState } from 'react';
import { ArrowLeft, Plus, Send, Bell, Users, BookOpen } from 'lucide-react';
import { useUIStore } from '../../../store/uiStore';

interface TeacherNotice {
  id: string;
  title: string;
  body: string;
  targetClass: string;
  targetSection: string;
  sentAt: string;
  type: 'HOMEWORK' | 'EXAM' | 'GENERAL';
}

interface Props { onBack: () => void; }

const MOCK_TEACHER_NOTICES: TeacherNotice[] = [
  { id: 'tn1', title: 'Chapter 5 Homework', body: 'Complete exercises 5.1 to 5.4 in textbook. Due tomorrow.', targetClass: 'Class 10', targetSection: 'A', sentAt: '2024-10-20', type: 'HOMEWORK' },
  { id: 'tn2', title: 'Unit Test Reminder', body: 'Unit Test 2 on 25th October. Chapters 3, 4, 5 in syllabus.', targetClass: 'Class 10', targetSection: 'B', sentAt: '2024-10-18', type: 'EXAM' },
];

const TYPE_COLORS: Record<string, string> = {
  HOMEWORK: 'bg-blue-50 text-blue-700',
  EXAM: 'bg-rose-50 text-rose-700',
  GENERAL: 'bg-slate-100 text-slate-600',
};

export const TeacherNoticesView: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const [view, setView] = useState<'LIST' | 'CREATE'>('LIST');
  const [notices, setNotices] = useState<TeacherNotice[]>(MOCK_TEACHER_NOTICES);
  const [form, setForm] = useState({ title: '', body: '', targetClass: 'Class 10', targetSection: 'A', type: 'GENERAL' as TeacherNotice['type'] });

  const ASSIGNED_CLASSES = ['Class 10-A', 'Class 10-B', 'Class 9-A'];

  const handleCreate = () => {
    if (!form.title || !form.body) { showToast('Title and message required', 'error'); return; }
    const notice: TeacherNotice = {
      id: `tn${Date.now()}`, ...form,
      sentAt: new Date().toISOString().split('T')[0],
    };
    setNotices(prev => [notice, ...prev]);
    showToast(`Notice sent to ${form.targetClass}-${form.targetSection}`);
    setForm({ title: '', body: '', targetClass: 'Class 10', targetSection: 'A', type: 'GENERAL' });
    setView('LIST');
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
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Send Notice', () => setView('LIST'))}
      <div className="flex-1 overflow-y-auto p-4  space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Target Class</p>
          <div className="flex gap-2 flex-wrap">
            {ASSIGNED_CLASSES.map(cls => {
              const [cn, sec] = cls.split('-');
              const isSelected = form.targetClass === cn && form.targetSection === sec;
              return (
                <button key={cls} onClick={() => setForm(f => ({ ...f, targetClass: cn, targetSection: sec }))}
                  className={`px-3 py-2 rounded-xl text-xs font-black transition-colors ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-50 border border-slate-200 text-slate-600'}`}>
                  {cls}
                </button>
              );
            })}
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Type</label>
            <div className="flex gap-2">
              {(['HOMEWORK', 'EXAM', 'GENERAL'] as const).map(t => (
                <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))}
                  className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-colors ${form.type === t ? 'bg-slate-900 text-white' : 'bg-slate-50 border border-slate-200 text-slate-500'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Title *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Notice title"
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500 focus:bg-white" />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Message *</label>
            <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              rows={4} placeholder="Write your notice here…"
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500 focus:bg-white resize-none" />
          </div>
        </div>
        <button onClick={handleCreate}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg">
          <Send size={14} /> Send Notice
        </button>
      </div>
    </div>
  );

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Notices', onBack,
        <button onClick={() => setView('CREATE')} className="p-2 bg-indigo-500 text-white rounded-full shadow-md">
          <Plus size={18} />
        </button>
      )}
      <div className="flex-1 overflow-y-auto p-4  space-y-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sent to your classes</p>
        {notices.length === 0 && (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <Bell size={32} className="mb-3 opacity-40" />
            <p className="font-bold text-sm">No notices sent yet</p>
          </div>
        )}
        {notices.map(n => (
          <div key={n.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="font-extrabold text-slate-900 text-sm flex-1">{n.title}</div>
              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase shrink-0 ${TYPE_COLORS[n.type]}`}>{n.type}</span>
            </div>
            <p className="text-xs font-bold text-slate-500 mb-2 line-clamp-2">{n.body}</p>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">{n.targetClass}-{n.targetSection}</span>
              <span className="text-[9px] font-bold text-slate-400">{n.sentAt}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
