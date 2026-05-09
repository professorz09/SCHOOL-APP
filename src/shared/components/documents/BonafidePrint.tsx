// Pure printable Bonafide certificate. Mirrors the visual template
// from ToolsManager.BonafideGenerator so a profile-side download and a
// Tools-side download produce identical output.
//
// Caller passes a ref to capture this node for PDF export (via
// downloadNodeAsPdf). Keep this component free of state / queries —
// orchestration lives in the caller.

import React, { forwardRef } from 'react';
import { schoolInfoService, type SchoolInfo } from '@/shared/utils/schoolInfo.service';
import { PrintHeader } from './PrintHeader';

export interface BonafidePrintProps {
  schoolInfo: SchoolInfo;
  studentName: string;
  fatherName: string;
  className: string;
  section: string;
  /** Optional purpose appended to the certificate body. */
  purpose?: string;
  /** Defaults to current Indian academic year window. */
  academicYearLabel?: string;
}

export const BonafidePrint = forwardRef<HTMLDivElement, BonafidePrintProps>(({
  schoolInfo, studentName, fatherName, className, section, purpose, academicYearLabel,
}, ref) => {
  const accent = schoolInfo.accentColor || '#4f46e5';
  const signatureUrl = schoolInfo.principalSignaturePath
    ? schoolInfoService.getAssetUrl(schoolInfo.principalSignaturePath) : null;
  const ay = academicYearLabel
    ?? `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
  return (
    <div ref={ref} className="bg-white border-2 rounded-2xl p-6 shadow-sm" style={{ borderColor: accent }}>
      <PrintHeader schoolInfo={schoolInfo} title="Bonafide Certificate" accent={accent} />
      <p className="text-sm font-bold text-slate-700 leading-relaxed text-justify">
        This is to certify that <strong>{studentName}</strong>, son/daughter of <strong>{fatherName || '___'}</strong>,
        is a bonafide student of this school studying in <strong>{className}-{section}</strong> during the academic year {ay}.
        {purpose ? ` This certificate is being issued for the purpose of ${purpose}.` : ''}
      </p>
      <div className="pt-6 mt-6 border-t-2 border-slate-200 flex items-end justify-between">
        <div>
          <div className="h-10 w-24 mb-1 flex items-end">
            {signatureUrl && (
              <img src={signatureUrl} alt="Principal signature" crossOrigin="anonymous"
                className="max-h-10 object-contain" />
            )}
          </div>
          <p className="text-xs font-bold text-slate-500 border-t border-slate-400 pt-1">
            Principal Signature &amp; Seal
          </p>
        </div>
        <p className="text-xs font-bold text-slate-500">
          Date: {new Date().toLocaleDateString('en-IN')}
        </p>
      </div>
    </div>
  );
});
BonafidePrint.displayName = 'BonafidePrint';
