import React, { useEffect, useState } from 'react';
import { ArrowLeft, CircleAlert, CheckCircle2, Clock, MessageSquare } from 'lucide-react';
import { principalService } from '../../../services/principal.service';
import { Complaint, ComplaintStatus } from '../../../types/principal.types';
import { useUIStore } from '../../../store/uiStore';

type Filter = 'ALL' | ComplaintStatus;

interface Props { onBack: () => void; }

const statusColor = (s: ComplaintStatus) =>
  s === 'OPEN' ? 'bg-rose-50 text-rose-700' :
  s === 'IN_PROGRESS' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700';

const fromColor = (f: string) =>
  f === 'STUDENT' ? 'bg-indigo-50 text-indigo-700' :
  f === 'TEACHER' ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700';

export const ComplaintsManager: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [selected, setSelected] = useState<Complaint | null>(null);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [response, setResponse] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => { principalService.getComplaints().then(setComplaints); }, []);

  const filtered = filter === 'ALL' ? complaints : complaints.filter(c => c.status === filter);

  const handleResolve = async () => {
    if (!selected || !response.trim()) { showToast('Response required', 'error'); return; }
    setIsSubmitting(true);
    try {
      const updated = await principalService.resolveComplaint(selected.id, response);
      setComplaints(prev => prev.map(c => c.id === updated.id ? updated : c));
      setSelected(updated);
      showToast('Complaint resolved');
    } finally { setIsSubmitting(false); }
  };

  if (selected) return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button onClick={() => setSelected(null)} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20} /></button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Complaint Detail</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${fromColor(selected.from)}`}>{selected.from}</span>
            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${statusColor(selected.status)}`}>{selected.status.replace('_', ' ')}</span>
          </div>
          <h3 className="font-black text-slate-900 text-base">{selected.subject}</h3>
          <p className="text-sm font-bold text-slate-500">{selected.description}</p>
          <div className="text-[10px] font-bold text-slate-400">
            From: <span className="text-slate-700">{selected.fromName}</span>
            {selected.fromClass && <> · <span className="text-slate-700">{selected.fromClass}</span></>}
          </div>
          <div className="text-[10px] font-bold text-slate-400">Filed: {selected.createdAt}</div>
        </div>

        {selected.response && (
          <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-2">Response</p>
            <p className="text-sm font-bold text-emerald-800">{selected.response}</p>
            {selected.resolvedAt && <p className="text-[10px] font-bold text-emerald-500 mt-1">Resolved on {selected.resolvedAt}</p>}
          </div>
        )}

        {selected.status !== 'RESOLVED' && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Respond &amp; Resolve</p>
            <textarea value={response} onChange={e => setResponse(e.target.value)} rows={4}
              placeholder="Type your response…"
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-emerald-500 resize-none" />
            <button onClick={handleResolve} disabled={isSubmitting}
              className="w-full py-3 bg-emerald-600 text-white font-black rounded-2xl active:scale-95 transition-transform disabled:opacity-60">
              {isSubmitting ? 'Resolving…' : 'Mark Resolved'}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20} /></button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Complaints</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-3">
        <div className="flex gap-2">
          {(['ALL', 'OPEN', 'IN_PROGRESS', 'RESOLVED'] as Filter[]).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`flex-1 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-colors ${filter === f ? 'bg-slate-900 text-white' : 'bg-white text-slate-400 border border-slate-200'}`}>
              {f.replace('_', ' ')}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {filtered.map(c => (
            <button key={c.id} onClick={() => { setSelected(c); setResponse(c.response ?? ''); }}
              className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-left active:bg-slate-50">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex gap-2">
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${fromColor(c.from)}`}>{c.from}</span>
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${statusColor(c.status)}`}>{c.status.replace('_', ' ')}</span>
                </div>
                <span className="text-[10px] font-bold text-slate-400 shrink-0">{c.createdAt}</span>
              </div>
              <div className="font-extrabold text-slate-900 text-sm">{c.subject}</div>
              <div className="text-[11px] font-bold text-slate-400 mt-1 line-clamp-2">{c.description}</div>
              <div className="text-[10px] font-black text-slate-500 mt-1.5">{c.fromName}</div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center py-16 text-slate-400">
              <CircleAlert size={32} className="mb-3 opacity-40" />
              <p className="font-bold text-sm">No complaints</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
