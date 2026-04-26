import React, { useEffect, useState } from 'react';
import { ArrowLeft, Plus, CircleAlert } from 'lucide-react';
import { studentDashboardService } from '../../../services/student.service2';
import { StudentComplaint } from '../../../types/student.types';
import { useUIStore } from '../../../store/uiStore';

type View = 'LIST' | 'CREATE';

interface Props { onBack: () => void; }

const statusColor = (s: string) =>
  s === 'OPEN' ? 'bg-rose-50 text-rose-700' :
  s === 'IN_PROGRESS' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700';

export const StudentComplaintsView: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const [view, setView] = useState<View>('LIST');
  const [complaints, setComplaints] = useState<StudentComplaint[]>([]);
  const [form, setForm] = useState({ subject: '', description: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => { studentDashboardService.getComplaints().then(setComplaints); }, []);

  const handleSubmit = async () => {
    if (!form.subject || !form.description) { showToast('Subject and description required', 'error'); return; }
    setIsSubmitting(true);
    try {
      const c = await studentDashboardService.submitComplaint(form.subject, form.description);
      setComplaints(prev => [c, ...prev]);
      showToast('Complaint submitted to principal');
      setForm({ subject: '', description: '' });
      setView('LIST');
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

  if (view === 'CREATE') return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('File Complaint', () => setView('LIST'))}
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3">
          <p className="text-xs font-bold text-blue-700">Your complaint will be reviewed by the principal.</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Subject *</label>
            <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
              placeholder="Brief summary of the issue"
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-rose-500" />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Description *</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={5}
              placeholder="Describe your issue in detail…"
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-rose-500 resize-none" />
          </div>
        </div>
        <button onClick={handleSubmit} disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 bg-rose-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-60">
          {isSubmitting ? 'Submitting…' : <><Plus size={16} /> Submit Complaint</>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('My Complaints', onBack,
        <button onClick={() => setView('CREATE')} className="p-2 bg-rose-500 text-white rounded-full shadow-md"><Plus size={18} /></button>
      )}
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-3">
        {complaints.map(c => (
          <div key={c.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${statusColor(c.status)}`}>{c.status.replace('_', ' ')}</span>
              <span className="text-[10px] font-bold text-slate-400">{c.createdAt}</span>
            </div>
            <div className="font-extrabold text-slate-900 text-sm">{c.subject}</div>
            <div className="text-[11px] font-bold text-slate-400 mt-1 line-clamp-2">{c.description}</div>
            {c.response && (
              <div className="mt-3 pt-3 border-t border-slate-50">
                <p className="text-[10px] font-black text-emerald-600 mb-1">Response</p>
                <p className="text-[11px] font-bold text-slate-600">{c.response}</p>
              </div>
            )}
          </div>
        ))}
        {complaints.length === 0 && (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <CircleAlert size={32} className="mb-3 opacity-40" />
            <p className="font-bold text-sm">No complaints filed</p>
          </div>
        )}
      </div>
    </div>
  );
};
