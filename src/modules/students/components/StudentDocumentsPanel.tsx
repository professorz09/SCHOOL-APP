// Compact in-place document generator. Each doc lives as a card that
// expands inline showing any extra inputs it needs (purpose for
// bonafide, exam picker for admit/marksheet), then a single
// "Generate & Download" button kicks off the PDF. The printable
// component renders into a hidden `.print-only` slot so downloadPDF
// can snapshot it.

import React, { useEffect, useRef, useState } from 'react';
import {
  Award, BadgeCheck, Download, Printer, Ticket, Loader2, ChevronDown, Users, User, FileText,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { apiExams } from '@/lib/apiClient';
import { schoolInfoService, type SchoolInfo } from '@/shared/utils/schoolInfo.service';
import { handlePrint, downloadPDF } from '@/shared/utils/htmlToPdf';
import { useUIStore } from '@/store/uiStore';
import { studentService } from '@/modules/students/student.service';
import type { Student } from '@/modules/students/student.types';
import { BonafidePrint } from '@/shared/components/documents/BonafidePrint';
import {
  MarksheetPrint, type MarksheetSubjectRow,
} from '@/shared/components/documents/MarksheetPrint';
import {
  AdmitCardPrint, DEFAULT_ADMIT_INSTRUCTIONS, type AdmitCardExam,
} from '@/shared/components/documents/AdmitCardPrint';
import {
  AdmissionFormSheet, studentToAdmissionRow, schoolInfoToHeader,
} from '@/shared/components/documents/AdmissionFormSheet';

interface Props { student: Student; }

type DocKey = 'BONAFIDE' | 'MARKSHEET' | 'ADMIT';

export const StudentDocumentsPanel: React.FC<Props> = ({ student }) => {
  const { showToast } = useUIStore();
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo | null>(null);
  const [open, setOpen] = useState<DocKey | null>(null);
  const [admissionBusy, setAdmissionBusy] = useState(false);

  const downloadAdmission = async () => {
    if (admissionBusy) return;
    setAdmissionBusy(true);
    try {
      const safeName = student.name.replace(/[^a-zA-Z0-9]+/g, '_');
      await downloadPDF('print-area-doc-admission',
        `Admission_${safeName}_${student.admissionNo}.pdf`);
      showToast('Admission form saved');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'PDF export failed', 'error');
    } finally {
      setAdmissionBusy(false);
    }
  };
  // Class peers — fetched once, used by the bulk-mode generators in
  // each row. Includes the focused student; rows filter by section.
  const [classPeers, setClassPeers] = useState<Student[]>([]);

  useEffect(() => { schoolInfoService.get().then(setSchoolInfo).catch(() => {}); }, []);

  useEffect(() => {
    if (!student.className) { setClassPeers([student]); return; }
    studentService.getAll()
      .then(all => {
        const peers = all.filter(s =>
          s.className === student.className && s.section === student.section,
        );
        setClassPeers(peers.length ? peers : [student]);
      })
      .catch(() => setClassPeers([student]));
  }, [student.id, student.className, student.section]);

  // Dynamic Tailwind class names like `bg-${color}-100` are silently
  // pruned by the JIT scanner, so each doc carries its full class
  // strings inline. Saves a safelist config and keeps the design
  // self-contained at the component.
  const docs: Array<{
    key: DocKey; label: string; subtitle: string; icon: React.ReactNode;
    iconBg: string; openBorder: string; openBg: string;
  }> = [
    { key: 'BONAFIDE',  label: 'Bonafide',   subtitle: 'Certify enrolment',
      icon: <BadgeCheck size={20} />,
      iconBg: 'bg-indigo-100 text-indigo-700',
      openBorder: 'border-indigo-200', openBg: 'bg-indigo-50/30' },
    { key: 'ADMIT',     label: 'Admit Card', subtitle: 'For upcoming exam',
      icon: <Ticket size={20} />,
      iconBg: 'bg-rose-100 text-rose-700',
      openBorder: 'border-rose-200', openBg: 'bg-rose-50/30' },
    { key: 'MARKSHEET', label: 'Marksheet',  subtitle: 'Subject-wise report',
      icon: <Award size={20} />,
      iconBg: 'bg-amber-100 text-amber-700',
      openBorder: 'border-amber-200', openBg: 'bg-amber-50/30' },
  ];

  if (!schoolInfo) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <Download size={14} className="text-slate-400" />
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Documents</p>
        </div>
        <div className="flex items-center justify-center py-6 text-slate-400">
          <Loader2 className="animate-spin" size={18} />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Download size={14} className="text-slate-400" />
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Documents</p>
        </div>
        <span className="text-[9px] font-bold text-slate-400">Tap to generate</span>
      </div>
      <div className="space-y-2">
        {/* Admission Form — true one-click. Hidden print area below is
            always mounted; the button snapshots it via downloadPDF
            without any extra confirmation, picker, or modal step. */}
        <button onClick={downloadAdmission} disabled={admissionBusy}
          className="w-full flex items-center justify-between gap-3 px-3.5 py-3 rounded-xl border border-slate-100 bg-white hover:border-sky-200 hover:bg-sky-50/30 active:scale-[0.99] transition-all disabled:opacity-60">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-sky-100 text-sky-700">
              <FileText size={20} />
            </div>
            <div className="min-w-0 text-left">
              <div className="font-black text-sm text-slate-900 leading-tight">Admission Form</div>
              <div className="text-[10px] font-bold text-slate-400 mt-0.5 truncate">
                {admissionBusy ? 'Generating…' : 'One-click download'}
              </div>
            </div>
          </div>
          {admissionBusy
            ? <Loader2 size={16} className="text-slate-400 shrink-0 animate-spin" />
            : <Download size={16} className="text-slate-400 shrink-0" />}
        </button>
        {docs.map(d => {
          const isOpen = open === d.key;
          return (
            <div key={d.key}
              className={`rounded-xl border transition-colors overflow-hidden ${
                isOpen ? `${d.openBorder} ${d.openBg}` : 'border-slate-100 bg-white hover:border-slate-200'
              }`}>
              <button onClick={() => setOpen(isOpen ? null : d.key)}
                className="w-full flex items-center justify-between gap-3 px-3.5 py-3 active:scale-[0.99] transition-transform">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${d.iconBg}`}>
                    {d.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="font-black text-sm text-slate-900 leading-tight">{d.label}</div>
                    <div className="text-[10px] font-bold text-slate-400 mt-0.5 truncate">{d.subtitle}</div>
                  </div>
                </div>
                <ChevronDown size={16}
                  className={`text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-100/70">
                  {d.key === 'BONAFIDE'  && <BonafideRow student={student} classPeers={classPeers} schoolInfo={schoolInfo}
                    onError={m => showToast(m, 'error')} onDone={m => showToast(m)} />}
                  {d.key === 'ADMIT'     && <AdmitRow student={student} classPeers={classPeers} schoolInfo={schoolInfo}
                    onError={m => showToast(m, 'error')} onDone={m => showToast(m)} />}
                  {d.key === 'MARKSHEET' && <MarksheetRow student={student} classPeers={classPeers} schoolInfo={schoolInfo}
                    onError={m => showToast(m, 'error')} onDone={m => showToast(m)} />}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {/* Always-mounted hidden print area for one-click admission
          download — keeping it out of the per-doc lazy expansion so the
          button has no warm-up delay. */}
      <div className="print-only">
        <div id="print-area-doc-admission" className="w-[794px] mx-auto bg-white avoid-break">
          <AdmissionFormSheet row={studentToAdmissionRow(student)}
            {...schoolInfoToHeader(schoolInfo)}
            logoUrl={schoolInfo.logoPath ? schoolInfoService.getAssetUrl(schoolInfo.logoPath) : ''} />
        </div>
      </div>
    </div>
  );
};

// "This student" vs "Whole class" segmented control. Reused by every
// doc row so the bulk-mode UX is identical across Bonafide / Admit /
// Marksheet — once a principal learns it on one, the rest are free.
const ScopeToggle: React.FC<{
  scope: 'SINGLE' | 'BULK';
  setScope: (s: 'SINGLE' | 'BULK') => void;
  classLabel: string;
  bulkCount: number;
}> = ({ scope, setScope, classLabel, bulkCount }) => (
  <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg mb-3">
    <button onClick={() => setScope('SINGLE')}
      className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md font-bold text-[10px] uppercase tracking-widest transition-all ${
        scope === 'SINGLE'
          ? 'bg-white text-slate-900 shadow-sm'
          : 'text-slate-500 hover:text-slate-700'
      }`}>
      <User size={11} /> One Student
    </button>
    <button onClick={() => setScope('BULK')}
      className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md font-bold text-[10px] uppercase tracking-widest transition-all ${
        scope === 'BULK'
          ? 'bg-white text-slate-900 shadow-sm'
          : 'text-slate-500 hover:text-slate-700'
      }`}>
      <Users size={11} /> {classLabel} · {bulkCount}
    </button>
  </div>
);

// Shared action bar — Print + Generate & Download. Manages the loading
// label on the download button so the user gets a "Generating…" hint
// instead of a frozen UI on bulk-page docs.
const ActionBar: React.FC<{
  onPrint: () => void;
  onDownload: () => Promise<void>;
  downloadLabel: string;
  ariaId: string;
}> = ({ onPrint, onDownload, downloadLabel, ariaId }) => {
  const [busy, setBusy] = useState(false);
  const handle = async () => {
    if (busy) return;
    setBusy(true);
    try { await onDownload(); } finally { setBusy(false); }
  };
  return (
    <div className="flex gap-2 pt-1">
      <button onClick={onPrint}
        className="flex-1 flex items-center justify-center gap-2 px-3 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-[11px] uppercase tracking-widest rounded-xl active:scale-[0.98] transition-all">
        <Printer size={14} /> Print
      </button>
      <button id={ariaId} onClick={handle} disabled={busy}
        className="flex-[1.5] flex items-center justify-center gap-2 px-3 py-3 bg-slate-900 hover:bg-black text-white font-black text-[11px] uppercase tracking-widest rounded-xl disabled:opacity-60 active:scale-[0.98] transition-all shadow-sm">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        {busy ? 'Generating…' : downloadLabel}
      </button>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// Bonafide — optional purpose input, no required pickers
// ───────────────────────────────────────────────────────────────────────────

const BonafideRow: React.FC<{ student: Student; classPeers: Student[]; schoolInfo: SchoolInfo; onError: (m: string) => void; onDone: (m: string) => void }> = ({
  student, classPeers, schoolInfo, onError, onDone,
}) => {
  const [purpose, setPurpose] = useState('');
  const [scope, setScope] = useState<'SINGLE' | 'BULK'>('SINGLE');
  const targets = scope === 'SINGLE' ? [student] : classPeers;

  const download = async () => {
    try {
      const filename = scope === 'SINGLE'
        ? `bonafide-${student.admissionNo}.pdf`
        : `bonafide-${student.className}-${student.section}-${targets.length}.pdf`;
      await downloadPDF('print-area-doc-bonafide', filename);
      onDone(scope === 'BULK' ? `${targets.length} bonafides saved` : 'Bonafide saved');
    } catch (e) { onError(e instanceof Error ? e.message : 'PDF export failed'); }
  };

  return (
    <div className="space-y-3">
      <ScopeToggle scope={scope} setScope={setScope}
        classLabel={`${student.className}-${student.section}`} bulkCount={classPeers.length} />
      <div>
        <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1.5 block">
          Purpose <span className="text-slate-400 normal-case tracking-normal">(optional)</span>
        </label>
        <input type="text" value={purpose} onChange={e => setPurpose(e.target.value)}
          placeholder="e.g. Passport application, scholarship"
          className="w-full px-3 py-2.5 bg-white border-2 border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:border-indigo-500" />
        {scope === 'BULK' && (
          <p className="text-[10px] font-bold text-slate-500 mt-1.5">Same purpose applied to all {targets.length} certificates.</p>
        )}
      </div>
      <ActionBar onPrint={handlePrint} onDownload={download}
        downloadLabel={scope === 'BULK' ? `Generate ${targets.length}` : 'Generate'}
        ariaId={`btn-dl-bonafide-${student.id}`} />
      {/* Hidden print target — one per student, each with .avoid-break
          so the page slicer puts each on its own A4. */}
      <div className="print-only">
        <div id="print-area-doc-bonafide" className="w-[794px] mx-auto bg-white">
          {targets.map(s => (
            <div key={s.id} className="avoid-break">
              <BonafidePrint schoolInfo={schoolInfo}
                studentName={s.name} fatherName={s.fatherName}
                className={s.className} section={s.section}
                purpose={purpose.trim() || undefined} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// Admit Card — upcoming exam picker
// ───────────────────────────────────────────────────────────────────────────

const AdmitRow: React.FC<{ student: Student; classPeers: Student[]; schoolInfo: SchoolInfo; onError: (m: string) => void; onDone: (m: string) => void }> = ({
  student, classPeers, schoolInfo, onError, onDone,
}) => {
  const [exams, setExams] = useState<Array<{ id: string; title: string; subject: string; test_type: string; scheduled_date: string | null; duration: number | null; max_marks: number | null }>>([]);
  const [examId, setExamId] = useState('');
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<'SINGLE' | 'BULK'>('SINGLE');
  const targets = scope === 'SINGLE' ? [student] : classPeers;

  useEffect(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() + 30);
    const todayIso = today.toISOString().slice(0, 10);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    apiExams.list({ className: student.className })
      .then((list: any[]) => {
        const upcoming = list.filter(e =>
          !e.results_uploaded && e.scheduled_date &&
          e.scheduled_date >= todayIso && e.scheduled_date <= cutoffIso &&
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
    title: picked.title, subject: picked.subject ?? '—',
    testType: picked.test_type ?? 'EXAM',
    scheduledDate: picked.scheduled_date,
    duration: picked.duration, maxMarks: picked.max_marks,
  } : null;

  const download = async () => {
    if (!picked) return onError('Pick an exam first');
    try {
      const safeTitle = picked.title.replace(/\s+/g, '-');
      const filename = scope === 'SINGLE'
        ? `admit-${student.admissionNo}-${safeTitle}.pdf`
        : `admit-${student.className}-${student.section}-${safeTitle}-${targets.length}.pdf`;
      await downloadPDF('print-area-doc-admit', filename);
      onDone(scope === 'BULK' ? `${targets.length} admit cards saved` : 'Admit card saved');
    } catch (e) { onError(e instanceof Error ? e.message : 'PDF export failed'); }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-4 text-slate-400"><Loader2 className="animate-spin" size={16} /></div>;
  }
  if (exams.length === 0) {
    return (
      <p className="text-xs font-bold text-slate-500 py-2">
        No upcoming exams in the next 30 days for {student.className}-{student.section}.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <ScopeToggle scope={scope} setScope={setScope}
        classLabel={`${student.className}-${student.section}`} bulkCount={classPeers.length} />
      <div>
        <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1.5 block">Exam *</label>
        <select value={examId} onChange={e => setExamId(e.target.value)}
          className="w-full px-3 py-2.5 bg-white border-2 border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:border-rose-500">
          <option value="">— Pick exam —</option>
          {exams.map(e => (
            <option key={e.id} value={e.id}>{e.title} · {e.subject} · {e.scheduled_date ?? '—'}</option>
          ))}
        </select>
        {scope === 'BULK' && (
          <p className="text-[10px] font-bold text-slate-500 mt-1.5">Same exam admit card for all {targets.length} students.</p>
        )}
      </div>
      <ActionBar onPrint={handlePrint} onDownload={download}
        downloadLabel={scope === 'BULK' ? `Generate ${targets.length}` : 'Generate'}
        ariaId={`btn-dl-admit-${student.id}`} />
      <div className="print-only">
        {examShape && (
          <div id="print-area-doc-admit" className="w-[794px] mx-auto bg-white">
            {targets.map(s => (
              <div key={s.id} className="avoid-break">
                <AdmitCardPrint schoolInfo={schoolInfo}
                  studentName={s.name} admissionNo={s.admissionNo}
                  className={s.className} section={s.section}
                  rollNo={s.rollNo} fatherName={s.fatherName}
                  exam={examShape} instructions={DEFAULT_ADMIT_INSTRUCTIONS} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// Marksheet — final exam picker (by year + title)
// ───────────────────────────────────────────────────────────────────────────

const MarksheetRow: React.FC<{ student: Student; classPeers: Student[]; schoolInfo: SchoolInfo; onError: (m: string) => void; onDone: (m: string) => void }> = ({
  student, classPeers, schoolInfo, onError, onDone,
}) => {
  const [years, setYears] = useState<Array<{ id: string; label: string }>>([]);
  const [yearId, setYearId] = useState('');
  const [allExams, setAllExams] = useState<Array<{ id: string; title: string; subject: string; max_marks: number; test_type: string }>>([]);
  const [examTitle, setExamTitle] = useState('');
  const [rows, setRows] = useState<MarksheetSubjectRow[]>([]);
  const [bulkRows, setBulkRows] = useState<Map<string, MarksheetSubjectRow[]>>(new Map());
  const [loadingYears, setLoadingYears] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);
  const [scope, setScope] = useState<'SINGLE' | 'BULK'>('SINGLE');
  const targets = scope === 'SINGLE' ? [student] : classPeers;

  useEffect(() => {
    setLoadingYears(true);
    (async () => {
      try {
        const { data: marks } = await supabase
          .from('exam_results').select('test_id, academic_year_id')
          .eq('student_id', student.id);
        const yearIds = Array.from(new Set(((marks ?? []) as { academic_year_id: string }[]).map(r => r.academic_year_id)));
        if (yearIds.length === 0) { setYears([]); return; }
        const { data: yrs } = await supabase
          .from('academic_years').select('id, label').in('id', yearIds);
        const opts = ((yrs ?? []) as { id: string; label: string }[])
          .map(y => ({ id: y.id, label: y.label }))
          .sort((a, b) => b.label.localeCompare(a.label));
        setYears(opts);
        if (opts.length === 1) setYearId(opts[0].id);
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Could not load years');
      } finally { setLoadingYears(false); }
    })();
  }, [student.id]);

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

  // Pull subject-wise results for the selected title. In bulk mode we
  // collect results for EVERY classmate so each marksheet row in the
  // PDF carries the right student's marks (not a copy of the focused
  // one's). Single mode is just `rows`; bulk mode populates bulkRows.
  useEffect(() => {
    if (!examTitle) { setRows([]); setBulkRows(new Map()); return; }
    const titleExams = allExams.filter(e => e.title === examTitle);
    setLoadingResults(true);
    Promise.all(
      titleExams.map(exam =>
        apiExams.getResults(exam.id).catch(() => [] as any[])
          .then((res: any[]) => ({ exam, res })),
      ),
    )
      .then(pulls => {
        const buildFor = (sid: string): MarksheetSubjectRow[] =>
          pulls.map(({ exam, res }) => {
            const mine = res.find((r: any) => r.student_id === sid);
            return {
              subject: exam.subject ?? '—',
              maxMarks: exam.max_marks ?? 0,
              obtainedMarks: mine ? Number(mine.obtained_marks ?? mine.marks ?? 0) : null,
              grade: mine?.grade ?? undefined,
            } as MarksheetSubjectRow;
          }).sort((a, b) => a.subject.localeCompare(b.subject));

        setRows(buildFor(student.id));
        const map = new Map<string, MarksheetSubjectRow[]>();
        for (const p of classPeers) map.set(p.id, buildFor(p.id));
        setBulkRows(map);
      })
      .finally(() => setLoadingResults(false));
  }, [examTitle, student.id, classPeers]);

  const download = async () => {
    if (rows.length === 0) return onError('No results to print yet');
    try {
      const safeTitle = examTitle.replace(/\s+/g, '-');
      const filename = scope === 'SINGLE'
        ? `marksheet-${student.admissionNo}-${safeTitle}.pdf`
        : `marksheet-${student.className}-${student.section}-${safeTitle}-${targets.length}.pdf`;
      await downloadPDF('print-area-doc-marksheet', filename);
      onDone(scope === 'BULK' ? `${targets.length} marksheets saved` : 'Marksheet saved');
    } catch (e) { onError(e instanceof Error ? e.message : 'PDF export failed'); }
  };

  if (loadingYears) {
    return <div className="flex items-center justify-center py-4 text-slate-400"><Loader2 className="animate-spin" size={16} /></div>;
  }
  if (years.length === 0) {
    return <p className="text-xs font-bold text-slate-500 py-2">No exam results published yet for this student.</p>;
  }

  return (
    <div className="space-y-3">
      <ScopeToggle scope={scope} setScope={setScope}
        classLabel={`${student.className}-${student.section}`} bulkCount={classPeers.length} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1.5 block">Year</label>
          <select value={yearId} onChange={e => setYearId(e.target.value)}
            className="w-full px-3 py-2.5 bg-white border-2 border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:border-amber-500">
            {years.length > 1 && <option value="">— Pick year —</option>}
            {years.map(y => <option key={y.id} value={y.id}>{y.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1.5 block">Exam</label>
          <select value={examTitle} onChange={e => setExamTitle(e.target.value)}
            disabled={!yearId || titleOptions.length === 0}
            className="w-full px-3 py-2.5 bg-white border-2 border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:border-amber-500 disabled:opacity-50">
            <option value="">{titleOptions.length === 0 ? '— No exams —' : '— Pick exam —'}</option>
            {titleOptions.map(e => <option key={e.id} value={e.title}>{e.title}</option>)}
          </select>
        </div>
      </div>
      {loadingResults && (
        <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
          <Loader2 className="animate-spin" size={14} /> Loading results…
        </div>
      )}
      {examTitle && !loadingResults && rows.length > 0 && scope === 'SINGLE' && (
        <p className="text-[10px] font-bold text-slate-500">{rows.length} subjects loaded</p>
      )}
      {scope === 'BULK' && !loadingResults && bulkRows.size > 0 && (
        <p className="text-[10px] font-bold text-slate-500">{targets.length} marksheets ready</p>
      )}
      <ActionBar onPrint={handlePrint} onDownload={download}
        downloadLabel={scope === 'BULK' ? `Generate ${targets.length}` : 'Generate'}
        ariaId={`btn-dl-marksheet-${student.id}`} />
      <div className="print-only">
        {rows.length > 0 && (
          <div id="print-area-doc-marksheet" className="w-[794px] mx-auto bg-white">
            {targets.map(s => {
              const r = scope === 'SINGLE' ? rows : (bulkRows.get(s.id) ?? []);
              if (r.length === 0) return null;
              return (
                <div key={s.id} className="avoid-break">
                  <MarksheetPrint schoolInfo={schoolInfo}
                    studentName={s.name} admissionNo={s.admissionNo}
                    className={s.className} section={s.section}
                    rollNo={s.rollNo} fatherName={s.fatherName}
                    examTitle={examTitle} rows={r} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
