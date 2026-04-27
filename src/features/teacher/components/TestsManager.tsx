import React, { useEffect, useState } from 'react';
import { ArrowLeft, Plus, ClipboardList, Calendar, Clock, Upload, CheckCircle, ChevronRight, BookOpen, Trash2 } from 'lucide-react';
import { teacherService } from '../../../services/teacher.service';
import { TestSchedule, TestType, TeacherClass, FinalExamSchedule, FinalExamSubject } from '../../../types/teacher.types';
import { useUIStore } from '../../../store/uiStore';

type View = 'LIST' | 'CREATE_NORMAL' | 'CREATE_FINAL' | 'UPLOAD_NORMAL' | 'UPLOAD_FINAL';
type ListTab = 'REGULAR' | 'FINAL';

const NORMAL_TYPES: TestType[] = ['UNIT_TEST', 'MID_TERM', 'QUIZ', 'PRACTICAL'];

const typeColor = (t: string): string => {
  const map: Record<string, string> = {
    UNIT_TEST: 'bg-blue-50 text-blue-700 border-blue-100',
    MID_TERM:  'bg-violet-50 text-violet-700 border-violet-100',
    FINAL:     'bg-rose-50 text-rose-700 border-rose-100',
    QUIZ:      'bg-emerald-50 text-emerald-700 border-emerald-100',
    PRACTICAL: 'bg-amber-50 text-amber-700 border-amber-100',
  };
  return map[t] ?? 'bg-slate-50 text-slate-600 border-slate-100';
};

const typeLabel = (t: string): string => {
  const map: Record<string, string> = {
    UNIT_TEST: 'Unit Test', MID_TERM: 'Mid Term', FINAL: 'Final Exam',
    QUIZ: 'Quiz', PRACTICAL: 'Practical',
  };
  return map[t] ?? t;
};

interface StudentRow { studentId: string; name: string; rollNo: string; marks: string; note: string; }
interface FinalStudentRow { studentId: string; name: string; rollNo: string; subjectMarks: Record<string, string>; note: string; }

const DEFAULT_SUBJECTS: FinalExamSubject[] = [
  { subject: 'Mathematics',   maxMarks: 100, teacherName: 'Aarti Desai' },
  { subject: 'Science',       maxMarks: 100, teacherName: 'Sanjay Mehta' },
  { subject: 'English',       maxMarks: 100, teacherName: 'Priya Singh' },
  { subject: 'Hindi',         maxMarks: 100, teacherName: 'Meera Jha' },
  { subject: 'Social Studies',maxMarks: 100, teacherName: 'Rao Kumar' },
];

interface Props { onBack: () => void; }

export const TestsManager: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const [view, setView]       = useState<View>('LIST');
  const [listTab, setListTab] = useState<ListTab>('REGULAR');
  const [tests, setTests]     = useState<TestSchedule[]>([]);
  const [finalExams, setFinalExams] = useState<FinalExamSchedule[]>([]);
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [isBusy, setIsBusy]   = useState(false);

  // Normal create form
  const [nForm, setNForm] = useState({
    classId: 'tc1', className: 'Class 10', section: 'A', subject: 'Mathematics',
    testType: 'UNIT_TEST' as TestType, title: '', scheduledDate: '', duration: 60, maxMarks: 25, syllabus: '',
  });

  // Final exam create form
  const [fForm, setFForm] = useState({
    classId: 'tc1', className: 'Class 10', section: 'A',
    title: '', description: '', scheduledDate: '', duration: 180,
  });
  const [fSubjects, setFSubjects] = useState<FinalExamSubject[]>(DEFAULT_SUBJECTS);

  // Normal upload state
  const [uploadTest, setUploadTest]   = useState<TestSchedule | null>(null);
  const [uploadDesc, setUploadDesc]   = useState('');
  const [stuRows, setStuRows]         = useState<StudentRow[]>([]);

  // Final exam upload state
  const [uploadFinal, setUploadFinal]           = useState<FinalExamSchedule | null>(null);
  const [finalStuRows, setFinalStuRows]         = useState<FinalStudentRow[]>([]);
  const [expandedFinalStu, setExpandedFinalStu] = useState<string | null>(null);

  useEffect(() => {
    teacherService.getTests().then(setTests);
    teacherService.getFinalExams().then(setFinalExams);
    teacherService.getClasses().then(setClasses);
  }, []);

  // ── Normal create ──
  const handleCreateNormal = async () => {
    if (!nForm.title || !nForm.scheduledDate) { showToast('Title and date required', 'error'); return; }
    setIsBusy(true);
    try {
      const t = await teacherService.createTest(nForm);
      setTests(p => [t, ...p]);
      showToast(`${typeLabel(nForm.testType)} scheduled`);
      setNForm({ classId: 'tc1', className: 'Class 10', section: 'A', subject: 'Mathematics', testType: 'UNIT_TEST', title: '', scheduledDate: '', duration: 60, maxMarks: 25, syllabus: '' });
      setView('LIST');
    } finally { setIsBusy(false); }
  };

  // ── Final exam create ──
  const handleCreateFinal = async () => {
    if (!fForm.title || !fForm.scheduledDate) { showToast('Title and date required', 'error'); return; }
    if (fSubjects.length === 0) { showToast('Add at least one subject', 'error'); return; }
    setIsBusy(true);
    try {
      const cls = classes.find(c => c.id === fForm.classId)!;
      const fe = await teacherService.createFinalExam({
        classId: fForm.classId, className: cls.className, section: cls.section,
        title: fForm.title, description: fForm.description,
        scheduledDate: fForm.scheduledDate, duration: fForm.duration,
        subjects: fSubjects,
      });
      setFinalExams(p => [fe, ...p]);
      showToast('Final Exam scheduled');
      setFForm({ classId: 'tc1', className: 'Class 10', section: 'A', title: '', description: '', scheduledDate: '', duration: 180 });
      setFSubjects(DEFAULT_SUBJECTS);
      setView('LIST'); setListTab('FINAL');
    } finally { setIsBusy(false); }
  };

  // ── Open normal upload ──
  const openUploadNormal = (test: TestSchedule) => {
    const cls = classes.find(c => c.id === test.classId);
    setStuRows((cls?.students ?? []).map(s => ({ studentId: s.id, name: s.name, rollNo: s.rollNo, marks: '', note: '' })));
    setUploadTest(test); setUploadDesc(''); setView('UPLOAD_NORMAL');
  };

  // ── Normal publish ──
  const handlePublishNormal = async () => {
    if (!uploadTest) return;
    if (stuRows.some(r => r.marks === '' || +r.marks < 0 || +r.marks > uploadTest.maxMarks)) {
      showToast(`Marks must be 0–${uploadTest.maxMarks} for all students`, 'error'); return;
    }
    const cls = classes.find(c => c.id === uploadTest.classId);
    setIsBusy(true);
    try {
      await teacherService.publishResults({
        testId: uploadTest.id, examName: uploadTest.title, description: uploadDesc,
        testType: uploadTest.testType, subject: uploadTest.subject,
        teacherName: 'Aarti Desai', date: uploadTest.scheduledDate,
        maxMarks: uploadTest.maxMarks,
        studentResults: stuRows.map(r => ({ studentId: r.studentId, obtainedMarks: +r.marks, note: r.note })),
        allStudents: cls?.students.map(s => ({ id: s.id, name: s.name, rollNo: s.rollNo })) ?? [],
      });
      setTests(p => p.map(t => t.id === uploadTest.id ? { ...t, resultsUploaded: true } : t));
      showToast('Results published! Students can see their results.');
      setView('LIST');
    } finally { setIsBusy(false); }
  };

  // ── Open final upload ──
  const openUploadFinal = (fe: FinalExamSchedule) => {
    const cls = classes.find(c => c.id === fe.classId);
    const students = cls?.students ?? [];
    const initMarks: Record<string, string> = {};
    fe.subjects.forEach(s => { initMarks[s.subject] = ''; });
    setFinalStuRows(students.map(s => ({ studentId: s.id, name: s.name, rollNo: s.rollNo, subjectMarks: { ...initMarks }, note: '' })));
    setUploadFinal(fe);
    setExpandedFinalStu(students[0]?.id ?? null);
    setView('UPLOAD_FINAL');
  };

  // ── Final exam publish ──
  const handlePublishFinal = async () => {
    if (!uploadFinal) return;
    for (const subj of uploadFinal.subjects) {
      if (finalStuRows.some(r => r.subjectMarks[subj.subject] === '' || +r.subjectMarks[subj.subject] < 0 || +r.subjectMarks[subj.subject] > subj.maxMarks)) {
        showToast(`Fill valid marks for ${subj.subject} for all students`, 'error'); return;
      }
    }
    setIsBusy(true);
    try {
      await teacherService.publishFinalExamResults({
        finalExamId: uploadFinal.id, examName: uploadFinal.title,
        description: uploadFinal.description, date: uploadFinal.scheduledDate,
        subjects: uploadFinal.subjects,
        studentResults: finalStuRows.map(r => ({
          studentId: r.studentId,
          subjectMarks: Object.fromEntries(Object.entries(r.subjectMarks).map(([k, v]) => [k, +v])),
          note: r.note,
        })),
      });
      setFinalExams(p => p.map(fe => fe.id === uploadFinal.id ? { ...fe, resultsUploaded: true } : fe));
      showToast('Final Exam results published!');
      setView('LIST'); setListTab('FINAL');
    } finally { setIsBusy(false); }
  };

  const updateStuRow = (idx: number, f: 'marks' | 'note', v: string) =>
    setStuRows(p => p.map((r, i) => i === idx ? { ...r, [f]: v } : r));

  const updateFinalStuMark = (stuId: string, subject: string, v: string) =>
    setFinalStuRows(p => p.map(r => r.studentId === stuId ? { ...r, subjectMarks: { ...r.subjectMarks, [subject]: v } } : r));

  const updateFinalStuNote = (stuId: string, v: string) =>
    setFinalStuRows(p => p.map(r => r.studentId === stuId ? { ...r, note: v } : r));

  const updateFSubject = (idx: number, field: keyof FinalExamSubject, val: string | number) =>
    setFSubjects(p => p.map((s, i) => i === idx ? { ...s, [field]: val } : s));

  const header = (title: string, back: () => void, action?: React.ReactNode) => (
    <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
      <div className="flex items-center gap-3">
        <button onClick={back} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20} /></button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">{title}</h2>
      </div>
      {action}
    </div>
  );

  /* ══ UPLOAD NORMAL ══════════════════════════════════════════════ */
  if (view === 'UPLOAD_NORMAL' && uploadTest) return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {header('Upload Results', () => setView('LIST'))}
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase border ${typeColor(uploadTest.testType)}`}>{typeLabel(uploadTest.testType)}</span>
            <span className="text-[10px] font-bold text-slate-400">{uploadTest.className}-{uploadTest.section} · {uploadTest.subject}</span>
          </div>
          <div className="font-black text-slate-900">{uploadTest.title}</div>
          <div className="flex gap-4 text-[10px] font-bold text-slate-500">
            <span>📅 {uploadTest.scheduledDate}</span><span>⏱ {uploadTest.duration} min</span><span>📊 Max {uploadTest.maxMarks}</span>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Exam Description <span className="normal-case font-medium text-slate-400">(students will see this)</span></label>
            <textarea value={uploadDesc} onChange={e => setUploadDesc(e.target.value)} rows={2}
              placeholder="e.g. Covered chapters 3–5, algebra and trigonometry…"
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-medium text-sm outline-none focus:border-indigo-400 resize-none" />
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-50 flex justify-between">
            <span className="font-black text-slate-800 text-sm">Student Marks</span>
            <span className="text-[10px] font-bold text-slate-400">{stuRows.length} students</span>
          </div>
          <div className="divide-y divide-slate-50">
            {stuRows.map((row, idx) => {
              const m = row.marks === '' ? null : +row.marks;
              const pct = m !== null ? Math.round((m / uploadTest.maxMarks) * 100) : null;
              return (
                <div key={row.studentId} className="px-4 py-3">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-7 h-7 bg-slate-100 rounded-full flex items-center justify-center shrink-0 text-[10px] font-black text-slate-500">{row.rollNo}</div>
                    <div className="flex-1 font-bold text-slate-800 text-sm">{row.name}</div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input type="number" min={0} max={uploadTest.maxMarks} value={row.marks}
                        onChange={e => updateStuRow(idx, 'marks', e.target.value)} placeholder="—"
                        className="w-14 border border-slate-200 bg-slate-50 rounded-xl px-2 py-1.5 text-center font-black text-sm outline-none focus:border-indigo-400" />
                      <span className="text-[10px] font-bold text-slate-400">/{uploadTest.maxMarks}</span>
                      {pct !== null && <span className={`text-[10px] font-black w-9 text-right ${pct >= 75 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-rose-500'}`}>{pct}%</span>}
                    </div>
                  </div>
                  <input type="text" value={row.note} onChange={e => updateStuRow(idx, 'note', e.target.value)}
                    placeholder="Note for student (optional)…"
                    className="w-full border border-slate-100 bg-slate-50 rounded-xl px-3 py-2 text-[11px] font-medium outline-none focus:border-indigo-300 placeholder:text-slate-300" />
                </div>
              );
            })}
          </div>
        </div>
        <button onClick={handlePublishNormal} disabled={isBusy || stuRows.some(r => r.marks === '')}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-50">
          {isBusy ? 'Publishing…' : <><CheckCircle size={16}/> Publish Results</>}
        </button>
        {stuRows.some(r => r.marks === '') && <p className="text-center text-[10px] font-bold text-slate-400">Fill marks for all students to publish</p>}
      </div>
    </div>
  );

  /* ══ UPLOAD FINAL EXAM ══════════════════════════════════════════ */
  if (view === 'UPLOAD_FINAL' && uploadFinal) {
    const totalMax = uploadFinal.subjects.reduce((a, s) => a + s.maxMarks, 0);
    const allFilled = finalStuRows.every(r =>
      uploadFinal.subjects.every(s => r.subjectMarks[s.subject] !== '')
    );
    return (
      <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        {header('Final Exam Results', () => setView('LIST'))}
        <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">
          {/* Exam info */}
          <div className="bg-[#0d1b3e] rounded-2xl p-4 text-white">
            <span className="text-[9px] font-black uppercase tracking-widest text-rose-300 bg-rose-900/40 px-2 py-0.5 rounded-full border border-rose-800/40">Final Exam</span>
            <div className="font-black text-white text-base mt-2">{uploadFinal.title}</div>
            <div className="flex gap-4 mt-1 text-[10px] font-bold text-blue-300">
              <span>📅 {uploadFinal.scheduledDate}</span><span>⏱ {uploadFinal.duration} min</span>
              <span>📊 Total {totalMax} marks</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {uploadFinal.subjects.map(s => (
                <span key={s.subject} className="text-[9px] font-black bg-white/10 text-blue-200 px-2 py-0.5 rounded-full">{s.subject} /{s.maxMarks}</span>
              ))}
            </div>
          </div>
          {/* Per-student cards */}
          <div className="space-y-3">
            {finalStuRows.map(row => {
              const total = uploadFinal.subjects.reduce((a, s) => {
                const m = row.subjectMarks[s.subject];
                return a + (m !== '' ? +m : 0);
              }, 0);
              const allDone = uploadFinal.subjects.every(s => row.subjectMarks[s.subject] !== '');
              const pct = allDone ? Math.round((total / totalMax) * 100) : null;
              const isOpen = expandedFinalStu === row.studentId;
              return (
                <div key={row.studentId} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <button onClick={() => setExpandedFinalStu(isOpen ? null : row.studentId)}
                    className="w-full flex items-center gap-3 px-4 py-3 active:bg-slate-50">
                    <div className="w-7 h-7 bg-slate-100 rounded-full flex items-center justify-center shrink-0 text-[10px] font-black text-slate-500">{row.rollNo}</div>
                    <div className="flex-1 font-bold text-slate-800 text-sm text-left">{row.name}</div>
                    {pct !== null && (
                      <span className={`text-sm font-black tabular-nums shrink-0 ${pct >= 75 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-rose-500'}`}>{pct}%</span>
                    )}
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border shrink-0 ${allDone ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                      {allDone ? 'Done' : 'Pending'}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 space-y-2 border-t border-slate-50 pt-3">
                      {uploadFinal.subjects.map(subj => {
                        const m = row.subjectMarks[subj.subject];
                        const sp = m !== '' ? Math.round((+m / subj.maxMarks) * 100) : null;
                        return (
                          <div key={subj.subject} className="flex items-center gap-3">
                            <div className="flex-1 text-xs font-bold text-slate-700">{subj.subject}</div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <input type="number" min={0} max={subj.maxMarks} value={m}
                                onChange={e => updateFinalStuMark(row.studentId, subj.subject, e.target.value)}
                                placeholder="—"
                                className="w-14 border border-slate-200 bg-slate-50 rounded-xl px-2 py-1.5 text-center font-black text-sm outline-none focus:border-indigo-400" />
                              <span className="text-[10px] font-bold text-slate-400 w-10">/{subj.maxMarks}</span>
                              {sp !== null && <span className={`text-[10px] font-black w-8 text-right ${sp >= 75 ? 'text-emerald-600' : sp >= 50 ? 'text-amber-600' : 'text-rose-500'}`}>{sp}%</span>}
                            </div>
                          </div>
                        );
                      })}
                      <input type="text" value={row.note} onChange={e => updateFinalStuNote(row.studentId, e.target.value)}
                        placeholder="Overall note for student (optional)…"
                        className="w-full border border-slate-100 bg-slate-50 rounded-xl px-3 py-2 text-[11px] font-medium outline-none focus:border-indigo-300 placeholder:text-slate-300 mt-1" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button onClick={handlePublishFinal} disabled={isBusy || !allFilled}
            className="w-full flex items-center justify-center gap-2 bg-rose-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-50">
            {isBusy ? 'Publishing…' : <><CheckCircle size={16}/> Publish Final Exam Results</>}
          </button>
          {!allFilled && <p className="text-center text-[10px] font-bold text-slate-400">Fill all students' marks to publish</p>}
        </div>
      </div>
    );
  }

  /* ══ CREATE NORMAL ══════════════════════════════════════════════ */
  if (view === 'CREATE_NORMAL') return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {header('Schedule Test', () => setView('LIST'))}
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Class</label>
            <select value={nForm.classId} onChange={e => { const c = classes.find(x => x.id === e.target.value); if (c) setNForm(f => ({ ...f, classId: c.id, className: c.className, section: c.section, subject: c.subject })); }}
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none">
              {classes.map(c => <option key={c.id} value={c.id}>{c.className}-{c.section} · {c.subject}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Test Type</label>
            <div className="flex flex-wrap gap-2">
              {NORMAL_TYPES.map(t => (
                <button key={t} onClick={() => setNForm(f => ({ ...f, testType: t }))}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-colors ${nForm.testType === t ? typeColor(t) + ' ring-1 ring-current' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                  {typeLabel(t)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Test Title *</label>
            <input value={nForm.title} onChange={e => setNForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Unit Test 1 — Algebra"
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Syllabus / Topics</label>
            <textarea value={nForm.syllabus} onChange={e => setNForm(f => ({ ...f, syllabus: e.target.value }))} rows={2}
              placeholder="Chapter numbers, topics covered…"
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Date *</label>
              <input type="date" value={nForm.scheduledDate} onChange={e => setNForm(f => ({ ...f, scheduledDate: e.target.value }))}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Duration (min)</label>
              <input type="number" value={nForm.duration} onChange={e => setNForm(f => ({ ...f, duration: +e.target.value }))}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Max Marks</label>
            <input type="number" value={nForm.maxMarks} onChange={e => setNForm(f => ({ ...f, maxMarks: +e.target.value }))}
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
          </div>
        </div>
        <button onClick={handleCreateNormal} disabled={isBusy}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-60">
          {isBusy ? 'Scheduling…' : <><Plus size={16}/> Schedule Test</>}
        </button>
      </div>
    </div>
  );

  /* ══ CREATE FINAL EXAM ══════════════════════════════════════════ */
  if (view === 'CREATE_FINAL') return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {header('Schedule Final Exam', () => setView('LIST'))}
      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Class</label>
            <select value={fForm.classId} onChange={e => { const c = classes.find(x => x.id === e.target.value); if (c) setFForm(f => ({ ...f, classId: c.id, className: c.className, section: c.section })); }}
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none">
              {classes.map(c => <option key={c.id} value={c.id}>{c.className}-{c.section}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Exam Title *</label>
            <input value={fForm.title} onChange={e => setFForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Annual Final Exam 2026"
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-rose-400" />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Description</label>
            <textarea value={fForm.description} onChange={e => setFForm(f => ({ ...f, description: e.target.value }))} rows={2}
              placeholder="Annual examination covering full year syllabus…"
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-medium text-sm outline-none focus:border-rose-400 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Start Date *</label>
              <input type="date" value={fForm.scheduledDate} onChange={e => setFForm(f => ({ ...f, scheduledDate: e.target.value }))}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-rose-400" />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Duration / subject (min)</label>
              <input type="number" value={fForm.duration} onChange={e => setFForm(f => ({ ...f, duration: +e.target.value }))}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-rose-400" />
            </div>
          </div>
        </div>

        {/* Subjects list */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
            <span className="font-black text-slate-800 text-sm">Subjects & Max Marks</span>
            <button onClick={() => setFSubjects(p => [...p, { subject: '', maxMarks: 100, teacherName: '' }])}
              className="p-1.5 bg-indigo-50 rounded-lg text-indigo-600"><Plus size={14}/></button>
          </div>
          <div className="divide-y divide-slate-50">
            {fSubjects.map((s, idx) => (
              <div key={idx} className="px-4 py-3 flex items-center gap-2">
                <BookOpen size={14} className="text-slate-400 shrink-0" />
                <input value={s.subject} onChange={e => updateFSubject(idx, 'subject', e.target.value)}
                  placeholder="Subject name"
                  className="flex-1 font-bold text-sm text-slate-800 bg-transparent outline-none placeholder:text-slate-300" />
                <input type="number" value={s.maxMarks} onChange={e => updateFSubject(idx, 'maxMarks', +e.target.value)}
                  className="w-16 border border-slate-200 bg-slate-50 rounded-xl px-2 py-1.5 text-center font-black text-sm outline-none focus:border-rose-400" />
                <span className="text-[10px] font-bold text-slate-400 shrink-0">marks</span>
                <button onClick={() => setFSubjects(p => p.filter((_, i) => i !== idx))} className="text-slate-300 hover:text-rose-400">
                  <Trash2 size={14}/>
                </button>
              </div>
            ))}
          </div>
          {fSubjects.length > 0 && (
            <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex justify-between text-[10px] font-black text-slate-500">
              <span>{fSubjects.length} subjects</span>
              <span>Total: {fSubjects.reduce((a, s) => a + s.maxMarks, 0)} marks</span>
            </div>
          )}
        </div>

        <button onClick={handleCreateFinal} disabled={isBusy}
          className="w-full flex items-center justify-center gap-2 bg-rose-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-60">
          {isBusy ? 'Scheduling…' : <><Plus size={16}/> Schedule Final Exam</>}
        </button>
      </div>
    </div>
  );

  /* ══ LIST ════════════════════════════════════════════════════════ */
  const pendingNormal = tests.filter(t => !t.resultsUploaded).length;
  const pendingFinal  = finalExams.filter(fe => !fe.resultsUploaded).length;

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {header('Tests & Exams', onBack,
        <button
          onClick={() => listTab === 'REGULAR' ? setView('CREATE_NORMAL') : setView('CREATE_FINAL')}
          className={`p-2 text-white rounded-full shadow-md ${listTab === 'REGULAR' ? 'bg-indigo-500' : 'bg-rose-500'}`}>
          <Plus size={18}/>
        </button>
      )}

      {/* Tabs */}
      <div className="flex bg-white border-b border-slate-100 px-4 pt-2 gap-1">
        {(['REGULAR', 'FINAL'] as ListTab[]).map(tab => (
          <button key={tab} onClick={() => setListTab(tab)}
            className={`px-4 py-2 text-[11px] font-black uppercase tracking-widest rounded-t-xl transition-colors ${listTab === tab ? 'bg-slate-900 text-white' : 'text-slate-400'}`}>
            {tab === 'REGULAR' ? `Regular Tests` : `Final Exams`}
            {tab === 'REGULAR' && pendingNormal > 0 && <span className="ml-1.5 bg-amber-500 text-white text-[8px] px-1.5 py-0.5 rounded-full">{pendingNormal}</span>}
            {tab === 'FINAL'   && pendingFinal  > 0 && <span className="ml-1.5 bg-rose-500 text-white text-[8px] px-1.5 py-0.5 rounded-full">{pendingFinal}</span>}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-3">
        {listTab === 'REGULAR' && (
          <>
            {tests.map(test => (
              <div key={test.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase border ${typeColor(test.testType)}`}>{typeLabel(test.testType)}</span>
                  <span className="text-[10px] font-bold text-slate-400">{test.className}-{test.section}</span>
                </div>
                <div className="font-extrabold text-slate-900 text-sm">{test.title}</div>
                <div className="text-[11px] font-bold text-slate-400 mt-1 line-clamp-1">{test.syllabus}</div>
                <div className="flex gap-4 mt-3 pt-3 border-t border-slate-50">
                  <span className="flex items-center gap-1 text-[10px] font-bold text-slate-600"><Calendar size={11} className="text-slate-400"/> {test.scheduledDate}</span>
                  <span className="flex items-center gap-1 text-[10px] font-bold text-slate-600"><Clock size={11} className="text-slate-400"/> {test.duration}m</span>
                  <span className="ml-auto text-[10px] font-black text-slate-700">{test.maxMarks} marks</span>
                </div>
                {test.resultsUploaded
                  ? <div className="mt-2 flex items-center gap-1.5 text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg w-fit"><CheckCircle size={10}/> Results Published</div>
                  : <button onClick={() => openUploadNormal(test)} className="mt-2 w-full flex items-center justify-between bg-indigo-50 border border-indigo-100 text-indigo-700 font-black text-[11px] uppercase tracking-widest px-3 py-2 rounded-xl active:scale-95 transition-transform">
                      <span className="flex items-center gap-1.5"><Upload size={12}/> Upload Results</span>
                      <ChevronRight size={14} className="text-indigo-400"/>
                    </button>
                }
              </div>
            ))}
            {tests.length === 0 && (
              <div className="flex flex-col items-center py-16 text-slate-400">
                <ClipboardList size={32} className="mb-3 opacity-40"/>
                <p className="font-bold text-sm">No tests scheduled</p>
              </div>
            )}
          </>
        )}

        {listTab === 'FINAL' && (
          <>
            {finalExams.map(fe => {
              const totalMax = fe.subjects.reduce((a, s) => a + s.maxMarks, 0);
              return (
                <div key={fe.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-rose-50 to-orange-50 px-4 pt-4 pb-3 border-b border-rose-100/50">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[9px] font-black uppercase text-rose-700 bg-rose-100 border border-rose-200 px-2 py-0.5 rounded-full">Final Exam</span>
                        <div className="font-extrabold text-slate-900 text-sm mt-1">{fe.title}</div>
                        <div className="text-[10px] font-bold text-slate-400 mt-0.5">{fe.className}-{fe.section} · {fe.scheduledDate}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-black text-slate-700 text-sm">{totalMax}</div>
                        <div className="text-[9px] font-bold text-slate-400">Total marks</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {fe.subjects.map(s => (
                        <span key={s.subject} className="text-[9px] font-black bg-white border border-rose-100 text-rose-700 px-2 py-0.5 rounded-full">{s.subject} /{s.maxMarks}</span>
                      ))}
                    </div>
                  </div>
                  <div className="p-4">
                    {fe.resultsUploaded
                      ? <div className="flex items-center gap-1.5 text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg w-fit"><CheckCircle size={10}/> Results Published</div>
                      : <button onClick={() => openUploadFinal(fe)} className="w-full flex items-center justify-between bg-rose-50 border border-rose-100 text-rose-700 font-black text-[11px] uppercase tracking-widest px-3 py-2 rounded-xl active:scale-95 transition-transform">
                          <span className="flex items-center gap-1.5"><Upload size={12}/> Upload All Subject Results</span>
                          <ChevronRight size={14} className="text-rose-400"/>
                        </button>
                    }
                  </div>
                </div>
              );
            })}
            {finalExams.length === 0 && (
              <div className="flex flex-col items-center py-16 text-slate-400">
                <ClipboardList size={32} className="mb-3 opacity-40"/>
                <p className="font-bold text-sm">No final exams scheduled</p>
                <button onClick={() => setView('CREATE_FINAL')} className="mt-3 text-[11px] font-black text-rose-600 bg-rose-50 border border-rose-100 px-4 py-2 rounded-xl">
                  + Schedule Final Exam
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
