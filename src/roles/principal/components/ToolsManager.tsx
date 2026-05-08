import React, { useEffect, useState, useRef } from 'react';
import { downloadNodeAsPdf, downloadNodesAsPdf, printCurrentPage } from '@/shared/utils/pdfPrint';
import {
  ArrowLeft, Sparkles, FileText, IdCard, Award, Ticket,
  FileCheck, Download, Printer, Eye, ChevronRight,
  ClipboardList, ScrollText, BadgeCheck,
} from 'lucide-react';
import { studentService } from '@/modules/students/student.service';
import { Student } from '@/modules/students/student.types';
import { schoolInfoService, type SchoolInfo } from '@/shared/utils/schoolInfo.service';
import { AdmissionFormPrint } from '@/shared/components/AdmissionFormPrint';
import { teacherService } from '@/roles/teacher/teacher.service';
import type { GeneratedExamPaper, ExamSection, ExamQuestion } from '@/roles/teacher/teacher.types';
import { isGeminiConfigured, GeminiUnavailableError, fileToInlineImage } from '@/lib/gemini';
import { useUIStore } from '@/store/uiStore';
import { apiExams } from '@/lib/apiClient';

type ToolView = 'DASHBOARD' | 'PAPERS' | 'TC' | 'IDCARD' | 'MARKSHEET' | 'ADMIT' | 'BONAFIDE' | 'ADMISSION' | 'BRANDING';

interface Props {
  onBack: () => void;
}

export const ToolsManager: React.FC<Props> = ({ onBack }) => {
  const [view, setView] = useState<ToolView>('DASHBOARD');
  const [students, setStudents] = React.useState<Student[]>([]);
  const [schoolInfo, setSchoolInfo] = React.useState<SchoolInfo | null>(null);
  const [printStudent, setPrintStudent] = React.useState<Student | null>(null);

  React.useEffect(() => {
    studentService.getAll().then(setStudents);
    // schoolInfoService.get() is async (Supabase-backed) — load once into state
    schoolInfoService.get().then(setSchoolInfo).catch(() => setSchoolInfo(null));
  }, []);

  // ── Shared student selector ──────────────────────────────────────────────
  const StudentPicker = ({
    value, onChange,
  }: { value: string; onChange: (id: string) => void }) => (
    <div>
      <label className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2 block">Select Student</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full border border-slate-200 bg-white rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500 transition-colors">
        <option value="">Choose a student...</option>
        {students.map(s => (
          <option key={s.id} value={s.id}>{s.name} — {s.className}-{s.section}</option>
        ))}
      </select>
    </div>
  );

  const SelectedCard = ({ student }: { student: Student }) => (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
      <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-black text-lg shrink-0">
        {student.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0">
        <div className="font-extrabold text-slate-900 truncate">{student.name}</div>
        <div className="text-xs font-bold text-slate-400 mt-0.5">{student.admissionNo} · {student.className}-{student.section}</div>
      </div>
    </div>
  );

  const ToolHeader = ({ title, onBackPress }: { title: string; onBackPress: () => void }) => (
    <div className="sticky top-0 bg-white px-4 pt-4 pb-4 flex items-center gap-3 border-b border-slate-100 z-10 shadow-sm">
      <button onClick={onBackPress} className="p-2 -ml-2 bg-slate-100 rounded-full">
        <ArrowLeft size={20} className="text-slate-600" />
      </button>
      <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">{title}</h2>
    </div>
  );

  // ── ADMISSION FORM ────────────────────────────────────────────────────────
  const AdmissionFormTool = () => {
    const [picked, setPicked] = useState('');
    const student = students.find(s => s.id === picked) ?? null;

    if (printStudent) {
      if (!schoolInfo) {
        return (
          <div className="p-8 text-center text-sm font-bold text-slate-500">
            Loading school info…
          </div>
        );
      }
      return (
        <AdmissionFormPrint
          student={printStudent}
          schoolInfo={schoolInfo}
          onClose={() => { setPrintStudent(null); }}
        />
      );
    }

    return (
      <div className="w-full flex flex-col">
        <ToolHeader title="Admission Form" onBackPress={() => setView('DASHBOARD')} />
        <div className="p-5 space-y-4">
          <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 flex items-start gap-3">
            <ClipboardList size={20} className="text-teal-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-black text-teal-900 text-sm">Admission Form Generator</p>
              <p className="text-xs font-bold text-teal-700 mt-0.5">
                Select a student to generate & print their official admission form
              </p>
            </div>
          </div>

          <StudentPicker value={picked} onChange={setPicked} />

          {student && <SelectedCard student={student} />}

          {student && (
            <button
              onClick={() => setPrintStudent(student)}
              className="w-full flex items-center justify-center gap-2 bg-teal-600 text-white font-black text-sm uppercase py-4 rounded-2xl active:scale-95 transition-transform shadow-md">
              <Printer size={16} /> Generate Admission Form
            </button>
          )}
        </div>
      </div>
    );
  };

  // ── PAPER PREVIEW + INLINE EDITOR ────────────────────────────────────────
  // Renders the generated/scanned paper read-only by default. "Edit Paper"
  // flips into a per-question editor: text/marks/type are typeable, sections
  // can be added/removed, questions can be reordered (delete + add). Save
  // writes back via teacherService.updateGeneratedPaper().
  const PaperPreview: React.FC<{
    paper: GeneratedExamPaper;
    onClose: () => void;
    onSaved: (updated: GeneratedExamPaper) => void;
  }> = ({ paper, onClose, onSaved }) => {
    const { showToast } = useUIStore();
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<ExamSection[]>(paper.sections);
    const [busy, setBusy] = useState(false);

    React.useEffect(() => { setDraft(paper.sections); }, [paper]);

    // Keep section.marks in sync with sum(question.marks) so the header
    // total never drifts when the user edits per-question marks.
    const recompute = (sections: ExamSection[]): ExamSection[] =>
      sections.map(s => ({
        ...s,
        marks: s.questions.reduce((a, q) => a + (Number(q.marks) || 0), 0),
      }));

    const renumberAll = (sections: ExamSection[]): ExamSection[] => {
      let n = 0;
      return sections.map(s => ({
        ...s,
        questions: s.questions.map(q => { n += 1; return { ...q, no: n }; }),
      }));
    };

    const updateSection = (sIdx: number, patch: Partial<ExamSection>) =>
      setDraft(prev => recompute(prev.map((s, i) => i === sIdx ? { ...s, ...patch } : s)));

    const updateQuestion = (sIdx: number, qIdx: number, patch: Partial<ExamQuestion>) =>
      setDraft(prev => recompute(prev.map((s, i) =>
        i === sIdx ? { ...s, questions: s.questions.map((q, j) => j === qIdx ? { ...q, ...patch } : q) } : s)));

    const addQuestion = (sIdx: number) =>
      setDraft(prev => renumberAll(recompute(prev.map((s, i) =>
        i === sIdx ? { ...s, questions: [...s.questions, { no: 0, text: '', marks: 1, type: 'SHORT' as const }] } : s))));

    const removeQuestion = (sIdx: number, qIdx: number) =>
      setDraft(prev => renumberAll(recompute(prev.map((s, i) =>
        i === sIdx ? { ...s, questions: s.questions.filter((_, j) => j !== qIdx) } : s))));

    const addSection = () =>
      setDraft(prev => renumberAll(recompute([...prev, {
        title: `Section ${String.fromCharCode(65 + prev.length)}`,
        instructions: '',
        marks: 0,
        questions: [],
      }])));

    const removeSection = (sIdx: number) => {
      if (!confirm('Remove this section and all its questions?')) return;
      setDraft(prev => renumberAll(recompute(prev.filter((_, i) => i !== sIdx))));
    };

    const handleSave = async () => {
      const cleaned = draft
        .map(s => ({ ...s, questions: s.questions.filter(q => q.text.trim().length > 0) }))
        .filter(s => s.questions.length > 0);
      if (cleaned.length === 0) {
        showToast('Add at least one question before saving', 'error');
        return;
      }
      setBusy(true);
      try {
        const finalSections = renumberAll(recompute(cleaned));
        await teacherService.updateGeneratedPaper(paper.id, finalSections);
        onSaved({ ...paper, sections: finalSections });
        setEditing(false);
        showToast('Paper updated');
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Save failed', 'error');
      } finally {
        setBusy(false);
      }
    };

    const handleCancelEdit = () => {
      setDraft(paper.sections);
      setEditing(false);
    };

    const sections = editing ? draft : paper.sections;

    return (
      <div className="w-full flex flex-col">
        <ToolHeader title={editing ? 'Edit Paper' : 'Question Paper'} onBackPress={editing ? handleCancelEdit : onClose} />
        <div className="p-5 space-y-4">
          <div className="bg-white border-2 border-slate-200 rounded-2xl p-5 lg:p-6 shadow-sm">
            <div className="text-center mb-5 pb-4 border-b-2 border-slate-200">
              <h3 className="text-lg font-black text-slate-900">{paper.request.subject.toUpperCase()}</h3>
              <p className="text-sm font-bold text-slate-500 mt-1">
                {paper.request.className} | Time: {Math.round(paper.request.duration / 60)} Hours | Total Marks: {paper.request.totalMarks}
              </p>
              <p className="text-[10px] font-bold text-slate-400 mt-1">
                {new Date(paper.generatedAt).toLocaleString()}
              </p>
            </div>

            <div className="space-y-6">
              {sections.map((section, sIdx) => (
                <div key={sIdx} className={editing ? 'bg-slate-50/50 border border-slate-200 rounded-xl p-3' : ''}>
                  {editing ? (
                    <div className="space-y-2 mb-3">
                      <div className="flex items-center gap-2">
                        <input
                          value={section.title}
                          onChange={e => updateSection(sIdx, { title: e.target.value })}
                          placeholder="Section title"
                          className="flex-1 border border-slate-200 bg-white rounded-lg px-3 py-2 font-black text-sm outline-none focus:border-violet-500"
                        />
                        <span className="text-[11px] font-black text-slate-500 bg-slate-100 px-2 py-1 rounded-md tabular-nums">
                          {section.marks} marks
                        </span>
                        <button onClick={() => removeSection(sIdx)}
                          className="w-8 h-8 flex items-center justify-center bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg text-sm font-black">
                          ×
                        </button>
                      </div>
                      <input
                        value={section.instructions ?? ''}
                        onChange={e => updateSection(sIdx, { instructions: e.target.value })}
                        placeholder="Instructions (optional)"
                        className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-[12px] font-bold italic text-slate-700 outline-none focus:border-violet-500"
                      />
                    </div>
                  ) : (
                    <>
                      <h4 className="font-black text-sm text-slate-900 mb-1">
                        {section.title} <span className="text-slate-500 font-bold">({section.marks} marks)</span>
                      </h4>
                      {section.instructions && (
                        <p className="text-[11px] font-bold text-slate-500 italic mb-3">{section.instructions}</p>
                      )}
                    </>
                  )}

                  <div className="space-y-2">
                    {section.questions.map((q, qIdx) => (
                      <div key={qIdx} className={editing ? 'bg-white rounded-lg border border-slate-200 p-2.5' : 'text-sm font-semibold text-slate-700'}>
                        {editing ? (
                          <div className="flex items-start gap-2">
                            <span className="text-[11px] font-black text-slate-400 mt-2 tabular-nums shrink-0 w-6 text-right">{q.no}.</span>
                            <textarea
                              value={q.text}
                              onChange={e => updateQuestion(sIdx, qIdx, { text: e.target.value })}
                              rows={2}
                              placeholder="Question text"
                              className="flex-1 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-700 outline-none focus:border-violet-500 resize-none"
                            />
                            <div className="flex flex-col gap-1 shrink-0">
                              <input
                                type="number" min={0} max={100}
                                value={q.marks}
                                onChange={e => updateQuestion(sIdx, qIdx, { marks: Number(e.target.value) || 0 })}
                                className="w-14 border border-slate-200 rounded-md px-1.5 py-1 text-[11px] font-black text-center tabular-nums outline-none focus:border-violet-500"
                                title="Marks"
                              />
                              <select
                                value={q.type}
                                onChange={e => updateQuestion(sIdx, qIdx, { type: e.target.value as ExamQuestion['type'] })}
                                className="w-14 border border-slate-200 rounded-md px-1 py-1 text-[10px] font-black outline-none focus:border-violet-500">
                                {(['MCQ', 'SHORT', 'LONG', 'DIAGRAM'] as const).map(t => (
                                  <option key={t} value={t}>{t}</option>
                                ))}
                              </select>
                            </div>
                            <button onClick={() => removeQuestion(sIdx, qIdx)}
                              className="w-8 h-8 flex items-center justify-center bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-md text-sm font-black shrink-0">
                              ×
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-3">
                            <span className="flex-1 whitespace-pre-wrap">{q.no}. {q.text}</span>
                            <span className="text-[10px] font-black text-slate-400 shrink-0 mt-0.5">[{q.marks}]</span>
                          </div>
                        )}
                      </div>
                    ))}

                    {editing && (
                      <button onClick={() => addQuestion(sIdx)}
                        className="w-full py-2 border border-dashed border-violet-300 text-violet-600 font-black text-[11px] uppercase tracking-wider rounded-lg hover:bg-violet-50 transition-colors">
                        + Add Question
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {editing && (
                <button onClick={addSection}
                  className="w-full py-3 border-2 border-dashed border-violet-300 text-violet-600 font-black text-xs uppercase tracking-wider rounded-xl hover:bg-violet-50 transition-colors">
                  + Add Section
                </button>
              )}
            </div>
          </div>

          {/* Action bar */}
          {editing ? (
            <div className="grid grid-cols-2 gap-3">
              <button onClick={handleCancelEdit} disabled={busy}
                className="flex items-center justify-center gap-2 bg-slate-100 text-slate-700 font-black text-sm uppercase py-3 rounded-2xl active:scale-95 transition-transform disabled:opacity-50">
                Cancel
              </button>
              <button onClick={handleSave} disabled={busy}
                className="flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-black text-sm uppercase py-3 rounded-2xl active:scale-95 transition-transform disabled:opacity-60 shadow-md">
                {busy ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => window.print()}
                className="flex items-center justify-center gap-1.5 bg-indigo-600 text-white font-black text-xs uppercase py-3 rounded-2xl active:scale-95 transition-transform">
                <Printer size={14} /> Print
              </button>
              <button onClick={() => setEditing(true)}
                className="flex items-center justify-center gap-1.5 bg-violet-600 text-white font-black text-xs uppercase py-3 rounded-2xl active:scale-95 transition-transform">
                <Eye size={14} /> Edit
              </button>
              <button onClick={onClose}
                className="flex items-center justify-center gap-1.5 bg-slate-100 text-slate-700 font-black text-xs uppercase py-3 rounded-2xl active:scale-95 transition-transform">
                <Sparkles size={14} /> New
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── QUESTION PAPER GENERATOR (AI) ────────────────────────────────────────
  const QuestionPaperGenerator = () => {
    const showToast = useUIStore(s => s.showToast);
    const [config, setConfig] = useState({
      class: '10', section: 'A', subject: 'Mathematics',
      totalMarks: 100, numQuestions: 30, difficulty: 'MIXED' as 'EASY' | 'MIXED' | 'HARD',
      topics: '',
    });
    const [paper, setPaper] = useState<GeneratedExamPaper | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [savedPapers, setSavedPapers] = useState<GeneratedExamPaper[]>([]);
    const [savedLoading, setSavedLoading] = useState(false);
    const aiAvailable = isGeminiConfigured();

    // Mode toggle: PROMPT (text-only AI generation) vs SCAN (upload photo
    // of an existing paper → Gemini Vision OCR → structured paper). Both
    // paths land on the same GeneratedExamPaper preview/persist flow.
    const [mode, setMode] = useState<'PROMPT' | 'SCAN'>('PROMPT');
    const [scanFiles, setScanFiles] = useState<File[]>([]);
    const [scanPreviews, setScanPreviews] = useState<string[]>([]);
    const [isScanning, setIsScanning] = useState(false);

    // Object URLs need to be revoked when previews change so the browser
    // doesn't leak blob memory across upload cycles.
    React.useEffect(() => {
      const urls = scanFiles.map(f => URL.createObjectURL(f));
      setScanPreviews(urls);
      return () => { urls.forEach(URL.revokeObjectURL); };
    }, [scanFiles]);

    React.useEffect(() => {
      setSavedLoading(true);
      teacherService.getGeneratedPapers()
        .then(setSavedPapers)
        .catch(() => { /* table may be empty / RLS — no toast on first load */ })
        .finally(() => setSavedLoading(false));
    }, []);

    const handleGenerate = async () => {
      if (!aiAvailable) { showToast('AI is not configured. Set GEMINI_API_KEY to enable.', 'error'); return; }
      setIsGenerating(true);
      try {
        const result = await teacherService.generateExamPaper({
          subject: config.subject,
          className: `Class ${config.class}`,
          testType: 'UNIT_TEST',
          totalMarks: config.totalMarks,
          duration: 180,
          topics: config.topics.trim(),
          difficulty: config.difficulty === 'MIXED' ? 'MEDIUM' : config.difficulty,
        });
        setPaper(result);
        teacherService.getGeneratedPapers()
          .then(setSavedPapers)
          .catch(() => {});
      } catch (e) {
        if (e instanceof GeminiUnavailableError) {
          showToast('AI is not configured. Set GEMINI_API_KEY to enable.', 'error');
        } else {
          showToast(e instanceof Error ? e.message : 'Failed to generate paper', 'error');
        }
      } finally {
        setIsGenerating(false);
      }
    };

    const handleScanExtract = async () => {
      if (!aiAvailable) { showToast('AI is not configured. Set GEMINI_API_KEY to enable.', 'error'); return; }
      if (scanFiles.length === 0) { showToast('Pick or take at least one photo of the paper first', 'error'); return; }
      setIsScanning(true);
      try {
        const inline = await Promise.all(scanFiles.map(fileToInlineImage));
        const result = await teacherService.extractPaperFromImages(inline, {
          className: `Class ${config.class}`,
          subject: config.subject,
          totalMarks: config.totalMarks,
          duration: 180,
          difficulty: config.difficulty === 'MIXED' ? 'MEDIUM' : config.difficulty,
        });
        setPaper(result);
        setScanFiles([]);
        teacherService.getGeneratedPapers().then(setSavedPapers).catch(() => {});
      } catch (e) {
        if (e instanceof GeminiUnavailableError) {
          showToast('AI is not configured. Set GEMINI_API_KEY to enable.', 'error');
        } else {
          showToast(e instanceof Error ? e.message : 'Could not extract questions', 'error');
        }
      } finally {
        setIsScanning(false);
      }
    };

    const handlePrint = () => window.print();

    if (paper) {
      return <PaperPreview paper={paper} onClose={() => setPaper(null)}
        onSaved={updated => {
          setPaper(updated);
          teacherService.getGeneratedPapers().then(setSavedPapers).catch(() => {});
        }} />;
    }

    return (
      <div className="w-full flex flex-col">
        <ToolHeader title="AI Question Paper" onBackPress={() => setView('DASHBOARD')} />
        <div className="p-5 space-y-4">
          {!aiAvailable && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
              <Sparkles size={20} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-black text-amber-900 text-sm">AI Not Configured</p>
                <p className="text-xs font-bold text-amber-700 mt-0.5">Set GEMINI_API_KEY in environment to enable AI features.</p>
              </div>
            </div>
          )}

          {/* Mode toggle — Generate via prompt OR scan an existing paper. */}
          <div className="bg-slate-100 rounded-2xl p-1 flex">
            <button onClick={() => setMode('PROMPT')}
              className={`flex-1 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${mode === 'PROMPT' ? 'bg-white text-violet-600 shadow-sm' : 'text-slate-500'}`}>
              ✨ Generate (AI)
            </button>
            <button onClick={() => setMode('SCAN')}
              className={`flex-1 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${mode === 'SCAN' ? 'bg-white text-violet-600 shadow-sm' : 'text-slate-500'}`}>
              📷 Scan Paper
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Class</label>
              <select value={config.class} onChange={e => setConfig({ ...config, class: e.target.value })}
                className="w-full border border-slate-200 bg-white rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-violet-500">
                {['8', '9', '10', '11', '12'].map(c => <option key={c} value={c}>Class {c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Subject</label>
              <select value={config.subject} onChange={e => setConfig({ ...config, subject: e.target.value })}
                className="w-full border border-slate-200 bg-white rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-violet-500">
                {['Mathematics', 'Science', 'English', 'History', 'Geography', 'Hindi', 'Physics', 'Chemistry', 'Biology'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Total Marks</label>
              <input type="number" value={config.totalMarks}
                onChange={e => setConfig({ ...config, totalMarks: parseInt(e.target.value) || 0 })}
                className="w-full border border-slate-200 bg-white rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-violet-500" />
            </div>
            {mode === 'PROMPT' && (
              <>
                <div>
                  <label className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Topics (optional)</label>
                  <textarea value={config.topics} rows={2}
                    placeholder="e.g. Quadratic equations, Trigonometry, Coordinate geometry"
                    onChange={e => setConfig({ ...config, topics: e.target.value })}
                    className="w-full border border-slate-200 bg-white rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-violet-500 resize-none" />
                </div>
                <div>
                  <label className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2 block">Difficulty</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['EASY', 'MIXED', 'HARD'] as const).map(d => (
                      <button key={d} onClick={() => setConfig({ ...config, difficulty: d })}
                        className={`py-2.5 rounded-xl font-black text-xs uppercase tracking-wide transition-all ${
                          config.difficulty === d ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {mode === 'SCAN' && (
              <div>
                <label className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5 block">
                  Photo of paper · {scanFiles.length}/4
                </label>
                <p className="text-[10px] font-bold text-slate-400 mb-2">
                  Capture or upload up to 4 clear photos of the printed/handwritten question paper. AI will extract every question into editable form.
                </p>
                <input
                  id="scan-paper-input"
                  type="file" accept="image/*" multiple
                  capture="environment"
                  onChange={e => {
                    const list = Array.from(e.target.files ?? []).slice(0, 4);
                    setScanFiles(list);
                    e.target.value = ''; // allow re-picking same file
                  }}
                  className="hidden"
                />
                <label htmlFor="scan-paper-input"
                  className="block w-full border-2 border-dashed border-violet-300 bg-violet-50/30 hover:bg-violet-50 rounded-xl px-4 py-6 text-center cursor-pointer transition-colors">
                  <div className="text-violet-600 text-2xl mb-1">📷</div>
                  <p className="text-xs font-black text-violet-700">Tap to take photo or upload</p>
                  <p className="text-[10px] font-bold text-violet-500 mt-0.5">JPG / PNG / WEBP · max 6 MB each · up to 4</p>
                </label>

                {scanPreviews.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {scanPreviews.map((url, i) => (
                      <div key={url} className="relative">
                        <img src={url} alt={`Page ${i + 1}`}
                          className="w-full h-32 object-cover rounded-lg border border-slate-200" />
                        <button
                          onClick={() => setScanFiles(files => files.filter((_, idx) => idx !== i))}
                          className="absolute top-1 right-1 w-6 h-6 bg-rose-600 text-white rounded-full text-xs font-black shadow-md">
                          ×
                        </button>
                        <span className="absolute bottom-1 left-1 bg-slate-900/80 text-white text-[9px] font-black px-1.5 py-0.5 rounded">
                          Page {i + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {mode === 'PROMPT' ? (
            <button onClick={handleGenerate} disabled={isGenerating || !aiAvailable}
              className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-black text-sm uppercase py-4 rounded-2xl active:scale-95 transition-transform disabled:opacity-60 shadow-md">
              {isGenerating
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Generating…</>
                : <><Sparkles size={16} /> Generate Paper</>}
            </button>
          ) : (
            <button onClick={handleScanExtract} disabled={isScanning || !aiAvailable || scanFiles.length === 0}
              className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-black text-sm uppercase py-4 rounded-2xl active:scale-95 transition-transform disabled:opacity-60 shadow-md">
              {isScanning
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Reading paper…</>
                : <><Sparkles size={16} /> Extract Questions</>}
            </button>
          )}

          {/* Saved papers — reopen previously generated AI papers */}
          <div className="pt-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Saved Papers</p>
            {savedLoading ? (
              <p className="text-xs font-bold text-slate-400">Loading…</p>
            ) : savedPapers.length === 0 ? (
              <p className="text-xs font-bold text-slate-400">No saved papers yet. Generate one to save it.</p>
            ) : (
              <div className="space-y-2">
                {savedPapers.map(p => (
                  <button key={p.id} onClick={() => setPaper(p)}
                    className="w-full bg-white border border-slate-200 rounded-xl p-3 text-left flex items-center justify-between active:scale-[0.98] transition-transform">
                    <div className="min-w-0">
                      <div className="font-extrabold text-slate-900 text-sm truncate">{p.request.subject} · {p.request.className}</div>
                      <div className="text-[10px] font-bold text-slate-400 mt-0.5">
                        {p.request.totalMarks} marks · {new Date(p.generatedAt).toLocaleDateString()} {new Date(p.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-slate-300 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ── TC GENERATOR ─────────────────────────────────────────────────────────
  const TCGenerator = () => {
    const [picked, setPicked] = useState('');
    const [preview, setPreview] = useState(false);
    const printRef = useRef<HTMLDivElement>(null);
    const { showToast } = useUIStore();
    const student = students.find(s => s.id === picked);

    const accent = schoolInfo?.accentColor || '#2563eb';
    const logoUrl = schoolInfo?.logoPath ? schoolInfoService.getAssetUrl(schoolInfo.logoPath) : null;
    const signatureUrl = schoolInfo?.principalSignaturePath ? schoolInfoService.getAssetUrl(schoolInfo.principalSignaturePath) : null;

    const handleDownload = async () => {
      if (!printRef.current || !student) return;
      try { await downloadNodeAsPdf(printRef.current, `tc-${student.admissionNo}.pdf`); }
      catch (e) { showToast(e instanceof Error ? e.message : 'PDF export failed', 'error'); }
    };

    if (preview && student && schoolInfo) {
      return (
        <div className="w-full flex flex-col">
          <ToolHeader title="Transfer Certificate" onBackPress={() => setPreview(false)} />
          <div className="p-5">
            <div ref={printRef} className="bg-white border-2 rounded-2xl p-6 shadow-sm" style={{ borderColor: accent }}>
              <div className="text-center border-b-2 pb-5 mb-5 flex items-center gap-3 justify-center" style={{ borderColor: accent }}>
                {logoUrl && (
                  <img src={logoUrl} alt="School logo" className="w-14 h-14 object-contain shrink-0" crossOrigin="anonymous" />
                )}
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">{schoolInfo.name || 'School Name'}</p>
                  <h3 className="text-xl font-black uppercase tracking-wide" style={{ color: accent }}>Transfer Certificate</h3>
                  <p className="text-xs font-bold text-slate-400 mt-1">TC No: {student.tcNumber || 'TC-' + new Date().getFullYear() + '-001'}</p>
                </div>
              </div>
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Student Name</p>
                    <p className="font-bold text-slate-900 mt-1">{student.name}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Admission No.</p>
                    <p className="font-bold text-slate-900 mt-1">{student.admissionNo}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Class</p>
                    <p className="font-bold text-slate-900 mt-1">{student.className}-{student.section}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Date of Birth</p>
                    <p className="font-bold text-slate-900 mt-1">{student.dob}</p>
                  </div>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Father's Name</p>
                  <p className="font-bold text-slate-900 mt-1">{student.fatherName || '—'}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Character</p>
                  <p className="font-bold text-slate-900 mt-1">Good</p>
                </div>
                <div className="pt-5 border-t-2 border-slate-200 flex items-end justify-between">
                  <div>
                    <div className="h-10 w-24 mb-1 flex items-end">
                      {signatureUrl && (
                        <img src={signatureUrl} alt="Principal signature" className="max-h-10 object-contain" crossOrigin="anonymous" />
                      )}
                    </div>
                    <p className="text-xs font-bold text-slate-500 border-t border-slate-400 pt-1">Principal Signature</p>
                  </div>
                  <p className="text-xs font-bold text-slate-500">Date: {new Date().toLocaleDateString('en-IN')}</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <button onClick={printCurrentPage} className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm uppercase py-3 rounded-2xl active:scale-95 transition-all">
                <Printer size={16} /> Print
              </button>
              <button onClick={handleDownload} className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-sm uppercase py-3 rounded-2xl active:scale-95 transition-all">
                <Download size={16} /> Download PDF
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="w-full flex flex-col">
        <ToolHeader title="Transfer Certificate" onBackPress={() => setView('DASHBOARD')} />
        <div className="p-5 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
            <ScrollText size={20} className="text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-black text-blue-900 text-sm">TC Generator</p>
              <p className="text-xs font-bold text-blue-700 mt-0.5">Select a student to generate Transfer Certificate</p>
            </div>
          </div>
          <StudentPicker value={picked} onChange={setPicked} />
          {student && <SelectedCard student={student} />}
          {picked && (
            <button onClick={() => setPreview(true)}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-black text-sm uppercase py-4 rounded-2xl active:scale-95 transition-transform shadow-md">
              <Eye size={16} /> Preview TC
            </button>
          )}
        </div>
      </div>
    );
  };

  // ── ID CARD GENERATOR — single + bulk-by-class ────────────────────────────
  const IDCardGenerator = () => {
    const [mode, setMode] = useState<'SINGLE' | 'BULK'>('BULK');
    const [picked, setPicked] = useState('');
    const [pickedClass, setPickedClass] = useState('');
    const [preview, setPreview] = useState(false);
    const [downloadingPdf, setDownloadingPdf] = useState(false);
    // Per-card refs for bulk PDF generation — same pattern as admit cards.
    const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
    const { showToast } = useUIStore();
    const student = students.find(s => s.id === picked) ?? null;

    const accent = schoolInfo?.accentColor || '#4f46e5';
    const logoUrl = schoolInfo?.logoPath ? schoolInfoService.getAssetUrl(schoolInfo.logoPath) : null;

    // Unique class+section pairs from the roster.
    const classes = React.useMemo(() => {
      const set = new Map<string, { className: string; section: string }>();
      for (const s of students) set.set(`${s.className}|${s.section}`, { className: s.className, section: s.section });
      return Array.from(set.entries()).map(([k, v]) => ({ id: k, ...v }))
        .sort((a, b) => `${a.className}-${a.section}`.localeCompare(`${b.className}-${b.section}`));
    }, []);

    const targetClassName = mode === 'SINGLE' ? student?.className : pickedClass.split('|')[0];
    const targetSection   = mode === 'SINGLE' ? student?.section   : pickedClass.split('|')[1];

    const printList: Student[] = mode === 'SINGLE'
      ? (student ? [student] : [])
      : students.filter(s => s.className === targetClassName && s.section === targetSection);

    const handleDownloadAllPdf = async () => {
      setDownloadingPdf(true);
      try {
        await new Promise(r => requestAnimationFrame(() => r(undefined)));
        const nodes = cardRefs.current.filter((n): n is HTMLDivElement => !!n);
        if (nodes.length === 0) {
          throw new Error('Cards not ready yet — wait a moment and tap Download again.');
        }
        const filename = nodes.length === 1
          ? `idcard-${printList[0]?.admissionNo ?? 'card'}.pdf`
          : `idcards-${(targetClassName ?? 'class').replace(/\s+/g, '-')}-${targetSection ?? ''}.pdf`;
        await downloadNodesAsPdf(nodes, filename);
        showToast(`PDF saved · ${nodes.length} card${nodes.length > 1 ? 's' : ''}`);
      } catch (e) {
        console.error('[id-card] PDF export failed:', e);
        showToast(e instanceof Error ? e.message : 'PDF export failed', 'error');
      } finally {
        setDownloadingPdf(false);
      }
    };

    if (preview && schoolInfo && printList.length > 0) {
      cardRefs.current = cardRefs.current.slice(0, printList.length);
      return (
        <div className="w-full flex flex-col">
          {/* Two-row toolbar — same mobile-friendly layout as admit cards. */}
          <div className="no-print sticky top-0 bg-white px-4 py-3 border-b border-slate-100 z-10 space-y-2">
            <div className="flex items-center gap-2">
              <button onClick={() => setPreview(false)}
                className="py-2 px-3 bg-slate-100 text-slate-700 font-black text-xs uppercase rounded-xl">
                ← Back
              </button>
              <span className="py-2 px-3 bg-green-50 text-green-700 border border-green-200 font-black text-[11px] uppercase rounded-xl flex items-center gap-1.5">
                {printList.length} Card{printList.length > 1 ? 's' : ''}
              </span>
              {targetClassName && (
                <span className="py-2 px-3 bg-slate-50 text-slate-600 border border-slate-200 font-black text-[11px] uppercase rounded-xl ml-auto truncate">
                  {targetClassName}{targetSection ? `-${targetSection}` : ''}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={handleDownloadAllPdf} disabled={downloadingPdf}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-60 active:scale-[0.98] transition-transform">
                <Download size={13} /> {downloadingPdf ? 'Saving PDF…' : 'Download PDF'}
              </button>
              <button onClick={() => window.print()}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase rounded-xl flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform">
                <Printer size={13} /> Print
              </button>
            </div>
          </div>

          <div className="printable bg-white">
            {printList.map((s, idx) => (
              <div key={s.id} className="print-page p-6 font-sans">
                <div ref={el => { cardRefs.current[idx] = el; }}
                  className="rounded-2xl p-5 text-white max-w-xs mx-auto shadow-lg"
                  style={{ background: `linear-gradient(135deg, ${accent} 0%, ${accent}cc 100%)` }}>
                  <div className="text-center mb-3 flex items-center gap-2 justify-center">
                    {logoUrl && (
                      <img src={logoUrl} alt="Logo" className="w-8 h-8 object-contain" crossOrigin="anonymous" />
                    )}
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-white">{schoolInfo.name || 'School Name'}</p>
                      <p className="text-[8px] font-bold text-white/70 mt-0.5">STUDENT IDENTITY CARD</p>
                    </div>
                  </div>
                  <div className="flex gap-4 items-start">
                    <div className="w-16 h-20 rounded-xl bg-white/20 flex items-center justify-center font-black text-2xl text-white shrink-0">
                      {s.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-black text-base leading-tight">{s.name}</div>
                      <div className="text-[10px] font-bold text-white/70 mt-1">{s.className}-{s.section}</div>
                      <div className="text-[10px] font-bold text-white/70">Roll: {s.rollNo || '—'}</div>
                      <div className="text-[10px] font-bold text-white/60 mt-2 font-mono">{s.admissionNo}</div>
                    </div>
                  </div>
                  {s.fatherName && (
                    <div className="mt-3 pt-3 border-t border-white/20">
                      <div className="text-[9px] font-bold text-white/50">Father: {s.fatherName}</div>
                      {s.fatherPhone && <div className="text-[9px] font-bold text-white/50">Ph: {s.fatherPhone}</div>}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    const canPreview = mode === 'SINGLE' ? !!student : printList.length > 0;

    return (
      <div className="w-full flex flex-col">
        <ToolHeader title="ID Cards" onBackPress={() => setView('DASHBOARD')} />
        <div className="p-5 space-y-4 lg:max-w-2xl lg:mx-auto lg:w-full">
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-start gap-3">
            <IdCard size={20} className="text-green-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-black text-green-900 text-sm">Student ID Cards</p>
              <p className="text-xs font-bold text-green-700 mt-0.5">
                Pick a class for bulk printing or one student — all cards inherit your branding.
              </p>
            </div>
          </div>

          {/* Mode toggle — bulk default. */}
          <div className="flex gap-2 bg-slate-100 p-1 rounded-2xl">
            <button onClick={() => { setMode('BULK'); setPicked(''); }}
              className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-colors ${mode === 'BULK' ? 'bg-white text-green-700 shadow-sm' : 'text-slate-500'}`}>
              Bulk by Class
            </button>
            <button onClick={() => { setMode('SINGLE'); setPickedClass(''); }}
              className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-colors ${mode === 'SINGLE' ? 'bg-white text-green-700 shadow-sm' : 'text-slate-500'}`}>
              Single Student
            </button>
          </div>

          {mode === 'BULK' ? (
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2 block">Select Class</label>
              <select value={pickedClass} onChange={e => setPickedClass(e.target.value)}
                className="w-full border border-slate-200 bg-white rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-green-400">
                <option value="">Class chunein…</option>
                {classes.map(c => {
                  const count = students.filter(s => s.className === c.className && s.section === c.section).length;
                  return <option key={c.id} value={c.id}>{c.className}-{c.section} · {count} students</option>;
                })}
              </select>
              {pickedClass && printList.length > 0 && (
                <p className="text-[10px] font-bold text-slate-500 mt-1.5">{printList.length} ID card{printList.length > 1 ? 's' : ''} will be generated</p>
              )}
            </div>
          ) : (
            <>
              <StudentPicker value={picked} onChange={setPicked} />
              {student && <SelectedCard student={student} />}
            </>
          )}

          {canPreview && (
            <button onClick={() => setPreview(true)}
              className="w-full flex items-center justify-center gap-2 bg-green-600 text-white font-black text-sm uppercase py-4 rounded-2xl active:scale-95 transition-transform shadow-md">
              <Eye size={16} /> Preview {printList.length > 1 ? `${printList.length} ID Cards` : 'ID Card'}
            </button>
          )}
        </div>
      </div>
    );
  };

  // ── BONAFIDE CERTIFICATE ──────────────────────────────────────────────────
  const BonafideGenerator = () => {
    const [picked, setPicked] = useState('');
    const [purpose, setPurpose] = useState('');
    const [preview, setPreview] = useState(false);
    const printRef = useRef<HTMLDivElement>(null);
    const { showToast } = useUIStore();
    const student = students.find(s => s.id === picked);
    const accent = schoolInfo?.accentColor || '#4f46e5';
    const logoUrl = schoolInfo?.logoPath ? schoolInfoService.getAssetUrl(schoolInfo.logoPath) : null;
    const signatureUrl = schoolInfo?.principalSignaturePath ? schoolInfoService.getAssetUrl(schoolInfo.principalSignaturePath) : null;

    const handleDownload = async () => {
      if (!printRef.current || !student) return;
      try { await downloadNodeAsPdf(printRef.current, `bonafide-${student.admissionNo}.pdf`); }
      catch (e) { showToast(e instanceof Error ? e.message : 'PDF export failed', 'error'); }
    };

    if (preview && student && schoolInfo) {
      return (
        <div className="w-full flex flex-col">
          <ToolHeader title="Bonafide Certificate" onBackPress={() => setPreview(false)} />
          <div className="p-5">
            <div ref={printRef} className="bg-white border-2 rounded-2xl p-6 shadow-sm" style={{ borderColor: accent }}>
              <div className="text-center pb-5 mb-5 border-b-2 flex items-center gap-3 justify-center" style={{ borderColor: accent }}>
                {logoUrl && (
                  <img src={logoUrl} alt="School logo" className="w-14 h-14 object-contain shrink-0" crossOrigin="anonymous" />
                )}
                <div>
                  <p className="text-xs font-black text-slate-500 uppercase tracking-widest">{schoolInfo.name || 'School Name'}</p>
                  <h3 className="text-xl font-black mt-1 uppercase tracking-wide" style={{ color: accent }}>Bonafide Certificate</h3>
                </div>
              </div>
              <p className="text-sm font-bold text-slate-700 leading-relaxed text-justify">
                This is to certify that <strong>{student.name}</strong>, son/daughter of <strong>{student.fatherName || '___'}</strong>,
                is a bonafide student of this school studying in <strong>{student.className}-{student.section}</strong> during the academic year {new Date().getFullYear()}-{new Date().getFullYear() + 1}.
                {purpose && ` This certificate is being issued for the purpose of ${purpose}.`}
              </p>
              <div className="pt-6 mt-6 border-t-2 border-slate-200 flex items-end justify-between">
                <div>
                  <div className="h-10 w-24 mb-1 flex items-end">
                    {signatureUrl && (
                      <img src={signatureUrl} alt="Principal signature" className="max-h-10 object-contain" crossOrigin="anonymous" />
                    )}
                  </div>
                  <p className="text-xs font-bold text-slate-500 border-t border-slate-400 pt-1">Principal Signature &amp; Seal</p>
                </div>
                <p className="text-xs font-bold text-slate-500">Date: {new Date().toLocaleDateString('en-IN')}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <button onClick={printCurrentPage} className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm uppercase py-3 rounded-2xl active:scale-95 transition-all">
                <Printer size={16} /> Print
              </button>
              <button onClick={handleDownload} className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-sm uppercase py-3 rounded-2xl active:scale-95 transition-all">
                <Download size={16} /> Download PDF
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="w-full flex flex-col">
        <ToolHeader title="Bonafide Certificate" onBackPress={() => setView('DASHBOARD')} />
        <div className="p-5 space-y-4">
          <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex items-start gap-3">
            <BadgeCheck size={20} className="text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-black text-indigo-900 text-sm">Bonafide Certificate</p>
              <p className="text-xs font-bold text-indigo-700 mt-0.5">Issue bonafide certificate for student</p>
            </div>
          </div>
          <StudentPicker value={picked} onChange={setPicked} />
          {student && <SelectedCard student={student} />}
          <div>
            <label className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Purpose (optional)</label>
            <input value={purpose} onChange={e => setPurpose(e.target.value)}
              placeholder="e.g. Bank account, Scholarship, etc."
              className="w-full border border-slate-200 bg-white rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
          </div>
          {picked && (
            <button onClick={() => setPreview(true)}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-black text-sm uppercase py-4 rounded-2xl active:scale-95 transition-transform shadow-md">
              <Eye size={16} /> Preview Certificate
            </button>
          )}
        </div>
      </div>
    );
  };

  // ── MARKSHEET TOOL (multi-subject) ───────────────────────────────────────
  const MarksheetTool = () => {
    const [picked,       setPicked]       = useState('');
    const [examTitle,    setExamTitle]    = useState('');
    const [allExams,     setAllExams]     = useState<any[]>([]);
    // rows: { exam, result } per subject
    const [subjectRows,  setSubjectRows]  = useState<{ exam: any; result: any | null }[]>([]);
    const [loadingExams, setLoadingExams] = useState(false);
    const [loadingRes,   setLoadingRes]   = useState(false);
    const [showPrint,    setShowPrint]    = useState(false);
    const printRef = useRef<HTMLDivElement>(null);
    const { showToast: msToast } = useUIStore();

    const student = students.find(s => s.id === picked) ?? null;

    // Branding — logo + signature embedded into the printed marksheet,
    // accent color used for the header rule + title. Defaults so the
    // doc still looks finished when branding hasn't been configured.
    const accent = schoolInfo?.accentColor || '#0f172a';
    const logoUrl = schoolInfo?.logoPath ? schoolInfoService.getAssetUrl(schoolInfo.logoPath) : null;
    const signatureUrl = schoolInfo?.principalSignaturePath ? schoolInfoService.getAssetUrl(schoolInfo.principalSignaturePath) : null;

    const handleDownload = async () => {
      if (!printRef.current || !student) return;
      try { await downloadNodeAsPdf(printRef.current, `marksheet-${student.admissionNo}.pdf`); }
      catch (e) { msToast(e instanceof Error ? e.message : 'PDF export failed', 'error'); }
    };

    // Load all completed exams for student's class
    useEffect(() => {
      if (!student) { setAllExams([]); setExamTitle(''); setSubjectRows([]); return; }
      setLoadingExams(true);
      apiExams.list({ className: student.className })
        .then((list: any[]) => setAllExams(list.filter(e => e.results_uploaded)))
        .catch(() => setAllExams([]))
        .finally(() => setLoadingExams(false));
    }, [student?.id]);

    // Unique exam titles for the dropdown
    const examTitleOptions = React.useMemo(() => {
      const seen = new Set<string>();
      return allExams.filter(e => { if (seen.has(e.title)) return false; seen.add(e.title); return true; });
    }, [allExams]);

    // Load per-subject results when title picked
    useEffect(() => {
      if (!examTitle || !picked) { setSubjectRows([]); return; }
      const titleExams = allExams.filter(e => e.title === examTitle);
      setLoadingRes(true);
      Promise.all(
        titleExams.map(exam =>
          apiExams.getResults(exam.id)
            .then((res: any[]) => ({
              exam,
              result: res.find((r: any) => r.student_id === picked) ?? null,
            }))
            .catch(() => ({ exam, result: null }))
        )
      )
        .then(rows => setSubjectRows(rows.sort((a, b) => (a.exam.subject ?? '').localeCompare(b.exam.subject ?? ''))))
        .finally(() => setLoadingRes(false));
    }, [examTitle, picked]);

    // Aggregate totals (only rows where result exists)
    const filledRows  = subjectRows.filter(r => r.result !== null);
    const totalMax    = subjectRows.reduce((s, r) => s + (r.exam.max_marks ?? 0), 0);
    const totalObtained = filledRows.reduce((s, r) => s + (r.result?.obtained_marks ?? 0), 0);
    const pct  = totalMax > 0 ? Math.round((totalObtained / totalMax) * 100) : 0;
    const passed = pct >= 33;

    const gradeLabel = (obt: number, max: number) => {
      const p = max > 0 ? (obt / max) * 100 : 0;
      return p >= 90 ? 'A+' : p >= 75 ? 'A' : p >= 60 ? 'B+' : p >= 45 ? 'B' : p >= 33 ? 'C' : 'F';
    };

    if (showPrint && student && examTitle && subjectRows.length > 0) {
      return (
        <div className="w-full flex flex-col">
          <div className="sticky top-0 bg-white px-4 py-3 border-b border-slate-100 flex gap-2 z-10 print:hidden">
            <button onClick={() => setShowPrint(false)}
              className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-black text-xs uppercase rounded-xl">
              ← Back
            </button>
            <button onClick={() => window.print()}
              className="flex-1 py-2.5 bg-slate-900 text-white font-black text-xs uppercase rounded-xl flex items-center justify-center gap-1.5">
              <Printer size={13} /> Print
            </button>
            <button onClick={handleDownload}
              className="flex-1 py-2.5 bg-amber-600 text-white font-black text-xs uppercase rounded-xl flex items-center justify-center gap-1.5">
              <Download size={13} /> PDF
            </button>
          </div>

          {/* ── Printable marksheet ── */}
          <div ref={printRef} className="p-6 bg-white min-h-screen font-sans">
            {/* School header — accent + logo from school branding. */}
            <div className="border-b-2 pb-4 mb-4 flex items-center gap-3 justify-center" style={{ borderColor: accent }}>
              {logoUrl && (
                <img src={logoUrl} alt="School logo" className="w-14 h-14 object-contain shrink-0" crossOrigin="anonymous" />
              )}
              <div className="text-center">
                <div className="text-xl font-black text-slate-900 uppercase tracking-wide">
                  {schoolInfo?.name ?? 'EduGrow School'}
                </div>
                {schoolInfo?.address && (
                  <div className="text-[10px] font-bold text-slate-500 mt-0.5">{schoolInfo.address}</div>
                )}
                <div className="text-sm font-black mt-2 uppercase tracking-widest" style={{ color: accent }}>
                  Academic Marksheet
                </div>
              </div>
            </div>

            {/* Student details grid */}
            <div className="grid grid-cols-2 gap-1.5 text-xs font-bold text-slate-700 mb-4 border border-slate-200 rounded-xl p-3">
              <div><span className="text-slate-400">Name: </span>{student.name}</div>
              <div><span className="text-slate-400">Adm. No: </span>{student.admissionNo}</div>
              <div><span className="text-slate-400">Class: </span>{student.className}-{student.section}</div>
              <div><span className="text-slate-400">Roll No: </span>{student.rollNo || '—'}</div>
              <div><span className="text-slate-400">Father: </span>{student.fatherName || '—'}</div>
              <div><span className="text-slate-400">Exam: </span>{examTitle}</div>
            </div>

            {/* Subject-wise results table */}
            <table className="w-full border-collapse text-xs mb-4">
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th className="text-left px-3 py-2 font-black">Subject</th>
                  <th className="text-center px-3 py-2 font-black">Max</th>
                  <th className="text-center px-3 py-2 font-black">Obtained</th>
                  <th className="text-center px-3 py-2 font-black">Grade</th>
                  <th className="text-center px-3 py-2 font-black">Result</th>
                </tr>
              </thead>
              <tbody>
                {subjectRows.map((row, i) => {
                  const obt = row.result?.obtained_marks ?? null;
                  const max = row.exam.max_marks ?? 0;
                  const grade = obt !== null ? (row.result?.grade ?? gradeLabel(obt, max)) : '—';
                  const subPass = obt !== null ? obt >= max * 0.33 : null;
                  return (
                    <tr key={i} className={i % 2 === 0 ? 'bg-slate-50' : 'bg-white'}>
                      <td className="px-3 py-2 font-bold border-b border-slate-100">{row.exam.subject}</td>
                      <td className="px-3 py-2 text-center border-b border-slate-100">{max}</td>
                      <td className="px-3 py-2 text-center font-black border-b border-slate-100">
                        {obt !== null ? obt : 'AB'}
                      </td>
                      <td className="px-3 py-2 text-center font-black border-b border-slate-100">{grade}</td>
                      <td className={`px-3 py-2 text-center font-black border-b border-slate-100 ${
                        subPass === true ? 'text-emerald-600' : subPass === false ? 'text-rose-600' : 'text-slate-400'
                      }`}>
                        {subPass === true ? 'P' : subPass === false ? 'F' : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-black">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-center">{totalMax}</td>
                  <td className="px-3 py-2 text-center">{totalObtained}</td>
                  <td className="px-3 py-2 text-center">{gradeLabel(totalObtained, totalMax)}</td>
                  <td className={`px-3 py-2 text-center ${passed ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {passed ? 'PASS' : 'FAIL'}
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* Percentage badge */}
            <div className={`text-center py-3 rounded-xl font-black text-base uppercase tracking-widest border-2 ${
              passed ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-rose-50 border-rose-300 text-rose-700'
            }`}>
              {passed ? '✓ PASS' : '✗ FAIL'} — {pct}% ({totalObtained}/{totalMax})
            </div>

            {/* Signature strip — Principal slot embeds the uploaded
                signature image when configured. */}
            <div className="grid grid-cols-3 gap-4 mt-8 pt-4 border-t border-slate-200">
              {(['Class Teacher', 'Parent / Guardian', 'Principal'] as const).map(label => (
                <div key={label} className="text-center">
                  <div className="h-10 mb-1 flex items-end justify-center">
                    {label === 'Principal' && signatureUrl && (
                      <img src={signatureUrl} alt="Principal signature" className="max-h-10 max-w-full object-contain" crossOrigin="anonymous" />
                    )}
                  </div>
                  <div className="border-t-2 border-slate-300 pt-2 text-[10px] font-bold text-slate-400">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="w-full flex flex-col">
        <ToolHeader title="Marksheet" onBackPress={() => setView('DASHBOARD')} />
        <div className="p-5 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
            <Award size={20} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-black text-amber-900 text-sm">Academic Marksheet Generator</p>
              <p className="text-xs font-bold text-amber-700 mt-0.5">
                Student → Exam series → Subject-wise marksheet with grades
              </p>
            </div>
          </div>

          <StudentPicker value={picked} onChange={v => { setPicked(v); setExamTitle(''); setSubjectRows([]); }} />

          {student && (
            <>
              <SelectedCard student={student} />

              <div>
                <label className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2 block">
                  Exam Series {loadingExams && <span className="text-[9px] text-slate-300">Loading…</span>}
                </label>
                <select value={examTitle} onChange={e => setExamTitle(e.target.value)}
                  className="w-full border border-slate-200 bg-white rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-amber-400">
                  <option value="">Exam series chunein (e.g. Half Yearly, Annual)…</option>
                  {examTitleOptions.map(e => (
                    <option key={e.id} value={e.title}>
                      {e.title} · {e.test_type}
                    </option>
                  ))}
                </select>
                {!loadingExams && examTitleOptions.length === 0 && (
                  <p className="text-[9px] font-bold text-rose-500 mt-1">
                    {student.className} ke liye koi completed exam nahi mila
                  </p>
                )}
              </div>
            </>
          )}

          {/* Preview rows */}
          {examTitle && !loadingRes && subjectRows.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-4 py-2 border-b border-slate-50 flex items-center justify-between">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Preview</p>
                <span className={`text-xs font-black ${pct >= 33 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {pct}% · {passed ? 'PASS' : 'FAIL'}
                </span>
              </div>
              {subjectRows.map((row, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2 border-b border-slate-50 last:border-0">
                  <span className="text-xs font-bold text-slate-700">{row.exam.subject}</span>
                  <span className="text-xs font-black text-slate-900">
                    {row.result !== null ? `${row.result.obtained_marks}/${row.exam.max_marks}` : 'AB'}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between px-4 py-2 bg-slate-50">
                <span className="text-xs font-black text-slate-700">Total</span>
                <span className="text-xs font-black text-slate-900">{totalObtained}/{totalMax}</span>
              </div>
              <div className="px-4 py-2 bg-slate-50">
                <div className="bg-slate-200 rounded-full h-1.5">
                  <div className={`h-1.5 rounded-full ${passed ? 'bg-emerald-500' : 'bg-rose-400'}`}
                    style={{ width: `${pct}%` }} />
                </div>
              </div>
            </div>
          )}

          {examTitle && loadingRes && (
            <div className="text-center text-xs font-bold text-slate-400 py-4">Results load ho rahe hain…</div>
          )}

          {examTitle && !loadingRes && subjectRows.length === 0 && (
            <p className="text-[10px] font-bold text-amber-600 text-center">
              Is exam series ke results nahi mile is student ke liye
            </p>
          )}

          {student && examTitle && subjectRows.length > 0 && (
            <button
              onClick={() => setShowPrint(true)}
              disabled={loadingRes}
              className="w-full flex items-center justify-center gap-2 bg-amber-600 text-white font-black text-sm uppercase py-4 rounded-2xl active:scale-95 transition-transform shadow-md disabled:opacity-50">
              <FileText size={16} /> Generate Marksheet ({subjectRows.length} subjects)
            </button>
          )}
        </div>
      </div>
    );
  };

  // ── ADMIT CARD TOOL — single + bulk-by-class ───────────────────────────────
  const DEFAULT_INSTRUCTIONS = [
    'Yeh admit card exam hall mein saath lana ZAROOR hai.',
    'Pehchan patra (school ID card) bhi saath layen.',
    '10 minute pehle aayein aur apni seat pe baith jayen.',
    'Mobile phone aur electronic device banned hain.',
  ];

  const AdmitCardTool = () => {
    const [mode, setMode]          = useState<'SINGLE' | 'BULK'>('BULK');
    // examSource = SCHEDULED uses a real test_schedules row; CUSTOM lets the
    // principal type exam details ad-hoc without creating a scheduled exam.
    const [examSource, setExamSource] = useState<'SCHEDULED' | 'CUSTOM'>('SCHEDULED');
    const [picked, setPicked]      = useState('');
    const [pickedClass, setPickedClass] = useState('');
    const [examId, setExamId]      = useState('');
    const [exams, setExams]        = useState<any[]>([]);
    const [loadingExams, setLoadingExams] = useState(false);
    const [showPrint, setShowPrint] = useState(false);
    const [downloadingPdf, setDownloadingPdf] = useState(false);
    // Editable instructions — comma/newline separated. Persists per-tool-session.
    const [instructions, setInstructions] = useState<string>(DEFAULT_INSTRUCTIONS.join('\n'));
    // Custom exam form (used when examSource = CUSTOM)
    const [customExam, setCustomExam] = useState({
      title: '', subject: '', testType: 'NORMAL',
      scheduledDate: '', duration: 60, maxMarks: 100,
    });
    // Per-card refs for bulk PDF generation
    const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
    const { showToast } = useUIStore();

    const student = students.find(s => s.id === picked) ?? null;

    const handleDownloadAllPdf = async () => {
      setDownloadingPdf(true);
      try {
        // Yield one paint frame so any layout pending from the click
        // (sticky toolbar, button state) settles BEFORE html2canvas walks
        // the DOM. Earlier the export occasionally captured a half-styled
        // first card on the very first click and the user just saw the
        // PDF "fail to download" with no obvious reason.
        await new Promise(r => requestAnimationFrame(() => r(undefined)));

        const nodes = cardRefs.current.filter((n): n is HTMLDivElement => !!n);
        if (nodes.length === 0) {
          throw new Error('Cards not ready yet — wait a moment and tap Download again.');
        }
        const filename = nodes.length === 1
          ? `admit-card-${printList[0]?.admissionNo ?? 'card'}.pdf`
          : `admit-cards-${(targetClassName ?? 'class').replace(/\s+/g, '-')}-${targetSection ?? ''}.pdf`;
        await downloadNodesAsPdf(nodes, filename);
        showToast(`PDF saved · ${nodes.length} card${nodes.length > 1 ? 's' : ''}`);
      } catch (e) {
        // Surface the real cause in the console so we can diagnose
        // html2canvas/jspdf failures (CORS, OOM, unsupported CSS, etc.).
        console.error('[admit-card] PDF export failed:', e);
        showToast(e instanceof Error ? e.message : 'PDF export failed', 'error');
      } finally {
        setDownloadingPdf(false);
      }
    };

    // Unique class+section pairs from the student roster
    const classes = React.useMemo(() => {
      const set = new Map<string, { className: string; section: string }>();
      for (const s of students) set.set(`${s.className}|${s.section}`, { className: s.className, section: s.section });
      return Array.from(set.entries()).map(([k, v]) => ({ id: k, ...v }))
        .sort((a, b) => `${a.className}-${a.section}`.localeCompare(`${b.className}-${b.section}`));
    }, []);

    const targetClassName = mode === 'SINGLE' ? student?.className : pickedClass.split('|')[0];
    const targetSection   = mode === 'SINGLE' ? student?.section   : pickedClass.split('|')[1];

    useEffect(() => {
      if (!targetClassName || examSource !== 'SCHEDULED') { setExams([]); setExamId(''); return; }
      setLoadingExams(true);
      apiExams.list({ className: targetClassName })
        // Admit cards are only meaningful for upcoming exams — exclude any
        // whose results have already been published (= done/locked).
        .then((list: any[]) => setExams(list.filter(e => !e.results_uploaded)))
        .catch(() => setExams([]))
        .finally(() => setLoadingExams(false));
    }, [targetClassName, examSource]);

    // Resolved exam to render — either the picked scheduled exam or the
    // custom one typed by the principal. Shape matches what the card needs.
    const scheduledExam = exams.find(e => e.id === examId);
    const customExamShape = customExam.title.trim() ? {
      id: 'custom',
      title: customExam.title,
      subject: customExam.subject || '—',
      test_type: customExam.testType,
      scheduled_date: customExam.scheduledDate || null,
      duration: customExam.duration || null,
      max_marks: customExam.maxMarks || null,
    } : null;
    const pickedExam = examSource === 'SCHEDULED' ? scheduledExam : customExamShape;
    const canGenerate = examSource === 'SCHEDULED' ? !!scheduledExam : !!customExamShape && !!targetClassName;

    const cleanInstructions = instructions.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

    // Branding assets — resolved once so the URL is stable across the
    // bulk render (avoid recomputing per card and triggering N image loads
    // for the same asset).
    const accent = schoolInfo?.accentColor || '#9f1239'; // fallback to rose
    const logoUrl = schoolInfo?.logoPath ? schoolInfoService.getAssetUrl(schoolInfo.logoPath) : null;
    const signatureUrl = schoolInfo?.principalSignaturePath ? schoolInfoService.getAssetUrl(schoolInfo.principalSignaturePath) : null;

    // Students to print admit cards for
    const printList: Student[] = mode === 'SINGLE'
      ? (student ? [student] : [])
      : students.filter(s => s.className === targetClassName && s.section === targetSection);

    if (showPrint && pickedExam && printList.length > 0) {
      // Make sure the refs array is the right size for current printList
      cardRefs.current = cardRefs.current.slice(0, printList.length);
      return (
        <div className="w-full flex flex-col">
          {/* Two-row toolbar so on mobile every action is visible. Top row =
              Back + count chip; bottom row = Download + Print, each
              flex-1 so they stay full-width and tap-friendly. Earlier the
              4 buttons crammed onto one row got cut off the right edge on
              phones — the user couldn't see Download PDF and assumed
              "nothing happens, goes back". */}
          <div className="no-print sticky top-0 bg-white px-4 py-3 border-b border-slate-100 z-10 space-y-2">
            <div className="flex items-center gap-2">
              <button onClick={() => setShowPrint(false)}
                className="py-2 px-3 bg-slate-100 text-slate-700 font-black text-xs uppercase rounded-xl">
                ← Back
              </button>
              <span className="py-2 px-3 bg-rose-50 text-rose-700 border border-rose-200 font-black text-[11px] uppercase rounded-xl flex items-center gap-1.5">
                {printList.length} Card{printList.length > 1 ? 's' : ''}
              </span>
              {targetClassName && (
                <span className="py-2 px-3 bg-slate-50 text-slate-600 border border-slate-200 font-black text-[11px] uppercase rounded-xl ml-auto truncate">
                  {targetClassName}{targetSection ? `-${targetSection}` : ''}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={handleDownloadAllPdf} disabled={downloadingPdf}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-60 active:scale-[0.98] transition-transform">
                <Download size={13} /> {downloadingPdf ? 'Saving PDF…' : 'Download PDF'}
              </button>
              <button onClick={() => window.print()}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase rounded-xl flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform">
                <Printer size={13} /> Print
              </button>
            </div>
          </div>

          {/* Printable admit cards — one per page (printable class hides app shell) */}
          <div className="printable bg-white">
            {printList.map((s, idx) => (
              <div key={s.id} className="print-page p-6 font-sans">
                <div ref={el => { cardRefs.current[idx] = el; }}
                  className="border-4 border-double rounded-2xl p-5 max-w-md mx-auto space-y-4"
                  style={{ borderColor: accent }}>
                  <div className="text-center border-b-2 border-slate-200 pb-3 flex items-center gap-3 justify-center">
                    {logoUrl && (
                      <img src={logoUrl} alt="School logo" className="w-12 h-12 object-contain shrink-0" crossOrigin="anonymous" />
                    )}
                    <div className="min-w-0">
                      <div className="text-base font-black text-slate-900 uppercase tracking-wide">
                        {schoolInfo?.name ?? 'EduGrow School'}
                      </div>
                      {schoolInfo?.address && (
                        <div className="text-[10px] font-bold text-slate-500 mt-0.5">{schoolInfo.address}</div>
                      )}
                      <div className="text-sm font-black mt-2 uppercase tracking-widest" style={{ color: accent }}>
                        Admit Card / प्रवेश पत्र
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl p-3 text-center" style={{ backgroundColor: `${accent}15`, border: `1px solid ${accent}40` }}>
                    <div className="text-sm font-black uppercase" style={{ color: accent }}>{pickedExam.title}</div>
                    <div className="text-[10px] font-bold mt-0.5" style={{ color: accent, opacity: 0.85 }}>
                      {pickedExam.test_type} · {pickedExam.subject}
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs font-bold text-slate-700">
                    {[
                      ['Student Name', s.name],
                      ['Admission No.', s.admissionNo],
                      ['Class / Section', `${s.className}-${s.section}`],
                      ['Roll No.', s.rollNo ?? '—'],
                      ["Father's Name", s.fatherName ?? '—'],
                    ].map(([label, val]) => (
                      <div key={label} className="flex items-center gap-2 border-b border-slate-100 pb-1.5">
                        <span className="w-28 text-slate-400 shrink-0">{label}:</span>
                        <span className="font-black text-slate-900">{val}</span>
                      </div>
                    ))}
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5 text-xs font-bold">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Date:</span>
                      <span className="font-black text-slate-900">{pickedExam.scheduled_date ?? '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Duration:</span>
                      <span className="font-black text-slate-900">{pickedExam.duration ? `${pickedExam.duration} min` : '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Max Marks:</span>
                      <span className="font-black text-slate-900">{pickedExam.max_marks ?? '—'}</span>
                    </div>
                  </div>

                  {cleanInstructions.length > 0 && (
                    <div className="text-[10px] font-bold text-slate-600 leading-relaxed border-t border-slate-100 pt-3">
                      <p className="font-black text-slate-800 mb-1">Instructions / निर्देश:</p>
                      <ul className="list-disc list-inside space-y-0.5">
                        {cleanInstructions.map((line, i) => <li key={i}>{line}</li>)}
                      </ul>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-200">
                    <div className="text-center">
                      <div className="h-10 mb-1" />
                      <div className="border-t-2 border-slate-300 pt-2 text-[9px] font-bold text-slate-400 uppercase">Student Signature</div>
                    </div>
                    <div className="text-center">
                      <div className="h-10 mb-1 flex items-end justify-center">
                        {signatureUrl && (
                          <img src={signatureUrl} alt="Principal signature" className="max-h-10 max-w-full object-contain" crossOrigin="anonymous" />
                        )}
                      </div>
                      <div className="border-t-2 border-slate-300 pt-2 text-[9px] font-bold text-slate-400 uppercase">Principal Seal &amp; Sign</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="w-full flex flex-col">
        <ToolHeader title="Admit Card" onBackPress={() => setView('DASHBOARD')} />
        <div className="p-5 space-y-4 lg:max-w-2xl lg:mx-auto lg:w-full">
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3">
            <Ticket size={20} className="text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-black text-rose-900 text-sm">Exam Admit Card Generator</p>
              <p className="text-xs font-bold text-rose-700 mt-0.5">
                Class chunein (poori class ke liye) ya single student — fir exam pick karke ek saath print karein.
              </p>
            </div>
          </div>

          {/* Mode toggle */}
          <div className="flex gap-2 bg-slate-100 p-1 rounded-2xl">
            <button onClick={() => { setMode('BULK'); setPicked(''); setExamId(''); }}
              className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-colors ${mode === 'BULK' ? 'bg-white text-rose-700 shadow-sm' : 'text-slate-500'}`}>
              Bulk by Class
            </button>
            <button onClick={() => { setMode('SINGLE'); setPickedClass(''); setExamId(''); }}
              className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-colors ${mode === 'SINGLE' ? 'bg-white text-rose-700 shadow-sm' : 'text-slate-500'}`}>
              Single Student
            </button>
          </div>

          {/* Selectors */}
          {mode === 'BULK' ? (
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2 block">Select Class</label>
              <select value={pickedClass} onChange={e => { setPickedClass(e.target.value); setExamId(''); }}
                className="w-full border border-slate-200 bg-white rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-rose-400">
                <option value="">Class chunein…</option>
                {classes.map(c => {
                  const count = students.filter(s => s.className === c.className && s.section === c.section).length;
                  return <option key={c.id} value={c.id}>{c.className}-{c.section} · {count} students</option>;
                })}
              </select>
              {pickedClass && printList.length > 0 && (
                <p className="text-[10px] font-bold text-slate-500 mt-1.5">{printList.length} students will get an admit card</p>
              )}
            </div>
          ) : (
            <>
              <StudentPicker value={picked} onChange={v => { setPicked(v); setExamId(''); }} />
              {student && <SelectedCard student={student} />}
            </>
          )}

          {/* Exam source toggle: scheduled exam OR custom-typed details */}
          {targetClassName && (
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2 block">Exam Details</label>
              <div className="flex gap-2 bg-slate-100 p-1 rounded-2xl mb-3">
                <button onClick={() => setExamSource('SCHEDULED')}
                  className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${examSource === 'SCHEDULED' ? 'bg-white text-rose-700 shadow-sm' : 'text-slate-500'}`}>
                  By Scheduled Exam
                </button>
                <button onClick={() => setExamSource('CUSTOM')}
                  className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${examSource === 'CUSTOM' ? 'bg-white text-rose-700 shadow-sm' : 'text-slate-500'}`}>
                  Custom (Type Manually)
                </button>
              </div>

              {examSource === 'SCHEDULED' ? (
                <>
                  <select value={examId} onChange={e => setExamId(e.target.value)}
                    className="w-full border border-slate-200 bg-white rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-rose-400">
                    <option value="">{loadingExams ? 'Loading…' : 'Exam chunein…'}</option>
                    {exams.map(e => (
                      <option key={e.id} value={e.id}>
                        {e.title} · {e.subject} · {e.scheduled_date}
                      </option>
                    ))}
                  </select>
                  {!loadingExams && exams.length === 0 && (
                    <p className="text-[10px] font-bold text-rose-500 mt-1">
                      {targetClassName} ke liye koi scheduled exam nahi mila — Custom mode use karein.
                    </p>
                  )}
                </>
              ) : (
                /* Custom exam form */
                <div className="space-y-2.5 bg-rose-50/30 border border-rose-100 rounded-xl p-3">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 block">Exam Title *</label>
                    <input value={customExam.title} onChange={e => setCustomExam(c => ({ ...c, title: e.target.value }))}
                      placeholder="e.g. Final Examination 2026"
                      className="w-full border border-slate-200 bg-white rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-rose-400"/>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 block">Subject</label>
                      <input value={customExam.subject} onChange={e => setCustomExam(c => ({ ...c, subject: e.target.value }))}
                        placeholder="All / Math / etc."
                        className="w-full border border-slate-200 bg-white rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-rose-400"/>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 block">Type</label>
                      <select value={customExam.testType} onChange={e => setCustomExam(c => ({ ...c, testType: e.target.value }))}
                        className="w-full border border-slate-200 bg-white rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-rose-400">
                        <option value="NORMAL">Normal Test</option>
                        <option value="FINAL">Final Exam</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 block">Date</label>
                      <input type="date" value={customExam.scheduledDate} onChange={e => setCustomExam(c => ({ ...c, scheduledDate: e.target.value }))}
                        className="w-full border border-slate-200 bg-white rounded-xl px-2 py-2.5 font-bold text-sm outline-none focus:border-rose-400"/>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 block">Duration</label>
                      <input type="number" min={1} value={customExam.duration} onChange={e => setCustomExam(c => ({ ...c, duration: +e.target.value }))}
                        className="w-full border border-slate-200 bg-white rounded-xl px-2 py-2.5 font-bold text-sm outline-none focus:border-rose-400"/>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 block">Max Marks</label>
                      <input type="number" min={1} value={customExam.maxMarks} onChange={e => setCustomExam(c => ({ ...c, maxMarks: +e.target.value }))}
                        className="w-full border border-slate-200 bg-white rounded-xl px-2 py-2.5 font-bold text-sm outline-none focus:border-rose-400"/>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Optional extra exam fields — quick override before printing */}
          {pickedExam && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Exam Summary</p>
              <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                <div><span className="text-slate-400">Date:</span> <span className="text-slate-800">{pickedExam.scheduled_date ?? '—'}</span></div>
                <div><span className="text-slate-400">Duration:</span> <span className="text-slate-800">{pickedExam.duration ?? '—'} min</span></div>
                <div><span className="text-slate-400">Max Marks:</span> <span className="text-slate-800">{pickedExam.max_marks ?? '—'}</span></div>
                <div><span className="text-slate-400">Subject:</span> <span className="text-slate-800 truncate">{pickedExam.subject}</span></div>
              </div>
            </div>
          )}

          {/* Editable instructions */}
          {pickedExam && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-black uppercase tracking-widest text-slate-400">Instructions</label>
                <button onClick={() => setInstructions(DEFAULT_INSTRUCTIONS.join('\n'))}
                  className="text-[10px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest">
                  Reset
                </button>
              </div>
              <textarea value={instructions} onChange={e => setInstructions(e.target.value)}
                rows={5}
                placeholder="Ek line per ek instruction…"
                className="w-full border border-slate-200 bg-white rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-rose-400 resize-none"/>
              <p className="text-[10px] font-bold text-slate-400 mt-1">Har line ek bullet ban jayegi. Khali line skip ho jayegi.</p>
            </div>
          )}

          {canGenerate && printList.length > 0 && (
            <button onClick={() => setShowPrint(true)}
              className="w-full flex items-center justify-center gap-2 bg-rose-600 text-white font-black text-sm uppercase py-4 rounded-2xl active:scale-95 hover:bg-rose-700 transition-all shadow-md">
              <Ticket size={16} /> Generate {printList.length === 1 ? 'Admit Card' : `${printList.length} Admit Cards`}
            </button>
          )}
        </div>
      </div>
    );
  };

  // ── GENERIC TOOL (Marksheet / Admit Card) ─────────────────────────────────
  const GenericDocTool = ({
    toolView, title, desc, accentClass, InfoIcon,
  }: {
    toolView: ToolView;
    title: string;
    desc: string;
    accentClass: string;
    InfoIcon: React.ElementType;
  }) => {
    const [picked, setPicked] = useState('');
    const student = students.find(s => s.id === picked);

    return (
      <div className="w-full flex flex-col">
        <ToolHeader title={title} onBackPress={() => setView('DASHBOARD')} />
        <div className="p-5 space-y-4">
          <div className={`${accentClass} rounded-2xl p-4 flex items-start gap-3`}>
            <InfoIcon size={20} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-black text-sm">{title}</p>
              <p className="text-xs font-bold opacity-80 mt-0.5">{desc}</p>
            </div>
          </div>
          <StudentPicker value={picked} onChange={setPicked} />
          {student && <SelectedCard student={student} />}
          {picked && (
            <button className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white font-black text-sm uppercase py-4 rounded-2xl active:scale-95 transition-transform shadow-md">
              <Printer size={16} /> Generate {title}
            </button>
          )}
        </div>
      </div>
    );
  };

  // ── ROUTE TO SUB-VIEWS ────────────────────────────────────────────────────
  if (printStudent) {
    if (!schoolInfo) {
      return (
        <div className="p-8 text-center text-sm font-bold text-slate-500">
          Loading school info…
        </div>
      );
    }
    return (
      <AdmissionFormPrint
        student={printStudent}
        schoolInfo={schoolInfo}
        onClose={() => setPrintStudent(null)}
      />
    );
  }

  // ── BRANDING TOOL — school identity for documents ────────────────────────
  // Logo, principal signature, accent color. All three feed into the printed
  // admit cards / ID cards / marksheets. Empty values fall back to the
  // existing default theme so nothing breaks for schools that haven't set
  // up branding yet.
  const BrandingTool = () => {
    const { showToast } = useUIStore();
    const [draft, setDraft] = useState<SchoolInfo | null>(schoolInfo);
    const [busy, setBusy] = useState<'logo' | 'sig' | 'save' | null>(null);

    React.useEffect(() => { setDraft(schoolInfo); }, []);
    if (!draft) {
      return (
        <div className="w-full flex flex-col">
          <ToolHeader title="Branding" onBackPress={() => setView('DASHBOARD')} />
          <div className="p-5 text-center text-sm font-bold text-slate-400">Loading…</div>
        </div>
      );
    }

    const logoUrl = schoolInfoService.getAssetUrl(draft.logoPath);
    const sigUrl  = schoolInfoService.getAssetUrl(draft.principalSignaturePath);

    const handleUpload = async (file: File, kind: 'logo' | 'sig') => {
      setBusy(kind);
      try {
        const path = kind === 'logo'
          ? await schoolInfoService.uploadLogo(file)
          : await schoolInfoService.uploadPrincipalSignature(file);
        const fresh = await schoolInfoService.save(
          kind === 'logo' ? { logoPath: path } : { principalSignaturePath: path }
        );
        setDraft(fresh);
        setSchoolInfo(fresh);
        showToast(kind === 'logo' ? 'Logo uploaded' : 'Signature uploaded');
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Upload failed', 'error');
      } finally {
        setBusy(null);
      }
    };

    const handleClear = async (kind: 'logo' | 'sig') => {
      try {
        const fresh = await schoolInfoService.save(
          kind === 'logo' ? { logoPath: '' } : { principalSignaturePath: '' }
        );
        setDraft(fresh);
        setSchoolInfo(fresh);
        showToast('Removed');
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Could not remove', 'error');
      }
    };

    const handleAccentSave = async (hex: string) => {
      setBusy('save');
      try {
        const fresh = await schoolInfoService.save({ accentColor: hex });
        setDraft(fresh);
        setSchoolInfo(fresh);
        showToast(hex ? `Accent set to ${hex}` : 'Accent cleared');
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Save failed', 'error');
      } finally {
        setBusy(null);
      }
    };

    return (
      <div className="w-full flex flex-col">
        <ToolHeader title="Branding" onBackPress={() => setView('DASHBOARD')} />
        <div className="p-5 lg:p-6 space-y-5 lg:max-w-2xl lg:mx-auto lg:w-full">
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
            <Sparkles size={18} className="text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-black text-blue-900 text-sm">School Branding</p>
              <p className="text-xs font-bold text-blue-700 mt-0.5">
                Logo, signature, accent color — show up on every printed admit card, ID card, and marksheet.
              </p>
            </div>
          </div>

          {/* Logo card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-slate-700">School Logo</p>
                <p className="text-[10px] font-bold text-slate-400 mt-0.5">PNG / JPG · max 4 MB · square recommended</p>
              </div>
              {draft.logoPath && (
                <button onClick={() => handleClear('logo')}
                  className="text-[10px] font-black text-rose-600 px-2 py-1 hover:bg-rose-50 rounded-md">
                  Remove
                </button>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div className="w-24 h-24 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden bg-slate-50 shrink-0">
                {logoUrl ? (
                  <img src={logoUrl} alt="School logo" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-[10px] font-bold text-slate-400 text-center">No logo</span>
                )}
              </div>
              <div className="flex-1">
                <input id="logo-input" type="file" accept="image/*" className="hidden"
                  onChange={async e => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) await handleUpload(f, 'logo');
                  }} />
                <label htmlFor="logo-input"
                  className={`block w-full py-2.5 text-center bg-blue-600 text-white font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer hover:bg-blue-700 transition-colors ${busy === 'logo' ? 'opacity-60 pointer-events-none' : ''}`}>
                  {busy === 'logo' ? 'Uploading…' : draft.logoPath ? 'Replace Logo' : 'Upload Logo'}
                </label>
              </div>
            </div>
          </div>

          {/* Principal signature card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-slate-700">Principal Signature</p>
                <p className="text-[10px] font-bold text-slate-400 mt-0.5">PNG with transparent background looks cleanest</p>
              </div>
              {draft.principalSignaturePath && (
                <button onClick={() => handleClear('sig')}
                  className="text-[10px] font-black text-rose-600 px-2 py-1 hover:bg-rose-50 rounded-md">
                  Remove
                </button>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div className="w-32 h-16 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden bg-slate-50 shrink-0">
                {sigUrl ? (
                  <img src={sigUrl} alt="Signature" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-[10px] font-bold text-slate-400">No signature</span>
                )}
              </div>
              <div className="flex-1">
                <input id="sig-input" type="file" accept="image/*" className="hidden"
                  onChange={async e => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) await handleUpload(f, 'sig');
                  }} />
                <label htmlFor="sig-input"
                  className={`block w-full py-2.5 text-center bg-blue-600 text-white font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer hover:bg-blue-700 transition-colors ${busy === 'sig' ? 'opacity-60 pointer-events-none' : ''}`}>
                  {busy === 'sig' ? 'Uploading…' : draft.principalSignaturePath ? 'Replace Signature' : 'Upload Signature'}
                </label>
              </div>
            </div>
          </div>

          {/* Accent color card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-slate-700">Accent Color</p>
              <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                Used as the highlight color on document borders and headers.
              </p>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {[
                { name: 'Indigo',  hex: '#4f46e5' },
                { name: 'Blue',    hex: '#2563eb' },
                { name: 'Emerald', hex: '#059669' },
                { name: 'Rose',    hex: '#e11d48' },
                { name: 'Amber',   hex: '#d97706' },
                { name: 'Slate',   hex: '#475569' },
              ].map(opt => {
                const active = (draft.accentColor || '').toLowerCase() === opt.hex;
                return (
                  <button key={opt.hex}
                    onClick={() => handleAccentSave(opt.hex)}
                    disabled={busy === 'save'}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all ${active ? 'border-slate-900' : 'border-slate-200 hover:border-slate-300'}`}>
                    <div className="w-8 h-8 rounded-full" style={{ backgroundColor: opt.hex }} />
                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-wider">{opt.name}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={draft.accentColor || '#4f46e5'}
                onChange={e => setDraft({ ...draft, accentColor: e.target.value })}
                className="w-12 h-10 rounded-lg border border-slate-200 cursor-pointer"
              />
              <input
                type="text" value={draft.accentColor}
                onChange={e => setDraft({ ...draft, accentColor: e.target.value })}
                placeholder="#4f46e5"
                className="flex-1 border border-slate-200 rounded-xl px-3 py-2 font-black text-sm tabular-nums outline-none focus:border-blue-500"
              />
              <button
                onClick={() => handleAccentSave(draft.accentColor)}
                disabled={busy === 'save'}
                className="px-4 py-2 bg-slate-900 text-white font-black text-xs uppercase rounded-xl disabled:opacity-50">
                {busy === 'save' ? '…' : 'Save'}
              </button>
              {draft.accentColor && (
                <button onClick={() => handleAccentSave('')}
                  className="px-3 py-2 bg-slate-100 text-slate-600 font-black text-xs uppercase rounded-xl">
                  Clear
                </button>
              )}
            </div>
          </div>

          <p className="text-center text-[10px] font-bold text-slate-400">
            Branding shows up on Admit Cards, ID Cards, Marksheets, Bonafide, and Transfer Certificates.
          </p>
        </div>
      </div>
    );
  };

  if (view === 'ADMISSION') return <AdmissionFormTool />;
  if (view === 'PAPERS')    return <QuestionPaperGenerator />;
  if (view === 'TC')        return <TCGenerator />;
  if (view === 'IDCARD')    return <IDCardGenerator />;
  if (view === 'BONAFIDE')  return <BonafideGenerator />;
  if (view === 'MARKSHEET') return <MarksheetTool />;
  if (view === 'BRANDING')  return <BrandingTool />;

  if (view === 'ADMIT') return <AdmitCardTool />;

  // ── MAIN DASHBOARD ────────────────────────────────────────────────────────
  // Tools grouped by intent so the dashboard reads top-to-bottom as
  // "Identity & Records" → "Academic" → "AI". Earlier the 7 tools sat in
  // one flat 7-pastel grid — visually busy and impossible to scan. Each
  // group now uses a single accent color; the card itself stays neutral
  // white so the dashboard feels designed, not chaotic.
  type ToolDef = { icon: typeof Sparkles; label: string; desc: string; view: ToolView };
  const TOOL_GROUPS: Array<{ label: string; iconBg: string; rail: string; tools: ToolDef[] }> = [
    {
      label: 'Identity & Records',
      iconBg: 'bg-blue-50 text-blue-600',
      rail:   'bg-blue-500',
      tools: [
        { icon: ClipboardList, label: 'Admission Form', desc: 'New admission form', view: 'ADMISSION' },
        { icon: IdCard,        label: 'ID Cards',       desc: 'Student ID cards',   view: 'IDCARD' },
        { icon: FileCheck,     label: 'Transfer Cert',  desc: 'TC for a student',   view: 'TC' },
        { icon: BadgeCheck,    label: 'Bonafide',       desc: 'Bonafide cert',      view: 'BONAFIDE' },
      ],
    },
    {
      label: 'Academic',
      iconBg: 'bg-emerald-50 text-emerald-600',
      rail:   'bg-emerald-500',
      tools: [
        { icon: Award,  label: 'Marksheets',  desc: 'Subject-wise marksheet',  view: 'MARKSHEET' },
        { icon: Ticket, label: 'Admit Cards', desc: 'Class-wise admit cards', view: 'ADMIT' },
      ],
    },
    {
      label: 'AI & Smart Tools',
      iconBg: 'bg-violet-50 text-violet-600',
      rail:   'bg-violet-500',
      tools: [
        { icon: Sparkles, label: 'AI Question Paper', desc: 'Auto-generate test paper', view: 'PAPERS' },
      ],
    },
    {
      label: 'Setup',
      iconBg: 'bg-amber-50 text-amber-600',
      rail:   'bg-amber-500',
      tools: [
        { icon: Sparkles, label: 'Branding', desc: 'Logo, signature, accent color', view: 'BRANDING' },
      ],
    },
  ];

  return (
    <div className="w-full flex flex-col lg:max-w-6xl lg:mx-auto">

      {/* Sticky header — slim. The bulky dark school banner used to live
          here and ate ~150px of viewport on mobile before the user saw any
          tool. School identity now lives in a one-line strip below. */}
      <div className="sticky top-0 bg-white z-10 border-b border-slate-100">
        <div className="px-4 lg:px-6 py-3 lg:py-4 flex items-center gap-3">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors">
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
          <div className="min-w-0">
            <h2 className="text-lg lg:text-xl font-black text-slate-900 uppercase tracking-tight">Tools</h2>
            {schoolInfo?.name && (
              <p className="text-[10px] font-bold text-slate-400 truncate">{schoolInfo.name}</p>
            )}
          </div>
        </div>
      </div>

      {/* School-info missing nudge — only when nothing's configured. */}
      {!schoolInfo?.name && (
        <div className="mx-4 lg:mx-6 mt-4 bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-start gap-2">
          <span className="text-amber-600 font-black">⚠</span>
          <p className="text-xs font-bold text-amber-700">
            School info not set — go to Settings to add school name & details before generating documents.
          </p>
        </div>
      )}

      {/* Grouped tool sections */}
      <div className="p-4 lg:p-6 space-y-6 lg:space-y-7">
        {TOOL_GROUPS.map(group => (
          <div key={group.label}>
            <div className="flex items-center gap-2 mb-3 px-1">
              <span className={`w-1 h-3.5 rounded-full ${group.rail}`} />
              <h3 className="text-[11px] font-black text-slate-700 uppercase tracking-wider">{group.label}</h3>
              <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md">{group.tools.length}</span>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {group.tools.map(tool => {
                const Icon = tool.icon;
                return (
                  <button key={tool.label} onClick={() => setView(tool.view)}
                    className="flex flex-col items-start gap-3 p-4 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 active:scale-[0.98] hover:shadow-sm transition-all text-left">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${group.iconBg}`}>
                      <Icon size={20} />
                    </div>
                    <div className="min-w-0 w-full">
                      <p className="text-sm font-black text-slate-900 leading-tight">{tool.label}</p>
                      <p className="text-[10px] font-bold text-slate-500 mt-0.5 leading-snug">{tool.desc}</p>
                    </div>
                    <ChevronRight size={14} className="text-slate-400 self-end" />
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-4 text-center">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">More tools coming soon</p>
          <p className="text-[10px] font-bold text-slate-300 mt-0.5">Hall passes, attendance reports & more</p>
        </div>
      </div>
    </div>
  );
};
