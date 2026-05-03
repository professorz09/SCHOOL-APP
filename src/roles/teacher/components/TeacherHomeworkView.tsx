import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, BookOpen, Plus, Trash2, Calendar, ChevronDown, ChevronUp, Loader,
} from 'lucide-react';
import { teacherService } from '@/roles/teacher/teacher.service';
import { apiHomework, apiAcademicYear } from '@/lib/apiClient';
import { TeacherClass } from '@/roles/teacher/teacher.types';
import { useUIStore } from '@/store/uiStore';

interface HomeworkRow {
  id: string;
  subject: string;
  title: string;
  description: string;
  assignedDate: string;
  dueDate: string;
  teacher: string;
}

const SUBJ_COLOR: Record<string, { dot: string; bg: string }> = {
  Mathematics:        { dot: 'bg-blue-500',    bg: 'bg-blue-50' },
  Science:            { dot: 'bg-emerald-500', bg: 'bg-emerald-50' },
  English:            { dot: 'bg-violet-500',  bg: 'bg-violet-50' },
  Hindi:              { dot: 'bg-rose-500',    bg: 'bg-rose-50' },
  'Social Studies':   { dot: 'bg-amber-500',   bg: 'bg-amber-50' },
  'Computer Science': { dot: 'bg-sky-500',     bg: 'bg-sky-50' },
};

const SUBJ_ICON: Record<string, string> = {
  Mathematics: '📐', Science: '🔬', English: '📖',
  Hindi: '✍️', 'Social Studies': '🌍', 'Computer Science': '💻',
  'Physical Education': '⚽',
};

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });

interface Props { onBack: () => void; }

export const TeacherHomeworkView: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const [classes, setClasses]     = useState<TeacherClass[]>([]);
  const [yearId, setYearId]       = useState<string>('');
  const [selectedClass, setSelectedClass] = useState<TeacherClass | null>(null);
  const [homework, setHomework]   = useState<HomeworkRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [hwLoading, setHwLoading] = useState(false);
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [showForm, setShowForm]   = useState(false);
  const [deleting, setDeleting]   = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    subject: '', title: '', description: '', dueDate: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      teacherService.getClasses(),
      apiAcademicYear.active(),
    ])
      .then(([cls, year]) => {
        setClasses(cls);
        setYearId((year as any)?.id ?? '');
        if (cls.length > 0) setSelectedClass(cls[0]);
      })
      .catch(() => showToast('Failed to load classes', 'error'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedClass || !yearId) return;
    setHwLoading(true);
    apiHomework.list(selectedClass.id, yearId)
      .then(rows => setHomework(rows as HomeworkRow[]))
      .catch(() => showToast('Failed to load homework', 'error'))
      .finally(() => setHwLoading(false));
  }, [selectedClass, yearId]);

  const handleCreate = async () => {
    if (!selectedClass || !yearId || !form.title.trim()) {
      showToast('Title is required', 'error');
      return;
    }
    setSaving(true);
    try {
      await apiHomework.create({
        sectionId: selectedClass.id,
        academicYearId: yearId,
        subject: form.subject,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        dueDate: form.dueDate || undefined,
      });
      showToast('Homework posted', 'success');
      setShowForm(false);
      setForm({ subject: '', title: '', description: '', dueDate: '' });
      const rows = await apiHomework.list(selectedClass.id, yearId);
      setHomework(rows as HomeworkRow[]);
    } catch (e: any) {
      showToast(e.message ?? 'Failed to post homework', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await apiHomework.delete(id);
      setHomework(prev => prev.filter(h => h.id !== id));
      showToast('Homework deleted', 'success');
    } catch (e: any) {
      showToast(e.message ?? 'Failed to delete', 'error');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-3 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
              <ArrowLeft size={20} />
            </button>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Homework</h2>
          </div>
          <button
            onClick={() => setShowForm(f => !f)}
            className="flex items-center gap-1.5 bg-indigo-600 text-white px-3 py-2 rounded-xl text-xs font-black active:scale-95 transition-transform"
          >
            <Plus size={14} />
            Assign
          </button>
        </div>

        {/* Class tabs */}
        {classes.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-0.5">
            {classes.map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedClass(c)}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest transition-all ${
                  selectedClass?.id === c.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {c.className}-{c.section}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-white border-b border-slate-100 px-4 py-4 space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">New Homework</p>
          <input
            value={form.subject}
            onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
            placeholder="Subject (optional)"
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-indigo-400"
          />
          <input
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Title *"
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-indigo-400"
          />
          <textarea
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Instructions / description (optional)"
            rows={3}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-indigo-400 resize-none"
          />
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Due Date</label>
            <input
              type="date"
              value={form.dueDate}
              onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-indigo-400"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={saving}
              className="flex-1 bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-black disabled:opacity-50 active:scale-95 transition-transform"
            >
              {saving ? 'Posting…' : 'Post Homework'}
            </button>
            <button
              onClick={() => { setShowForm(false); setForm({ subject: '', title: '', description: '', dueDate: '' }); }}
              className="px-4 bg-slate-100 text-slate-600 py-2.5 rounded-xl text-sm font-black"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {(loading || hwLoading) && (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <Loader size={28} className="mb-3 animate-spin" />
            <p className="font-bold text-sm">Loading…</p>
          </div>
        )}

        {!loading && !hwLoading && homework.length === 0 && (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <BookOpen size={36} className="mb-3 opacity-30" />
            <p className="font-bold text-sm">No homework assigned yet</p>
            <p className="text-xs mt-1 opacity-60">Tap "Assign" to post homework for this class</p>
          </div>
        )}

        {!loading && !hwLoading && homework.map(hw => {
          const col = SUBJ_COLOR[hw.subject] ?? { dot: 'bg-slate-400', bg: 'bg-slate-50' };
          const isOpen = expanded === hw.id;
          return (
            <div key={hw.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className={`h-1 w-full ${col.dot}`} />
              <div className="px-4 pt-3 pb-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xl shrink-0">{SUBJ_ICON[hw.subject] ?? '📝'}</span>
                    <div className="min-w-0">
                      {hw.subject && (
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{hw.subject}</div>
                      )}
                      <div className="font-black text-slate-900 text-sm leading-tight">{hw.title}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(hw.id)}
                    disabled={deleting === hw.id}
                    className="p-1.5 bg-rose-50 text-rose-400 rounded-lg shrink-0 active:scale-95 transition-transform disabled:opacity-40"
                  >
                    {deleting === hw.id
                      ? <Loader size={14} className="animate-spin" />
                      : <Trash2 size={14} />}
                  </button>
                </div>

                <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400 mb-2">
                  <span className="flex items-center gap-1">
                    <Calendar size={10} />Assigned: {formatDate(hw.assignedDate)}
                  </span>
                  {hw.dueDate && hw.dueDate !== hw.assignedDate && (
                    <span className="flex items-center gap-1 text-amber-600">
                      <Calendar size={10} />Due: {formatDate(hw.dueDate)}
                    </span>
                  )}
                </div>

                {hw.description && (
                  <button
                    onClick={() => setExpanded(isOpen ? null : hw.id)}
                    className="flex items-center gap-1 text-[10px] font-black text-blue-600 uppercase tracking-wide"
                  >
                    {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    {isOpen ? 'Hide' : 'Instructions'}
                  </button>
                )}

                {isOpen && hw.description && (
                  <div className="mt-3 bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <p className="text-xs font-medium text-slate-700 leading-relaxed">{hw.description}</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
