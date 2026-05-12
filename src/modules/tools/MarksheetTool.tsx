// Marksheet Tool — Toolsedu pattern with school-data integration.
//
// Workflow:
//   1. Set school name, academic year, exam name.
//   2. Configure subjects (add/remove + max marks per subject).
//   3. Pick students from class roster (DataInputSection).
//   4. Marks can be entered manually OR pulled from existing
//      exam_results via "Load Marks from Exams" — fetches the
//      selected year's exam list, you pick an exam title, and each
//      classmate's subject-wise marks slot into their row.
//   5. Print / Download. Father's Name auto-appears on every sheet.

import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Sparkles, Loader2 } from 'lucide-react';
import { DataInputSection } from './components/DataInputSection';
import { ToolShell, ToolCard, ToolField, ToolLabel } from './components/ToolShell';
import type { Student } from '@/modules/students/student.types';
import type { SchoolInfo } from '@/shared/utils/schoolInfo.service';
import { schoolInfoService } from '@/shared/utils/schoolInfo.service';
import { useUIStore } from '@/store/uiStore';
import { supabase } from '@/lib/supabase';
import { apiExams } from '@/lib/apiClient';

interface Props {
  onBack: () => void;
  students: Student[];
  schoolInfo: SchoolInfo | null;
}

// Keys that are NOT subjects (name/class/roll/fatherName). Subject
// columns are dynamic — anything else in the row is a subject.
const STANDARD_KEYS = ['name', 'class', 'roll', 'fatherName'];

const calculateGrade = (pct: number): string => {
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B';
  if (pct >= 60) return 'C';
  if (pct >= 45) return 'D';
  if (pct >= 33) return 'E';
  return 'F';
};

interface SubjectConfig { name: string; maxMarks: number; passMarks: number; }

// Default passing = 33 % of max marks (CBSE / state board norm).
const defaultPass = (max: number) => Math.ceil(max * 0.33);

const DEFAULT_SUBJECTS: SubjectConfig[] = [
  { name: 'English',        maxMarks: 100, passMarks: 33 },
  { name: 'Hindi',          maxMarks: 100, passMarks: 33 },
  { name: 'Mathematics',    maxMarks: 100, passMarks: 33 },
  { name: 'Science',        maxMarks: 100, passMarks: 33 },
  { name: 'Social Studies', maxMarks: 100, passMarks: 33 },
];

export const MarksheetTool: React.FC<Props> = ({ onBack, students, schoolInfo }) => {
  const { showToast } = useUIStore();
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [schoolName, setSchoolName] = useState(schoolInfo?.name || 'School Name');
  const [academicYear, setAcademicYear] = useState('2025-2026');
  const [examTitle, setExamTitle] = useState('Final Examination');
  const [subjects, setSubjects] = useState<SubjectConfig[]>(DEFAULT_SUBJECTS);
  const logoUrl = schoolInfo?.logoPath ? schoolInfoService.getAssetUrl(schoolInfo.logoPath) : '';

  // ─── Load Marks from Exams ───────────────────────────────────────────
  const [loadOpen, setLoadOpen] = useState(false);
  const [years, setYears] = useState<Array<{ id: string; label: string }>>([]);
  const [pickedYearId, setPickedYearId] = useState('');
  const [examTitles, setExamTitles] = useState<string[]>([]);
  const [pickedExamTitle, setPickedExamTitle] = useState('');
  const [loadingResults, setLoadingResults] = useState(false);

  React.useEffect(() => { if (schoolInfo?.name) setSchoolName(schoolInfo.name); }, [schoolInfo]);

  // Year list: every academic year tied to this school.
  useEffect(() => {
    if (!loadOpen) return;
    (async () => {
      const { data: rows } = await supabase
        .from('academic_years').select('id, label')
        .order('label', { ascending: false });
      const opts = ((rows ?? []) as { id: string; label: string }[])
        .map(y => ({ id: y.id, label: y.label }));
      setYears(opts);
      if (opts.length === 1) setPickedYearId(opts[0].id);
    })();
  }, [loadOpen]);

  // Find every student in the current data (Load Class → data has
  // class students); we pull their results in bulk for the chosen
  // exam title. Works for any classroom worth of marksheets.
  const studentIdsInData = React.useMemo(() => {
    const ids = new Set<string>();
    for (const r of data) {
      const adm = String(r.admissionNo ?? '');
      if (adm) {
        const s = students.find(x => x.admissionNo === adm);
        if (s) ids.add(s.id);
      }
    }
    return ids;
  }, [data, students]);

  // Exam titles available in the selected year for the current class
  // (uses first row's class as the filter).
  useEffect(() => {
    if (!pickedYearId) { setExamTitles([]); return; }
    const firstClass = data.length > 0 ? String(data[0].class ?? '').split('-')[0]?.trim() : '';
    apiExams.list({ yearId: pickedYearId, className: firstClass || undefined })
      .then((list: any[]) => {
        const titles = Array.from(new Set(
          list.filter(e => e.results_uploaded).map(e => e.title as string),
        )).sort();
        setExamTitles(titles);
        if (titles.length === 1) setPickedExamTitle(titles[0]);
      })
      .catch(() => setExamTitles([]));
  }, [pickedYearId, data]);

  const loadMarksFromExams = async () => {
    if (!pickedYearId || !pickedExamTitle) {
      showToast('Pick a year and exam first', 'error'); return;
    }
    setLoadingResults(true);
    try {
      const firstClass = data.length > 0 ? String(data[0].class ?? '').split('-')[0]?.trim() : '';
      const list = await apiExams.list({ yearId: pickedYearId, className: firstClass || undefined });
      const matchingExams = (list as any[]).filter(e => e.title === pickedExamTitle && e.results_uploaded);
      if (matchingExams.length === 0) { showToast('No exams matched', 'error'); return; }

      // Build a "studentId -> subject -> { mark, max }" map.
      const marksByStudent = new Map<string, Map<string, { mark: number | null; max: number }>>();
      for (const exam of matchingExams) {
        const subj = (exam.subject ?? '').trim();
        const max = Number(exam.max_marks ?? 100);
        const results = await apiExams.getResults(exam.id).catch(() => [] as any[]);
        for (const r of results as any[]) {
          if (!studentIdsInData.has(r.student_id)) continue;
          const sm = marksByStudent.get(r.student_id) ?? new Map();
          sm.set(subj, { mark: r.obtained_marks != null ? Number(r.obtained_marks) : null, max });
          marksByStudent.set(r.student_id, sm);
        }
      }

      // Patch data rows with the loaded marks, AND keep the user's
      // configured subject list in sync (add any new subjects we saw
      // in the exam results that weren't already configured).
      const allSubjects = new Set<string>(subjects.map(s => s.name));
      const newConfigs: SubjectConfig[] = [...subjects];
      for (const m of marksByStudent.values()) {
        for (const [subj, info] of m.entries()) {
          if (!allSubjects.has(subj)) {
            newConfigs.push({ name: subj, maxMarks: info.max, passMarks: defaultPass(info.max) });
            allSubjects.add(subj);
          }
        }
      }
      setSubjects(newConfigs);

      // Patch data: for each row, find its studentId and write subject marks.
      const patched = data.map(row => {
        const adm = String(row.admissionNo ?? '');
        const stu = students.find(x => x.admissionNo === adm);
        if (!stu) return row;
        const subjMap = marksByStudent.get(stu.id);
        if (!subjMap) return row;
        const next: Record<string, unknown> = { ...row };
        for (const [subj, info] of subjMap.entries()) {
          next[subj] = info.mark != null ? String(info.mark) : '';
        }
        return next;
      });
      setData(patched);
      setLoadOpen(false);
      showToast(`Marks loaded from "${pickedExamTitle}"`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load marks', 'error');
    } finally { setLoadingResults(false); }
  };

  // ─── Subject manager ─────────────────────────────────────────────────
  const addSubject = () => setSubjects(s => [...s, { name: '', maxMarks: 100, passMarks: 33 }]);
  const removeSubject = (i: number) => setSubjects(s => s.filter((_, idx) => idx !== i));
  const updateSubject = (i: number, patch: Partial<SubjectConfig>) =>
    setSubjects(s => s.map((sub, idx) => {
      if (idx !== i) return sub;
      const next = { ...sub, ...patch };
      // Auto-recompute passMarks to 33 % when max changes AND
      // passMarks was still at the previous default. This keeps the
      // form ergonomic — type "Max 80" and the pass field updates
      // to 27 unless the user has manually overridden it.
      if (patch.maxMarks !== undefined && sub.passMarks === defaultPass(sub.maxMarks)) {
        next.passMarks = defaultPass(next.maxMarks);
      }
      return next;
    }));

  // ─── Build fields list dynamically from configured subjects ─────────
  const fields = React.useMemo(() => [
    { key: 'name',       label: 'Student Name' },
    { key: 'fatherName', label: "Father's Name" },
    { key: 'class',      label: 'Class/Grade' },
    { key: 'roll',       label: 'Roll Number' },
    ...subjects.filter(s => s.name.trim()).map(s => ({ key: s.name, label: `${s.name} (/${s.maxMarks})` })),
  ], [subjects]);

  const mapStudent = (s: Student): Record<string, unknown> => ({
    name: s.name,
    fatherName: s.fatherName || '',
    class: `${s.className}-${s.section}`,
    roll: s.rollNo || '',
    admissionNo: s.admissionNo, // hidden carrier for exam-results lookup
  });

  const subjectMaxMap = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const s of subjects) { if (s.name.trim()) m.set(s.name, s.maxMarks); }
    return m;
  }, [subjects]);

  const subjectPassMap = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const s of subjects) {
      if (s.name.trim()) m.set(s.name, Math.max(0, Math.min(s.passMarks, s.maxMarks)));
    }
    return m;
  }, [subjects]);

  return (
    <ToolShell
      title="Marksheets"
      subtitle="Report cards from exam data or manual entry"
      onBack={onBack}
      hasData={data.length > 0}
      previewLabel={data.length > 0 ? <span className="ml-1 text-[10px] font-bold opacity-70">({data.length})</span> : null}
      filename="marksheets.pdf"
      printTargetId="print-area-marksheets"
      edit={(
        <>
          <ToolCard title="Marksheet Header">
            <ToolField label="School Name" value={schoolName} onChange={setSchoolName} />
            <div className="grid grid-cols-2 gap-3">
              <ToolField label="Academic Year" value={academicYear} onChange={setAcademicYear} />
              <ToolField label="Exam Name" value={examTitle} onChange={setExamTitle} placeholder="Final Examination" />
            </div>
          </ToolCard>

          <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between px-1">
              <ToolLabel>Subjects ({subjects.length})</ToolLabel>
              <button onClick={addSubject}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-900 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest active:scale-95 transition-all">
                <Plus size={12} /> Add
              </button>
            </div>
            <p className="text-[10px] font-medium text-slate-400 px-1 leading-snug">
              Name · Max · Pass marks. Default pass = 33% of max, edit kar sakte hain.
            </p>
            {subjects.map((sub, i) => (
              <div key={i} className="flex gap-2 items-center bg-slate-50 border border-slate-200 rounded-lg p-2">
                <input type="text" value={sub.name}
                  onChange={e => updateSubject(i, { name: e.target.value })}
                  placeholder="Subject (e.g. Mathematics)"
                  className="flex-1 min-w-0 px-2.5 py-1.5 bg-white border border-slate-200 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <input type="number" min={1} max={500} value={sub.maxMarks}
                  onChange={e => updateSubject(i, { maxMarks: parseInt(e.target.value) || 0 })}
                  className="w-14 px-2 py-1.5 bg-white border border-slate-200 rounded-md text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  title="Max marks" placeholder="Max" />
                <span className="text-[10px] font-bold text-slate-400">/</span>
                <input type="number" min={0} max={sub.maxMarks} value={sub.passMarks}
                  onChange={e => updateSubject(i, { passMarks: parseInt(e.target.value) || 0 })}
                  className="w-14 px-2 py-1.5 bg-white border border-amber-200 rounded-md text-sm font-bold text-center text-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  title="Pass marks" placeholder="Pass" />
                <button onClick={() => removeSubject(i)}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors shrink-0">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <DataInputSection data={data} setData={setData} fields={fields}
            title="Students" students={students} mapStudent={mapStudent} />

          {data.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <button onClick={() => setLoadOpen(o => !o)}
                className="w-full flex items-center gap-3 active:scale-[0.99] transition-all">
                <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                  <Sparkles size={16} />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="font-bold text-sm text-slate-900">Pull marks from exams</div>
                  <div className="text-[11px] font-medium text-slate-500">Auto-fill every row from saved results</div>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {loadOpen ? 'Close' : 'Open'}
                </span>
              </button>
              {loadOpen && (
                <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <ToolLabel>Year</ToolLabel>
                      <select value={pickedYearId} onChange={e => setPickedYearId(e.target.value)}
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        <option value="">— Pick year —</option>
                        {years.map(y => <option key={y.id} value={y.id}>{y.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <ToolLabel>Exam</ToolLabel>
                      <select value={pickedExamTitle} onChange={e => setPickedExamTitle(e.target.value)}
                        disabled={!pickedYearId || examTitles.length === 0}
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50">
                        <option value="">{examTitles.length === 0 ? '— No exams —' : '— Pick exam —'}</option>
                        {examTitles.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  <button onClick={loadMarksFromExams} disabled={loadingResults || !pickedYearId || !pickedExamTitle}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-900 hover:bg-black text-white rounded-lg font-bold text-xs uppercase tracking-widest disabled:opacity-50 active:scale-[0.98] transition-all">
                    {loadingResults ? <><Loader2 size={14} className="animate-spin" /> Loading…</> : <><Sparkles size={14} /> Load Marks</>}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
      preview={(
        <div className="overflow-x-auto bg-white border border-slate-200 shadow-sm p-2 md:p-3 rounded-xl">
          <div className="min-w-[8in]">
            <Marksheet row={data[0] ?? {}} subjectMax={subjectMaxMap} subjectPass={subjectPassMap}
              schoolName={schoolName} academicYear={academicYear} examTitle={examTitle} logoUrl={logoUrl} />
          </div>
          {data.length > 1 && (
            <p className="text-center text-slate-500 mt-3 text-xs font-medium">
              Showing first of {data.length} marksheets · download to get all.
            </p>
          )}
        </div>
      )}
      printNode={(
        <div id="print-area-marksheets" className="flex flex-col pb-10 bg-white w-full max-w-[794px] mx-auto min-h-[1122px]">
          {data.map((row, i) => (
            <Marksheet key={i} row={row} subjectMax={subjectMaxMap} subjectPass={subjectPassMap}
              schoolName={schoolName} academicYear={academicYear} examTitle={examTitle} logoUrl={logoUrl} />
          ))}
        </div>
      )}
    />
  );
};

const Marksheet: React.FC<{
  row: Record<string, unknown>;
  subjectMax: Map<string, number>;
  subjectPass: Map<string, number>;
  schoolName: string;
  academicYear: string;
  examTitle: string;
  logoUrl: string;
}> = ({ row, subjectMax, subjectPass, schoolName, academicYear, examTitle, logoUrl }) => {
  // Subjects in the printed marksheet come from the row keys, in the
  // order they were configured (skipping the standard student-info
  // keys + the internal admissionNo carrier).
  const subjectNames = Object.keys(row).filter(k => !STANDARD_KEYS.includes(k) && k !== 'admissionNo');
  let total = 0, totalMax = 0, totalPass = 0, valid = 0;
  let anyFailed = false;
  const marks = subjectNames.map(sub => {
    const v = String(row[sub] ?? '');
    const n = parseFloat(v);
    const ok = !isNaN(n) && v.trim().length > 0;
    const max = subjectMax.get(sub) ?? 100;
    const pass = subjectPass.get(sub) ?? Math.ceil(max * 0.33);
    if (ok) {
      total += n; totalMax += max; totalPass += pass; valid++;
      if ((n as number) < pass) anyFailed = true;
    }
    return { subject: sub, mark: ok ? n : v, max, pass };
  });
  const pct = totalMax > 0 ? ((total / totalMax) * 100) : 0;
  const pctStr = totalMax > 0 ? pct.toFixed(1) : '-';
  // Overall pass = no subject failed AND aggregate ≥ aggregate-pass.
  const overallPass = valid > 0 && !anyFailed && total >= totalPass;

  return (
    <div className="w-[794px] mx-auto bg-white border-4 border-double border-slate-800 p-8 min-h-[1122px] avoid-break flex flex-col relative">
      {/* Header */}
      <div className="text-center border-b-2 border-slate-800 pb-5 mb-6 flex items-center gap-4 justify-center">
        {logoUrl && (
          <img src={logoUrl} alt="School logo" crossOrigin="anonymous"
            className="w-16 h-16 object-contain shrink-0" />
        )}
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 uppercase tracking-[0.15em]">{schoolName}</h1>
          <p className="text-base text-slate-700 mt-1 font-serif italic">Academic Report Book</p>
          {examTitle && (
            <p className="text-sm text-slate-700 font-bold tracking-wider uppercase mt-1">{examTitle}</p>
          )}
          <p className="text-xs text-slate-500 font-semibold tracking-wider uppercase mt-1">Session: {academicYear}</p>
        </div>
      </div>

      {/* Student details */}
      <div className="grid grid-cols-2 gap-x-12 gap-y-2.5 mb-7 text-sm">
        <Detail label="Student Name" val={String(row.name || '-')} upper />
        <Detail label="Father's Name" val={String(row.fatherName || '-')} upper />
        <Detail label="Class & Section" val={String(row.class || '-')} />
        <Detail label="Roll Number" val={String(row.roll || '-')} />
      </div>

      {/* Subject marks table */}
      <div className="flex-1 mb-6">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-100 text-slate-800 uppercase tracking-wider text-[11px]">
              <th className="border-2 border-slate-800 px-3 py-2.5 text-left w-[34%]">Subject</th>
              <th className="border-2 border-slate-800 px-3 py-2.5 text-center">Max</th>
              <th className="border-2 border-slate-800 px-3 py-2.5 text-center">Pass</th>
              <th className="border-2 border-slate-800 px-3 py-2.5 text-center">Obtained</th>
              <th className="border-2 border-slate-800 px-3 py-2.5 text-center">Grade</th>
              <th className="border-2 border-slate-800 px-3 py-2.5 text-center">Result</th>
            </tr>
          </thead>
          <tbody>
            {marks.length > 0 ? marks.map((m, i) => {
              const okNum = typeof m.mark === 'number';
              const fail = okNum && (m.mark as number) < m.pass;
              return (
                <tr key={i} className="even:bg-slate-50">
                  <td className="border border-slate-300 border-x-2 border-x-slate-800 px-3 py-2.5 font-semibold uppercase">{m.subject}</td>
                  <td className="border border-slate-300 border-x-2 border-x-slate-800 px-3 py-2.5 text-center font-medium">{m.max}</td>
                  <td className="border border-slate-300 border-x-2 border-x-slate-800 px-3 py-2.5 text-center font-medium text-amber-700">{m.pass}</td>
                  <td className={`border border-slate-300 border-x-2 border-x-slate-800 px-3 py-2.5 text-center font-bold text-base ${fail ? 'text-red-600' : 'text-slate-900'}`}>{okNum ? m.mark : '-'}</td>
                  <td className={`border border-slate-300 border-x-2 border-x-slate-800 px-3 py-2.5 text-center font-bold ${fail ? 'text-red-600' : 'text-blue-800'}`}>
                    {okNum ? calculateGrade(((m.mark as number) / m.max) * 100) : '-'}
                  </td>
                  <td className={`border border-slate-300 border-x-2 border-x-slate-800 px-3 py-2.5 text-center font-black text-[11px] uppercase tracking-wider ${fail ? 'text-red-600' : 'text-emerald-700'}`}>
                    {okNum ? (fail ? 'Fail' : 'Pass') : '-'}
                  </td>
                </tr>
              );
            }) : (
              <tr><td colSpan={6} className="border-2 border-slate-800 px-4 py-8 text-center text-slate-400">No subjects configured</td></tr>
            )}
            <tr className="bg-slate-100 font-bold uppercase text-[11px]">
              <td className="border-2 border-slate-800 px-3 py-2.5 text-right">Grand Total</td>
              <td className="border-2 border-slate-800 px-3 py-2.5 text-center">{totalMax > 0 ? totalMax : '-'}</td>
              <td className="border-2 border-slate-800 px-3 py-2.5 text-center text-amber-700">{valid > 0 ? totalPass : '-'}</td>
              <td className="border-2 border-slate-800 px-3 py-2.5 text-center text-base">{valid > 0 ? total : '-'}</td>
              <td className="border-2 border-slate-800 px-3 py-2.5 text-center">{valid > 0 ? `${pctStr}%` : '-'}</td>
              <td className={`border-2 border-slate-800 px-3 py-2.5 text-center ${overallPass ? 'text-emerald-700' : 'text-red-600'}`}>
                {valid > 0 ? (overallPass ? 'Pass' : 'Fail') : '-'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Result line — overall pass = no individual fail + aggregate ≥ total pass marks */}
      {valid > 0 && (
        <div className="text-center py-2 mb-6">
          <span className={`inline-block px-6 py-1.5 rounded font-black text-sm uppercase tracking-widest ${
            overallPass ? 'bg-emerald-50 text-emerald-700 border-2 border-emerald-200' : 'bg-rose-50 text-rose-700 border-2 border-rose-200'
          }`}>
            Result: {overallPass ? 'Pass' : 'Fail'} · Grade {calculateGrade(pct)}
            {anyFailed && !overallPass && (
              <span className="block text-[10px] font-bold text-rose-600 mt-0.5 normal-case">
                (failed in {marks.filter(m => typeof m.mark === 'number' && (m.mark as number) < m.pass).map(m => m.subject).join(', ')})
              </span>
            )}
          </span>
        </div>
      )}

      <div className="flex justify-between items-end pb-6 mt-8 px-6 text-sm font-bold text-slate-600 uppercase tracking-widest">
        <div className="border-t-2 border-slate-800 w-44 text-center pt-2">Class Teacher</div>
        <div className="border-t-2 border-slate-800 w-44 text-center pt-2">Principal</div>
      </div>
    </div>
  );
};

const Detail: React.FC<{ label: string; val: string; upper?: boolean }> = ({ label, val, upper }) => (
  <div className="flex border-b border-slate-200 pb-1">
    <span className="w-32 font-bold text-slate-600 uppercase">{label}</span>
    <span className={`font-semibold text-slate-900 ${upper ? 'uppercase' : ''}`}>{val}</span>
  </div>
);
