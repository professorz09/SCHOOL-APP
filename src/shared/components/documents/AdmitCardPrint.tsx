// Pure printable Admit Card. Mirrors the visual template inside
// ToolsManager.AdmitCardTool.

import React, { forwardRef } from 'react';
import { schoolInfoService, type SchoolInfo } from '@/shared/utils/schoolInfo.service';
import { PrintHeader } from './PrintHeader';

export interface AdmitCardExam {
  title: string;
  subject: string;
  testType: string;
  scheduledDate: string | null;
  duration: number | null;
  maxMarks: number | null;
}

export interface AdmitCardPrintProps {
  schoolInfo: SchoolInfo;
  studentName: string;
  admissionNo: string;
  className: string;
  section: string;
  rollNo: string;
  fatherName: string;
  exam: AdmitCardExam;
  /** Bullet lines printed at the bottom. */
  instructions: string[];
}

export const AdmitCardPrint = forwardRef<HTMLDivElement, AdmitCardPrintProps>(({
  schoolInfo, studentName, admissionNo, className, section, rollNo, fatherName,
  exam, instructions,
}, ref) => {
  const accent = schoolInfo.accentColor || '#9f1239';
  const signatureUrl = schoolInfo.principalSignaturePath
    ? schoolInfoService.getAssetUrl(schoolInfo.principalSignaturePath) : null;
  return (
    <div ref={ref}
      className="printable border-4 border-double rounded-2xl p-5 max-w-md mx-auto space-y-4 bg-white"
      style={{ borderColor: accent }}>
      <PrintHeader schoolInfo={schoolInfo} title="Admit Card / प्रवेश पत्र" accent={accent} compact />

      <div className="rounded-xl p-3 text-center"
        style={{ backgroundColor: `${accent}15`, border: `1px solid ${accent}40` }}>
        <div className="text-sm font-black uppercase" style={{ color: accent }}>{exam.title}</div>
        <div className="text-[10px] font-bold mt-0.5" style={{ color: accent, opacity: 0.85 }}>
          {exam.testType} · {exam.subject}
        </div>
      </div>

      <div className="space-y-1.5 text-xs font-bold text-slate-700">
        {([
          ['Student Name',     studentName],
          ['Admission No.',    admissionNo],
          ['Class / Section',  `${className}-${section}`],
          ['Roll No.',         rollNo || '—'],
          ["Father's Name",    fatherName || '—'],
        ] as const).map(([label, val]) => (
          <div key={label} className="flex items-center gap-2 border-b border-slate-100 pb-1.5">
            <span className="w-28 text-slate-400 shrink-0">{label}:</span>
            <span className="font-black text-slate-900">{val}</span>
          </div>
        ))}
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5 text-xs font-bold">
        <div className="flex justify-between">
          <span className="text-slate-400">Date:</span>
          <span className="font-black text-slate-900">{exam.scheduledDate ?? '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Duration:</span>
          <span className="font-black text-slate-900">{exam.duration ? `${exam.duration} min` : '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Max Marks:</span>
          <span className="font-black text-slate-900">{exam.maxMarks ?? '—'}</span>
        </div>
      </div>

      {instructions.length > 0 && (
        <div className="text-[10px] font-bold text-slate-600 leading-relaxed border-t border-slate-100 pt-3">
          <p className="font-black text-slate-800 mb-1">Instructions / निर्देश:</p>
          <ul className="list-disc list-inside space-y-0.5">
            {instructions.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-200">
        <div className="text-center">
          <div className="h-10 mb-1" />
          <div className="border-t-2 border-slate-300 pt-2 text-[9px] font-bold text-slate-400 uppercase">
            Student Signature
          </div>
        </div>
        <div className="text-center">
          <div className="h-10 mb-1 flex items-end justify-center">
            {signatureUrl && (
              <img src={signatureUrl} alt="Principal signature" crossOrigin="anonymous"
                className="max-h-10 max-w-full object-contain" />
            )}
          </div>
          <div className="border-t-2 border-slate-300 pt-2 text-[9px] font-bold text-slate-400 uppercase">
            Principal Seal &amp; Sign
          </div>
        </div>
      </div>
    </div>
  );
});
AdmitCardPrint.displayName = 'AdmitCardPrint';

export const DEFAULT_ADMIT_INSTRUCTIONS = [
  'Yeh admit card exam hall mein saath lana ZAROOR hai.',
  'Pehchan patra (school ID card) bhi saath layen.',
  '10 minute pehle aayein aur apni seat pe baith jayen.',
  'Mobile phone aur electronic device banned hain.',
];
