import React, { useEffect, useState } from 'react';
import { ArrowLeft, MailPlus, Send, History, Trash2, Users, School, BookOpen, GraduationCap } from 'lucide-react';
import { useBroadcastStore } from '../../../store/broadcastStore';
import { useUIStore } from '../../../store/uiStore';
import { BroadcastAudience } from '../../../config/constants';
import { Broadcast } from '../../../types/broadcast.types';

interface Props {
  onBack: () => void;
}

const AUDIENCE_META: Record<BroadcastAudience, { label: string; icon: React.ReactNode; reach: string; color: string }> = {
  [BroadcastAudience.ALL]: { label: 'All Users', icon: <Users size={16} />, reach: '~18,500 users', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  [BroadcastAudience.PRINCIPALS]: { label: 'Principals Only', icon: <School size={16} />, reach: '6 principals', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  [BroadcastAudience.TEACHERS]: { label: 'Teachers Only', icon: <BookOpen size={16} />, reach: '~352 teachers', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  [BroadcastAudience.STUDENTS]: { label: 'Students Only', icon: <GraduationCap size={16} />, reach: '~6,740 students', color: 'bg-amber-50 text-amber-700 border-amber-200' },
};

export const BroadcastManager: React.FC<Props> = ({ onBack }) => {
  const { broadcasts, fetchBroadcasts, send, delete: deleteBroadcast } = useBroadcastStore();
  const { showToast } = useUIStore();

  const [tab, setTab] = useState<'NEW' | 'HISTORY'>('NEW');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<BroadcastAudience>(BroadcastAudience.ALL);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    fetchBroadcasts().catch(e => showToast(e instanceof Error ? e.message : 'Failed to load broadcasts', 'error'));
  }, []);

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) { showToast('Title and message required', 'error'); return; }
    setIsSending(true);
    try {
      await send({ title: title.trim(), body: body.trim(), audience });
      showToast(`Broadcast sent to ${AUDIENCE_META[audience].reach}`);
      setTitle('');
      setBody('');
      setTab('HISTORY');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to send broadcast', 'error');
    } finally {
      setIsSending(false);
    }
  };

  const handleDelete = async (bc: Broadcast) => {
    try {
      await deleteBroadcast(bc.id);
      showToast('Broadcast removed', 'info');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to remove broadcast', 'error');
    }
  };

  const audienceColor = (a: BroadcastAudience) => {
    const m: Record<BroadcastAudience, string> = {
      ALL: 'text-blue-700 bg-blue-50',
      PRINCIPALS: 'text-indigo-700 bg-indigo-50',
      TEACHERS: 'text-emerald-700 bg-emerald-50',
      STUDENTS: 'text-amber-700 bg-amber-50',
    };
    return m[a];
  };

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Broadcast</h2>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-full">
          <button onClick={() => setTab('NEW')} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-1 ${tab === 'NEW' ? 'bg-white shadow-sm text-amber-600' : 'text-slate-500'}`}>
            <MailPlus size={12} /> New
          </button>
          <button onClick={() => setTab('HISTORY')} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-1 ${tab === 'HISTORY' ? 'bg-white shadow-sm text-amber-600' : 'text-slate-500'}`}>
            <History size={12} /> Sent ({broadcasts.filter(b => b.status === 'SENT').length})
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 ">
        {tab === 'NEW' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Title *</label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. System Maintenance Notice"
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-amber-500 focus:bg-white transition-colors" />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Target Audience</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(AUDIENCE_META).map(([key, meta]) => (
                    <button key={key} onClick={() => setAudience(key as BroadcastAudience)}
                      className={`flex items-center gap-2 p-3 rounded-xl border-2 text-left transition-all ${audience === key ? `border-amber-400 bg-amber-50` : 'border-slate-200 bg-white'}`}>
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${meta.color}`}>{meta.icon}</div>
                      <div>
                        <div className="text-[10px] font-black text-slate-900">{meta.label}</div>
                        <div className="text-[9px] font-bold text-slate-400">{meta.reach}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Message *</label>
                <textarea value={body} onChange={e => setBody(e.target.value)} rows={5}
                  placeholder="Write your announcement here…"
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-amber-500 focus:bg-white transition-colors resize-none" />
                <div className="text-right text-[10px] font-bold text-slate-400 mt-1">{body.length} chars</div>
              </div>
            </div>

            {/* Preview card */}
            {(title || body) && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-2">Preview</div>
                <div className="font-extrabold text-slate-900 text-sm mb-1">{title || '—'}</div>
                <div className="text-xs font-bold text-slate-600 line-clamp-3">{body || '—'}</div>
                <div className={`mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${audienceColor(audience)}`}>
                  {AUDIENCE_META[audience].icon} {AUDIENCE_META[audience].label}
                </div>
              </div>
            )}

            <button onClick={handleSend} disabled={isSending}
              className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-all shadow-lg disabled:opacity-60">
              {isSending ? 'Sending…' : <><Send size={16} /> Send Broadcast</>}
            </button>
          </div>
        )}

        {tab === 'HISTORY' && (
          <div className="space-y-3">
            {broadcasts.length === 0 && (
              <div className="flex flex-col items-center py-16 text-slate-400">
                <MailPlus size={32} className="mb-3 opacity-40" />
                <p className="font-bold text-sm">No broadcasts yet</p>
              </div>
            )}
            {broadcasts.map(bc => (
              <div key={bc.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${audienceColor(bc.audience)}`}>
                          {bc.audience}
                        </span>
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${bc.status === 'SENT' ? 'text-emerald-700 bg-emerald-50' : 'text-amber-700 bg-amber-50'}`}>
                          {bc.status}
                        </span>
                      </div>
                      <div className="font-extrabold text-slate-900 text-sm">{bc.title}</div>
                      <div className="text-xs font-bold text-slate-500 mt-1 line-clamp-2">{bc.body}</div>
                    </div>
                    <button onClick={() => handleDelete(bc)} className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-50">
                    <span className="text-[10px] font-bold text-slate-400">{bc.sentAt ?? bc.scheduledAt}</span>
                    <span className="text-[10px] font-black text-blue-600">
                      {bc.reachCount.toLocaleString('en-IN')} reached
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
