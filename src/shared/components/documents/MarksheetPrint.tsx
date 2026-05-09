// Pure printable academic marksheet. Mirrors the layout used by
// ToolsManager.MarksheetTool so Profile-side downloads match.

import React, { forwardRef } from 'react';
import { schoolInfoService, type SchoolInfo } from '@/shared/utils/schoolInfo.service';
import { PrintHeader } from './PrintHeader';

export interface MarksheetSubjectRow {
  subject: string;
  maxMarks: number;
  /** null = absent. */
  obtainedMarks: number | null;
  grade?: string;
}

export interface MarksheetPrintProps {
  schoolInfo: SchoolInfo;
  studentName: string;
  admissionNo: string;
  className: string;
  section: string;
  rollNo: string;
  fatherName: string;
  examTitle: string;
  rows: MarksheetSubjectRow[];
}

const gradeFor = (obt: number | null, max: number): string => {
  if (obt === null || max === 0) return '—';
  const p = (obt / max) * 100;
  return p >= 90 ? 'A+' : p >= 75 ? 'A' : p >= 60 ? 'B+' : p >= 45 ? 'B' : p >= 33 ? 'C' : 'F';
};

export const MarksheetPrint = forwardRef<HTMLDivElement, MarksheetPrintProps>(({
  schoolInfo, studentName, admissionNo, className, section, rollNo, fatherName,
  examTitle, rows,
}, ref) => {
  const accent = schoolInfo.accentColor || '#0f172a';
  const signatureUrl = schoolInfo.principalSignaturePath
    ? schoolInfoService.getAssetUrl(schoolInfo.principalSignaturePath) : null;
  const totalMax      = rows.reduce((s, r) => s + r.maxMarks, 0);
  const totalObtained = rows.reduce((s, r) => s + (r.obtainedMarks ?? 0), 0);
  const pct = totalMax > 0 ? Math.round((totalObtained / totalMax) * 100) : 0;
  const passed = pct >= 33;
  return (
    <div ref={ref} className="p-6 bg-white font-sans">
      <PrintHeader schoolInfo={schoolInfo} title="Academic Marksheet" accent={accent} compact />
      <div className="grid grid-cols-2 gap-1.5 text-xs font-bold text-slate-700 mb-4 border border-slate-200 rounded-xl p-3">
        <div><span className="text-slate-400">Name: </span>{studentName}</div>
        <div><span className="text-slate-400">Adm. No: </span>{admissionNo}</div>
        <div><span className="text-slate-400">Class: </span>{className}-{section}</div>
        <div><span className="text-slate-400">Roll No: </span>{rollNo || '—'}</div>
        <div><span className="text-slate-400">Father: </span>{fatherName || '—'}</div>
        <div><span className="text-slate-400">Exam: </span>{examTitle}</div>
      </div>
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
          {rows.map((r, i) => {
            const grade = r.grade || gradeFor(r.obtainedMarks, r.maxMarks);
            const subPass = r.obtainedMarks === null ? null : r.obtainedMarks >= r.maxMarks * 0.33;
            return (
              <tr key={i} className={i % 2 === 0 ? 'bg-slate-50' : 'bg-white'}>
                <td className="px-3 py-2 font-bold border-b border-slate-100">{r.subject}</td>
                <td className="px-3 py-2 text-center border-b border-slate-100">{r.maxMarks}</td>
                <td className="px-3 py-2 text-center font-black border-b border-slate-100">
                  {r.obtainedMarks ?? 'AB'}
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
            <td className="px-3 py-2 text-center">{gradeFor(totalObtained, totalMax)}</td>
            <td className={`px-3 py-2 text-center ${passed ? 'text-emerald-600' : 'text-rose-600'}`}>
              {passed ? 'PASS' : 'FAIL'}
            </td>
          </tr>
        </tfoot>
      </table>
      <div className={`text-center py-3 rounded-xl font-black text-base uppercase tracking-widest border-2 ${
        passed ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-rose-50 border-rose-300 text-rose-700'
      }`}>
        {passed ? '✓ PASS' : '✗ FAIL'} — {pct}% ({totalObtained}/{totalMax})
      </div>
      <div className="grid grid-cols-3 gap-4 mt-8 pt-4 border-t border-slate-200">
        {(['Class Teacher', 'Parent / Guardian', 'Principal'] as const).map(label => (
          <div key={label} className="text-center">
            <div className="h-10 mb-1 flex items-end justify-center">
              {label === 'Principal' && signatureUrl && (
                <img src={signatureUrl} alt="Principal signature" crossOrigin="anonymous"
                  className="max-h-10 max-w-full object-contain" />
              )}
            </div>
            <div className="border-t-2 border-slate-300 pt-2 text-[10px] font-bold text-slate-400">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
});
MarksheetPrint.displayName = 'MarksheetPrint';
