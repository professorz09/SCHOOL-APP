import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, Plus, Calendar, Clock, Upload, CheckCircle, ChevronRight,
  BookOpen, Trash2,
} from 'lucide-react';
import { teacherService } from '@/roles/teacher/teacher.service';
import { TestSchedule, TestType, TeacherClass } from '@/shared/types/teacher.types';
import { useUIStore } from '@/shared/store/uiStore';
import { useAuthStore } from '@/shared/store/authStore';
import { useAcademicYear } from '@/shared/context/AcademicYearContext';
import { useEditGuard } from '@/shared/store/correctionStore';

type View = 'LIST' | 'CREATE' | 'UPLOAD';

interface Subject { subject: string; maxMarks: number; }
interface StudentRow { studentId: string; name: string; rollNo: string; marks: string; subjectMarks: Record<string, string>; note: string; }

const EXAM_TYPES: TestType[] = ['UNIT_TEST', 'MID_TERM', 'QUIZ', 'PRACTICAL', 'FINAL'];

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

interface Props { onBack: () => void; }

export const TestsManager: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const teacherName = useAuthStore(s => s.session?.name ?? 'Teacher');
  const { currentYear } = useAcademicYear();
  const isYearClosed = !!currentYear && currentYear.status === 'LOCKED';
  const editGuard = useEditGuard(currentYear?.id, isYearClosed);
  const [view, setView]      = useState<View>('LIST');
  const [exams, setExams]    = useState<TestSchedule[]>([]);
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [isBusy, setIsBusy]  = useState(false);
  // Subjects taught in the currently-selected class (live from timetable_entries + own primary subject)
  const [classSubjects, setClassSubjects] = useState<string[]>([]);

  // Create form
  const [cForm, setCForm] = useState({
    classId: '', className: '', section: '',
    title: '', description: '', testType: 'UNIT_TEST' as TestType,
    scheduledDate: '', duration: 60, maxMarks: 25, hasSubjects: false,
    primarySubject: '',
  });
  const [subjects, setSubjects] = useState<Subject[]>([]);

  // Upload state
  const [uploadExam, setUploadExam]  = useState<TestSchedule | null>(null);
  const [stuRows, setStuRows]        = useState<StudentRow[]>([]);
  const [expandedStu, setExpandedStu] = useState<string | null>(null);

  useEffect(() => {
    teacherService.getTests().then(setExams);
    teacherService.getClasses().then(setClasses);
  }, []);

  // Whenever the user picks a class, fetch the real subjects taught in that section
  useEffect(() => {
    if (!cForm.classId) { setClassSubjects([]); return; }
    let cancelled = false;
    teacherService.getSubjectsForSection(cForm.classId)
      .then(list => { if (!cancelled) setClassSubjects(list); })
      .catch(() => { if (!cancelled) setClassSubjects([]); });
    return () => { cancelled = true; };
  }, [cForm.classId]);

  // Default the single-subject field to the first real subject for the picked class
  useEffect(() => {
    if (classSubjects.length && !cForm.primarySubject) {
      setCForm(f => ({ ...f, primarySubject: classSubjects[0] }));
    }
  }, [classSubjects, cForm.primarySubject]);

  const handleCreateExam = async () => {
    if (!cForm.title || !cForm.scheduledDate || !cForm.classId) {
      showToast('Fill all required fields', 'error');
      return;
    }
    if (cForm.hasSubjects && subjects.length === 0) {
      showToast('Add at least one subject', 'error');
      return;
    }
    if (cForm.hasSubjects && subjects.some(s => !s.subject.trim())) {
      showToast('Pick a subject for every row', 'error');
      return;
    }
    if (!cForm.hasSubjects && !cForm.primarySubject.trim()) {
      showToast('Pick a subject for this exam', 'error');
      return;
    }
    if (!editGuard.canEdit) {
      showToast('Year closed — Principal se Correction Mode enable karne ko bolein', 'error');
      return;
    }
    setIsBusy(true);
    try {
      const totalMarks = cForm.hasSubjects ? subjects.reduce((a, s) => a + s.maxMarks, 0) : cForm.maxMarks;
      const exam = await editGuard.gate(
        () => teacherService.createTest({
          classId:      cForm.classId,
          className:    cForm.className,
          section:      cForm.section,
          subject:      cForm.hasSubjects ? subjects.map(s => s.subject).join(', ') : cForm.primarySubject,
          testType:     cForm.testType,
          title:        cForm.title,
          scheduledDate: cForm.scheduledDate,
          duration:     cForm.duration,
          maxMarks:     totalMarks,
          syllabus:     cForm.description,
        }),
        { entityType: 'test_schedule', entityId: `${cForm.classId}/${cForm.title}` },
      );
      if (exam === undefined) return; // user cancelled correction prompt
      setExams(p => [exam, ...p]);
      showToast(`${typeLabel(cForm.testType)} scheduled`);
      resetForm();
      setView('LIST');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create exam', 'error');
    } finally { setIsBusy(false); }
  };

  const resetForm = () => {
    setCForm({
      classId: '', className: '', section: '',
      title: '', description: '', testType: 'UNIT_TEST',
      scheduledDate: '', duration: 60, maxMarks: 25, hasSubjects: false,
      primarySubject: '',
    });
    setSubjects([]);
  };

  const openUpload = (exam: TestSchedule) => {
    const cls = classes.find(c => c.id === exam.classId);
    const rows = (cls?.students ?? []).map(s => ({
      studentId: s.id, name: s.name, rollNo: s.rollNo,
      marks: '', subjectMarks: {}, note: '',
    }));
    setStuRows(rows);
    setUploadExam(exam);
    setExpandedStu(rows[0]?.studentId ?? null);
    setView('UPLOAD');
  };

  const handlePublish = async () => {
    if (!uploadExam) return;
    const hasSubjects = uploadExam.subject.includes(',');
    if (hasSubjects) {
      // Multi-subject: validate all subject marks
      const subj = uploadExam.subject.split(', ');
      if (stuRows.some(r => subj.some(s => (r.subjectMarks[s] ?? '') === ''))) {
        showToast('Fill marks for all subjects for all students', 'error');
        return;
      }
    } else {
      // Single marks
      if (stuRows.some(r => r.marks === '')) {
        showToast(`Fill marks for all students`, 'error');
        return;
      }
    }
    if (!editGuard.canEdit) {
      showToast('Year closed — Principal se Correction Mode enable karne ko bolein', 'error');
      return;
    }
    setIsBusy(true);
    try {
      const cls = classes.find(c => c.id === uploadExam.classId);
      const result = await editGuard.gate(
        () => teacherService.publishResults({
          testId:       uploadExam.id,
          examName:     uploadExam.title,
          description:  uploadExam.syllabus,
          testType:     uploadExam.testType,
          subject:      uploadExam.subject,
          teacherName:  teacherName,
          date:         uploadExam.scheduledDate,
          maxMarks:     uploadExam.maxMarks,
          studentResults: stuRows.map(r => ({
            studentId:    r.studentId,
            obtainedMarks: hasSubjects ? Object.values(r.subjectMarks).reduce((a, v) => a + (+v || 0), 0) : +r.marks,
            note:         r.note,
          })),
          allStudents: cls?.students.map(s => ({ id: s.id, name: s.name, rollNo: s.rollNo })) ?? [],
        }),
        { entityType: 'exam_result', entityId: uploadExam.id },
      );
      if (result === undefined) return; // user cancelled correction prompt
      setExams(p => p.map(e => e.id === uploadExam.id ? { ...e, resultsUploaded: true } : e));
      showToast('Results published!');
      setView('LIST');
    } finally { setIsBusy(false); }
  };

  const updateStuRow = (idx: number, field: 'marks' | 'note', v: string) =>
    setStuRows(p => p.map((r, i) => i === idx ? { ...r, [field]: v } : r));

  const updateSubjectMark = (stuId: string, subject: string, v: string) =>
    setStuRows(p => p.map(r => r.studentId === stuId ? { ...r, subjectMarks: { ...r.subjectMarks, [subject]: v } } : r));

  const header = (title: string, back: () => void, action?: React.ReactNode) => (
    <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
      <div className="flex items-center gap-3">
        <button onClick={back} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20}/></button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">{title}</h2>
      </div>
      {action}
    </div>
  );

  /* ── UPLOAD ────────────────────────────────────────────────────────── */
  if (view === 'UPLOAD' && uploadExam) {
    const hasSubjects = uploadExam.subject.includes(',');
    const subjectList = hasSubjects ? uploadExam.subject.split(', ') : [];
    const allFilled = hasSubjects
      ? stuRows.every(r => subjectList.every(s => r.subjectMarks[s] !== ''))
      : stuRows.every(r => r.marks !== '');

    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        {header('Upload Results', () => setView('LIST'))}
        <div className="flex-1 overflow-y-auto p-4  space-y-4">
          {/* Exam info */}
          <div className={`rounded-2xl p-4 text-white ${uploadExam.testType === 'FINAL' ? 'bg-[#0d1b3e]' : 'bg-indigo-600'}`}>
            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase border inline-block mb-2 ${typeColor(uploadExam.testType)}`}>{typeLabel(uploadExam.testType)}</span>
            <div className="font-black text-white text-base">{uploadExam.title}</div>
            <div className="flex gap-4 mt-1 text-[10px] font-bold opacity-75">
              <span>📅 {uploadExam.scheduledDate}</span><span>⏱ {uploadExam.duration} min</span><span>📊 {uploadExam.maxMarks} marks</span>
            </div>
          </div>

          {/* Students */}
          <div className="space-y-3">
            {stuRows.map(row => {
              const isOpen = expandedStu === row.studentId;
              const total = hasSubjects ? subjectList.reduce((a, s) => a + (+row.subjectMarks[s] || 0), 0) : +row.marks;
              const pct = total > 0 ? Math.round((total / uploadExam.maxMarks) * 100) : null;
              const allDone = hasSubjects ? subjectList.every(s => row.subjectMarks[s] !== '') : row.marks !== '';

              return (
                <div key={row.studentId} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <button onClick={() => setExpandedStu(isOpen ? null : row.studentId)}
                    className="w-full flex items-center gap-3 px-4 py-3 active:bg-slate-50">
                    <div className="w-7 h-7 bg-slate-100 rounded-full flex items-center justify-center shrink-0 text-[10px] font-black text-slate-500">{row.rollNo}</div>
                    <div className="flex-1 font-bold text-slate-800 text-sm text-left">{row.name}</div>
                    {pct !== null && <span className={`text-sm font-black tabular-nums shrink-0 ${pct >= 75 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-rose-500'}`}>{pct}%</span>}
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border shrink-0 ${allDone ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                      {allDone ? 'Done' : 'Pending'}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 space-y-2 border-t border-slate-50 pt-3">
                      {hasSubjects ? (
                        subjectList.map(subj => {
                          const m = row.subjectMarks[subj] || '';
                          const sp = m !== '' ? Math.round((+m / 25) * 100) : null; // Assuming 25 per subject
                          return (
                            <div key={subj} className="flex items-center gap-3">
                              <div className="flex-1 text-xs font-bold text-slate-700">{subj}</div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <input type="number" min={0} max={25} value={m} onChange={e => updateSubjectMark(row.studentId, subj, e.target.value)} placeholder="—"
                                  className="w-14 border border-slate-200 bg-slate-50 rounded-xl px-2 py-1.5 text-center font-black text-sm outline-none focus:border-indigo-400"/>
                                <span className="text-[10px] font-bold text-slate-400 w-8">/25</span>
                                {sp !== null && <span className={`text-[10px] font-black w-8 text-right ${sp >= 75 ? 'text-emerald-600' : sp >= 50 ? 'text-amber-600' : 'text-rose-500'}`}>{sp}%</span>}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="flex-1 text-xs font-bold text-slate-700">Marks</div>
                          <input type="number" min={0} max={uploadExam.maxMarks} value={row.marks} onChange={e => updateStuRow(stuRows.findIndex(r => r.studentId === row.studentId), 'marks', e.target.value)} placeholder="—"
                            className="w-14 border border-slate-200 bg-slate-50 rounded-xl px-2 py-1.5 text-center font-black text-sm outline-none focus:border-indigo-400"/>
                          <span className="text-[10px] font-bold text-slate-400">/{uploadExam.maxMarks}</span>
                        </div>
                      )}
                      <input type="text" value={row.note} onChange={e => updateStuRow(stuRows.findIndex(r => r.studentId === row.studentId), 'note', e.target.value)} placeholder="Note (optional)…"
                        className="w-full border border-slate-100 bg-slate-50 rounded-xl px-3 py-2 text-[11px] font-medium outline-none focus:border-indigo-300 placeholder:text-slate-300"/>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button onClick={handlePublish} disabled={isBusy || !allFilled}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-50">
            {isBusy ? 'Publishing…' : <><CheckCircle size={16}/> Publish Results</>}
          </button>
        </div>
      </div>
    );
  }

  /* ── CREATE ────────────────────────────────────────────────────────── */
  if (view === 'CREATE') return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {header('Create Exam', () => setView('LIST'))}
      <div className="flex-1 overflow-y-auto p-4  space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
          {/* Class selection */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Class *</label>
            <select value={cForm.classId} onChange={e => {
              const c = classes.find(x => x.id === e.target.value);
              if (c) setCForm(f => ({ ...f, classId: c.id, className: c.className, section: c.section }));
            }} className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none">
              <option value="">Select class…</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.className}-{c.section}</option>)}
            </select>
          </div>

          {/* Exam type */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Exam Type</label>
            <div className="flex flex-wrap gap-2">
              {EXAM_TYPES.map(t => (
                <button key={t} onClick={() => setCForm(f => ({ ...f, testType: t }))}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-colors ${cForm.testType === t ? typeColor(t) + ' ring-1 ring-current' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                  {typeLabel(t)}
                </button>
              ))}
            </div>
          </div>

          {/* Title & Description */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Exam Title *</label>
            <input value={cForm.title} onChange={e => setCForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Unit Test 1 — Algebra"
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500"/>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Description / Topics</label>
            <textarea value={cForm.description} onChange={e => setCForm(f => ({ ...f, description: e.target.value }))} rows={2}
              placeholder="Chapter numbers, topics covered…"
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500 resize-none"/>
          </div>

          {/* Date & Duration */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Date *</label>
              <input type="date" value={cForm.scheduledDate} onChange={e => setCForm(f => ({ ...f, scheduledDate: e.target.value }))}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-indigo-500"/>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Duration (min)</label>
              <input type="number" value={cForm.duration} onChange={e => setCForm(f => ({ ...f, duration: +e.target.value }))}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500"/>
            </div>
          </div>

          {/* Subjects toggle */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={cForm.hasSubjects} onChange={e => {
                setCForm(f => ({ ...f, hasSubjects: e.target.checked }));
                if (!e.target.checked) setSubjects([]);
              }} className="w-4 h-4 rounded border-slate-300"/>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Add Multiple Subjects (each with marks)</span>
            </label>
          </div>

          {/* Single subject + max marks OR subjects list */}
          {!cForm.hasSubjects ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Subject *</label>
                {classSubjects.length > 0 ? (
                  <select value={cForm.primarySubject}
                    onChange={e => setCForm(f => ({ ...f, primarySubject: e.target.value }))}
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-indigo-500">
                    {classSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : (
                  <input value={cForm.primarySubject}
                    onChange={e => setCForm(f => ({ ...f, primarySubject: e.target.value }))}
                    placeholder={cForm.classId ? 'Type subject…' : 'Pick a class first'}
                    disabled={!cForm.classId}
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-indigo-500 disabled:opacity-60"/>
                )}
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Max Marks</label>
                <input type="number" value={cForm.maxMarks} onChange={e => setCForm(f => ({ ...f, maxMarks: +e.target.value }))}
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500"/>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
                <span className="font-black text-slate-800 text-sm">Subjects & Max Marks</span>
                <button onClick={() => setSubjects(p => [...p, { subject: '', maxMarks: 25 }])}
                  className="p-1.5 bg-indigo-50 rounded-lg text-indigo-600"><Plus size={14}/></button>
              </div>
              <div className="divide-y divide-slate-50">
                {subjects.map((s, idx) => (
                  <div key={idx} className="px-4 py-3 flex items-center gap-2">
                    <BookOpen size={14} className="text-slate-400 shrink-0"/>
                    {classSubjects.length > 0 ? (
                      <select value={s.subject}
                        onChange={e => setSubjects(p => p.map((x, i) => i === idx ? { ...x, subject: e.target.value } : x))}
                        className="flex-1 font-bold text-sm text-slate-800 bg-transparent outline-none">
                        <option value="">Select subject…</option>
                        {classSubjects.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    ) : (
                      <input value={s.subject} onChange={e => setSubjects(p => p.map((x, i) => i === idx ? { ...x, subject: e.target.value } : x))}
                        placeholder="Subject name"
                        className="flex-1 font-bold text-sm text-slate-800 bg-transparent outline-none placeholder:text-slate-300"/>
                    )}
                    <input type="number" value={s.maxMarks} onChange={e => setSubjects(p => p.map((x, i) => i === idx ? { ...x, maxMarks: +e.target.value } : x))}
                      className="w-16 border border-slate-200 bg-slate-50 rounded-xl px-2 py-1.5 text-center font-black text-sm outline-none focus:border-indigo-400"/>
                    <span className="text-[10px] font-bold text-slate-400 shrink-0">marks</span>
                    <button onClick={() => setSubjects(p => p.filter((_, i) => i !== idx))} className="text-slate-300 hover:text-rose-400">
                      <Trash2 size={14}/>
                    </button>
                  </div>
                ))}
              </div>
              {subjects.length > 0 && (
                <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex justify-between text-[10px] font-black text-slate-500">
                  <span>{subjects.length} subjects</span>
                  <span>Total: {subjects.reduce((a, s) => a + s.maxMarks, 0)} marks</span>
                </div>
              )}
            </div>
          )}
        </div>

        <button onClick={handleCreateExam} disabled={isBusy}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-60">
          {isBusy ? 'Creating…' : <><Plus size={16}/> Create Exam</>}
        </button>
      </div>
    </div>
  );

  /* ── LIST ──────────────────────────────────────────────────────────── */
  const pendingCount = exams.filter(e => !e.resultsUploaded).length;

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {header('Exams & Tests', onBack,
        <button onClick={() => setView('CREATE')}
          className="p-2 text-white bg-indigo-500 rounded-full shadow-md">
          <Plus size={18}/>
        </button>,
      )}

      <div className="flex-1 overflow-y-auto p-4  space-y-3">
        {exams.map(exam => {
          const isPending = !exam.resultsUploaded;
          return (
            <div key={exam.id} className={`bg-white rounded-2xl border shadow-sm p-4 ${isPending ? 'border-amber-100' : 'border-slate-100'}`}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase border ${typeColor(exam.testType)}`}>{typeLabel(exam.testType)}</span>
                <span className="text-[10px] font-bold text-slate-400">{exam.className}-{exam.section}</span>
              </div>
              <div className="font-extrabold text-slate-900 text-sm">{exam.title}</div>
              <div className="text-[11px] font-bold text-slate-400 mt-1 line-clamp-1">{exam.syllabus}</div>
              <div className="flex gap-4 mt-3 pt-3 border-t border-slate-50">
                <span className="flex items-center gap-1 text-[10px] font-bold text-slate-600"><Calendar size={11} className="text-slate-400"/> {exam.scheduledDate}</span>
                <span className="flex items-center gap-1 text-[10px] font-bold text-slate-600"><Clock size={11} className="text-slate-400"/> {exam.duration}m</span>
                <span className="ml-auto text-[10px] font-black text-slate-700">{exam.maxMarks} marks</span>
              </div>
              {isPending
                ? <button onClick={() => openUpload(exam)} className="mt-2 w-full flex items-center justify-between bg-indigo-50 border border-indigo-100 text-indigo-700 font-black text-[11px] uppercase tracking-widest px-3 py-2 rounded-xl active:scale-95 transition-transform">
                    <span className="flex items-center gap-1.5"><Upload size={12}/> Upload Results</span>
                    <ChevronRight size={14} className="text-indigo-400"/>
                  </button>
                : <div className="mt-2 flex items-center gap-1.5 text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg w-fit"><CheckCircle size={10}/> Results Published</div>
              }
            </div>
          );
        })}

        {exams.length === 0 && (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <BookOpen size={32} className="mb-3 opacity-40"/>
            <p className="font-bold text-sm">No exams created yet</p>
            <button onClick={() => setView('CREATE')} className="mt-3 text-[11px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 px-4 py-2 rounded-xl">
              + Create Exam
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
