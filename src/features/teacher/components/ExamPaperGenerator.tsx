import React, { useState } from 'react';
import { ArrowLeft, Sparkles, Download, ScrollText, Loader2 } from 'lucide-react';
import { teacherService } from '../../../services/teacher.service';
import { ExamPaperRequest, GeneratedExamPaper, TestType } from '../../../types/teacher.types';
import { useUIStore } from '../../../store/uiStore';

type View = 'FORM' | 'PREVIEW';

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
  const [form, setForm] = useState<ExamPaperRequest>({
    subject: 'Mathematics',
    className: 'Class 10',
    testType: 'UNIT_TEST',
    totalMarks: 25,
    duration: 60,
    topics: 'Algebra, Quadratic Equations, Coordinate Geometry',
    difficulty: 'MEDIUM',
  });

  const handleGenerate = async () => {
    if (!form.topics.trim()) { showToast('Enter topics to generate questions', 'error'); return; }
    setIsGenerating(true);
    try {
      const generated = await teacherService.generateExamPaper(form);
      setPaper(generated);
      setView('PREVIEW');
      showToast('Exam paper generated!');
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
    a.download = `exam_paper_${paper.request.subject.replace(' ', '_')}_${paper.request.className.replace(' ', '_')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Paper downloaded as text file');
  };

  if (view === 'PREVIEW' && paper) return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => setView('FORM')} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20} /></button>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Generated Paper</h2>
        </div>
        <button onClick={handleDownload} className="flex items-center gap-1.5 bg-emerald-500 text-white text-[11px] font-black px-3 py-2 rounded-xl active:scale-95 transition-transform">
          <Download size={13} /> Download
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">
        {/* Header card */}
        <div className="bg-slate-900 rounded-2xl p-4 text-white">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-amber-400" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">AI Generated</span>
          </div>
          <div className="font-black text-xl">{paper.request.subject}</div>
          <div className="flex gap-2 mt-2 flex-wrap">
            <span className="text-[9px] font-black bg-white/10 px-2 py-0.5 rounded-full uppercase">{paper.request.className}</span>
            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${typeColor(paper.request.testType)}`}>{paper.request.testType.replace('_', ' ')}</span>
            <span className="text-[9px] font-black bg-white/10 px-2 py-0.5 rounded-full uppercase">{paper.request.totalMarks} marks</span>
            <span className="text-[9px] font-black bg-white/10 px-2 py-0.5 rounded-full uppercase">{paper.request.duration} min</span>
          </div>
        </div>

        {/* Sections */}
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

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-12 pb-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20} /></button>
        <div>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">AI Exam Generator</h2>
          <p className="text-[10px] font-bold text-slate-400">Powered by Google Gemini</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">
        <div className="bg-gradient-to-br from-slate-900 to-slate-700 rounded-2xl p-4 text-white">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={18} className="text-amber-400" />
            <span className="font-black text-sm">Gemini AI Paper Generator</span>
          </div>
          <p className="text-[11px] font-bold text-slate-300">Enter details below and get a complete exam paper with Section A/B/C questions auto-generated from your syllabus topics.</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
          {[
            { label: 'Subject *', key: 'subject', placeholder: 'e.g. Mathematics' },
            { label: 'Class', key: 'className', placeholder: 'e.g. Class 10' },
          ].map(({ label, key, placeholder }) => (
            <div key={key}>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">{label}</label>
              <input value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-amber-500" />
            </div>
          ))}
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
