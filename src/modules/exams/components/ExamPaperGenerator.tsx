import React, { useEffect, useState } from 'react';
import { ArrowLeft, Sparkles, Download, Loader2, ScrollText, ChevronRight } from 'lucide-react';
import { teacherService } from '@/roles/teacher/teacher.service';
import { ExamPaperRequest, GeneratedExamPaper, TestType } from '@/roles/teacher/teacher.types';
import { useUIStore } from '@/store/uiStore';

type View = 'FORM' | 'PREVIEW' | 'SAVED';

const TEST_TYPES: TestType[] = ['UNIT_TEST', 'MID_TERM', 'FINAL', 'QUIZ', 'PRACTICAL'];
const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;

const typeColor = (t: string) => {
  const map: Record<string, string> = {
    EXAM: 'bg-rose-50 text-rose-700',
    UNIT_TEST: 'bg-blue-50 text-blue-700',
    MID_TERM: 'bg-violet-50 text-violet-700',
    FINAL: 'bg-rose-50 text-rose-700',
    QUIZ: 'bg-emerald-50 text-emerald-700',
    PRACTICAL: 'bg-amber-50 text-amber-700',
    MCQ: 'bg-blue-50 text-blue-700',
    SHORT: 'bg-emerald-50 text-emerald-700',
    LONG: 'bg-violet-50 text-violet-700',
    DIAGRAM: 'bg-amber-50 text-amber-700',
  };
  return map[t] ?? 'bg-slate-100 text-slate-600';
};

interface Props { onBack: () => void; }

export const ExamPaperGeneratorView: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const [view, setView] = useState<View>('FORM');
  const [isGenerating, setIsGenerating] = useState(false);
  const [paper, setPaper] = useState<GeneratedExamPaper | null>(null);
  const [savedPapers, setSavedPapers] = useState<GeneratedExamPaper[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [form, setForm] = useState<ExamPaperRequest>({
    subject: '',
    className: '',
    testType: 'UNIT_TEST',
    totalMarks: 25,
    duration: 60,
    topics: '',
    difficulty: 'MEDIUM',
  });

  // Pre-load this teacher's primary subject + first assigned class for saner defaults.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      teacherService.getMyStaffInfo().catch(() => null),
      teacherService.getClasses().catch(() => []),
    ]).then(([staff, classes]) => {
      if (cancelled) return;
      setForm(f => ({
        ...f,
        subject: f.subject || staff?.subject || '',
        className: f.className || (classes[0] ? `${classes[0].className}-${classes[0].section}` : ''),
      }));
    });
    return () => { cancelled = true; };
  }, []);

  const refreshSaved = async () => {
    setSavedLoading(true);
    try {
      const list = await teacherService.getGeneratedPapers();
      setSavedPapers(list);
    } catch {
      setSavedPapers([]);
    } finally {
      setSavedLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!form.subject.trim()) { showToast('Enter a subject', 'error'); return; }
    if (!form.topics.trim()) { showToast('Enter topics to generate questions', 'error'); return; }
    setIsGenerating(true);
    try {
      const generated = await teacherService.generateExamPaper(form);
      setPaper(generated);
      setView('PREVIEW');
      showToast('Exam paper generated and saved');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'AI generation failed', 'error');
    } finally { setIsGenerating(false); }
  };

  const handleDownload = () => {
    if (!paper) return;
    let content = `EXAM PAPER\n${'='.repeat(50)}\n`;
    content += `Subject: ${paper.request.subject}\n`;
    content += `Class: ${paper.request.className}\n`;
    content += `Type: ${paper.request.testType.replace('_', ' ')}\n`;
    content += `Total Marks: ${paper.request.totalMarks}\n`;
    content += `Duration: ${paper.request.duration} minutes\n`;
    content += `Difficulty: ${paper.request.difficulty}\n`;
    content += `${'='.repeat(50)}\n\n`;
    paper.sections.forEach(sec => {
      content += `\n${sec.title.toUpperCase()} [${sec.marks} marks]\n`;
      content += `${sec.instructions}\n${'-'.repeat(40)}\n`;
      sec.questions.forEach(q => {
        content += `Q${q.no}. ${q.text} [${q.marks} mark${q.marks > 1 ? 's' : ''}]\n\n`;
      });
    });
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `exam_paper_${paper.request.subject.replace(/\s+/g, '_')}_${paper.request.className.replace(/\s+/g, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Paper downloaded');
  };

  const openSaved = async () => {
    setView('SAVED');
    await refreshSaved();
  };

  // ── PREVIEW ──────────────────────────────────────────────────────────────
  if (view === 'PREVIEW' && paper) return (
    <div className="w-full lg:max-w-5xl lg:mx-auto bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => setView('FORM')} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20} /></button>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Generated Paper</h2>
        </div>
        <button onClick={handleDownload} className="flex items-center gap-1.5 bg-emerald-500 text-white text-[11px] font-black px-3 py-2 rounded-xl active:scale-95 transition-transform">
          <Download size={13} /> Download
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="bg-slate-900 rounded-2xl p-4 text-white">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-amber-400" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">AI Generated · Saved</span>
          </div>
          <div className="font-black text-xl">{paper.request.subject}</div>
          <div className="flex gap-2 mt-2 flex-wrap">
            <span className="text-[9px] font-black bg-white/10 px-2 py-0.5 rounded-full uppercase">{paper.request.className}</span>
            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${typeColor(paper.request.testType)}`}>{paper.request.testType.replace('_', ' ')}</span>
            <span className="text-[9px] font-black bg-white/10 px-2 py-0.5 rounded-full uppercase">{paper.request.totalMarks} marks</span>
            <span className="text-[9px] font-black bg-white/10 px-2 py-0.5 rounded-full uppercase">{paper.request.duration} min</span>
          </div>
        </div>

        {paper.sections.map((sec, si) => (
          <div key={si} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <span className="font-black text-slate-900 text-sm">{sec.title}</span>
                <span className="text-[10px] font-black text-slate-500">{sec.marks} marks</span>
              </div>
              <p className="text-[10px] font-bold text-slate-400 mt-0.5">{sec.instructions}</p>
            </div>
            <div className="p-4 space-y-3">
              {sec.questions.map(q => (
                <div key={q.no} className="flex gap-3">
                  <span className="text-xs font-black text-slate-900 shrink-0 w-7">Q{q.no}.</span>
                  <div className="flex-1">
                    <p className="text-xs font-bold text-slate-700 leading-relaxed">{q.text}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${typeColor(q.type)}`}>{q.type}</span>
                      <span className="text-[9px] font-bold text-slate-400">[{q.marks} mark{q.marks > 1 ? 's' : ''}]</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // ── SAVED LIST ───────────────────────────────────────────────────────────
  if (view === 'SAVED') return (
    <div className="w-full lg:max-w-5xl lg:mx-auto bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button onClick={() => setView('FORM')} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20} /></button>
        <div>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">My Saved Papers</h2>
          <p className="text-[10px] font-bold text-slate-400">All papers you've generated</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {savedLoading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : savedPapers.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <ScrollText size={32} className="mb-3 opacity-40" />
            <p className="font-bold text-sm">No saved papers yet</p>
            <p className="text-[11px] mt-1">Generate one to see it here</p>
          </div>
        ) : (
          savedPapers.map(p => (
            <button key={p.id} onClick={() => { setPaper(p); setView('PREVIEW'); }}
              className="w-full text-left bg-white rounded-2xl border border-slate-100 shadow-sm p-4 active:bg-slate-50">
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${typeColor(p.request.testType)}`}>{p.request.testType.replace('_', ' ')}</span>
                <span className="text-[10px] font-bold text-slate-400">{(p.generatedAt ?? '').slice(0, 10)}</span>
              </div>
              <div className="font-extrabold text-slate-900 text-sm">{p.request.subject}</div>
              <div className="text-[11px] font-bold text-slate-500 mt-1">{p.request.className} · {p.request.totalMarks} marks · {p.request.duration} min</div>
              <div className="text-[10px] font-bold text-slate-400 mt-1 line-clamp-1">{p.request.topics}</div>
              <div className="mt-3 pt-3 border-t border-slate-50 flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-500">{p.sections.length} sections · {p.sections.reduce((a, s) => a + s.questions.length, 0)} questions</span>
                <ChevronRight size={14} className="text-slate-300" />
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );

  // ── FORM ─────────────────────────────────────────────────────────────────
  return (
    <div className="w-full lg:max-w-5xl lg:mx-auto bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20} /></button>
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">AI Exam Generator</h2>
            <p className="text-[10px] font-bold text-slate-400">Powered by Google Gemini</p>
          </div>
        </div>
        <button onClick={openSaved}
          className="flex items-center gap-1.5 bg-slate-100 text-slate-700 text-[11px] font-black px-3 py-2 rounded-xl active:scale-95 transition-transform">
          <ScrollText size={13} /> My Papers
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Subject *</label>
            <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
              placeholder="e.g. Mathematics"
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-amber-500" />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Class</label>
            <input value={form.className} onChange={e => setForm(f => ({ ...f, className: e.target.value }))}
              placeholder="e.g. Class 10"
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-amber-500" />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Test Type</label>
            <div className="flex flex-wrap gap-2">
              {TEST_TYPES.map(t => (
                <button key={t} onClick={() => setForm(f => ({ ...f, testType: t }))}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-colors ${form.testType === t ? 'bg-slate-900 text-white' : 'bg-slate-50 border border-slate-200 text-slate-400'}`}>
                  {t.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Topics / Syllabus *</label>
            <textarea value={form.topics} onChange={e => setForm(f => ({ ...f, topics: e.target.value }))} rows={3}
              placeholder="e.g. Algebra, Quadratic Equations, Coordinate Geometry, Ch. 3-5"
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-amber-500 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Total Marks</label>
              <input type="number" value={form.totalMarks} onChange={e => setForm(f => ({ ...f, totalMarks: +e.target.value }))}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Duration (min)</label>
              <input type="number" value={form.duration} onChange={e => setForm(f => ({ ...f, duration: +e.target.value }))}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-amber-500" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Difficulty Level</label>
            <div className="flex gap-2">
              {DIFFICULTIES.map(d => (
                <button key={d} onClick={() => setForm(f => ({ ...f, difficulty: d }))}
                  className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${
                    form.difficulty === d
                      ? d === 'EASY' ? 'bg-emerald-500 text-white' : d === 'MEDIUM' ? 'bg-amber-500 text-white' : 'bg-rose-500 text-white'
                      : 'bg-slate-50 border border-slate-200 text-slate-400'
                  }`}>
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button onClick={handleGenerate} disabled={isGenerating}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-60">
          {isGenerating ? (
            <><Loader2 size={16} className="animate-spin" /> Generating with Gemini…</>
          ) : (
            <><Sparkles size={16} /> Generate Exam Paper</>
          )}
        </button>
      </div>
    </div>
  );
};
