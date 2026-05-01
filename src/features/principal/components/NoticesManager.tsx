import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Plus, Bell, Trash2, Pin } from 'lucide-react';
import { principalService } from '../../../services/principal.service';
import { Notice, NoticeAudience } from '../../../types/principal.types';
import { useUIStore } from '../../../store/uiStore';
import { useRealtimeTable } from '../../../hooks/useRealtimeTable';

type View = 'LIST' | 'COMPOSE';

const AUDIENCES: NoticeAudience[] = ['ALL', 'STUDENTS', 'TEACHERS', 'STAFF', 'PARENTS'];

const audienceColor = (a: NoticeAudience) => {
  const map: Record<NoticeAudience, string> = {
    ALL: 'bg-slate-900 text-white',
    STUDENTS: 'bg-indigo-50 text-indigo-700',
    TEACHERS: 'bg-blue-50 text-blue-700',
    STAFF: 'bg-emerald-50 text-emerald-700',
    PARENTS: 'bg-violet-50 text-violet-700',
  };
  return map[a];
};

interface Props { onBack: () => void; }

export const NoticesManager: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const [view, setView] = useState<View>('LIST');
  const [notices, setNotices] = useState<Notice[]>([]);
  const [form, setForm] = useState<{ title: string; body: string; audience: NoticeAudience; pinned: boolean }>({
    title: '', body: '', audience: 'ALL', pinned: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Notice | null>(null);

  const loadNotices = useCallback(() => {
    principalService.getNotices().then(setNotices);
  }, []);

  useEffect(() => { loadNotices(); }, [loadNotices]);
  useRealtimeTable('notices', loadNotices);

  const handleSend = async () => {
    if (!form.title || !form.body) { showToast('Title and body required', 'error'); return; }
    setIsSubmitting(true);
    try {
      const notice = await principalService.sendNotice({ ...form, sentBy: 'Dr. Rajesh Kumar' });
      setNotices(prev => [notice, ...prev]);
      showToast(`Notice sent to ${form.audience}`);
      setForm({ title: '', body: '', audience: 'ALL', pinned: false });
      setView('LIST');
    } finally { setIsSubmitting(false); }
  };

  const handleDelete = async (notice: Notice) => {
    await principalService.deleteNotice(notice.id);
    setNotices(prev => prev.filter(n => n.id !== notice.id));
    showToast('Notice deleted', 'info');
    setConfirmDelete(null);
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

  if (view === 'COMPOSE') return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('New Notice', () => setView('LIST'))}
      <div className="flex-1 overflow-y-auto p-4  space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Send To</label>
            <div className="grid grid-cols-3 gap-2">
              {AUDIENCES.map(a => (
                <button key={a} onClick={() => setForm(f => ({ ...f, audience: a }))}
                  className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${form.audience === a ? audienceColor(a) : 'bg-slate-50 border border-slate-200 text-slate-400'}`}>
                  {a}
                </button>
              ))}
            </div>
            <p className="text-[10px] font-bold text-slate-400 mt-1.5">
              STAFF reaches all teachers and non-teaching staff (drivers, peons, accountants, etc.).
            </p>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Title *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Notice title"
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-violet-500" />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Message *</label>
            <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} rows={6}
              placeholder="Type your notice…"
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-violet-500 resize-none" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600">Pin notice to top</span>
            <button onClick={() => setForm(f => ({ ...f, pinned: !f.pinned }))}
              className={`w-12 h-6 rounded-full transition-colors relative ${form.pinned ? 'bg-violet-500' : 'bg-slate-200'}`}>
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.pinned ? 'translate-x-7' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>
        <button onClick={handleSend} disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 bg-violet-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-60">
          {isSubmitting ? 'Sending…' : <><Bell size={16} /> Send Notice</>}
        </button>
      </div>
    </div>
  );

  if (confirmDelete) return (
    <div className="absolute inset-0 z-60 bg-slate-900/60 flex items-end justify-center animate-in fade-in">
      <div className="bg-white w-full rounded-t-3xl p-6 pb-10 animate-in slide-in-from-bottom-4">
        <h3 className="font-black text-slate-900 text-lg mb-2">Delete Notice?</h3>
        <p className="text-sm text-slate-500 mb-6">"{confirmDelete.title}" will be removed.</p>
        <div className="flex gap-3">
          <button onClick={() => setConfirmDelete(null)} className="flex-1 py-3 rounded-2xl border border-slate-200 font-black text-slate-600">Cancel</button>
          <button onClick={() => handleDelete(confirmDelete)} className="flex-1 py-3 rounded-2xl bg-rose-600 text-white font-black">Delete</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Notices', onBack,
        <button onClick={() => setView('COMPOSE')} className="p-2 bg-violet-500 text-white rounded-full shadow-md"><Plus size={18} /></button>
      )}
      <div className="flex-1 overflow-y-auto p-4  space-y-3">
        {notices.map(notice => (
          <div key={notice.id} className={`bg-white rounded-2xl border shadow-sm p-4 ${notice.pinned ? 'border-violet-200 bg-violet-50/30' : 'border-slate-100'}`}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                {notice.pinned && <Pin size={12} className="text-violet-500" />}
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${audienceColor(notice.audience)}`}>{notice.audience}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400">{notice.sentAt}</span>
                <button onClick={() => setConfirmDelete(notice)} className="p-1 text-slate-400 hover:text-rose-500 transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
            <h3 className="font-extrabold text-slate-900 text-sm">{notice.title}</h3>
            <p className="text-[11px] font-bold text-slate-500 mt-1 line-clamp-2">{notice.body}</p>
            <p className="text-[10px] font-bold text-slate-400 mt-2">By {notice.sentBy}</p>
          </div>
        ))}
        {notices.length === 0 && (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <Bell size={32} className="mb-3 opacity-40" />
            <p className="font-bold text-sm">No notices sent yet</p>
          </div>
        )}
      </div>
    </div>
  );
};
