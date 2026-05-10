// Tiny CSV helper used by per-screen "Export CSV" buttons.
// No deps — Excel + Numbers + Sheets all parse RFC-4180 quoting fine.

const csvCell = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Convert an array of plain objects (or [headers, ...rows]) to CSV text. */
export function toCsv(
  rows: Record<string, unknown>[],
  headers?: string[],
): string {
  if (rows.length === 0) return (headers ?? []).join(',') + '\n';
  const cols = headers ?? Object.keys(rows[0]);
  const lines = [cols.join(',')];
  for (const r of rows) lines.push(cols.map(c => csvCell(r[c])).join(','));
  return lines.join('\n') + '\n';
}

/** Trigger a browser download of CSV content as `<filename>.csv`. */
export function downloadCsv(filename: string, content: string): void {
  // Prepend BOM so Excel opens UTF-8 (rupee symbol, accents) correctly.
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // Defer cleanup so the browser can start the download fetch before
  // the blob URL is revoked. Synchronous revoke races the fetch in
  // Safari / older WebKit and the file ends up empty / "Failed".
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}

/** One-shot helper: build CSV from rows and download it. */
export function exportCsv(
  filename: string,
  rows: Record<string, unknown>[],
  headers?: string[],
): void {
  downloadCsv(filename, toCsv(rows, headers));
}
