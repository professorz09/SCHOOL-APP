// Self-contained HTML templates for principal-facing print documents.
// Each builder returns a full `<!DOCTYPE html>` string with inline CSS,
// designed to render at exact A4 dimensions in a new browser tab and
// be picked up by the native print → "Save as PDF" flow.
//
// Why inline HTML instead of React → html2canvas → jsPDF?
//   • No Tailwind v4 oklch parsing — every colour is plain RGB / hex.
//   • Native font rendering — Devanagari prints cleanly, no canvas glitch.
//   • Real CSS page-break — multi-card bulk PDFs paginate properly.
//   • Same output across iOS Safari, Android Chrome, desktop browsers.
//
// All inputs are escaped via `esc()` — these strings are interpolated
// directly into HTML, so any untrusted field (student name, etc.) MUST
// pass through it.

import type { SchoolInfo } from '@/shared/utils/schoolInfo.service';

// ─── shared helpers ────────────────────────────────────────────────────

const esc = (s: string | number | null | undefined): string => {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

// Top-of-document boilerplate. @page locks A4 with 12mm margin. The
// print-page wrapper handles bulk pagination — one card per A4 sheet.
const docShell = (title: string, accent: string, bodyHtml: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    @media print {
      .print-page { page-break-after: always; break-after: page; }
      .print-page:last-child { page-break-after: auto; break-after: auto; }
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #0f172a;
      font-family: 'Segoe UI', system-ui, -apple-system, 'Roboto', 'Noto Sans Devanagari', sans-serif; }
    body { padding: 0; }
    .print-page { padding: 16px; }
    .school-head { text-align: center; padding-bottom: 14px; margin-bottom: 16px;
      border-bottom: 2px solid ${accent}; }
    .school-head img { height: 56px; width: 56px; object-fit: contain; vertical-align: middle; margin-right: 12px; }
    .school-head .name { font-size: 22px; font-weight: 900; letter-spacing: 0.02em; text-transform: uppercase; display: inline-block; vertical-align: middle; }
    .school-head .addr { font-size: 11px; color: #64748b; font-weight: 700; margin-top: 4px; }
    .doc-title { font-size: 16px; font-weight: 900; color: ${accent};
      letter-spacing: 0.06em; text-transform: uppercase; margin-top: 10px; }
    .row { display: flex; gap: 12px; margin-bottom: 8px; font-size: 13px; }
    .row .lbl { color: #64748b; font-weight: 700; min-width: 140px; }
    .row .val { color: #0f172a; font-weight: 900; flex: 1; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
    .badge { display: inline-block; background: ${accent}15;
      color: ${accent}; border: 1px solid ${accent}40; padding: 10px 16px;
      border-radius: 12px; text-align: center; margin: 12px 0; }
    .badge .t { font-size: 16px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; }
    .badge .s { font-size: 11px; font-weight: 700; margin-top: 4px; opacity: 0.85; }
    .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px;
      padding: 12px 14px; margin: 12px 0; font-size: 13px; }
    .info-box .ir { display: flex; justify-content: space-between; padding: 4px 0; }
    .info-box .ir + .ir { border-top: 1px dashed #e2e8f0; }
    .info-box .l { color: #64748b; font-weight: 700; }
    .info-box .v { color: #0f172a; font-weight: 900; }
    .instructions { font-size: 12px; color: #475569; margin-top: 14px;
      padding-top: 12px; border-top: 1px dashed #cbd5e1; }
    .instructions .h { font-weight: 900; color: #1e293b; margin-bottom: 6px; }
    .instructions ul { margin: 0; padding-left: 18px; line-height: 1.6; }
    .sign-row { display: flex; gap: 32px; margin-top: 36px; padding-top: 8px; }
    .sign-box { flex: 1; text-align: center; }
    .sign-box .line { height: 36px; border-bottom: 2px solid #94a3b8; margin-bottom: 4px; }
    .sign-box .line img { max-height: 36px; max-width: 120px; object-fit: contain; }
    .sign-box .cap { font-size: 10px; font-weight: 900; color: #64748b;
      text-transform: uppercase; letter-spacing: 0.08em; }
    .frame { border: 3px double ${accent}; border-radius: 12px; padding: 18px; }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;

const schoolHead = (schoolInfo: SchoolInfo, docTitle: string, accent: string, logoUrl: string | null) => `
  <div class="school-head">
    ${logoUrl ? `<img src="${esc(logoUrl)}" alt="logo" crossorigin="anonymous" />` : ''}
    <span class="name">${esc(schoolInfo.name || 'School Name')}</span>
    ${schoolInfo.address ? `<div class="addr">${esc(schoolInfo.address)}</div>` : ''}
    <div class="doc-title">${esc(docTitle)}</div>
  </div>`;

const signRow = (signatureUrl: string | null) => `
  <div class="sign-row">
    <div class="sign-box">
      <div class="line"></div>
      <div class="cap">Student Signature</div>
    </div>
    <div class="sign-box">
      <div class="line">
        ${signatureUrl ? `<img src="${esc(signatureUrl)}" alt="Principal sign" crossorigin="anonymous" />` : ''}
      </div>
      <div class="cap">Principal Seal &amp; Sign</div>
    </div>
  </div>`;

// ─── Admit Card ────────────────────────────────────────────────────────

export interface AdmitCardInput {
  studentName: string;
  admissionNo: string;
  className: string;
  section: string;
  rollNo: string;
  fatherName: string;
  examTitle: string;
  examSubject: string;
  examType: string;
  examDate: string | null;
  examDuration: number | null;
  examMaxMarks: number | null;
  instructions: string[];
}

export interface PrintBranding {
  schoolInfo: SchoolInfo;
  accent: string;
  logoUrl: string | null;
  signatureUrl: string | null;
}

const admitCardBody = (a: AdmitCardInput, b: PrintBranding) => `
  <div class="frame">
    ${schoolHead(b.schoolInfo, 'Admit Card / प्रवेश पत्र', b.accent, b.logoUrl)}
    <div class="badge">
      <div class="t">${esc(a.examTitle)}</div>
      <div class="s">${esc(a.examType)} · ${esc(a.examSubject)}</div>
    </div>
    <div class="row"><span class="lbl">Student Name</span><span class="val">${esc(a.studentName)}</span></div>
    <div class="row"><span class="lbl">Admission No.</span><span class="val">${esc(a.admissionNo)}</span></div>
    <div class="row"><span class="lbl">Class / Section</span><span class="val">${esc(a.className)}-${esc(a.section)}</span></div>
    <div class="row"><span class="lbl">Roll No.</span><span class="val">${esc(a.rollNo || '—')}</span></div>
    <div class="row"><span class="lbl">Father's Name</span><span class="val">${esc(a.fatherName || '—')}</span></div>
    <div class="info-box">
      <div class="ir"><span class="l">Date</span><span class="v">${esc(a.examDate ?? '—')}</span></div>
      <div class="ir"><span class="l">Duration</span><span class="v">${a.examDuration ? esc(a.examDuration) + ' min' : '—'}</span></div>
      <div class="ir"><span class="l">Max Marks</span><span class="v">${esc(a.examMaxMarks ?? '—')}</span></div>
    </div>
    ${a.instructions.length > 0 ? `
      <div class="instructions">
        <div class="h">Instructions / निर्देश:</div>
        <ul>${a.instructions.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
      </div>` : ''}
    ${signRow(b.signatureUrl)}
  </div>`;

/** Single admit card → A4 HTML document. */
export function buildAdmitCardHtml(a: AdmitCardInput, b: PrintBranding): string {
  return docShell(`Admit Card — ${a.studentName}`, b.accent,
    `<div class="print-page">${admitCardBody(a, b)}</div>`);
}

/** Bulk admit cards (one per A4 page). */
export function buildAdmitCardsBulkHtml(items: AdmitCardInput[], b: PrintBranding, title = 'Admit Cards'): string {
  return docShell(title, b.accent,
    items.map(a => `<div class="print-page">${admitCardBody(a, b)}</div>`).join(''));
}

// ─── ID Card ───────────────────────────────────────────────────────────

export interface IdCardInput {
  studentName: string;
  admissionNo: string;
  className: string;
  section: string;
  rollNo: string;
  fatherName: string;
  motherName: string;
  bloodGroup: string;
  dob: string;
  phone: string;
  address: string;
  photoUrl: string | null;
}

const idCardCss = (accent: string) => `
  .idc { width: 86mm; height: 130mm; margin: 0 auto;
    background: linear-gradient(135deg, ${accent} 0%, ${accent}cc 100%);
    border-radius: 14px; padding: 14px; color: #fff;
    box-shadow: 0 4px 16px rgba(0,0,0,0.12); }
  .idc .head { display: flex; align-items: center; gap: 8px;
    border-bottom: 1px solid rgba(255,255,255,0.25); padding-bottom: 8px; margin-bottom: 10px; }
  .idc .head img { width: 32px; height: 32px; object-fit: contain; }
  .idc .head .n { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.06em; }
  .idc .head .s { font-size: 8px; font-weight: 700; opacity: 0.8; letter-spacing: 0.12em; text-transform: uppercase; }
  .idc .body { display: flex; gap: 10px; align-items: flex-start; }
  .idc .photo { width: 60px; height: 75px; background: rgba(255,255,255,0.95);
    border-radius: 6px; overflow: hidden; flex-shrink: 0; display: flex; align-items: center;
    justify-content: center; color: ${accent}; font-weight: 900; font-size: 18px; }
  .idc .photo img { width: 100%; height: 100%; object-fit: cover; }
  .idc .who { font-size: 13px; font-weight: 900; }
  .idc .meta { font-size: 9px; font-weight: 600; opacity: 0.92; margin-top: 6px; line-height: 1.55; }
  .idc .meta b { font-weight: 900; }
  .idc .foot { margin-top: 10px; padding-top: 8px;
    border-top: 1px solid rgba(255,255,255,0.25); font-size: 8px; text-align: center; opacity: 0.85; }
`;

const idCardBody = (s: IdCardInput, b: PrintBranding) => `
  <div class="idc">
    <div class="head">
      ${b.logoUrl ? `<img src="${esc(b.logoUrl)}" alt="logo" crossorigin="anonymous" />` : ''}
      <div>
        <div class="n">${esc(b.schoolInfo.name || 'School')}</div>
        <div class="s">Student ID</div>
      </div>
    </div>
    <div class="body">
      <div class="photo">
        ${s.photoUrl ? `<img src="${esc(s.photoUrl)}" alt="photo" crossorigin="anonymous" />`
          : esc(s.studentName.charAt(0).toUpperCase() || '?')}
      </div>
      <div>
        <div class="who">${esc(s.studentName)}</div>
        <div class="meta">
          <b>Adm. No.:</b> ${esc(s.admissionNo)}<br/>
          <b>Class:</b> ${esc(s.className)}-${esc(s.section)} &nbsp;
          <b>Roll:</b> ${esc(s.rollNo || '—')}<br/>
          ${s.fatherName ? `<b>Father:</b> ${esc(s.fatherName)}<br/>` : ''}
          ${s.bloodGroup ? `<b>Blood:</b> ${esc(s.bloodGroup)} &nbsp;` : ''}
          ${s.dob ? `<b>DOB:</b> ${esc(s.dob)}` : ''}
        </div>
      </div>
    </div>
    ${s.address || s.phone ? `<div class="meta" style="margin-top: 8px; font-size: 8px;">
      ${s.address ? `<b>Addr:</b> ${esc(s.address)}<br/>` : ''}
      ${s.phone ? `<b>Phone:</b> ${esc(s.phone)}` : ''}
    </div>` : ''}
    <div class="foot">${esc(b.schoolInfo.address || '')}</div>
  </div>`;

export function buildIdCardsBulkHtml(items: IdCardInput[], b: PrintBranding, title = 'ID Cards'): string {
  const css = idCardCss(b.accent);
  return docShell(title, b.accent,
    `<style>${css}</style>` +
    items.map(s => `<div class="print-page" style="padding: 8mm;">${idCardBody(s, b)}</div>`).join('')
  );
}
