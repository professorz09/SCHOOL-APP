import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, Sparkles, FileText, IdCard, Award, Ticket,
  FileCheck, Download, Printer, Eye, ChevronRight,
  GraduationCap, ClipboardList, ScrollText, BadgeCheck,
} from 'lucide-react';
import { studentService } from '@/modules/students/student.service';
import { Student } from '@/shared/types/principal.types';
import { schoolInfoService, type SchoolInfo } from '@/shared/services/schoolInfo.service';
import { AdmissionFormPrint } from '@/shared/components/AdmissionFormPrint';
import { teacherService } from '@/roles/teacher/teacher.service';
import type { GeneratedExamPaper } from '@/shared/types/teacher.types';
import { isGeminiConfigured, GeminiUnavailableError } from '@/shared/lib/gemini';
import { useUIStore } from '@/shared/store/uiStore';
import { apiExams } from '@/shared/lib/apiClient';

type ToolView = 'DASHBOARD' | 'PAPERS' | 'TC' | 'IDCARD' | 'MARKSHEET' | 'ADMIT' | 'BONAFIDE' | 'ADMISSION';

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

    const handlePrint = () => window.print();

    if (paper) {
      return (
        <div className="w-full flex flex-col">
          <ToolHeader title="Question Paper" onBackPress={() => setPaper(null)} />
          <div className="p-5 space-y-4">
            <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 shadow-sm">
              <div className="text-center mb-6 pb-4 border-b-2 border-slate-200">
                <h3 className="text-lg font-black text-slate-900">{paper.request.subject.toUpperCase()}</h3>
                <p className="text-sm font-bold text-slate-500 mt-1">
                  {paper.request.className} | Time: {Math.round(paper.request.duration / 60)} Hours | Total Marks: {paper.request.totalMarks}
                </p>
                <p className="text-[10px] font-bold text-slate-400 mt-1">
                  Generated {new Date(paper.generatedAt).toLocaleString()}
                </p>
              </div>
              <div className="space-y-6">
                {paper.sections.map((section, sIdx) => (
                  <div key={sIdx}>
                    <h4 className="font-black text-sm text-slate-900 mb-1">
                      {section.title} <span className="text-slate-500 font-bold">({section.marks} marks)</span>
                    </h4>
                    {section.instructions && (
                      <p className="text-[11px] font-bold text-slate-500 italic mb-3">{section.instructions}</p>
                    )}
                    <div className="space-y-3">
                      {section.questions.map(q => (
                        <div key={q.no} className="text-sm font-semibold text-slate-700">
                          <div className="flex items-start justify-between gap-3">
                            <span className="flex-1 whitespace-pre-wrap">{q.no}. {q.text}</span>
                            <span className="text-[10px] font-black text-slate-400 shrink-0 mt-0.5">[{q.marks}]</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={handlePrint} className="flex items-center justify-center gap-2 bg-indigo-600 text-white font-black text-sm uppercase py-3 rounded-2xl active:scale-95 transition-transform">
                <Printer size={16} /> Print
              </button>
              <button onClick={() => setPaper(null)} className="flex items-center justify-center gap-2 bg-slate-100 text-slate-700 font-black text-sm uppercase py-3 rounded-2xl active:scale-95 transition-transform">
                <Sparkles size={16} /> Regenerate
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="w-full flex flex-col">
        <ToolHeader title="AI Question Paper" onBackPress={() => setView('DASHBOARD')} />
        <div className="p-5 space-y-4">
          {aiAvailable ? (
            <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 flex items-start gap-3">
              <Sparkles size={20} className="text-purple-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-black text-purple-900 text-sm">AI Powered Generator</p>
                <p className="text-xs font-bold text-purple-700 mt-0.5">Generates real question papers via Gemini AI</p>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
              <Sparkles size={20} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-black text-amber-900 text-sm">AI Not Configured</p>
                <p className="text-xs font-bold text-amber-700 mt-0.5">Set GEMINI_API_KEY in environment to enable real AI generation.</p>
              </div>
            </div>
          )}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Class</label>
              <select value={config.class} onChange={e => setConfig({ ...config, class: e.target.value })}
                className="w-full border border-slate-200 bg-white rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-purple-500">
                {['8', '9', '10', '11', '12'].map(c => <option key={c} value={c}>Class {c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Subject</label>
              <select value={config.subject} onChange={e => setConfig({ ...config, subject: e.target.value })}
                className="w-full border border-slate-200 bg-white rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-purple-500">
                {['Mathematics', 'Science', 'English', 'History', 'Geography', 'Hindi', 'Physics', 'Chemistry', 'Biology'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Total Marks</label>
              <input type="number" value={config.totalMarks}
                onChange={e => setConfig({ ...config, totalMarks: parseInt(e.target.value) || 0 })}
                className="w-full border border-slate-200 bg-white rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-purple-500" />
            </div>
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Topics (optional)</label>
              <textarea value={config.topics} rows={2}
                placeholder="e.g. Quadratic equations, Trigonometry, Coordinate geometry"
                onChange={e => setConfig({ ...config, topics: e.target.value })}
                className="w-full border border-slate-200 bg-white rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-purple-500 resize-none" />
            </div>
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2 block">Difficulty</label>
              <div className="grid grid-cols-3 gap-2">
                {(['EASY', 'MIXED', 'HARD'] as const).map(d => (
                  <button key={d} onClick={() => setConfig({ ...config, difficulty: d })}
                    className={`py-2.5 rounded-xl font-black text-xs uppercase tracking-wide transition-all ${
                      config.difficulty === d ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button onClick={handleGenerate} disabled={isGenerating || !aiAvailable}
            className="w-full flex items-center justify-center gap-2 bg-purple-600 text-white font-black text-sm uppercase py-4 rounded-2xl active:scale-95 transition-transform disabled:opacity-60 shadow-md">
            {isGenerating
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Generating...</>
              : <><Sparkles size={16} /> Generate Paper</>}
          </button>

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
    const student = students.find(s => s.id === picked);

    if (preview && student && schoolInfo) {
      return (
        <div className="w-full flex flex-col">
          <ToolHeader title="Transfer Certificate" onBackPress={() => setPreview(false)} />
          <div className="p-5">
            <div className="bg-white border-2 border-slate-300 rounded-2xl p-6 shadow-sm">
              <div className="text-center border-b-2 border-slate-300 pb-5 mb-5">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">{schoolInfo.name || 'School Name'}</p>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-wide">Transfer Certificate</h3>
                <p className="text-xs font-bold text-slate-400 mt-1">TC No: {student.tcNumber || 'TC-' + new Date().getFullYear() + '-001'}</p>
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
                    <p className="text-xs font-bold text-slate-500">Principal Signature</p>
                    <div className="h-10 w-24 border-t border-slate-400 mt-4" />
                  </div>
                  <p className="text-xs font-bold text-slate-500">Date: {new Date().toLocaleDateString('en-IN')}</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <button className="flex items-center justify-center gap-2 bg-blue-600 text-white font-black text-sm uppercase py-3 rounded-2xl active:scale-95 transition-transform">
                <Printer size={16} /> Print
              </button>
              <button className="flex items-center justify-center gap-2 bg-slate-100 text-slate-700 font-black text-sm uppercase py-3 rounded-2xl active:scale-95 transition-transform">
                <Download size={16} /> Download
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

  // ── ID CARD GENERATOR ─────────────────────────────────────────────────────
  const IDCardGenerator = () => {
    const [picked, setPicked] = useState('');
    const [preview, setPreview] = useState(false);
    const student = students.find(s => s.id === picked);

    if (preview && student && schoolInfo) {
      return (
        <div className="w-full flex flex-col">
          <ToolHeader title="ID Card" onBackPress={() => setPreview(false)} />
          <div className="p-5 space-y-4">
            <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-5 text-white max-w-xs mx-auto shadow-lg">
              <div className="text-center mb-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-white/70">{schoolInfo.name || 'School Name'}</p>
                <p className="text-[8px] font-bold text-white/50 mt-0.5">STUDENT IDENTITY CARD</p>
              </div>
              <div className="flex gap-4 items-start">
                <div className="w-16 h-20 rounded-xl bg-white/20 flex items-center justify-center font-black text-2xl text-white shrink-0">
                  {student.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-black text-base leading-tight">{student.name}</div>
                  <div className="text-[10px] font-bold text-white/70 mt-1">{student.className}-{student.section}</div>
                  <div className="text-[10px] font-bold text-white/70">Roll: {student.rollNo}</div>
                  <div className="text-[10px] font-bold text-white/60 mt-2 font-mono">{student.admissionNo}</div>
                </div>
              </div>
              {student.fatherName && (
                <div className="mt-3 pt-3 border-t border-white/20">
                  <div className="text-[9px] font-bold text-white/50">Father: {student.fatherName}</div>
                  {student.fatherPhone && <div className="text-[9px] font-bold text-white/50">Ph: {student.fatherPhone}</div>}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button className="flex items-center justify-center gap-2 bg-indigo-600 text-white font-black text-sm uppercase py-3 rounded-2xl active:scale-95 transition-transform">
                <Printer size={16} /> Print
              </button>
              <button className="flex items-center justify-center gap-2 bg-slate-100 text-slate-700 font-black text-sm uppercase py-3 rounded-2xl active:scale-95 transition-transform">
                <Download size={16} /> Download
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="w-full flex flex-col">
        <ToolHeader title="ID Cards" onBackPress={() => setView('DASHBOARD')} />
        <div className="p-5 space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-start gap-3">
            <IdCard size={20} className="text-green-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-black text-green-900 text-sm">Student ID Card</p>
              <p className="text-xs font-bold text-green-700 mt-0.5">Generate official ID card for student</p>
            </div>
          </div>
          <StudentPicker value={picked} onChange={setPicked} />
          {student && <SelectedCard student={student} />}
          {picked && (
            <button onClick={() => setPreview(true)}
              className="w-full flex items-center justify-center gap-2 bg-green-600 text-white font-black text-sm uppercase py-4 rounded-2xl active:scale-95 transition-transform shadow-md">
              <Eye size={16} /> Preview ID Card
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
    const student = students.find(s => s.id === picked);

    if (preview && student && schoolInfo) {
      return (
        <div className="w-full flex flex-col">
          <ToolHeader title="Bonafide Certificate" onBackPress={() => setPreview(false)} />
          <div className="p-5">
            <div className="bg-white border-2 border-slate-300 rounded-2xl p-6 shadow-sm">
              <div className="text-center pb-5 mb-5 border-b-2 border-slate-200">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest">{schoolInfo.name || 'School Name'}</p>
                <h3 className="text-xl font-black text-slate-900 mt-1 uppercase tracking-wide">Bonafide Certificate</h3>
              </div>
              <p className="text-sm font-bold text-slate-700 leading-relaxed text-justify">
                This is to certify that <strong>{student.name}</strong>, son/daughter of <strong>{student.fatherName || '___'}</strong>,
                is a bonafide student of this school studying in <strong>{student.className}-{student.section}</strong> during the academic year {new Date().getFullYear()}-{new Date().getFullYear() + 1}.
                {purpose && ` This certificate is being issued for the purpose of ${purpose}.`}
              </p>
              <div className="pt-6 mt-6 border-t-2 border-slate-200 flex items-end justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-500">Principal Signature & Seal</p>
                  <div className="h-10 w-24 border-t border-slate-400 mt-4" />
                </div>
                <p className="text-xs font-bold text-slate-500">Date: {new Date().toLocaleDateString('en-IN')}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <button className="flex items-center justify-center gap-2 bg-indigo-600 text-white font-black text-sm uppercase py-3 rounded-2xl active:scale-95 transition-transform">
                <Printer size={16} /> Print
              </button>
              <button className="flex items-center justify-center gap-2 bg-slate-100 text-slate-700 font-black text-sm uppercase py-3 rounded-2xl active:scale-95 transition-transform">
                <Download size={16} /> Download
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

    const student = students.find(s => s.id === picked) ?? null;

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
          <div className="sticky top-0 bg-white px-4 py-3 border-b border-slate-100 flex gap-2 z-10">
            <button onClick={() => setShowPrint(false)}
              className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-black text-xs uppercase rounded-xl">
              ← Back
            </button>
            <button onClick={() => window.print()}
              className="flex-1 py-2.5 bg-slate-900 text-white font-black text-xs uppercase rounded-xl flex items-center justify-center gap-1.5">
              <Printer size={13} /> Print
            </button>
          </div>

          {/* ── Printable marksheet ── */}
          <div className="p-6 bg-white min-h-screen font-sans">
            {/* School header */}
            <div className="text-center border-b-2 border-slate-800 pb-4 mb-4">
              <div className="text-xl font-black text-slate-900 uppercase tracking-wide">
                {schoolInfo?.name ?? 'EduGrow School'}
              </div>
              {schoolInfo?.address && (
                <div className="text-[10px] font-bold text-slate-500 mt-0.5">{schoolInfo.address}</div>
              )}
              <div className="text-sm font-black text-slate-700 mt-2 uppercase tracking-widest">
                Academic Marksheet
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

            {/* Signature strip */}
            <div className="grid grid-cols-3 gap-4 mt-8 pt-4 border-t border-slate-200">
              {['Class Teacher', 'Parent / Guardian', 'Principal'].map(label => (
                <div key={label} className="text-center">
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

  // ── ADMIT CARD TOOL ───────────────────────────────────────────────────────
  const AdmitCardTool = () => {
    const [picked,      setPicked]      = useState('');
    const [examId,      setExamId]      = useState('');
    const [exams,       setExams]       = useState<any[]>([]);
    const [loadingExams,setLoadingExams]= useState(false);
    const [showPrint,   setShowPrint]   = useState(false);

    const student = students.find(s => s.id === picked) ?? null;

    useEffect(() => {
      if (!student) { setExams([]); setExamId(''); return; }
      setLoadingExams(true);
      apiExams.list({ className: student.className })
        .then((list: any[]) => setExams(list))
        .catch(() => setExams([]))
        .finally(() => setLoadingExams(false));
    }, [student?.id]);

    const pickedExam = exams.find(e => e.id === examId);

    if (showPrint && student && pickedExam) {
      return (
        <div className="w-full flex flex-col">
          <div className="sticky top-0 bg-white px-4 py-3 border-b border-slate-100 flex gap-2 z-10">
            <button onClick={() => setShowPrint(false)}
              className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-black text-xs uppercase rounded-xl">
              ← Back
            </button>
            <button onClick={() => window.print()}
              className="flex-1 py-2.5 bg-rose-600 text-white font-black text-xs uppercase rounded-xl flex items-center justify-center gap-1.5">
              <Printer size={13} /> Print
            </button>
          </div>

          {/* Printable admit card */}
          <div className="p-6 bg-white min-h-screen font-sans">
            {/* Border frame */}
            <div className="border-4 border-double border-slate-800 rounded-2xl p-5 max-w-md mx-auto space-y-4">
              {/* School header */}
              <div className="text-center border-b-2 border-slate-200 pb-3">
                <div className="text-base font-black text-slate-900 uppercase tracking-wide">
                  {schoolInfo?.name ?? 'EduGrow School'}
                </div>
                {schoolInfo?.address && (
                  <div className="text-[10px] font-bold text-slate-500 mt-0.5">{schoolInfo.address}</div>
                )}
                <div className="text-sm font-black text-rose-700 mt-2 uppercase tracking-widest">
                  Admit Card / प्रवेश पत्र
                </div>
              </div>

              {/* Exam info */}
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-center">
                <div className="text-sm font-black text-rose-900 uppercase">{pickedExam.title}</div>
                <div className="text-[10px] font-bold text-rose-600 mt-0.5">
                  {pickedExam.test_type} · {pickedExam.subject}
                </div>
              </div>

              {/* Student info */}
              <div className="space-y-1.5 text-xs font-bold text-slate-700">
                {[
                  ['Student Name', student.name],
                  ['Admission No.', student.admissionNo],
                  ['Class / Section', `${student.className}-${student.section}`],
                  ['Roll No.', student.rollNo ?? '—'],
                  ['Father\'s Name', student.fatherName ?? '—'],
                ].map(([label, val]) => (
                  <div key={label} className="flex items-center gap-2 border-b border-slate-100 pb-1.5">
                    <span className="w-28 text-slate-400 shrink-0">{label}:</span>
                    <span className="font-black text-slate-900">{val}</span>
                  </div>
                ))}
              </div>

              {/* Exam details */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5 text-xs font-bold">
                <div className="flex justify-between">
                  <span className="text-slate-400">Date:</span>
                  <span className="font-black text-slate-900">{pickedExam.scheduled_date ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Duration:</span>
                  <span className="font-black text-slate-900">
                    {pickedExam.duration ? `${pickedExam.duration} min` : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Max Marks:</span>
                  <span className="font-black text-slate-900">{pickedExam.max_marks ?? '—'}</span>
                </div>
              </div>

              {/* Instructions */}
              <div className="text-[10px] font-bold text-slate-600 leading-relaxed border-t border-slate-100 pt-3">
                <p className="font-black text-slate-800 mb-1">Instructions / निर्देश:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Yeh admit card exam hall mein saath lana ZAROOR hai.</li>
                  <li>Pehchan patra (school ID card) bhi saath layen.</li>
                  <li>10 minute pehle aayein aur apni seat pe baith jayen.</li>
                  <li>Mobile phone aur electronic device banned hain.</li>
                </ul>
              </div>

              {/* Signature strip */}
              <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-200">
                <div className="text-center">
                  <div className="border-t-2 border-slate-300 pt-2 text-[9px] font-bold text-slate-400 uppercase">
                    Student Signature
                  </div>
                </div>
                <div className="text-center">
                  <div className="border-t-2 border-slate-300 pt-2 text-[9px] font-bold text-slate-400 uppercase">
                    Principal Seal &amp; Sign
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="w-full flex flex-col">
        <ToolHeader title="Admit Card" onBackPress={() => setView('DASHBOARD')} />
        <div className="p-5 space-y-4">
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3">
            <Ticket size={20} className="text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-black text-rose-900 text-sm">Exam Admit Card Generator</p>
              <p className="text-xs font-bold text-rose-700 mt-0.5">
                Student chunein → Exam chunein → Admit card print karein
              </p>
            </div>
          </div>

          <StudentPicker value={picked} onChange={v => { setPicked(v); setExamId(''); }} />

          {student && (
            <>
              <SelectedCard student={student} />
              <div>
                <label className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2 block">
                  Select Exam {loadingExams && <span className="text-[9px] text-slate-300">Loading…</span>}
                </label>
                <select value={examId} onChange={e => setExamId(e.target.value)}
                  className="w-full border border-slate-200 bg-white rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-rose-400">
                  <option value="">Exam chunein…</option>
                  {exams.map(e => (
                    <option key={e.id} value={e.id}>
                      {e.title} · {e.subject} · {e.scheduled_date}
                    </option>
                  ))}
                </select>
                {!loadingExams && exams.length === 0 && (
                  <p className="text-[9px] font-bold text-rose-500 mt-1">
                    {student.className} ke liye koi exam nahi mila
                  </p>
                )}
              </div>
            </>
          )}

          {student && examId && (
            <button
              onClick={() => setShowPrint(true)}
              className="w-full flex items-center justify-center gap-2 bg-rose-600 text-white font-black text-sm uppercase py-4 rounded-2xl active:scale-95 transition-transform shadow-md">
              <Ticket size={16} /> Generate Admit Card
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

  if (view === 'ADMISSION') return <AdmissionFormTool />;
  if (view === 'PAPERS')    return <QuestionPaperGenerator />;
  if (view === 'TC')        return <TCGenerator />;
  if (view === 'IDCARD')    return <IDCardGenerator />;
  if (view === 'BONAFIDE')  return <BonafideGenerator />;
  if (view === 'MARKSHEET') return <MarksheetTool />;

  if (view === 'ADMIT') return <AdmitCardTool />;

  // ── MAIN DASHBOARD ────────────────────────────────────────────────────────
  const TOOLS = [
    {
      icon: ClipboardList,
      label: 'Admission Form',
      desc: 'Generate & print admission form',
      view: 'ADMISSION' as ToolView,
      card: 'bg-teal-50 border-teal-200',
      icon_: 'text-teal-600 bg-teal-100',
    },
    {
      icon: FileCheck,
      label: 'Transfer Cert',
      desc: 'Generate TC for a student',
      view: 'TC' as ToolView,
      card: 'bg-blue-50 border-blue-200',
      icon_: 'text-blue-600 bg-blue-100',
    },
    {
      icon: IdCard,
      label: 'ID Cards',
      desc: 'Print official ID cards',
      view: 'IDCARD' as ToolView,
      card: 'bg-green-50 border-green-200',
      icon_: 'text-green-600 bg-green-100',
    },
    {
      icon: Award,
      label: 'Marksheets',
      desc: 'Generate academic marksheets',
      view: 'MARKSHEET' as ToolView,
      card: 'bg-amber-50 border-amber-200',
      icon_: 'text-amber-600 bg-amber-100',
    },
    {
      icon: Ticket,
      label: 'Admit Cards',
      desc: 'Generate exam admit cards',
      view: 'ADMIT' as ToolView,
      card: 'bg-rose-50 border-rose-200',
      icon_: 'text-rose-600 bg-rose-100',
    },
    {
      icon: BadgeCheck,
      label: 'Bonafide',
      desc: 'Issue bonafide certificates',
      view: 'BONAFIDE' as ToolView,
      card: 'bg-indigo-50 border-indigo-200',
      icon_: 'text-indigo-600 bg-indigo-100',
    },
    {
      icon: Sparkles,
      label: 'AI Papers',
      desc: 'AI question paper generator',
      view: 'PAPERS' as ToolView,
      card: 'bg-purple-50 border-purple-200',
      icon_: 'text-purple-600 bg-purple-100',
    },
  ];

  return (
    <div className="w-full flex flex-col">

      {/* Sticky header + school info */}
      <div className="sticky top-0 bg-white z-10 border-b border-slate-100 shadow-sm">
        <div className="px-4 pt-4 pb-3 flex items-center gap-3">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full">
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Tools & Generators</h2>
        </div>

        {/* School info banner */}
        {schoolInfo?.name ? (
          <div className="mx-4 mb-4 bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-4 text-white">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                <GraduationCap size={22} className="text-white/80" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-black text-sm leading-snug text-white">{schoolInfo.name}</h3>
                {schoolInfo.address && (
                  <p className="text-[10px] font-medium text-white/60 mt-1 leading-snug">
                    {schoolInfo.address}{schoolInfo.city ? `, ${schoolInfo.city}` : ''}
                    {schoolInfo.state ? `, ${schoolInfo.state}` : ''}
                  </p>
                )}
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                  {schoolInfo.phone && (
                    <span className="text-[10px] font-bold text-white/50">📞 {schoolInfo.phone}</span>
                  )}
                  {schoolInfo.email && (
                    <span className="text-[10px] font-bold text-white/50">✉ {schoolInfo.email}</span>
                  )}
                  {schoolInfo.affiliationBoard && (
                    <span className="text-[10px] font-bold text-white/40">{schoolInfo.affiliationBoard}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-4 mb-4 bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-start gap-2">
            <span className="text-amber-500 text-sm">⚠</span>
            <p className="text-xs font-bold text-amber-700">
              School info not set — go to Settings to add your school name and details.
            </p>
          </div>
        )}
      </div>

      {/* Tool cards grid */}
      <div className="p-4 space-y-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Document Tools</p>

        <div className="grid grid-cols-2 gap-3">
          {TOOLS.map(tool => {
            const Icon = tool.icon;
            return (
              <button key={tool.label} onClick={() => setView(tool.view)}
                className={`flex flex-col items-start gap-3 p-4 rounded-2xl border-2 active:scale-95 transition-all ${tool.card}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tool.icon_}`}>
                  <Icon size={20} />
                </div>
                <div className="min-w-0 w-full">
                  <p className="text-xs font-black text-slate-900 leading-tight">{tool.label}</p>
                  <p className="text-[9px] font-bold text-slate-500 mt-0.5 leading-snug">{tool.desc}</p>
                </div>
                <div className="self-end">
                  <ChevronRight size={14} className="text-slate-400" />
                </div>
              </button>
            );
          })}
        </div>

        <div className="bg-slate-100 rounded-2xl p-3 text-center mt-2">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">More tools coming soon</p>
          <p className="text-[9px] font-bold text-slate-300 mt-0.5">Hall passes, attendance reports & more</p>
        </div>
      </div>
    </div>
  );
};
