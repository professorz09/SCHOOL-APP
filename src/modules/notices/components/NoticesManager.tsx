import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Plus, Bell, Trash2, Pin, User, Search, Megaphone } from 'lucide-react';
import { noticeService } from '@/modules/notices/notice.service';
import type { Notice, NoticeAudience } from '@/modules/notices/notice.types';
import { useUIStore } from '@/store/uiStore';
import { useRealtimeTable } from '@/shared/hooks/useRealtimeTable';
import { studentService } from '@/modules/students/student.service';
import type { Student } from '@/modules/students/student.types';
import { getRelevantBroadcasts, type RelevantBroadcast } from '@/shared/utils/broadcasts.service';

type View = 'LIST' | 'COMPOSE';

const AUDIENCES: NoticeAudience[] = ['ALL', 'STUDENTS', 'TEACHERS', 'STAFF', 'PARENTS', 'SPECIFIC_STUDENT'];

const AUDIENCE_LABEL: Record<NoticeAudience, string> = {
  ALL: 'All', STUDENTS: 'Students', TEACHERS: 'Teachers',
  STAFF: 'Staff', PARENTS: 'Parents', SPECIFIC_STUDENT: 'Specific Student',
};

const audienceColor = (a: NoticeAudience) => {
  const map: Record<NoticeAudience, string> = {
    ALL: 'bg-slate-900 text-white',
    STUDENTS: 'bg-indigo-50 text-indigo-700',
    TEACHERS: 'bg-blue-50 text-blue-700',
    STAFF: 'bg-emerald-50 text-emerald-700',
    PARENTS: 'bg-violet-50 text-violet-700',
    SPECIFIC_STUDENT: 'bg-rose-50 text-rose-700',
  };
  return map[a];
};

interface Props { onBack: () => void; }

export const NoticesManager: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const [view, setView] = useState<View>('LIST');
  const [notices, setNotices] = useState<Notice[]>([]);
  const [shown, setShown] = useState(50);
  const [form, setForm] = useState<{
    title: string; body: string; audience: NoticeAudience; pinned: boolean;
    targetStudentId: string | null; targetStudentName: string;
  }>({
    title: '', body: '', audience: 'ALL', pinned: false,
    targetStudentId: null, targetStudentName: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Notice | null>(null);

  // Lazy student list — only fetched when the principal picks SPECIFIC_STUDENT.
  // Kept in component state to avoid a fresh fetch every keystroke.
  const [students, setStudents] = useState<Student[] | null>(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [broadcasts, setBroadcasts] = useState<RelevantBroadcast[]>([]);

  const loadNotices = useCallback(() => {
    noticeService.invalidate();
    noticeService.getAll().then(setNotices).catch(() => {});
    getRelevantBroadcasts('PRINCIPAL').then(setBroadcasts).catch(() => setBroadcasts([]));
  }, []);

  useEffect(() => { loadNotices(); }, [loadNotices]);
  useRealtimeTable('notices', loadNotices);
  useRealtimeTable('broadcasts', loadNotices, { schoolColumn: false });

  // Fetch students the first time the principal switches to SPECIFIC_STUDENT.
  useEffect(() => {
    if (form.audience !== 'SPECIFIC_STUDENT' || students !== null) return;
    studentService.getAll().then(setStudents).catch(() => setStudents([]));
  }, [form.audience, students]);

  const handleSend = async () => {
    if (!form.title || !form.body) { showToast('Title and body required', 'error'); return; }
    if (form.audience === 'SPECIFIC_STUDENT' && !form.targetStudentId) {
      showToast('Pick a student to send to', 'error'); return;
    }
    setIsSubmitting(true);
    try {
      const notice = await noticeService.create({
        title: form.title, body: form.body, audience: form.audience,
        pinned: form.pinned, sentBy: '',
        targetStudentId: form.audience === 'SPECIFIC_STUDENT' ? form.targetStudentId : null,
      });
      setNotices(prev => [notice, ...prev]);
      const dest = form.audience === 'SPECIFIC_STUDENT' && form.targetStudentName
        ? `to ${form.targetStudentName}`
        : `to ${AUDIENCE_LABEL[form.audience]}`;
      showToast(`Notice sent ${dest}`);
      setForm({ title: '', body: '', audience: 'ALL', pinned: false, targetStudentId: null, targetStudentName: '' });
      setStudentSearch('');
      setView('LIST');
    } finally { setIsSubmitting(false); }
  };

  const handleDelete = async (notice: Notice) => {
    // Earlier this updated UI optimistically AFTER the awaited
    // delete — fine on success, but a server failure left the
    // notice still in the list with no error toast (the throw
    // bubbled silently into onClick's promise sink). Wrap the call.
    try {
      await noticeService.delete(notice.id);
      setNotices(prev => prev.filter(n => n.id !== notice.id));
      showToast('Notice deleted', 'info');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not delete notice', 'error');
    } finally {
      setConfirmDelete(null);
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

  if (view === 'COMPOSE') return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('New Notice', () => setView('LIST'))}
      <div className="flex-1 overflow-y-auto p-4  space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Send To</label>
            <div className="grid grid-cols-3 gap-2">
              {AUDIENCES.map(a => (
                <button key={a} onClick={() => setForm(f => ({ ...f, audience: a, targetStudentId: null, targetStudentName: '' }))}
                  className={`py-2 px-1 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${form.audience === a ? audienceColor(a) : 'bg-slate-50 border border-slate-200 text-slate-400'}`}>
                  {AUDIENCE_LABEL[a]}
                </button>
              ))}
            </div>
            <p className="text-[10px] font-bold text-slate-400 mt-1.5">
              STAFF reaches all teachers and non-teaching staff. SPECIFIC STUDENT delivers a personal notice to one student only.
            </p>
          </div>

          {/* Student picker — only when audience = SPECIFIC_STUDENT */}
          {form.audience === 'SPECIFIC_STUDENT' && (
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Pick Student *</label>
              {form.targetStudentId ? (
                <div className="flex items-center justify-between bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-rose-200 text-rose-700 flex items-center justify-center font-black text-xs shrink-0">
                      {form.targetStudentName.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()}
                    </div>
                    <div className="font-black text-sm text-slate-900 truncate">{form.targetStudentName}</div>
                  </div>
                  <button onClick={() => setForm(f => ({ ...f, targetStudentId: null, targetStudentName: '' }))}
                    className="text-[10px] font-black text-rose-600 px-2 py-1 hover:bg-rose-100 rounded">
                    Change
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                    <input value={studentSearch} onChange={e => setStudentSearch(e.target.value)}
                      placeholder="Search by name, roll, admission no…"
                      className="w-full pl-9 pr-3 py-2.5 border border-slate-200 bg-slate-50 rounded-xl text-sm font-bold text-slate-800 outline-none focus:border-rose-400"/>
                  </div>
                  <div className="max-h-56 overflow-y-auto border border-slate-100 rounded-xl bg-white">
                    {students === null ? (
                      <p className="text-center py-4 text-xs font-bold text-slate-400">Loading students…</p>
                    ) : (() => {
                      const q = studentSearch.trim().toLowerCase();
                      const matches = students.filter(s =>
                        !q || s.name.toLowerCase().includes(q)
                          || s.admissionNo.toLowerCase().includes(q)
                          || (s.rollNo ?? '').includes(studentSearch)
                      ).slice(0, 30);
                      if (matches.length === 0) return (
                        <p className="text-center py-4 text-xs font-bold text-slate-400">No matches</p>
                      );
                      return matches.map(s => (
                        <button key={s.id}
                          onClick={() => setForm(f => ({ ...f, targetStudentId: s.id, targetStudentName: s.name }))}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-rose-50 active:bg-rose-100 transition-colors text-left border-b border-slate-50 last:border-0">
                          <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                            <User size={14}/>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-black text-sm text-slate-900 truncate">{s.name}</div>
                            <div className="text-[10px] font-bold text-slate-400">{s.className ? `${s.className}-${s.section} · ` : ''}{s.admissionNo}</div>
                          </div>
                        </button>
                      ));
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}
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
        {notices.slice(0, shown).map(notice => (
          <div key={notice.id} className={`bg-white rounded-2xl border shadow-sm p-4 ${notice.pinned ? 'border-violet-200 bg-violet-50/30' : 'border-slate-100'}`}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                {notice.pinned && <Pin size={12} className="text-violet-500" />}
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${audienceColor(notice.audience)}`}>
                  {AUDIENCE_LABEL[notice.audience]}
                </span>
                {notice.audience === 'SPECIFIC_STUDENT' && notice.targetStudentName && (
                  <span className="flex items-center gap-1 text-[9px] font-black text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                    <User size={9}/> {notice.targetStudentName}
                  </span>
                )}
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
        {notices.length > shown && (
          <button onClick={() => setShown(s => s + 50)}
            className="w-full py-3 bg-white border border-slate-200 rounded-2xl font-black text-xs text-violet-700 hover:bg-violet-50 transition-colors">
            Load More ({notices.length - shown} remaining)
          </button>
        )}
        {notices.length > 0 && (
          <p className="text-center text-[10px] font-bold text-slate-300 pt-1">
            Showing {Math.min(shown, notices.length)} of {notices.length}
          </p>
        )}
      </div>
    </div>
  );
};
