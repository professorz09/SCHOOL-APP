import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Sparkles, Download, Loader2, ScrollText, ChevronRight, Printer, FileText } from 'lucide-react';
import { downloadNodeAsPdf, printCurrentPage } from '@/shared/utils/pdfPrint';
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
    paperType: 'MIX',
    language: 'ENGLISH',
    mcqCount: 0,
    shortCount: 0,
    longCount: 0,
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

  // Ref to the printable section so html2canvas/jsPDF can rasterise
  // just that part of the page (not the dark hero card or app shell).
  const printableRef = useRef<HTMLDivElement | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const handleDownloadPdf = async () => {
    if (!paper || !printableRef.current) return;
    setDownloadingPdf(true);
    try {
      const safeSubject = paper.request.subject.replace(/\s+/g, '_');
      const safeClass = paper.request.className.replace(/\s+/g, '_');
      await downloadNodeAsPdf(
        printableRef.current,
        `exam_paper_${safeSubject}_${safeClass}.pdf`,
      );
      showToast('PDF saved');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'PDF export failed', 'error');
    } finally { setDownloadingPdf(false); }
  };

  const handleDownloadTxt = () => {
    if (!paper) return;
    let content = `${paper.request.schoolName ? paper.request.schoolName.toUpperCase() + '\n' : ''}EXAM PAPER\n${'='.repeat(50)}\n`;
    content += `Subject: ${paper.request.subject}\n`;
    content += `Class: ${paper.request.className}\n`;
    if (paper.request.board) content += `Board: ${paper.request.board}\n`;
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
    const blob = new Blob(['﻿' + content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `exam_paper_${paper.request.subject.replace(/\s+/g, '_')}_${paper.request.className.replace(/\s+/g, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Text downloaded');
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
        <div className="flex items-center gap-1.5">
          <button onClick={handleDownloadPdf} disabled={downloadingPdf}
            className="flex items-center gap-1.5 bg-rose-600 text-white text-[11px] font-black px-3 py-2 rounded-xl active:scale-95 transition-transform disabled:opacity-60">
            {downloadingPdf
              ? <><Loader2 size={13} className="animate-spin" /> PDF…</>
              : <><Download size={13} /> PDF</>}
          </button>
          <button onClick={printCurrentPage}
            className="flex items-center gap-1.5 bg-blue-600 text-white text-[11px] font-black px-3 py-2 rounded-xl active:scale-95 transition-transform">
            <Printer size={13} /> Print
          </button>
          <button onClick={handleDownloadTxt}
            className="flex items-center gap-1.5 bg-slate-200 text-slate-700 text-[11px] font-black px-3 py-2 rounded-xl active:scale-95 transition-transform">
            <FileText size={13} /> TXT
          </button>
        </div>
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

        {/* Printable / PDF-target region — html2canvas rasterises only
            this div, so the dark hero card above + app chrome stay
            out of the export. School name + class line render at the
            top of every PDF. */}
        <div ref={printableRef} className="bg-white rounded-2xl border border-slate-200 p-5 lg:p-7">
          <div className="text-center pb-4 mb-4 border-b-2 border-slate-200">
            {paper.request.schoolName && (
              <div className="text-lg lg:text-xl font-black text-slate-900 uppercase tracking-wide">
                {paper.request.schoolName}
              </div>
            )}
            <div className="text-sm font-black text-slate-700 mt-1">
              {paper.request.subject} · Class {paper.request.className}
              {paper.request.board ? ` · ${paper.request.board}` : ''}
            </div>
            <div className="text-[11px] font-bold text-slate-500 mt-1">
              {paper.request.testType.replace('_', ' ')} ·
              {' '}Total: {paper.request.totalMarks} marks ·
              {' '}Duration: {paper.request.duration} min
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

          {/* Question count controls — exact counts per type. When all
              three are 0, AI auto-balances based on difficulty + test
              type. Live total + marks math shown below the row. */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
              Question Counts <span className="text-slate-400">(0 = auto-balance)</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'mcqCount'   as const, label: 'MCQ',         marks: 1, color: 'border-blue-200 focus:border-blue-500',      labelColor: 'text-blue-700' },
                { key: 'shortCount' as const, label: 'Short',       marks: 2, color: 'border-violet-200 focus:border-violet-500',  labelColor: 'text-violet-700' },
                { key: 'longCount'  as const, label: 'Long',        marks: 5, color: 'border-rose-200 focus:border-rose-500',      labelColor: 'text-rose-700' },
              ].map(({ key, label, marks, color, labelColor }) => (
                <div key={key}>
                  <div className={`text-[9px] font-black uppercase tracking-wider ${labelColor} mb-1 flex items-center justify-between`}>
                    <span>{label}</span>
                    <span className="text-slate-400">~{marks}m</span>
                  </div>
                  <input
                    type="number" min={0} max={50}
                    value={form[key] ?? 0}
                    onChange={e => setForm(f => ({ ...f, [key]: Math.max(0, +e.target.value || 0) }))}
                    className={`w-full bg-slate-50 border rounded-xl px-3 py-2 text-center font-black text-base outline-none ${color}`}
                  />
                </div>
              ))}
            </div>
            {(() => {
              const mcq = form.mcqCount ?? 0;
              const sht = form.shortCount ?? 0;
              const lng = form.longCount ?? 0;
              const totalQs = mcq + sht + lng;
              const estMarks = mcq * 1 + sht * 2 + lng * 5;
              if (totalQs === 0) return (
                <p className="text-[10px] font-bold text-slate-400 mt-1.5">AI will pick a balanced mix automatically.</p>
              );
              const overrun = estMarks > form.totalMarks;
              return (
                <p className={`text-[10px] font-bold mt-1.5 ${overrun ? 'text-rose-600' : 'text-slate-500'}`}>
                  {totalQs} questions · ≈ {estMarks} marks
                  {overrun && ` — exceeds total ${form.totalMarks}, AI will rebalance`}
                </p>
              );
            })()}
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
