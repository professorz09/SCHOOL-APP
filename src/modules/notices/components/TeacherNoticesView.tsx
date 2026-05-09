import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Plus, Send, Bell, Megaphone } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { teacherService } from '@/roles/teacher/teacher.service';
import { TeacherClass } from '@/roles/teacher/teacher.types';
import { useRealtimeTable } from '@/shared/hooks/useRealtimeTable';
import { getRelevantBroadcasts, type RelevantBroadcast } from '@/shared/utils/broadcasts.service';

interface TeacherNotice {
  id: string;
  title: string;
  body: string;
  targetClass: string;
  targetSection: string;
  sentAt: string;
  type: 'HOMEWORK' | 'EXAM' | 'GENERAL';
  sentByName: string;
  isMine: boolean;
}

interface Props { onBack: () => void; }

const TYPE_COLORS: Record<string, string> = {
  HOMEWORK: 'bg-blue-50 text-blue-700',
  EXAM: 'bg-rose-50 text-rose-700',
  GENERAL: 'bg-slate-100 text-slate-600',
};

export const TeacherNoticesView: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const [view, setView] = useState<'LIST' | 'CREATE'>('LIST');
  const [notices, setNotices] = useState<TeacherNotice[]>([]);
  const [shown, setShown] = useState(50);
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<{
    title: string;
    body: string;
    targetSectionId: string;
    targetClass: string;
    targetSection: string;
    type: TeacherNotice['type'];
  }>({
    title: '', body: '', targetSectionId: '', targetClass: '', targetSection: '',
    type: 'GENERAL',
  });

  const [broadcasts, setBroadcasts] = useState<RelevantBroadcast[]>([]);

  const loadNotices = useCallback(() => {
    teacherService.getMyNotices().catch(() => []).then(setNotices);
    getRelevantBroadcasts('TEACHER').then(setBroadcasts).catch(() => setBroadcasts([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      teacherService.getMyNotices().catch(() => []),
      teacherService.getClasses().catch(() => []),
    ]).then(([ns, cs]) => {
      if (cancelled) return;
      setNotices(ns);
      setClasses(cs);
      if (cs[0]) {
        setForm(f => ({
          ...f,
          targetSectionId: cs[0].id,
          targetClass: cs[0].className,
          targetSection: cs[0].section,
        }));
      }
      setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  useRealtimeTable('notices', loadNotices);
  useRealtimeTable('broadcasts', loadNotices, { schoolColumn: false });

  const handleCreate = async () => {
    if (!form.title.trim() || !form.body.trim()) { showToast('Title and message required', 'error'); return; }
    if (!form.targetSectionId) { showToast('Pick a class', 'error'); return; }
    setIsSubmitting(true);
    try {
      await teacherService.createNotice({
        title: form.title.trim(),
        body: form.body.trim(),
        targetSectionId: form.targetSectionId,
        targetClass: form.targetClass,
        targetSection: form.targetSection,
        type: form.type,
      });
      const fresh = await teacherService.getMyNotices();
      setNotices(fresh);
      showToast(`Notice sent to ${form.targetClass}-${form.targetSection}`);
      const first = classes[0];
      setForm({
        title: '', body: '', type: 'GENERAL',
        targetSectionId: first?.id ?? '',
        targetClass: first?.className ?? '',
        targetSection: first?.section ?? '',
      });
      setView('LIST');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to send notice', 'error');
    } finally {
      setIsSubmitting(false);
    }
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
    <div className="w-full lg:max-w-5xl lg:mx-auto bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Send Notice', () => setView('LIST'))}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Target Class</p>
            {classes.length === 0 ? (
              <p className="text-xs font-bold text-slate-400">No classes assigned to you yet.</p>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {classes.map(c => {
                  const isSelected = form.targetSectionId === c.id;
                  return (
                    <button key={c.id} onClick={() => setForm(f => ({
                      ...f, targetSectionId: c.id, targetClass: c.className, targetSection: c.section,
                    }))}
                      className={`px-3 py-2 rounded-xl text-xs font-black transition-colors ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-50 border border-slate-200 text-slate-600'}`}>
                      {c.className}-{c.section}
                    </button>
                  );
                })}
              </div>
            )}
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
        <button onClick={handleCreate} disabled={isSubmitting || !form.targetSectionId}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-60">
          {isSubmitting ? 'Sending…' : <><Send size={14} /> Send Notice</>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="w-full lg:max-w-5xl lg:mx-auto bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Notices', onBack,
        <button onClick={() => setView('CREATE')} disabled={classes.length === 0}
          className="p-2 bg-indigo-500 text-white rounded-full shadow-md disabled:opacity-50">
          <Plus size={18} />
        </button>
      )}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {broadcasts.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Platform Announcements</p>
            {broadcasts.map(b => (
              <div key={b.id} className="bg-gradient-to-br from-indigo-50 to-violet-50 rounded-2xl border border-indigo-200 shadow-sm p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <Megaphone size={11} className="text-indigo-600 shrink-0" />
                  <span className="text-[9px] font-black px-2 py-0.5 rounded-full border uppercase text-indigo-700 bg-white border-indigo-200">Announcement</span>
                  <span className="ml-auto text-[10px] font-bold text-indigo-500">
                    {b.sentAt ? new Date(b.sentAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
                  </span>
                </div>
                <div className="font-black text-slate-900 text-sm leading-tight mb-1">{b.title}</div>
                <p className="text-xs font-medium text-slate-700 leading-relaxed whitespace-pre-line">{b.body}</p>
              </div>
            ))}
          </div>
        )}
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Notices for you and your classes</p>
        {isLoading ? (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <p className="font-bold text-sm">Loading…</p>
          </div>
        ) : notices.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <Bell size={32} className="mb-3 opacity-40" />
            <p className="font-bold text-sm">No notices yet</p>
            <p className="text-[11px] mt-1">School-wide notices and ones for your classes will show here.</p>
          </div>
        ) : (
          <>
          {notices.slice(0, shown).map(n => (
            <div key={n.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="font-extrabold text-slate-900 text-sm flex-1">{n.title}</div>
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase shrink-0 ${TYPE_COLORS[n.type]}`}>{n.type}</span>
              </div>
              <p className="text-xs font-bold text-slate-500 mb-2 line-clamp-2">{n.body}</p>
              <div className="flex items-center gap-2 flex-wrap">
                {(n.targetClass || n.targetSection) && (
                  <span className="text-[9px] font-black bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
                    {n.targetClass}{n.targetSection ? `-${n.targetSection}` : ''}
                  </span>
                )}
                {n.isMine ? (
                  <span className="text-[9px] font-black bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">Sent by you</span>
                ) : n.sentByName ? (
                  <span className="text-[9px] font-bold text-slate-500">From {n.sentByName}</span>
                ) : null}
                <span className="text-[9px] font-bold text-slate-400 ml-auto">{n.sentAt}</span>
              </div>
            </div>
          ))}
          {notices.length > shown && (
            <button onClick={() => setShown(s => s + 50)}
              className="w-full py-3 bg-white border border-slate-200 rounded-2xl font-black text-xs text-indigo-700 hover:bg-indigo-50 transition-colors">
              Load More ({notices.length - shown} remaining)
            </button>
          )}
          </>
        )}
      </div>
    </div>
  );
};
