// Quick-access document downloads from a Student profile.
//
//   • Bonafide  — 1-tap (optional purpose), renders BonafidePrint, PDF download.
//   • Marksheet — pick AY where this student has a final exam with results
//                 uploaded. Pulls subject-wise results and renders MarksheetPrint.
//   • Admit Card — pick from upcoming exams in the next 30 days for this
//                 student's class+section. Renders AdmitCardPrint.
//
// The print templates live in src/shared/components/documents and match
// the visual style used in ToolsManager so a Profile-side download is
// indistinguishable from a Tools-side download.

import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Award, BadgeCheck, Download, Eye, Printer, Ticket, X, Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { apiExams } from '@/lib/apiClient';
import { schoolInfoService, type SchoolInfo } from '@/shared/utils/schoolInfo.service';
import { downloadNodeAsPdf, printCurrentPage } from '@/shared/utils/pdfPrint';
import { useUIStore } from '@/store/uiStore';
import type { Student } from '@/modules/students/student.types';
import { BonafidePrint } from '@/shared/components/documents/BonafidePrint';
import {
  MarksheetPrint, type MarksheetSubjectRow,
} from '@/shared/components/documents/MarksheetPrint';
import {
  AdmitCardPrint, DEFAULT_ADMIT_INSTRUCTIONS,
  type AdmitCardExam,
} from '@/shared/components/documents/AdmitCardPrint';

interface Props { student: Student; }

type Modal = null | 'BONAFIDE' | 'MARKSHEET' | 'ADMIT';

export const StudentDocumentsPanel: React.FC<Props> = ({ student }) => {
  const { showToast } = useUIStore();
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo | null>(null);
  const [modal, setModal] = useState<Modal>(null);

  useEffect(() => { schoolInfoService.get().then(setSchoolInfo).catch(() => {}); }, []);

  const close = () => setModal(null);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">
        Documents
      </p>
      <div className="grid grid-cols-3 gap-2">
        <button onClick={() => setModal('ADMIT')}
          className="flex flex-col items-center gap-1.5 p-3 bg-rose-50 border border-rose-100 rounded-xl active:scale-95 transition-transform">
          <Ticket size={18} className="text-rose-600" />
          <span className="text-[10px] font-black uppercase tracking-wide text-rose-700">Admit Card</span>
        </button>
        <button onClick={() => setModal('MARKSHEET')}
          className="flex flex-col items-center gap-1.5 p-3 bg-amber-50 border border-amber-100 rounded-xl active:scale-95 transition-transform">
          <Award size={18} className="text-amber-600" />
          <span className="text-[10px] font-black uppercase tracking-wide text-amber-700">Marksheet</span>
        </button>
        <button onClick={() => setModal('BONAFIDE')}
          className="flex flex-col items-center gap-1.5 p-3 bg-indigo-50 border border-indigo-100 rounded-xl active:scale-95 transition-transform">
          <BadgeCheck size={18} className="text-indigo-600" />
          <span className="text-[10px] font-black uppercase tracking-wide text-indigo-700">Bonafide</span>
        </button>
      </div>

      {modal && schoolInfo && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-stretch justify-center animate-in fade-in"
          onClick={close}>
          <div className="bg-slate-50 w-full max-w-2xl overflow-y-auto animate-in slide-in-from-right-8"
            onClick={e => e.stopPropagation()}>
            <div className="bg-white border-b border-slate-100 px-4 py-3 sticky top-0 z-10 flex items-center gap-3">
              <button onClick={close} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
                <ArrowLeft size={18} />
              </button>
              <h3 className="text-base font-black text-slate-900 uppercase tracking-tight flex-1">
                {modal === 'BONAFIDE'  && 'Bonafide Certificate'}
                {modal === 'MARKSHEET' && 'Academic Marksheet'}
                {modal === 'ADMIT'     && 'Admit Card'}
              </h3>
              <button onClick={close} className="p-2 bg-slate-100 rounded-full text-slate-500">
                <X size={16} />
              </button>
            </div>

            <div className="p-4">
              {modal === 'BONAFIDE'  && <BonafideFlow  student={student} schoolInfo={schoolInfo} onError={m => showToast(m, 'error')} />}
              {modal === 'MARKSHEET' && <MarksheetFlow student={student} schoolInfo={schoolInfo} onError={m => showToast(m, 'error')} />}
              {modal === 'ADMIT'     && <AdmitFlow     student={student} schoolInfo={schoolInfo} onError={m => showToast(m, 'error')} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// Bonafide
// ───────────────────────────────────────────────────────────────────────────

const BonafideFlow: React.FC<{ student: Student; schoolInfo: SchoolInfo; onError: (m: string) => void }> = ({
  student, schoolInfo, onError,
}) => {
  const [purpose, setPurpose] = useState('');
  const [preview, setPreview] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const download = async () => {
    if (!ref.current) return;
    try { await downloadNodeAsPdf(ref.current, `bonafide-${student.admissionNo}.pdf`); }
    catch (e) { onError(e instanceof Error ? e.message : 'PDF export failed'); }
  };

  if (preview) {
    return (
      <>
        <BonafidePrint
          ref={ref}
          schoolInfo={schoolInfo}
          studentName={student.name}
          fatherName={student.fatherName}
          className={student.className}
          section={student.section}
          purpose={purpose.trim() || undefined}
        />
        <div className="grid grid-cols-2 gap-3 mt-4">
          <button onClick={printCurrentPage}
            className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm uppercase py-3 rounded-2xl">
            <Printer size={16} /> Print
          </button>
          <button onClick={download}
            className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-sm uppercase py-3 rounded-2xl">
            <Download size={16} /> Download PDF
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex items-start gap-3">
        <BadgeCheck size={20} className="text-indigo-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-black text-indigo-900 text-sm">Bonafide Certificate</p>
          <p className="text-xs font-bold text-indigo-700 mt-0.5">
            For {student.name} · {student.className}-{student.section}
          </p>
        </div>
      </div>
      <div>
        <label className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5 block">
          Purpose (optional)
        </label>
        <input value={purpose} onChange={e => setPurpose(e.target.value)}
          placeholder="e.g. Bank account, Scholarship"
          className="w-full border border-slate-200 bg-white rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-indigo-500" />
      </div>
      <button onClick={() => setPreview(true)}
        className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-black text-sm uppercase py-4 rounded-2xl active:scale-95 shadow-md">
        <Eye size={16} /> Preview Certificate
      </button>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// Marksheet
// ───────────────────────────────────────────────────────────────────────────

interface YearOption { id: string; label: string; }

const MarksheetFlow: React.FC<{ student: Student; schoolInfo: SchoolInfo; onError: (m: string) => void }> = ({
  student, schoolInfo, onError,
}) => {
  const [years, setYears]         = useState<YearOption[]>([]);
  const [yearId, setYearId]       = useState('');
  const [examTitle, setExamTitle] = useState('');
  const [allExams, setAllExams]   = useState<Array<{ id: string; title: string; subject: string; test_type: string; max_marks: number; academic_year_id: string }>>([]);
  const [rows, setRows]           = useState<MarksheetSubjectRow[]>([]);
  const [loadingYears, setLoadingYears] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);
  const [preview, setPreview] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Years where this student has a fully-entered final exam.
  // Strict criterion: a test with test_type IN ('FINAL','ANNUAL','HALF_YEARLY')
  // (covers terminal/board-style exams) AND results_uploaded=true AND at
  // least one exam_results row for this student.
  useEffect(() => {
    (async () => {
      try {
        const { data: marks } = await supabase
          .from('exam_results')
          .select('test_id, academic_year_id')
          .eq('student_id', student.id);
        const yearIds = Array.from(new Set(((marks ?? []) as { academic_year_id: string }[]).map(r => r.academic_year_id)));
        if (yearIds.length === 0) { setYears([]); return; }
        const { data: yrs } = await supabase
          .from('academic_years')
          .select('id, label')
          .in('id', yearIds);
        const opts = ((yrs ?? []) as { id: string; label: string }[])
          .map(y => ({ id: y.id, label: y.label }))
          .sort((a, b) => b.label.localeCompare(a.label));
        setYears(opts);
        if (opts.length === 1) setYearId(opts[0].id);
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Could not load academic years');
      } finally { setLoadingYears(false); }
    })();
  }, [student.id]);

  // Final exams for the picked year + this student's class.
  // We use apiExams.list with className so the API filters server-side
  // (matches ToolsManager's pattern).
  useEffect(() => {
    if (!yearId) { setAllExams([]); setExamTitle(''); return; }
    apiExams.list({ yearId, className: student.className })
      .then((list: any[]) => {
        const finals = list.filter(e =>
          e.results_uploaded &&
          ['FINAL', 'ANNUAL', 'HALF_YEARLY', 'TERMINAL'].includes((e.test_type ?? '').toUpperCase())
        );
        setAllExams(finals);
        if (finals.length === 1) setExamTitle(finals[0].title);
      })
      .catch(() => setAllExams([]));
  }, [yearId, student.className]);

  const titleOptions = React.useMemo(() => {
    const seen = new Set<string>();
    return allExams.filter(e => { if (seen.has(e.title)) return false; seen.add(e.title); return true; });
  }, [allExams]);

  // Pull subject-wise results when a title is picked.
  useEffect(() => {
    if (!examTitle) { setRows([]); return; }
    const titleExams = allExams.filter(e => e.title === examTitle);
    setLoadingResults(true);
    Promise.all(
      titleExams.map(exam =>
        apiExams.getResults(exam.id)
          .then((res: any[]) => {
            const mine = res.find((r: any) => r.student_id === student.id);
            return {
              subject: exam.subject ?? '—',
              maxMarks: exam.max_marks ?? 0,
              obtainedMarks: mine ? Number(mine.obtained_marks ?? mine.marks ?? 0) : null,
              grade: mine?.grade ?? undefined,
            } as MarksheetSubjectRow;
          })
          .catch(() => ({ subject: exam.subject ?? '—', maxMarks: exam.max_marks ?? 0, obtainedMarks: null }))
      )
    )
      .then(out => setRows(out.sort((a, b) => a.subject.localeCompare(b.subject))))
      .finally(() => setLoadingResults(false));
  }, [examTitle, student.id]);

  const download = async () => {
    if (!ref.current) return;
    try { await downloadNodeAsPdf(ref.current, `marksheet-${student.admissionNo}-${examTitle}.pdf`); }
    catch (e) { onError(e instanceof Error ? e.message : 'PDF export failed'); }
  };

  if (preview && rows.length > 0) {
    return (
      <>
        <MarksheetPrint
          ref={ref}
          schoolInfo={schoolInfo}
          studentName={student.name}
          admissionNo={student.admissionNo}
          className={student.className}
          section={student.section}
          rollNo={student.rollNo}
          fatherName={student.fatherName}
          examTitle={examTitle}
          rows={rows}
        />
        <div className="grid grid-cols-2 gap-3 mt-4">
          <button onClick={printCurrentPage}
            className="flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-black text-sm uppercase py-3 rounded-2xl">
            <Printer size={16} /> Print
          </button>
          <button onClick={download}
            className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-sm uppercase py-3 rounded-2xl">
            <Download size={16} /> Download PDF
          </button>
        </div>
      </>
    );
  }

  if (loadingYears) {
    return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-400" size={20} /></div>;
  }
  if (years.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400">
        <Award size={32} className="mx-auto mb-3 opacity-40" />
        <p className="font-bold text-sm">No marksheets available</p>
        <p className="text-[10px] font-bold text-slate-300 mt-1">
          Marksheets show only after a final / annual exam is fully entered.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
        <p className="font-black text-amber-900 text-sm">Academic Marksheet</p>
        <p className="text-xs font-bold text-amber-700 mt-0.5">
          For {student.name} · {student.className}-{student.section}
        </p>
      </div>

      <div>
        <label className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2 block">
          Academic Year
        </label>
        <select value={yearId} onChange={e => { setYearId(e.target.value); setExamTitle(''); }}
          className="w-full border border-slate-200 bg-white rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-amber-400">
          <option value="">Choose year…</option>
          {years.map(y => <option key={y.id} value={y.id}>{y.label}</option>)}
        </select>
      </div>

      {yearId && (
        <div>
          <label className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2 block">
            Exam Series
          </label>
          <select value={examTitle} onChange={e => setExamTitle(e.target.value)}
            className="w-full border border-slate-200 bg-white rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-amber-400">
            <option value="">Choose exam…</option>
            {titleOptions.map(e => (
              <option key={e.id} value={e.title}>{e.title} · {e.test_type}</option>
            ))}
          </select>
          {titleOptions.length === 0 && (
            <p className="text-[10px] font-bold text-rose-500 mt-1">
              No fully-entered final exams in this year
            </p>
          )}
        </div>
      )}

      {loadingResults && (
        <div className="text-center text-xs font-bold text-slate-400 py-4">Loading results…</div>
      )}

      {examTitle && !loadingResults && rows.length > 0 && (
        <button onClick={() => setPreview(true)}
          className="w-full flex items-center justify-center gap-2 bg-amber-600 text-white font-black text-sm uppercase py-4 rounded-2xl active:scale-95 shadow-md">
          <Eye size={16} /> Preview Marksheet ({rows.length} subjects)
        </button>
      )}
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// Admit Card
// ───────────────────────────────────────────────────────────────────────────

const AdmitFlow: React.FC<{ student: Student; schoolInfo: SchoolInfo; onError: (m: string) => void }> = ({
  student, schoolInfo, onError,
}) => {
  const [exams, setExams] = useState<Array<{ id: string; title: string; subject: string; test_type: string; scheduled_date: string | null; duration: number | null; max_marks: number | null }>>([]);
  const [examId, setExamId] = useState('');
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() + 30);
    const todayIso  = today.toISOString().slice(0, 10);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    apiExams.list({ className: student.className })
      .then((list: any[]) => {
        const upcoming = list.filter(e =>
          !e.results_uploaded &&
          e.scheduled_date &&
          e.scheduled_date >= todayIso &&
          e.scheduled_date <= cutoffIso &&
          // Match section if the exam is section-specific. Section-agnostic
          // (school-wide) exams have section_id=null and apply to everyone.
          (!e.section || e.section === student.section)
        );
        setExams(upcoming);
        if (upcoming.length === 1) setExamId(upcoming[0].id);
      })
      .catch(() => setExams([]))
      .finally(() => setLoading(false));
  }, [student.className, student.section]);

  const picked = exams.find(e => e.id === examId);
  const examShape: AdmitCardExam | null = picked ? {
    title: picked.title,
    subject: picked.subject ?? '—',
    testType: picked.test_type ?? 'EXAM',
    scheduledDate: picked.scheduled_date,
    duration: picked.duration,
    maxMarks: picked.max_marks,
  } : null;

  const download = async () => {
    if (!ref.current || !picked) return;
    try { await downloadNodeAsPdf(ref.current, `admit-${student.admissionNo}-${picked.title.replace(/\s+/g, '-')}.pdf`); }
    catch (e) { onError(e instanceof Error ? e.message : 'PDF export failed'); }
  };

  if (preview && examShape) {
    return (
      <>
        <AdmitCardPrint
          ref={ref}
          schoolInfo={schoolInfo}
          studentName={student.name}
          admissionNo={student.admissionNo}
          className={student.className}
          section={student.section}
          rollNo={student.rollNo}
          fatherName={student.fatherName}
          exam={examShape}
          instructions={DEFAULT_ADMIT_INSTRUCTIONS}
        />
        <div className="grid grid-cols-2 gap-3 mt-4">
          <button onClick={printCurrentPage}
            className="flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white font-black text-sm uppercase py-3 rounded-2xl">
            <Printer size={16} /> Print
          </button>
          <button onClick={download}
            className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-sm uppercase py-3 rounded-2xl">
            <Download size={16} /> Download PDF
          </button>
        </div>
      </>
    );
  }

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-400" size={20} /></div>;
  }
  if (exams.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400">
        <Ticket size={32} className="mx-auto mb-3 opacity-40" />
        <p className="font-bold text-sm">No upcoming exams</p>
        <p className="text-[10px] font-bold text-slate-300 mt-1">
          Admit cards appear when an exam is scheduled in the next 30 days.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4">
        <p className="font-black text-rose-900 text-sm">Upcoming Exam Admit Card</p>
        <p className="text-xs font-bold text-rose-700 mt-0.5">
          For {student.name} · {student.className}-{student.section}
        </p>
      </div>
      <div className="space-y-2">
        {exams.map(e => (
          <button key={e.id} onClick={() => setExamId(e.id)}
            className={`w-full text-left p-4 rounded-2xl border-2 transition-colors ${
              examId === e.id ? 'border-rose-500 bg-rose-50' : 'border-slate-200 bg-white hover:border-slate-300'
            }`}>
            <div className="flex items-center justify-between gap-2">
              <div className="font-black text-slate-900 text-sm">{e.title}</div>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {e.test_type}
              </span>
            </div>
            <div className="text-[11px] font-bold text-slate-500 mt-1">
              {e.subject ?? '—'} · {e.scheduled_date ?? 'Date TBD'} · {e.duration ? `${e.duration} min` : '—'} · Max {e.max_marks ?? '—'}
            </div>
          </button>
        ))}
      </div>
      {examId && (
        <button onClick={() => setPreview(true)}
          className="w-full flex items-center justify-center gap-2 bg-rose-600 text-white font-black text-sm uppercase py-4 rounded-2xl active:scale-95 shadow-md">
          <Eye size={16} /> Preview Admit Card
        </button>
      )}
    </div>
  );
};
