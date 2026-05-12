// Question Paper Tool — mobile-app style UI rewrite. The printed sheet
// (PaperView) is unchanged; only the editor shell is restructured into
// a three-tab flow:
//   Setup     — paper info + AI helper (text / photo)
//   Questions — question list editor with marks meter
//   Preview   — live A4 preview + sticky Print / Download bar
//
// Mobile-first: tab strip is sticky at top, primary action sits in a
// sticky bottom bar per tab so the user never has to scroll to act.

import React, { useEffect, useRef, useState } from 'react';
import {
  Sparkles, Loader2, ScrollText, Printer, Plus, Trash2, Upload, FileText, Image as ImageIcon, X, Download,
  ArrowLeft, ChevronRight, Minus, Eye, ListChecks, Settings2, Share2,
} from 'lucide-react';
import { handlePrint, downloadPDF } from '@/shared/utils/htmlToPdf';
import { teacherService } from '@/roles/teacher/teacher.service';
import type { ExamPaperRequest, GeneratedExamPaper } from '@/roles/teacher/teacher.types';
import { useUIStore } from '@/store/uiStore';

interface Props { onBack: () => void; }
interface Question { id: string; text: string; marks: number; options?: string[]; }
type Tab = 'SETUP' | 'QUESTIONS' | 'PREVIEW';

function flattenPaper(paper: GeneratedExamPaper): Question[] {
  const out: Question[] = [];
  for (const sec of paper.sections) {
    for (const q of sec.questions) {
      out.push({
        id: `${Date.now()}-${out.length}-${Math.random().toString(36).slice(2, 7)}`,
        text: q.text, marks: q.marks,
        ...(q.options && q.options.length ? { options: q.options } : {}),
      });
    }
  }
  return out;
}

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export const ExamPaperGeneratorView: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const [tab, setTab] = useState<Tab>('SETUP');
  const [savedView, setSavedView] = useState(false);
  const [savedPapers, setSavedPapers] = useState<GeneratedExamPaper[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);

  // Paper config
  const [schoolName, setSchoolName] = useState('');
  const [examName, setExamName] = useState('');
  const [subject, setSubject] = useState('');
  const [className, setClassName] = useState('');
  const [time, setTime] = useState('3 Hours');
  const [maxMarks, setMaxMarks] = useState(100);

  // Questions
  const [questions, setQuestions] = useState<Question[]>([
    { id: newId(), text: '', marks: 5 },
  ]);

  // AI panel
  const [aiOpen, setAiOpen] = useState(false);
  const [aiTab, setAiTab] = useState<'TEXT' | 'IMAGE'>('TEXT');
  const [aiTopics, setAiTopics] = useState('');
  const [aiDifficulty, setAiDifficulty] = useState<ExamPaperRequest['difficulty']>('MEDIUM');
  const [aiLanguage, setAiLanguage] = useState<ExamPaperRequest['language']>('ENGLISH');
  const [aiMcq, setAiMcq] = useState(5);
  const [aiShort, setAiShort] = useState(5);
  const [aiLong, setAiLong] = useState(2);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiImages, setAiImages] = useState<File[]>([]);

  const totalDistributed = questions.reduce((s, q) => s + (Number(q.marks) || 0), 0);
  const marksOk = totalDistributed === maxMarks;

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      teacherService.getMyStaffInfo().catch(() => null),
      teacherService.getClasses().catch(() => []),
    ]).then(([staff, classes]) => {
      if (cancelled) return;
      if (!subject && staff?.subject) setSubject(staff.subject);
      if (!className && classes[0]) setClassName(`${classes[0].className}-${classes[0].section}`);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addQuestion = () => setQuestions(qs => [...qs, { id: newId(), text: '', marks: 5 }]);
  const updateQuestion = (id: string, patch: Partial<Question>) =>
    setQuestions(qs => qs.map(q => q.id === id ? { ...q, ...patch } : q));
  const removeQuestion = (id: string) =>
    setQuestions(qs => qs.filter(q => q.id !== id));

  const handleAiText = async () => {
    if (!aiTopics.trim()) { showToast('Enter topics / chapters first', 'error'); return; }
    setAiBusy(true);
    try {
      const generated = await teacherService.generateExamPaper({
        subject: subject || aiTopics.split(/[,\n]/)[0].trim() || 'General',
        className: className || 'Class 10',
        testType: 'UNIT_TEST', testHeading: examName || '',
        totalMarks: maxMarks, duration: parseInt(time) || 180,
        topics: aiTopics, difficulty: aiDifficulty, paperType: 'MIX',
        language: aiLanguage,
        mcqCount: aiMcq, shortCount: aiShort, longCount: aiLong,
      });
      setQuestions(flattenPaper(generated));
      setAiOpen(false);
      setTab('QUESTIONS');
      showToast('Paper generated · edit any question below');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'AI generation failed', 'error');
    } finally { setAiBusy(false); }
  };

  const handleAiImage = async () => {
    if (aiImages.length === 0) { showToast('Pick an image first', 'error'); return; }
    setAiBusy(true);
    try {
      const images = await Promise.all(aiImages.map(file => new Promise<{ mimeType: string; data: string }>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => {
          const result = r.result as string;
          const base64 = result.split(',')[1] || '';
          resolve({ mimeType: file.type, data: base64 });
        };
        r.onerror = () => reject(new Error('Failed to read image'));
        r.readAsDataURL(file);
      })));
      const generated = await teacherService.extractPaperFromImages(images, {
        className: className || 'Class 10',
        subject: subject || 'General',
        totalMarks: maxMarks, duration: parseInt(time) || 180,
        difficulty: aiDifficulty,
      });
      setQuestions(flattenPaper(generated));
      setAiImages([]);
      setAiOpen(false);
      setTab('QUESTIONS');
      showToast(`Extracted ${generated.sections.reduce((s, x) => s + x.questions.length, 0)} questions`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Image extraction failed', 'error');
    } finally { setAiBusy(false); }
  };

  const printableRef = useRef<HTMLDivElement | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const canShare = typeof navigator !== 'undefined'
    && typeof (navigator as Navigator & { canShare?: (d: ShareData) => boolean }).canShare === 'function';

  const fname = () => `question_paper_${(subject || 'paper').replace(/\s+/g, '_')}.pdf`;

  const handleDownload = async () => {
    if (downloading || sharing) return;
    setDownloading(true);
    try {
      await downloadPDF('print-area-paper', fname(), undefined, { mode: 'download' });
      showToast('PDF saved');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'PDF export failed', 'error');
    } finally { setDownloading(false); }
  };

  const handleShare = async () => {
    if (downloading || sharing) return;
    setSharing(true);
    try {
      await downloadPDF('print-area-paper', fname(), undefined, { mode: 'share' });
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Share failed', 'error');
    } finally { setSharing(false); }
  };

  const openSaved = async () => {
    setSavedView(true);
    setSavedLoading(true);
    try { setSavedPapers(await teacherService.getGeneratedPapers()); }
    catch { setSavedPapers([]); }
    finally { setSavedLoading(false); }
  };

  // ── Saved papers screen ────────────────────────────────────────────────
  if (savedView) {
    return (
      <div className="w-full bg-slate-50 min-h-screen flex flex-col">
        <TopBar title="My Papers" subtitle="Tap to reopen" onBack={() => setSavedView(false)} />
        <div className="px-3 md:px-6 py-4 max-w-3xl mx-auto w-full flex-1">
          {savedLoading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 className="animate-spin" size={20} />
            </div>
          ) : savedPapers.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <ScrollText className="text-slate-400" size={22} />
              </div>
              <p className="text-slate-500 font-semibold text-sm">No saved papers yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {savedPapers.map(p => (
                <button key={(p as any).id ?? p.request.subject}
                  onClick={() => {
                    setQuestions(flattenPaper(p));
                    setSubject(p.request.subject);
                    setClassName(p.request.className);
                    setExamName(p.request.testHeading?.trim() || p.request.testType.replace('_', ' '));
                    setMaxMarks(p.request.totalMarks);
                    setSavedView(false);
                    setTab('QUESTIONS');
                    showToast('Paper loaded · edit below');
                  }}
                  className="w-full flex items-center gap-3 text-left bg-white border border-slate-200 hover:border-slate-900 active:scale-[0.99] p-3.5 rounded-xl transition-all">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                    <FileText size={18} className="text-slate-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-slate-900 truncate">{p.request.subject}</div>
                    <div className="text-[11px] font-medium text-slate-500 truncate">
                      {p.request.className} · {p.request.testHeading?.trim() || p.request.testType} · {p.request.totalMarks}m · {p.request.duration}min
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-slate-400 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Main editor ────────────────────────────────────────────────────────
  return (
    <div className="w-full bg-slate-50 min-h-screen flex flex-col">
      <div className="no-print flex-1 flex flex-col">
        <TopBar title="Question Paper" subtitle={subject ? `${subject}${className ? ` · ${className}` : ''}` : 'Setup → Questions → Preview'}
          onBack={onBack}
          right={
            <button onClick={openSaved}
              className="p-2 -mr-1 rounded-full hover:bg-slate-100 active:scale-95 transition-all"
              title="My Papers">
              <ScrollText size={18} className="text-slate-700" />
            </button>
          } />

        {/* Tab strip */}
        <div className="sticky top-[57px] z-10 bg-white border-b border-slate-100 px-3 md:px-6">
          <div className="max-w-3xl mx-auto flex">
            <TabBtn active={tab === 'SETUP'} onClick={() => setTab('SETUP')} icon={<Settings2 size={15} />}>Setup</TabBtn>
            <TabBtn active={tab === 'QUESTIONS'} onClick={() => setTab('QUESTIONS')} icon={<ListChecks size={15} />}>
              Questions <span className="ml-1 text-[10px] font-bold opacity-70">({questions.length})</span>
            </TabBtn>
            <TabBtn active={tab === 'PREVIEW'} onClick={() => setTab('PREVIEW')} icon={<Eye size={15} />}>Preview</TabBtn>
          </div>
        </div>

        <div className="flex-1 px-3 md:px-6 py-4 md:py-5 max-w-3xl mx-auto w-full"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 130px)' }}>

          {/* ── SETUP TAB ───────────────────────────────────────────── */}
          {tab === 'SETUP' && (
            <div className="space-y-3">
              {/* AI helper — collapsed by default, expands into a sheet */}
              <button onClick={() => setAiOpen(o => !o)}
                className="w-full flex items-center gap-3 bg-white border border-slate-200 hover:border-indigo-300 rounded-xl px-4 py-3.5 active:scale-[0.99] transition-all">
                <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                  <Sparkles size={18} />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="font-bold text-sm text-slate-900">AI Paper Helper</div>
                  <div className="text-[11px] font-medium text-slate-500">Generate from topic or photo</div>
                </div>
                <ChevronRight size={16} className={`text-slate-400 transition-transform ${aiOpen ? 'rotate-90' : ''}`} />
              </button>

              {aiOpen && (
                <div className="bg-white border border-indigo-100 rounded-xl p-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
                  <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg">
                    <button onClick={() => setAiTab('TEXT')}
                      className={`flex items-center justify-center gap-1.5 py-2 rounded-md text-[11px] font-bold uppercase tracking-widest transition-all ${
                        aiTab === 'TEXT' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                      }`}>
                      <FileText size={13} /> From Topic
                    </button>
                    <button onClick={() => setAiTab('IMAGE')}
                      className={`flex items-center justify-center gap-1.5 py-2 rounded-md text-[11px] font-bold uppercase tracking-widest transition-all ${
                        aiTab === 'IMAGE' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                      }`}>
                      <ImageIcon size={13} /> From Photo
                    </button>
                  </div>

                  {aiTab === 'TEXT' ? (
                    <div className="space-y-3">
                      <Textarea label="Chapters / Topics" value={aiTopics} onChange={setAiTopics}
                        placeholder="e.g. Light reflection, Magnetism, Ch 3–5" rows={2} />
                      <div className="grid grid-cols-3 gap-2">
                        <Stepper label="MCQ" value={aiMcq} onChange={setAiMcq} />
                        <Stepper label="Short" value={aiShort} onChange={setAiShort} />
                        <Stepper label="Long" value={aiLong} onChange={setAiLong} />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label>Level</Label>
                          <select value={aiDifficulty} onChange={e => setAiDifficulty(e.target.value as ExamPaperRequest['difficulty'])}
                            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500">
                            <option>EASY</option><option>MEDIUM</option><option>HARD</option>
                          </select>
                        </div>
                        <div>
                          <Label>Language</Label>
                          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
                            {(['ENGLISH','HINDI','BILINGUAL'] as const).map(l => (
                              <button key={l} onClick={() => setAiLanguage(l)}
                                className={`py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${
                                  aiLanguage === l ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                                }`}>
                                {l === 'BILINGUAL' ? 'Both' : l === 'HINDI' ? 'हिं' : 'EN'}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      <p className="text-[11px] font-bold text-indigo-700 text-center">
                        ≈ {aiMcq * 1 + aiShort * 2 + aiLong * 5} marks · {aiMcq + aiShort + aiLong} questions
                      </p>
                      <button onClick={handleAiText} disabled={aiBusy}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900 hover:bg-black text-white rounded-xl font-bold text-xs uppercase tracking-widest active:scale-[0.98] transition-all disabled:opacity-60">
                        {aiBusy ? <><Loader2 size={15} className="animate-spin" /> Generating…</> : <><Sparkles size={15} /> Generate</>}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <label className="border-2 border-dashed border-slate-300 rounded-xl p-5 text-center bg-slate-50 block cursor-pointer hover:border-indigo-400 active:scale-[0.99] transition-all">
                        <Upload className="mx-auto text-slate-400 mb-1.5" size={22} />
                        <p className="text-sm font-bold text-slate-700">Tap to add photo(s)</p>
                        <p className="text-[10px] font-medium text-slate-500 mt-0.5">Max 4 · JPG / PNG / WEBP</p>
                        <input type="file" accept="image/*" multiple className="hidden"
                          onChange={e => {
                            const files = Array.from(e.target.files ?? []);
                            setAiImages(prev => [...prev, ...files].slice(0, 4));
                            e.target.value = '';
                          }} />
                      </label>
                      {aiImages.length > 0 && (
                        <div className="space-y-1.5">
                          {aiImages.map((f, i) => (
                            <div key={i} className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
                              <ImageIcon size={13} className="text-indigo-500 shrink-0" />
                              <span className="text-xs font-bold text-slate-700 truncate flex-1">{f.name}</span>
                              <button onClick={() => setAiImages(prev => prev.filter((_, idx) => idx !== i))}
                                className="text-slate-400 hover:text-red-500 p-1">
                                <X size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <button onClick={handleAiImage} disabled={aiBusy || aiImages.length === 0}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900 hover:bg-black text-white rounded-xl font-bold text-xs uppercase tracking-widest active:scale-[0.98] transition-all disabled:opacity-50">
                        {aiBusy ? <><Loader2 size={15} className="animate-spin" /> Extracting…</> : <><Sparkles size={15} /> Extract Questions</>}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Paper details */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Paper Details</h3>
                <Field label="School / Institution" value={schoolName} onChange={setSchoolName}
                  placeholder="e.g. Sunrise Public School" />
                <Field label="Exam Name" value={examName} onChange={setExamName}
                  placeholder="e.g. Mid Term 2026-27" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Subject" value={subject} onChange={setSubject} placeholder="Math" />
                  <Field label="Class" value={className} onChange={setClassName} placeholder="10-A" />
                  <Field label="Time" value={time} onChange={setTime} placeholder="3 Hours" />
                  <div>
                    <Label>Max Marks</Label>
                    <input type="number" value={maxMarks}
                      onChange={e => setMaxMarks(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                </div>
              </div>

              <button onClick={() => setTab('QUESTIONS')}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-slate-900 hover:bg-black text-white rounded-xl font-bold text-xs uppercase tracking-widest active:scale-[0.98] transition-all">
                Next: Questions <ChevronRight size={15} />
              </button>
            </div>
          )}

          {/* ── QUESTIONS TAB ────────────────────────────────────────── */}
          {tab === 'QUESTIONS' && (
            <div className="space-y-3">
              {/* Marks meter */}
              <div className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${
                marksOk ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
              }`}>
                <div className={`w-2.5 h-2.5 rounded-full ${marksOk ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                <div className="flex-1 min-w-0">
                  <div className={`text-[11px] font-bold uppercase tracking-widest ${marksOk ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {marksOk ? 'Marks balanced' : `${totalDistributed} of ${maxMarks} marks`}
                  </div>
                  <div className="h-1.5 bg-white/60 rounded-full mt-1 overflow-hidden">
                    <div className={`h-full ${marksOk ? 'bg-emerald-500' : 'bg-amber-500'}`}
                      style={{ width: `${Math.min(100, (totalDistributed / Math.max(1, maxMarks)) * 100)}%` }}></div>
                  </div>
                </div>
                <span className={`text-sm font-black tabular-nums ${marksOk ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {totalDistributed}/{maxMarks}
                </span>
              </div>

              {questions.length === 0 ? (
                <div className="bg-white border border-dashed border-slate-300 rounded-xl py-10 text-center">
                  <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-2">
                    <ListChecks className="text-slate-400" size={20} />
                  </div>
                  <p className="text-sm font-bold text-slate-600">No questions yet</p>
                  <p className="text-[11px] font-medium text-slate-400 mt-0.5">Add manually or use AI helper in Setup.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {questions.map((q, i) => (
                    <QuestionCard key={q.id} index={i + 1} question={q}
                      onChange={patch => updateQuestion(q.id, patch)}
                      onRemove={() => removeQuestion(q.id)} />
                  ))}
                </div>
              )}

              <button onClick={addQuestion}
                className="w-full flex items-center justify-center gap-2 py-3 bg-white border-2 border-dashed border-slate-300 hover:border-slate-900 text-slate-700 rounded-xl font-bold text-xs uppercase tracking-widest active:scale-[0.98] transition-all">
                <Plus size={15} /> Add Question
              </button>

              <button onClick={() => setTab('PREVIEW')}
                disabled={questions.length === 0}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-slate-900 hover:bg-black disabled:opacity-50 text-white rounded-xl font-bold text-xs uppercase tracking-widest active:scale-[0.98] transition-all">
                Preview Paper <ChevronRight size={15} />
              </button>
            </div>
          )}

          {/* ── PREVIEW TAB ──────────────────────────────────────────── */}
          {tab === 'PREVIEW' && (
            <div className="space-y-3">
              {questions.length === 0 && (
                <p className="text-center py-10 text-slate-400 font-medium text-sm">Add a question first.</p>
              )}
              {questions.length > 0 && (
                <div className="overflow-x-auto bg-white border border-slate-200 shadow-sm p-2 md:p-3 rounded-xl">
                  <div className="min-w-[680px]">
                    <PaperView schoolName={schoolName} examName={examName} subject={subject}
                      className={className} time={time} maxMarks={maxMarks} questions={questions} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sticky bottom action bar — visible on Preview only */}
        {tab === 'PREVIEW' && questions.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent pt-4 px-3 md:px-6"
            style={{
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 40px)',
            }}>
            <div className={`max-w-3xl mx-auto grid gap-2 ${canShare ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <button onClick={handlePrint}
                className="py-3 bg-white border border-slate-300 hover:border-slate-900 text-slate-900 rounded-xl font-bold text-[11px] md:text-xs uppercase tracking-widest flex justify-center items-center gap-1.5 md:gap-2 active:scale-[0.98] transition-all">
                <Printer size={15} /> Print
              </button>
              {canShare && (
                <button onClick={handleShare} disabled={downloading || sharing}
                  className="py-3 bg-white border border-slate-300 hover:border-slate-900 text-slate-900 rounded-xl font-bold text-[11px] md:text-xs uppercase tracking-widest flex justify-center items-center gap-1.5 md:gap-2 active:scale-[0.98] transition-all disabled:opacity-60">
                  {sharing ? <Loader2 size={15} className="animate-spin" /> : <Share2 size={15} />}
                  {sharing ? '…' : 'Share'}
                </button>
              )}
              <button onClick={handleDownload} disabled={downloading || sharing}
                className="py-3 bg-slate-900 hover:bg-black text-white rounded-xl font-bold text-[11px] md:text-xs uppercase tracking-widest flex justify-center items-center gap-1.5 md:gap-2 active:scale-[0.98] transition-all disabled:opacity-60">
                {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                {downloading ? '…' : 'Download'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Hidden print target */}
      <div className="print-only">
        <div id="print-area-paper" ref={printableRef}
          className="bg-white w-[794px] mx-auto min-h-[1122px]">
          <PaperView schoolName={schoolName} examName={examName} subject={subject}
            className={className} time={time} maxMarks={maxMarks} questions={questions} />
        </div>
      </div>
    </div>
  );
};

// ─── Pieces ──────────────────────────────────────────────────────────────

const TopBar: React.FC<{ title: string; subtitle?: string; onBack: () => void; right?: React.ReactNode }> = ({ title, subtitle, onBack, right }) => (
  <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-100 px-3 md:px-6 py-3 flex items-center gap-2">
    <div className="max-w-3xl mx-auto w-full flex items-center gap-2">
      <button onClick={onBack}
        className="p-2 -ml-1 rounded-full hover:bg-slate-100 active:scale-95 transition-all shrink-0">
        <ArrowLeft size={18} className="text-slate-700" />
      </button>
      <div className="flex-1 min-w-0">
        <h1 className="text-base md:text-lg font-bold text-slate-900 leading-tight truncate">{title}</h1>
        {subtitle && <p className="text-[11px] font-medium text-slate-500 truncate">{subtitle}</p>}
      </div>
      {right}
    </div>
  </div>
);

const TabBtn: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }> = ({ active, onClick, icon, children }) => (
  <button onClick={onClick}
    className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-[11px] md:text-xs font-bold uppercase tracking-widest border-b-2 transition-colors ${
      active ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'
    }`}>
    {icon} {children}
  </button>
);

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-1.5">{children}</label>
);

const Field: React.FC<{ label: string; value: string; onChange: (v: string) => void; placeholder?: string }> = ({ label, value, onChange, placeholder }) => (
  <div>
    <Label>{label}</Label>
    <input type="text" value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500" />
  </div>
);

const Textarea: React.FC<{ label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }> = ({ label, value, onChange, placeholder, rows }) => (
  <div>
    <Label>{label}</Label>
    <textarea value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} rows={rows ?? 3}
      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
  </div>
);

// Tap-friendly +/- stepper. Replaces the bare number input that needed
// keyboard input on mobile.
const Stepper: React.FC<{ label: string; value: number; onChange: (n: number) => void }> = ({ label, value, onChange }) => (
  <div>
    <Label>{label}</Label>
    <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
      <button onClick={() => onChange(Math.max(0, value - 1))}
        className="px-2.5 py-2.5 hover:bg-slate-100 active:scale-90 transition-all">
        <Minus size={13} className="text-slate-600" />
      </button>
      <div className="flex-1 text-center font-black text-base text-slate-900 tabular-nums">{value}</div>
      <button onClick={() => onChange(value + 1)}
        className="px-2.5 py-2.5 hover:bg-slate-100 active:scale-90 transition-all">
        <Plus size={13} className="text-slate-600" />
      </button>
    </div>
  </div>
);

const QuestionCard: React.FC<{
  index: number; question: Question;
  onChange: (patch: Partial<Question>) => void;
  onRemove: () => void;
}> = ({ index, question, onChange, onRemove }) => (
  <div className="bg-white border border-slate-200 rounded-xl p-3">
    <div className="flex items-center justify-between mb-2">
      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Q{index}</span>
      <div className="flex items-center gap-1.5">
        <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
          <button onClick={() => onChange({ marks: Math.max(0, question.marks - 1) })}
            className="px-2 py-1.5 hover:bg-slate-100 active:scale-90">
            <Minus size={11} className="text-slate-600" />
          </button>
          <span className="px-2 text-xs font-black text-slate-900 tabular-nums min-w-[24px] text-center">{question.marks}</span>
          <button onClick={() => onChange({ marks: question.marks + 1 })}
            className="px-2 py-1.5 hover:bg-slate-100 active:scale-90">
            <Plus size={11} className="text-slate-600" />
          </button>
        </div>
        <span className="text-[10px] font-bold text-slate-400 uppercase">marks</span>
        <button onClick={onRemove}
          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
    <textarea value={question.text}
      onChange={e => onChange({ text: e.target.value })}
      placeholder="Type the question…"
      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[64px] resize-none" />
    {question.options && question.options.length > 0 && (
      <div className="mt-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Options</span>
          <button onClick={() => onChange({ options: undefined })}
            className="text-[10px] font-bold text-slate-400 hover:text-red-500 uppercase tracking-widest">
            Remove
          </button>
        </div>
        {question.options.map((opt, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 w-5 text-center">({'abcd'[idx] ?? idx + 1})</span>
            <input type="text" value={opt}
              onChange={e => {
                const next = [...(question.options ?? [])];
                next[idx] = e.target.value;
                onChange({ options: next });
              }}
              placeholder={`Option ${'abcd'[idx] ?? idx + 1}`}
              className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        ))}
      </div>
    )}
    {(!question.options || question.options.length === 0) && (
      <button onClick={() => onChange({ options: ['', '', '', ''] })}
        className="mt-2 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 uppercase tracking-widest">
        + Make MCQ
      </button>
    )}
  </div>
);

// ─── Paper view (unchanged — printed output) ─────────────────────────────

interface PaperViewProps {
  schoolName: string; examName: string; subject: string;
  className: string; time: string; maxMarks: number;
  questions: Question[];
}

const PaperView: React.FC<PaperViewProps> = ({ schoolName, examName, subject, className, time, maxMarks, questions }) => (
  <div className="p-8 max-w-4xl mx-auto bg-white text-slate-900 font-serif">
    <div className="text-center border-b-2 border-slate-900 pb-4 mb-5">
      <h1 className="text-2xl font-bold uppercase tracking-widest leading-tight">{schoolName || 'School Name'}</h1>
      {examName && <h2 className="text-lg font-semibold mt-2">{examName}</h2>}
    </div>

    <div className="flex justify-between items-end border-b border-slate-300 pb-2 mb-7 font-semibold text-sm uppercase tracking-wide gap-4 flex-wrap">
      <div className="space-y-1">
        {subject && <div><span className="text-slate-600 underline underline-offset-4">Subject:</span> {subject}</div>}
        {className && <div><span className="text-slate-600 underline underline-offset-4">Class:</span> {className}</div>}
      </div>
      <div className="text-right space-y-1">
        {time && <div><span className="text-slate-600 underline underline-offset-4">Time:</span> {time}</div>}
        {maxMarks > 0 && <div><span className="text-slate-600 underline underline-offset-4">Max Marks:</span> {maxMarks}</div>}
      </div>
    </div>

    <div className="space-y-5 text-base leading-relaxed">
      {questions.map((q, i) => (
        <div key={q.id} className="flex gap-4 avoid-break">
          <div className="font-bold w-8 shrink-0">Q{i + 1}.</div>
          <div className="flex-1 min-w-0">
            <div className="whitespace-pre-wrap">{q.text || <span className="text-slate-300 italic">— blank —</span>}</div>
            {q.options && q.options.length > 0 && (
              <ol className="mt-1.5 ml-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[15px]"
                style={{ listStyle: 'none' }}>
                {q.options.map((opt, idx) => (
                  <li key={idx} className="flex gap-2">
                    <span className="font-semibold shrink-0">({'abcd'[idx] ?? String(idx + 1)})</span>
                    <span className="flex-1">{opt}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div className="font-bold w-12 text-right shrink-0">[{q.marks}]</div>
        </div>
      ))}
    </div>

    {questions.length > 0 && (
      <div className="mt-12 text-center italic text-slate-500 font-medium text-sm">
        — End of Paper —
      </div>
    )}
  </div>
);
