import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Plus, Calendar, Clock, Upload, CheckCircle, ChevronRight,
  BookOpen, Trash2, Lock,
} from 'lucide-react';
import { teacherService } from '@/roles/teacher/teacher.service';
import { TestSchedule, TestType, TeacherClass } from '@/roles/teacher/teacher.types';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { useAcademicYear } from '@/shared/context/AcademicYearContext';
import { useEditGuard } from '@/store/correctionStore';

type View = 'LIST' | 'CREATE' | 'UPLOAD';
type CreateTab = 'DETAILS' | 'SUBJECTS';

interface Subject { subject: string; maxMarks: number; passMarks: number; }
interface StudentRow { studentId: string; name: string; rollNo: string; marks: string; subjectMarks: Record<string, string>; note: string; }

// Parse the syllabus JSON wrapper. Older exams stored plain-text syllabus; newer
// exams wrap it as JSON with optional subjects[] and passMarks.
function parseSyllabus(exam: TestSchedule): { subjects?: Subject[]; desc?: string; passMarks?: number } {
  try {
    const parsed = JSON.parse(exam.syllabus ?? '');
    if (parsed && typeof parsed === 'object') return parsed;
  } catch { /* not JSON */ }
  return { desc: exam.syllabus ?? '' };
}

// Per-subject {subject, maxMarks, passMarks} for a multi-subject exam, or null for single-subject.
function parseSubjectsFromExam(exam: TestSchedule): Subject[] | null {
  if (!exam.subject?.includes(',')) return null;
  const parsed = parseSyllabus(exam);
  if (Array.isArray(parsed.subjects)) {
    return parsed.subjects.map(s => ({
      subject: s.subject,
      maxMarks: s.maxMarks,
      passMarks: s.passMarks ?? Math.ceil(s.maxMarks * 0.33),
    }));
  }
  const names = exam.subject.split(', ').map((s: string) => s.trim()).filter(Boolean);
  if (names.length === 0) {
    return [{ subject: exam.subject, maxMarks: exam.maxMarks, passMarks: Math.ceil(exam.maxMarks * 0.33) }];
  }
  // Distribute maxMarks evenly; the last subject absorbs the remainder so
  // sum(subjects) === exam.maxMarks (previously Math.round dropped marks
  // — 100/3 → 33 each, sum = 99, mismatching the exam total).
  const base = Math.floor(exam.maxMarks / names.length);
  return names.map((s: string, i: number) => {
    const max = i === names.length - 1
      ? exam.maxMarks - base * (names.length - 1)
      : base;
    return { subject: s, maxMarks: max, passMarks: Math.ceil(max * 0.33) };
  });
}

function getExamDescription(exam: TestSchedule): string {
  return parseSyllabus(exam).desc ?? '';
}

function getExamPassMarks(exam: TestSchedule): number {
  const p = parseSyllabus(exam).passMarks;
  return typeof p === 'number' ? p : Math.ceil(exam.maxMarks * 0.33);
}

// Teachers can only schedule NORMAL tests. FINAL exams are the principal's
// responsibility (school-wide / promotion-driving) and live in
// PrincipalExamsManager. Server-side guard in /api/teacher/test/create
// also rejects testType='FINAL' from a TEACHER caller.
const EXAM_TYPES: TestType[] = ['NORMAL'];

const typeColor = (t: string): string => {
  const map: Record<string, string> = {
    NORMAL:    'bg-blue-50 text-blue-700 border-blue-100',
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
    NORMAL: 'Normal Test', UNIT_TEST: 'Unit Test', MID_TERM: 'Mid Term',
    FINAL: 'Final Exam', QUIZ: 'Quiz', PRACTICAL: 'Practical',
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
  const [createTab, setCreateTab] = useState<CreateTab>('DETAILS');
  const [exams, setExams]    = useState<TestSchedule[]>([]);
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [isBusy, setIsBusy]  = useState(false);
  // Subjects taught in the currently-selected class (live from timetable_entries + own primary subject)
  const [classSubjects, setClassSubjects] = useState<string[]>([]);

  // Create form
  const [cForm, setCForm] = useState({
    classId: '', className: '', section: '',
    title: '', description: '', testType: 'NORMAL' as TestType,
    scheduledDate: '', duration: 60, maxMarks: 25, passMarks: 9,
    hasSubjects: false, primarySubject: '',
  });
  const [subjects, setSubjects] = useState<Subject[]>([]);

  // Upload state
  const [uploadExam, setUploadExam]    = useState<TestSchedule | null>(null);
  const [uploadSubjects, setUploadSubjects] = useState<Subject[]>([]);
  const [stuRows, setStuRows]          = useState<StudentRow[]>([]);
  const [expandedStu, setExpandedStu]  = useState<string | null>(null);
  // When the test was already locked by the principal (status=LOCKED), the
  // upload screen flips into a fully read-only "view what you submitted"
  // mode. SUBMITTED state is still editable so teacher can fix typos before
  // principal publishes.
  const [viewLocked, setViewLocked]    = useState(false);

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

  // Multi-subject mode: keep total passing marks in sync with the sum of
  // per-subject pass marks until the user explicitly overrides it. We only
  // overwrite when the current value still matches the previous sum, so a
  // manual edit isn't blown away on the next subject tweak.
  const subjectsPassSum = subjects.reduce((a, s) => a + s.passMarks, 0);
  const subjectsMaxSum  = subjects.reduce((a, s) => a + s.maxMarks, 0);
  const lastAutoPassRef = useRef<number>(0);
  useEffect(() => {
    if (!cForm.hasSubjects) return;
    setCForm(f => {
      // If the user has manually changed passMarks (it differs from the last
      // auto-applied value), respect their value and only clamp to new max.
      const wasManual = f.passMarks !== lastAutoPassRef.current;
      const next = wasManual ? Math.min(f.passMarks, subjectsMaxSum) : subjectsPassSum;
      lastAutoPassRef.current = subjectsPassSum;
      return { ...f, passMarks: next };
    });
  }, [subjectsPassSum, subjectsMaxSum, cForm.hasSubjects]);

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
      // For multi-subject, cForm.passMarks is the *overall* passing threshold,
      // separate from per-subject pass marks (which are stored on each subject row).
      // For single-subject, cForm.passMarks is the only pass threshold.
      const totalPass = cForm.passMarks;
      const syllabusPayload = cForm.hasSubjects
        ? JSON.stringify({ subjects, desc: cForm.description, passMarks: totalPass })
        : JSON.stringify({ desc: cForm.description, passMarks: totalPass });
      let createdExam: TestSchedule | null = null;
      const ran = await editGuard.gate(
        async () => {
          createdExam = await teacherService.createTest({
            classId:      cForm.classId,
            className:    cForm.className,
            section:      cForm.section,
            subject:      cForm.hasSubjects ? subjects.map(s => s.subject).join(', ') : cForm.primarySubject,
            testType:     cForm.testType,
            title:        cForm.title,
            scheduledDate: cForm.scheduledDate,
            duration:     cForm.duration,
            maxMarks:     totalMarks,
            syllabus:     syllabusPayload,
          });
          return true as const;
        },
        { entityType: 'test_schedule', entityId: `${cForm.classId}/${cForm.title}` },
      );
      if (!ran || !createdExam) return; // user cancelled correction prompt
      setExams(p => [createdExam!, ...p]);
      showToast(`${typeLabel(cForm.testType)} scheduled`);
      resetForm();
      setView('LIST');
    } catch (err) {
      console.error('[createTest] failed:', err);
      showToast(err instanceof Error ? err.message : 'Failed to create exam', 'error');
    } finally { setIsBusy(false); }
  };

  const resetForm = () => {
    setCForm({
      classId: '', className: '', section: '',
      title: '', description: '', testType: 'NORMAL',
      scheduledDate: '', duration: 60, maxMarks: 25, passMarks: 9,
      hasSubjects: false, primarySubject: '',
    });
    setSubjects([]);
  };

  const openUpload = async (exam: TestSchedule) => {
    const cls = classes.find(c => c.id === exam.classId);
    const baseRows: StudentRow[] = (cls?.students ?? []).map(s => ({
      studentId: s.id, name: s.name, rollNo: s.rollNo,
      marks: '', subjectMarks: {}, note: '',
    }));
    const subjs = parseSubjectsFromExam(exam) ?? [];
    setUploadSubjects(subjs);
    setUploadExam(exam);

    // Pre-fill existing results when teacher comes back to view what they
    // submitted. For multi-subject exams the per-subject breakdown comes
    // from the JSON we now stash in `remarks` at publish time.
    let rows = baseRows;
    if (exam.resultsUploaded) {
      try {
        const existing = await teacherService.getResultsByTest(exam.id);
        rows = baseRows.map(r => {
          const ex = existing[r.studentId];
          if (!ex) return r;
          let subjectMarks: Record<string, string> = {};
          let note = '';
          if (ex.remarks) {
            try {
              const parsed = JSON.parse(ex.remarks);
              if (parsed && typeof parsed === 'object') {
                if (parsed.subjectMarks && typeof parsed.subjectMarks === 'object') {
                  for (const [k, v] of Object.entries(parsed.subjectMarks as Record<string, unknown>)) {
                    subjectMarks[k] = String(v ?? '');
                  }
                }
                if (typeof parsed.note === 'string') note = parsed.note;
              } else {
                note = ex.remarks;
              }
            } catch {
              note = ex.remarks;
            }
          }
          return { ...r, marks: String(ex.obtainedMarks ?? ''), subjectMarks, note };
        });
      } catch (e) {
        // Earlier this only console.error'd. The teacher would see
        // a blank form when re-opening a previously-published test
        // and might re-enter all marks (overwriting the saved ones)
        // not realising the prefill silently failed. Toast so they
        // know the values they see may be incomplete.
        console.error('[openUpload] failed to fetch existing results:', e);
        showToast('Could not load saved marks — values may be missing. Refresh to retry.', 'error');
      }
    }

    setStuRows(rows);
    // Read the camelCase field exposed by rowToTest. The earlier code used
    // `exam.result_status` (snake_case) which is the DB column name, NOT
    // the mapped TestSchedule field — so it was always undefined and
    // viewLocked never flipped to true. Result: even after the principal
    // approved/locked the result, teacher could still edit & resubmit.
    setViewLocked(exam.resultStatus === 'LOCKED');
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
      // HTML min/max only constrains the spinner — paste / programmatic input
      // can land out-of-range values. Validate numerically before publishing.
      const subjMax = subj.length > 0 ? Math.round(uploadExam.maxMarks / subj.length) : uploadExam.maxMarks;
      for (const r of stuRows) {
        for (const s of subj) {
          const v = Number(r.subjectMarks[s]);
          if (!Number.isFinite(v) || v < 0 || v > subjMax) {
            showToast(`Invalid marks for a student (must be 0–${subjMax})`, 'error');
            return;
          }
        }
      }
    } else {
      // Single marks
      if (stuRows.some(r => r.marks === '')) {
        showToast(`Fill marks for all students`, 'error');
        return;
      }
      for (const r of stuRows) {
        const v = Number(r.marks);
        if (!Number.isFinite(v) || v < 0 || v > uploadExam.maxMarks) {
          showToast(`Marks must be between 0 and ${uploadExam.maxMarks}`, 'error');
          return;
        }
      }
    }
    if (!editGuard.canEdit) {
      showToast('Year closed — Principal se Correction Mode enable karne ko bolein', 'error');
      return;
    }
    setIsBusy(true);
    try {
      const cls = classes.find(c => c.id === uploadExam.classId);
      // Wrap action to return a sentinel `true` so we can distinguish a real
      // success from gate's `undefined` (which means user cancelled the
      // correction prompt). Without this, void-returning actions look like
      // cancellations and the success path is skipped silently.
      const ran = await editGuard.gate(
        async () => {
          await teacherService.publishResults({
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
              obtainedMarks: hasSubjects ? Object.values(r.subjectMarks).reduce((a: number, v) => a + (Number(v) || 0), 0) : +r.marks,
              // For multi-subject exams, persist the per-subject breakdown as
              // JSON in remarks so the marksheet/view-results screens can
              // re-render the breakdown later. Single-subject keeps the
              // teacher's plain note in remarks.
              note:         hasSubjects
                ? JSON.stringify({ subjectMarks: r.subjectMarks, note: r.note })
                : r.note,
            })),
            allStudents: cls?.students.map(s => ({ id: s.id, name: s.name, rollNo: s.rollNo })) ?? [],
          });
          return true as const;
        },
        { entityType: 'exam_result', entityId: uploadExam.id },
      );
      if (!ran) return; // user cancelled correction prompt
      setExams(p => p.map(e => e.id === uploadExam.id ? { ...e, resultsUploaded: true } : e));
      showToast('Results published!');
      setView('LIST');
    } catch (err) {
      console.error('[publishResults] failed:', err);
      showToast(err instanceof Error ? err.message : 'Failed to publish results', 'error');
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

    // Progress + bulk helpers — saves a teacher entering 30+ rows of
    // marks the pain of tapping every card. "Filled" = every required
    // marks input on that row is non-empty (subject-wise OR single).
    const filledCount = stuRows.filter(r =>
      hasSubjects
        ? subjectList.every(s => (r.subjectMarks[s] ?? '') !== '')
        : r.marks !== ''
    ).length;
    const totalRows = stuRows.length;
    const pctDone = totalRows > 0 ? Math.round((filledCount / totalRows) * 100) : 0;

    // Jump to the first row that's still missing a mark and expand it.
    // Used by the "Next pending" button on the sticky progress bar.
    const jumpToNextPending = () => {
      const next = stuRows.find(r =>
        hasSubjects
          ? subjectList.some(s => (r.subjectMarks[s] ?? '') === '')
          : r.marks === ''
      );
      if (!next) return;
      setExpandedStu(next.studentId);
      // Defer scroll so the row has rendered in expanded form.
      requestAnimationFrame(() => {
        document.getElementById(`stu-row-${next.studentId}`)?.scrollIntoView({
          behavior: 'smooth', block: 'center',
        });
      });
    };

    // Bulk "All Full Marks" / "All Zero" — common after a class quiz
    // where the teacher only deviates for a handful of students. They
    // hit the bulk fill, then tap the few outliers individually.
    const bulkFill = (kind: 'FULL' | 'ZERO') => {
      if (viewLocked) return;
      const subjMaxBySubject: Record<string, number> = {};
      for (const s of uploadSubjects) subjMaxBySubject[s.subject] = s.maxMarks;
      setStuRows(prev => prev.map(r => {
        if (hasSubjects) {
          const next: Record<string, string> = { ...r.subjectMarks };
          for (const subj of subjectList) {
            next[subj] = kind === 'FULL'
              ? String(subjMaxBySubject[subj] ?? Math.round(uploadExam.maxMarks / subjectList.length))
              : '0';
          }
          return { ...r, subjectMarks: next };
        }
        return { ...r, marks: kind === 'FULL' ? String(uploadExam.maxMarks) : '0' };
      }));
    };

    return (
      <div className="w-full lg:max-w-5xl lg:mx-auto bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        {header(viewLocked ? 'View Results' : (uploadExam.resultsUploaded ? 'Edit Results' : 'Upload Results'), () => setView('LIST'))}

        {/* Sticky progress bar — visible while the teacher scrolls
            through long class lists. Tap "Next pending" to jump
            straight to the next un-marked student instead of scrolling
            manually through completed rows. */}
        {!viewLocked && (
          <div className="sticky top-[57px] z-10 bg-white border-b border-slate-100 px-4 py-2.5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5 mb-1">
                  <span className="text-sm font-black text-slate-900 tabular-nums">{filledCount}</span>
                  <span className="text-[10px] font-bold text-slate-400">/ {totalRows} done</span>
                  <span className={`ml-auto text-[10px] font-black tabular-nums ${pctDone === 100 ? 'text-emerald-600' : 'text-slate-500'}`}>
                    {pctDone}%
                  </span>
                </div>
                <div className="bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div className={`h-1.5 rounded-full transition-all ${pctDone === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                    style={{ width: `${pctDone}%` }} />
                </div>
              </div>
              {filledCount < totalRows && (
                <button onClick={jumpToNextPending}
                  className="shrink-0 flex items-center gap-1 px-3 py-2 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl active:scale-95 transition-transform">
                  Next pending →
                </button>
              )}
            </div>
            {/* Bulk fill — only when nothing is filled yet OR teacher
                explicitly wants to overwrite. Hidden once partially
                filled to avoid the principal accidentally nuking
                30 rows of typed marks. */}
            {filledCount === 0 && (
              <div className="flex gap-2 mt-2">
                <button onClick={() => bulkFill('FULL')}
                  className="flex-1 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black uppercase tracking-widest rounded-lg active:scale-95">
                  Sab full marks
                </button>
                <button onClick={() => bulkFill('ZERO')}
                  className="flex-1 py-1.5 bg-slate-50 text-slate-600 border border-slate-200 text-[10px] font-black uppercase tracking-widest rounded-lg active:scale-95">
                  Sab zero
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4  space-y-4">
          {/* Exam info */}
          <div className={`rounded-2xl p-4 text-white ${uploadExam.testType === 'FINAL' ? 'bg-[#0d1b3e]' : 'bg-indigo-600'}`}>
            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase border inline-block mb-2 ${typeColor(uploadExam.testType)}`}>{typeLabel(uploadExam.testType)}</span>
            <div className="font-black text-white text-base">{uploadExam.title}</div>
            <div className="flex gap-4 mt-1 text-[10px] font-bold opacity-75">
              <span>📅 {uploadExam.scheduledDate}</span><span>⏱ {uploadExam.duration} min</span><span>📊 {uploadExam.maxMarks} marks</span>
            </div>
          </div>

          {/* Status banner — shown when revisiting an already-uploaded test */}
          {viewLocked && (
            <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-2xl p-3">
              <Lock size={14} className="text-emerald-600 shrink-0 mt-0.5"/>
              <div>
                <div className="text-xs font-black text-emerald-800">Published & Locked</div>
                <div className="text-[10px] font-bold text-emerald-600 mt-0.5">Results published by principal — read-only. Ask principal to enable Editor Mode for corrections.</div>
              </div>
            </div>
          )}
          {!viewLocked && uploadExam.resultsUploaded && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-2xl p-3">
              <Clock size={14} className="text-amber-600 shrink-0 mt-0.5"/>
              <div>
                <div className="text-xs font-black text-amber-800">Submitted — pending principal publish</div>
                <div className="text-[10px] font-bold text-amber-600 mt-0.5">You can still fix typos and resubmit before the principal publishes.</div>
              </div>
            </div>
          )}

          {/* Students */}
          <div className="space-y-3">
            {stuRows.map(row => {
              const isOpen = expandedStu === row.studentId;
              const total = hasSubjects ? uploadSubjects.reduce((a, s) => a + (+row.subjectMarks[s.subject] || 0), 0) : +row.marks;
              const pct = total > 0 ? Math.round((total / uploadExam.maxMarks) * 100) : null;
              const allDone = hasSubjects
                ? uploadSubjects.every(s => (row.subjectMarks[s.subject] ?? '') !== '')
                : row.marks !== '';

              return (
                <div key={row.studentId} id={`stu-row-${row.studentId}`} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden scroll-mt-32">
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
                        uploadSubjects.map(({ subject: subj, maxMarks: subjMax }) => {
                          const m = row.subjectMarks[subj] || '';
                          const sp = m !== '' ? Math.round((+m / subjMax) * 100) : null;
                          return (
                            <div key={subj} className="flex items-center gap-3">
                              <div className="flex-1 text-xs font-bold text-slate-700">{subj}</div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <input type="number" inputMode="numeric" min={0} max={subjMax} value={m} disabled={viewLocked} onChange={e => updateSubjectMark(row.studentId, subj, e.target.value)} placeholder="—"
                                  className="w-16 border border-slate-200 bg-slate-50 rounded-xl px-2 py-2.5 text-center font-black text-base outline-none focus:border-indigo-400 disabled:bg-slate-100 disabled:text-slate-500"/>
                                <span className="text-[10px] font-bold text-slate-400 w-8">/{subjMax}</span>
                                {sp !== null && <span className={`text-[10px] font-black w-8 text-right ${sp >= 75 ? 'text-emerald-600' : sp >= 50 ? 'text-amber-600' : 'text-rose-500'}`}>{sp}%</span>}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="flex-1 text-xs font-bold text-slate-700">Marks</div>
                          <input type="number" inputMode="numeric" min={0} max={uploadExam.maxMarks} value={row.marks} disabled={viewLocked} onChange={e => updateStuRow(stuRows.findIndex(r => r.studentId === row.studentId), 'marks', e.target.value)} placeholder="—"
                            className="w-16 border border-slate-200 bg-slate-50 rounded-xl px-2 py-2.5 text-center font-black text-base outline-none focus:border-indigo-400 disabled:bg-slate-100 disabled:text-slate-500"/>
                          <span className="text-[10px] font-bold text-slate-400">/{uploadExam.maxMarks}</span>
                        </div>
                      )}
                      <input type="text" value={row.note} disabled={viewLocked} onChange={e => updateStuRow(stuRows.findIndex(r => r.studentId === row.studentId), 'note', e.target.value)} placeholder="Note (optional)…"
                        className="w-full border border-slate-100 bg-slate-50 rounded-xl px-3 py-2 text-[11px] font-medium outline-none focus:border-indigo-300 placeholder:text-slate-300 disabled:bg-slate-100 disabled:text-slate-500"/>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {!viewLocked && (
            <button onClick={handlePublish} disabled={isBusy || !allFilled}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-50">
              {isBusy ? 'Submitting…' : <><CheckCircle size={16}/> {uploadExam.resultsUploaded ? 'Resubmit Results' : 'Submit Results'}</>}
            </button>
          )}
        </div>
      </div>
    );
  }

  /* ── CREATE ────────────────────────────────────────────────────────── */
  if (view === 'CREATE') {
    const totalMax  = cForm.hasSubjects ? subjectsMaxSum  : cForm.maxMarks;
    const subjPassSum = subjectsPassSum;
    const passOverridden = cForm.hasSubjects && cForm.passMarks !== subjPassSum;

    const sectionLabel = (n: string) => (
      <div className="px-1 text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">{n}</div>
    );

    return (
    <div className="w-full lg:max-w-5xl lg:mx-auto bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300 min-h-screen">
      {header('Create Exam', () => setView('LIST'))}

      {/* Tab strip — mobile-app style switch between form sections.
          Same pattern as the principal's question-paper tool. */}
      <div className="sticky top-[60px] z-10 bg-white border-b border-slate-100 px-3 md:px-6">
        <div className="max-w-3xl mx-auto flex">
          <button onClick={() => setCreateTab('DETAILS')}
            className={`flex-1 py-3 text-[11px] md:text-xs font-bold uppercase tracking-widest border-b-2 transition-colors ${
              createTab === 'DETAILS' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500'
            }`}>
            Details
          </button>
          <button onClick={() => setCreateTab('SUBJECTS')}
            className={`flex-1 py-3 text-[11px] md:text-xs font-bold uppercase tracking-widest border-b-2 transition-colors ${
              createTab === 'SUBJECTS' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500'
            }`}>
            Subjects & Marks
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 120px)' }}>
        {createTab === 'DETAILS' && <>
        {/* Section 1: Basics */}
        <div>
          {sectionLabel('Basics')}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Class *</label>
              <select value={cForm.classId} onChange={e => {
                const c = classes.find(x => x.id === e.target.value);
                if (c) setCForm(f => ({ ...f, classId: c.id, className: c.className, section: c.section }));
              }} className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500">
                <option value="">Select class…</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.className}-{c.section}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Exam Type</label>
              <div className="grid grid-cols-2 gap-2">
                {EXAM_TYPES.map(t => (
                  <button key={t} onClick={() => setCForm(f => ({ ...f, testType: t }))}
                    className={`px-3 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider border transition-all ${cForm.testType === t ? typeColor(t) + ' ring-2 ring-offset-1 ring-current/30 shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                    {typeLabel(t)}
                  </button>
                ))}
              </div>
              {cForm.testType === 'FINAL' && (
                <p className="text-[10px] font-bold text-rose-500 mt-1.5 px-1">⚠ Final exams are used for student promotion</p>
              )}
            </div>
          </div>
        </div>

        {/* Section 2: Details */}
        <div>
          {sectionLabel('Details')}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Exam Title *</label>
              <input value={cForm.title} onChange={e => setCForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Mid Term — September"
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500"/>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Description / Topics</label>
              <textarea value={cForm.description} onChange={e => setCForm(f => ({ ...f, description: e.target.value }))} rows={2}
                placeholder="Chapter numbers, topics covered…"
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500 resize-none"/>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Date *</label>
                <input type="date" value={cForm.scheduledDate} onChange={e => setCForm(f => ({ ...f, scheduledDate: e.target.value }))}
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-indigo-500"/>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Duration (min)</label>
                <input type="number" min={1} value={cForm.duration} onChange={e => setCForm(f => ({ ...f, duration: +e.target.value }))}
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500"/>
              </div>
            </div>
          </div>
        </div>

        </>}
        {createTab === 'SUBJECTS' && <>
        {/* Section 3: Marks */}
        <div>
          {sectionLabel('Subjects & Marks')}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            {/* Mode toggle */}
            <div className="px-4 py-3 border-b border-slate-50 flex items-center gap-2">
              <button onClick={() => { setCForm(f => ({ ...f, hasSubjects: false })); setSubjects([]); }}
                className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors ${!cForm.hasSubjects ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-50 text-slate-500'}`}>
                Single Subject
              </button>
              <button onClick={() => setCForm(f => ({ ...f, hasSubjects: true }))}
                className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors ${cForm.hasSubjects ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-50 text-slate-500'}`}>
                Multiple Subjects
              </button>
            </div>

            {!cForm.hasSubjects ? (
              <div className="p-4 space-y-3">
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Max Marks</label>
                    <input type="number" min={1} value={cForm.maxMarks}
                      onChange={e => {
                        const v = +e.target.value;
                        setCForm(f => ({ ...f, maxMarks: v, passMarks: Math.min(f.passMarks, v) }));
                      }}
                      className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500"/>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-1.5">Passing Marks</label>
                    <input type="number" min={0} max={cForm.maxMarks} value={cForm.passMarks}
                      onChange={e => setCForm(f => ({ ...f, passMarks: Math.min(+e.target.value, f.maxMarks) }))}
                      className="w-full border-2 border-emerald-100 bg-emerald-50/50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-emerald-500"/>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Per-subject rows */}
                <div className="divide-y divide-slate-50">
                  {subjects.length === 0 && (
                    <div className="px-4 py-8 text-center">
                      <BookOpen size={24} className="mx-auto text-slate-300 mb-2"/>
                      <p className="text-[11px] font-bold text-slate-400">Add subjects below</p>
                    </div>
                  )}
                  {subjects.map((s, idx) => (
                    <div key={idx} className="px-4 py-3 space-y-2">
                      <div className="flex items-center gap-2">
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
                        <button onClick={() => setSubjects(p => p.filter((_, i) => i !== idx))} className="text-slate-300 hover:text-rose-400">
                          <Trash2 size={14}/>
                        </button>
                      </div>
                      <div className="flex items-center gap-2 pl-6">
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 w-10">Max</span>
                        <input type="number" min={1} value={s.maxMarks}
                          onChange={e => {
                            const max = +e.target.value;
                            setSubjects(p => p.map((x, i) => i === idx ? { ...x, maxMarks: max, passMarks: Math.min(x.passMarks, max) } : x));
                          }}
                          className="w-16 border border-slate-200 bg-slate-50 rounded-xl px-2 py-1.5 text-center font-black text-sm outline-none focus:border-indigo-400"/>
                        <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600 w-10 ml-3">Pass</span>
                        <input type="number" min={0} max={s.maxMarks} value={s.passMarks}
                          onChange={e => setSubjects(p => p.map((x, i) => i === idx ? { ...x, passMarks: Math.min(+e.target.value, x.maxMarks) } : x))}
                          className="w-16 border-2 border-emerald-100 bg-emerald-50/50 rounded-xl px-2 py-1.5 text-center font-black text-sm outline-none focus:border-emerald-500"/>
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={() => setSubjects(p => [...p, { subject: '', maxMarks: 25, passMarks: 9 }])}
                  className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-indigo-50 text-indigo-700 text-[11px] font-black uppercase tracking-wider border-t border-slate-50 active:scale-95 transition-transform">
                  <Plus size={14}/> Add Subject
                </button>

                {/* Total passing marks (overall threshold) — separate from sum of per-subject */}
                {subjects.length > 0 && (
                  <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total Max</span>
                      <span className="text-sm font-black text-slate-700 tabular-nums">{totalMax}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1">
                        <div className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Total Passing Marks</div>
                        <div className="text-[9px] font-bold text-slate-400 mt-0.5">
                          Subjects sum: {subjPassSum}
                          {passOverridden && <span className="text-amber-600"> · overridden</span>}
                        </div>
                      </div>
                      <input type="number" min={0} max={totalMax} value={cForm.passMarks}
                        onChange={e => {
                          const v = Math.min(+e.target.value, totalMax);
                          setCForm(f => ({ ...f, passMarks: v }));
                        }}
                        className="w-20 border-2 border-emerald-200 bg-white rounded-xl px-2 py-2 text-center font-black text-sm outline-none focus:border-emerald-500"/>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        </>}
      </div>

      {/* Fixed bottom action bar — Next on Details tab, Create on
          Subjects tab. Mirrors the principal's question-paper flow.
          Safe-area-inset padding keeps it above Android nav. */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent pt-4 px-3 md:px-6"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 40px)' }}>
        <div className="max-w-3xl mx-auto">
          {createTab === 'DETAILS' ? (
            <button onClick={() => setCreateTab('SUBJECTS')}
              className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-black text-white font-bold text-xs uppercase tracking-widest py-3.5 rounded-xl active:scale-[0.98] transition-all">
              Next: Subjects & Marks <ChevronRight size={15} />
            </button>
          ) : (
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <button onClick={() => setCreateTab('DETAILS')}
                className="px-4 py-3.5 bg-white border border-slate-300 text-slate-900 rounded-xl font-bold text-xs uppercase tracking-widest active:scale-[0.98] transition-all">
                Back
              </button>
              <button onClick={handleCreateExam} disabled={isBusy}
                className="flex items-center justify-center gap-2 bg-slate-900 hover:bg-black text-white font-bold text-xs uppercase tracking-widest py-3.5 rounded-xl active:scale-[0.98] transition-all disabled:opacity-60">
                {isBusy ? 'Creating…' : <><Plus size={16}/> Create Exam</>}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
    );
  }

  /* ── LIST ──────────────────────────────────────────────────────────── */
  const pendingCount = exams.filter(e => !e.resultsUploaded).length;

  return (
    <div className="w-full lg:max-w-5xl lg:mx-auto bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {header('Exams & Tests', onBack,
        <button onClick={() => { setCreateTab('DETAILS'); setView('CREATE'); }}
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
              {getExamDescription(exam) && (
                <div className="text-[11px] font-bold text-slate-400 mt-1 line-clamp-1">{getExamDescription(exam)}</div>
              )}
              <div className="flex gap-4 mt-3 pt-3 border-t border-slate-50">
                <span className="flex items-center gap-1 text-[10px] font-bold text-slate-600"><Calendar size={11} className="text-slate-400"/> {exam.scheduledDate}</span>
                <span className="flex items-center gap-1 text-[10px] font-bold text-slate-600"><Clock size={11} className="text-slate-400"/> {exam.duration}m</span>
                <span className="ml-auto text-[10px] font-black text-slate-700">{exam.maxMarks} marks</span>
              </div>
              {isPending ? (
                <button onClick={() => openUpload(exam)} className="mt-2 w-full flex items-center justify-between bg-indigo-50 border border-indigo-100 text-indigo-700 font-black text-[11px] uppercase tracking-widest px-3 py-2 rounded-xl active:scale-95 transition-transform">
                  <span className="flex items-center gap-1.5"><Upload size={12}/> Upload Results</span>
                  <ChevronRight size={14} className="text-indigo-400"/>
                </button>
              ) : (
                <div className="mt-2 space-y-1.5">
                  {exam.resultStatus === 'LOCKED' ? (
                    <div className="flex items-center gap-1.5 text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-1.5 rounded-lg">
                      <CheckCircle size={10}/> Published & Locked by Principal
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-100 px-2 py-1.5 rounded-lg">
                      <Clock size={10}/> Submitted — pending principal publish
                    </div>
                  )}
                  <button onClick={() => openUpload(exam)} className="w-full flex items-center justify-between bg-slate-50 border border-slate-100 text-slate-700 font-black text-[11px] uppercase tracking-widest px-3 py-2 rounded-xl active:scale-95 transition-transform">
                    <span className="flex items-center gap-1.5">
                      {exam.resultStatus === 'LOCKED' ? <><BookOpen size={12}/> View Results</> : <><Upload size={12}/> Edit & Resubmit</>}
                    </span>
                    <ChevronRight size={14} className="text-slate-400"/>
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {exams.length === 0 && (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <BookOpen size={32} className="mb-3 opacity-40"/>
            <p className="font-bold text-sm">No exams created yet</p>
            <button onClick={() => { setCreateTab('DETAILS'); setView('CREATE'); }} className="mt-3 text-[11px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 px-4 py-2 rounded-xl">
              + Create Exam
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
