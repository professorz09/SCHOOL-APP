import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Printer, Download, ChevronDown } from 'lucide-react';
import { apiExams } from '@/lib/apiClient';
import { useAcademicYear } from '@/shared/context/AcademicYearContext';
import { useUIStore } from '@/store/uiStore';
import { schoolInfoService, SchoolInfo } from '@/shared/utils/schoolInfo.service';

interface Props { onBack: () => void; }

type View = 'SELECT' | 'SHEET';

const GRADE = (pct: number) =>
  pct >= 91 ? 'A1' : pct >= 81 ? 'A2' : pct >= 71 ? 'B1' : pct >= 61 ? 'B2' :
  pct >= 51 ? 'C1' : pct >= 41 ? 'C2' : pct >= 33 ? 'D' : 'E';

const GRADE_COLOR = (g: string) => {
  if (g === 'E') return 'text-rose-600';
  if (g === 'D') return 'text-amber-600';
  return 'text-emerald-700';
};

const CLASS_OPTIONS = [
  'Nursery','LKG','UKG',
  'Class 1','Class 2','Class 3','Class 4','Class 5',
  'Class 6','Class 7','Class 8','Class 9','Class 10',
  '11th Science','11th Commerce','11th Arts','11th Maths',
  '12th Science','12th Commerce','12th Arts','12th Maths',
];

export const Marksheet: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  const { activeYear } = useAcademicYear();

  const [view, setView]         = useState<View>('SELECT');
  const [className, setClassName] = useState('');
  const [loading, setLoading]   = useState(false);
  const [exams, setExams]       = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo | null>(null);
  const [pickedStudent, setPickedStudent] = useState<any | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    schoolInfoService.getSchoolInfo().then(setSchoolInfo).catch(() => {});
  }, []);

  const loadMarksheet = async () => {
    if (!className || !activeYear?.id) {
      showToast('Select a class first', 'error');
      return;
    }
    setLoading(true);
    try {
      const data = await apiExams.getMarksheet(className, activeYear.id);
      if (data.exams.length === 0) {
        showToast('No Final exams found for this class', 'error');
        return;
      }
      setExams(data.exams);
      setStudents(data.students);
      setView('SHEET');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load marksheet', 'error');
    } finally {
      setLoading(false);
    }
  };

  const printMarksheet = (student: any) => {
    const totalMax  = exams.reduce((s, e) => s + (e.max_marks ?? 0), 0);
    const totalObt  = exams.reduce((s, e) => s + (student.results[e.id]?.obtainedMarks ?? 0), 0);
    const pct       = totalMax > 0 ? Math.round((totalObt / totalMax) * 100) : 0;
    const grade     = GRADE(pct);
    const passMark  = exams.reduce((s, e) => s + (e.pass_marks ?? Math.ceil((e.max_marks ?? 0) * 0.33)), 0);
    const overallPass = totalObt >= passMark;

    const rowsHtml = exams.map(e => {
      const r     = student.results[e.id];
      const obt   = r?.obtainedMarks ?? '—';
      const max   = e.max_marks ?? 100;
      const pm    = e.pass_marks ?? Math.ceil(max * 0.33);
      const spct  = typeof obt === 'number' ? Math.round((obt / max) * 100) : 0;
      const sg    = typeof obt === 'number' ? GRADE(spct) : '—';
      const pass  = typeof obt === 'number' && obt >= pm;
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;">${e.subject}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:center;">${max}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:center;">${pm}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:center;font-weight:900;font-size:15px;">${obt}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:center;">${sg}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:center;font-weight:900;color:${pass ? '#059669' : '#dc2626'};">${pass ? 'PASS' : 'FAIL'}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Marksheet — ${student.name}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; }
  body { background: #fff; padding: 32px; max-width: 700px; margin: auto; color: #1e293b; }
  .school { text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #1e293b; }
  .school h1 { font-size: 22px; font-weight: 900; letter-spacing: .04em; text-transform: uppercase; }
  .school p { font-size: 11px; color: #64748b; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; margin-top: 3px; }
  .title { text-align: center; font-size: 16px; font-weight: 900; text-transform: uppercase; letter-spacing: .12em; margin-bottom: 20px; background: #1e293b; color: #fff; padding: 8px 0; border-radius: 8px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin-bottom: 20px; padding: 14px 16px; background: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0; }
  .info-row { display: flex; gap: 8px; }
  .info-label { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; min-width: 90px; }
  .info-val { font-size: 12px; font-weight: 800; color: #1e293b; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  thead tr { background: #1e293b; color: #fff; }
  thead th { padding: 10px 12px; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: .06em; text-align: left; }
  thead th:not(:first-child) { text-align: center; }
  .total-row td { background: #f8fafc; font-weight: 900; border-top: 2px solid #1e293b; padding: 10px 12px; }
  .result-badge { display: inline-block; padding: 8px 24px; border-radius: 8px; font-size: 18px; font-weight: 900; text-transform: uppercase; letter-spacing: .1em; }
  .pass { background: #d1fae5; color: #065f46; }
  .fail { background: #fee2e2; color: #991b1b; }
  .footer { margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr 1fr; text-align: center; gap: 16px; }
  .sign-box { border-top: 1px solid #1e293b; padding-top: 6px; font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: .06em; }
  @media print { body { padding: 20px; } }
</style></head><body>
  <div class="school">
    <h1>${schoolInfo?.name ?? 'School Name'}</h1>
    <p>${schoolInfo?.address ?? ''}</p>
    ${schoolInfo?.phone ? `<p>Ph: ${schoolInfo.phone}</p>` : ''}
  </div>
  <div class="title">Academic Progress Report — ${activeYear?.label ?? ''}</div>
  <div class="info-grid">
    <div class="info-row"><span class="info-label">Student</span><span class="info-val">${student.name}</span></div>
    <div class="info-row"><span class="info-label">Adm. No.</span><span class="info-val">${student.admissionNo ?? '—'}</span></div>
    <div class="info-row"><span class="info-label">Class</span><span class="info-val">${student.className ?? ''}${student.section ? ' - ' + student.section : ''}</span></div>
    <div class="info-row"><span class="info-label">Roll No.</span><span class="info-val">${student.rollNo ?? '—'}</span></div>
  </div>
  <table>
    <thead><tr>
      <th>Subject</th>
      <th>Max Marks</th>
      <th>Pass Marks</th>
      <th>Obtained</th>
      <th>Grade</th>
      <th>Result</th>
    </tr></thead>
    <tbody>${rowsHtml}
      <tr class="total-row">
        <td>TOTAL</td>
        <td style="text-align:center;">${totalMax}</td>
        <td style="text-align:center;">${passMark}</td>
        <td style="text-align:center;font-size:16px;">${totalObt}</td>
        <td style="text-align:center;">${grade}</td>
        <td style="text-align:center;font-size:15px;color:${overallPass ? '#059669' : '#dc2626'};">${overallPass ? 'PASS' : 'FAIL'}</td>
      </tr>
    </tbody>
  </table>
  <div style="text-align:center;margin:20px 0;">
    <span class="result-badge ${overallPass ? 'pass' : 'fail'}">${overallPass ? '✓ PASSED' : '✗ FAILED'}</span>
    <div style="margin-top:8px;font-size:12px;color:#64748b;">Percentage: ${pct}% &nbsp;|&nbsp; Grade: ${grade}</div>
  </div>
  <div class="footer">
    <div class="sign-box">Class Teacher</div>
    <div class="sign-box">Examination Controller</div>
    <div class="sign-box">Principal</div>
  </div>
</body></html>`;

    const w = window.open('', '_blank', 'width=750,height=900');
    if (!w) { showToast('Allow popups to print marksheet', 'error'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 400);
  };

  // ── SELECT VIEW ────────────────────────────────────────────────────────────
  if (view === 'SELECT') {
    return (
      <div className="w-full bg-slate-50 flex flex-col min-h-screen">
        <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
          <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Marksheet</h2>
            <p className="text-[10px] font-bold text-slate-400">Final exam marksheet by class</p>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Select Class</p>
              <div className="relative">
                <select value={className} onChange={e => setClassName(e.target.value)}
                  className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-indigo-500">
                  <option value="">— Choose a class —</option>
                  {CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
              <p className="text-[10px] font-black text-indigo-700 uppercase tracking-widest mb-1">Academic Year</p>
              <p className="text-sm font-black text-indigo-900">{activeYear?.label ?? 'No active year'}</p>
            </div>

            <button onClick={loadMarksheet} disabled={!className || loading}
              className="w-full py-3.5 bg-indigo-600 text-white font-black rounded-xl disabled:opacity-40 flex items-center justify-center gap-2">
              {loading
                ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <><Printer size={16} /> Load Marksheet</>
              }
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── SHEET VIEW ─────────────────────────────────────────────────────────────
  const totalMax = exams.reduce((s, e) => s + (e.max_marks ?? 0), 0);

  return (
    <div className="w-full bg-slate-50 flex flex-col min-h-screen">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button onClick={() => setView('SELECT')} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-black text-slate-900">{className} — Marksheet</h2>
          <p className="text-[10px] font-bold text-slate-400">{students.length} students · {exams.length} subjects · {totalMax} marks total</p>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Subject header strip */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
          <table className="w-full text-xs min-w-[500px]">
            <thead>
              <tr className="bg-slate-800 text-white">
                <th className="text-left px-3 py-2.5 font-black text-[10px] uppercase tracking-widest">Student</th>
                {exams.map(e => (
                  <th key={e.id} className="px-2 py-2.5 text-center font-black text-[9px] uppercase tracking-widest max-w-[60px]">
                    <div className="truncate max-w-[56px]">{e.subject}</div>
                    <div className="font-bold opacity-60">{e.max_marks}m</div>
                  </th>
                ))}
                <th className="px-3 py-2.5 text-center font-black text-[10px] uppercase tracking-widest">Total</th>
                <th className="px-3 py-2.5 text-center font-black text-[10px] uppercase tracking-widest">%</th>
                <th className="px-3 py-2.5 text-center font-black text-[10px] uppercase tracking-widest">Result</th>
                <th className="px-3 py-2.5 font-black text-[10px] uppercase tracking-widest"></th>
              </tr>
            </thead>
            <tbody>
              {students.map((student, idx) => {
                const totalObt = exams.reduce((s, e) => s + (student.results[e.id]?.obtainedMarks ?? 0), 0);
                const pct = totalMax > 0 ? Math.round((totalObt / totalMax) * 100) : 0;
                const grade = GRADE(pct);
                const passMark = exams.reduce((s, e) => s + (e.pass_marks ?? Math.ceil((e.max_marks ?? 0) * 0.33)), 0);
                const overallPass = totalObt >= passMark;
                return (
                  <tr key={student.studentId} className={`border-t border-slate-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                    <td className="px-3 py-2.5 min-w-[130px]">
                      <div className="font-black text-slate-900 text-xs">{student.name}</div>
                      <div className="text-[9px] font-bold text-slate-400">#{student.rollNo ?? '—'} · {student.admissionNo}</div>
                    </td>
                    {exams.map(e => {
                      const r = student.results[e.id];
                      const obt = r?.obtainedMarks;
                      const pm = e.pass_marks ?? Math.ceil((e.max_marks ?? 0) * 0.33);
                      const pass = typeof obt === 'number' && obt >= pm;
                      return (
                        <td key={e.id} className="px-2 py-2.5 text-center">
                          <span className={`font-black text-sm ${typeof obt === 'number' ? (pass ? 'text-emerald-700' : 'text-rose-600') : 'text-slate-300'}`}>
                            {obt ?? '—'}
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2.5 text-center font-black text-slate-900">{totalObt}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`font-black text-xs ${GRADE_COLOR(grade)}`}>{pct}%</span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${overallPass ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        {overallPass ? 'PASS' : 'FAIL'}
                      </span>
                    </td>
                    <td className="px-2 py-2.5">
                      <button onClick={() => printMarksheet(student)}
                        className="flex items-center gap-1 text-[9px] font-black text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-2 py-1 rounded-lg">
                        <Printer size={10} /> Print
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {students.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <p className="font-bold text-sm">No results found</p>
            <p className="text-xs mt-1">Upload Final exam results first</p>
          </div>
        )}
      </div>
    </div>
  );
};
