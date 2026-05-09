// Shared school-branded header used by every printable document
// (TC, Bonafide, Marksheet, Admit Card). Keeps logo / name / address /
// title styling identical across the four templates so all PDFs read
// like one consistent set.
//
// `accent` drives the bottom border + the doc-type subtitle colour.
// `compact` tightens spacing for documents that need to fit one page
// (admit cards inside the small framed body).

import React from 'react';
import { schoolInfoService, type SchoolInfo } from '@/shared/utils/schoolInfo.service';

export interface PrintHeaderProps {
  schoolInfo: SchoolInfo;
  /** The document type rendered below the school name. */
  title: string;
  /** Hex colour for borders + title text. Falls back to slate-900. */
  accent?: string;
  /** Use smaller logo + tighter padding (admit card body). */
  compact?: boolean;
  /** Optional subtitle line (e.g. "TC No: TC-2025-001"). */
  subtitle?: string;
}

export const PrintHeader: React.FC<PrintHeaderProps> = ({
  schoolInfo, title, accent = '#0f172a', compact = false, subtitle,
}) => {
  const logoUrl = schoolInfo.logoPath ? schoolInfoService.getAssetUrl(schoolInfo.logoPath) : null;
  return (
    <div
      className={`text-center flex items-center gap-3 justify-center border-b-2 ${compact ? 'pb-3 mb-3' : 'pb-5 mb-5'}`}
      style={{ borderColor: accent }}
    >
      {logoUrl && (
        <img
          src={logoUrl} alt="School logo" crossOrigin="anonymous"
          className={`${compact ? 'w-12 h-12' : 'w-14 h-14'} object-contain shrink-0`}
        />
      )}
      <div className="min-w-0">
        <p className={`${compact ? 'text-base' : 'text-xs'} font-black ${compact ? 'text-slate-900 uppercase tracking-wide' : 'text-slate-500 uppercase tracking-widest'}`}>
          {schoolInfo.name || 'School Name'}
        </p>
        {compact && schoolInfo.address && (
          <p className="text-[10px] font-bold text-slate-500 mt-0.5">{schoolInfo.address}</p>
        )}
        <h3
          className={`${compact ? 'text-sm mt-2' : 'text-xl mt-1'} font-black uppercase tracking-wide`}
          style={{ color: accent }}
        >
          {title}
        </h3>
        {subtitle && <p className="text-xs font-bold text-slate-400 mt-1">{subtitle}</p>}
      </div>
    </div>
  );
};
