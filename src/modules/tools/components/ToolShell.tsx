// ToolShell — shared mobile-app style wrapper used by every tool.
// Provides:
//   • sticky top bar (back arrow + title + subtitle + optional right slot)
//   • two-tab strip: Edit / Preview (count badge optional)
//   • fixed-bottom action bar (Print + Download) when in Preview and
//     `hasData` is true
//   • always-mounted print-only slot so downloadPDF can snapshot it
//     regardless of which tab is showing
//
// Each tool passes its inputs as `edit`, the on-screen preview as
// `preview`, and the full A4 render as `printNode`. The shell handles
// every other UI concern.

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Printer, Download, Loader2, Settings2, Eye, Share2 } from 'lucide-react';
import { handlePrint, downloadPDF } from '@/shared/utils/htmlToPdf';

export type ToolTab = 'EDIT' | 'PREVIEW';

interface Props {
  title: string;
  subtitle?: string;
  onBack: () => void;
  /** Optional top-right element (icons like history / settings). */
  topRight?: React.ReactNode;
  /** Inputs / data section — rendered in the Edit tab. */
  edit: React.ReactNode;
  /** On-screen preview — rendered in the Preview tab. */
  preview: React.ReactNode;
  /** Hidden A4 print target — always mounted so downloadPDF can find it. */
  printNode: React.ReactNode;
  /** id of the print target inside `printNode`. */
  printTargetId: string;
  /** Downloaded PDF filename. */
  filename: string;
  /** Whether download/print should be enabled. */
  hasData: boolean;
  /** Optional initial tab. Defaults to EDIT. */
  initialTab?: ToolTab;
  /** Optional label override for the Preview tab (e.g. count). */
  previewLabel?: React.ReactNode;
}

export const ToolShell: React.FC<Props> = ({
  title, subtitle, onBack, topRight,
  edit, preview, printNode, printTargetId, filename,
  hasData, initialTab = 'EDIT', previewLabel,
}) => {
  const [tab, setTab] = useState<ToolTab>(initialTab);
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);

  // Whether the device exposes the Web Share API for files (mobile).
  // Hide the Share button on desktops where it'd just fall through.
  const canShare = typeof navigator !== 'undefined'
    && typeof (navigator as Navigator & { canShare?: (d: ShareData) => boolean }).canShare === 'function';

  const onDownload = async () => {
    if (downloading || sharing) return;
    setDownloading(true);
    try {
      await downloadPDF(printTargetId, filename, undefined, { mode: 'download' });
    } catch (err) {
      console.error('[ToolShell] download threw', err);
      alert(`Download failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDownloading(false);
    }
  };

  const onShare = async () => {
    if (downloading || sharing) return;
    setSharing(true);
    try {
      await downloadPDF(printTargetId, filename, undefined, { mode: 'share' });
    } catch (err) {
      console.error('[ToolShell] share threw', err);
      alert(`Share failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="w-full bg-slate-50 min-h-screen flex flex-col">
      <div className="no-print flex-1 flex flex-col">
        {/* ── Top bar ───────────────────────────────────────────── */}
        <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-100 px-3 md:px-6 py-3">
          <div className="max-w-3xl mx-auto flex items-center gap-2">
            <button onClick={onBack}
              className="p-2 -ml-1 rounded-full hover:bg-slate-100 active:scale-95 transition-all shrink-0">
              <ArrowLeft size={18} className="text-slate-700" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-base md:text-lg font-bold text-slate-900 leading-tight truncate">{title}</h1>
              {subtitle && <p className="text-[11px] font-medium text-slate-500 truncate">{subtitle}</p>}
            </div>
            {topRight}
          </div>
        </div>

        {/* ── Tab strip ─────────────────────────────────────────── */}
        <div className="sticky top-[57px] z-10 bg-white border-b border-slate-100 px-3 md:px-6">
          <div className="max-w-3xl mx-auto flex">
            <TabBtn active={tab === 'EDIT'} onClick={() => setTab('EDIT')} icon={<Settings2 size={15} />}>
              Edit
            </TabBtn>
            <TabBtn active={tab === 'PREVIEW'} onClick={() => setTab('PREVIEW')} icon={<Eye size={15} />}>
              Preview {previewLabel}
            </TabBtn>
          </div>
        </div>

        {/* ── Body ──────────────────────────────────────────────── */}
        <div className="flex-1 px-3 md:px-6 py-4 md:py-5 max-w-3xl mx-auto w-full"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 130px)' }}>
          {tab === 'EDIT' ? (
            <div className="space-y-3">{edit}</div>
          ) : (
            <div className="space-y-3">
              {hasData ? preview : (
                <p className="text-center py-12 text-slate-400 font-medium text-sm">
                  Add data on the Edit tab first.
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Sticky bottom action bar (Preview only, when hasData) ────
            `env(safe-area-inset-bottom)` lifts the bar above the
            phone's system gesture nav so the buttons don't sit under
            the Android nav bar / iOS home indicator. */}
        {tab === 'PREVIEW' && hasData && (
          <div className="fixed bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent pt-4 px-3 md:px-6"
            style={{
              // Push buttons well clear of Android's gesture nav /
              // 3-button nav. `env()` returns 0 in regular Chrome
              // tabs, so we always add a 40 px buffer on top of it.
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 40px)',
            }}>
            <div className={`max-w-3xl mx-auto grid gap-2 ${canShare ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <button onClick={handlePrint}
                className="py-3 bg-white border border-slate-300 hover:border-slate-900 text-slate-900 rounded-xl font-bold text-[11px] md:text-xs uppercase tracking-widest flex justify-center items-center gap-1.5 md:gap-2 active:scale-[0.98] transition-all">
                <Printer size={15} /> Print
              </button>
              {canShare && (
                <button onClick={onShare} disabled={downloading || sharing}
                  className="py-3 bg-white border border-slate-300 hover:border-slate-900 text-slate-900 rounded-xl font-bold text-[11px] md:text-xs uppercase tracking-widest flex justify-center items-center gap-1.5 md:gap-2 active:scale-[0.98] transition-all disabled:opacity-60">
                  {sharing ? <Loader2 size={15} className="animate-spin" /> : <Share2 size={15} />}
                  {sharing ? '…' : 'Share'}
                </button>
              )}
              <button onClick={onDownload} disabled={downloading || sharing}
                className="py-3 bg-slate-900 hover:bg-black text-white rounded-xl font-bold text-[11px] md:text-xs uppercase tracking-widest flex justify-center items-center gap-1.5 md:gap-2 active:scale-[0.98] transition-all disabled:opacity-60">
                {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                {downloading ? '…' : 'Download'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Always-mounted hidden print target ──────────────────────── */}
      {/* Render via Portal directly to document.body so the print
          target is never affected by parent layout / unmounts, and
          downloadPDF's lift logic always finds it. */}
      {typeof document !== 'undefined' && createPortal(
        <div className="print-only">{printNode}</div>,
        document.body,
      )}
    </div>
  );
};

const TabBtn: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }> = ({ active, onClick, icon, children }) => (
  <button onClick={onClick}
    className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-[11px] md:text-xs font-bold uppercase tracking-widest border-b-2 transition-colors ${
      active ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'
    }`}>
    {icon} {children}
  </button>
);

// Reusable form pieces so tools don't redefine the same styles.

export const ToolLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-1.5">{children}</label>
);

export const ToolField: React.FC<{ label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }> = ({ label, value, onChange, placeholder, type }) => (
  <div>
    <ToolLabel>{label}</ToolLabel>
    <input type={type ?? 'text'} value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500" />
  </div>
);

export const ToolCard: React.FC<{ title?: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
    {title && <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{title}</h3>}
    {children}
  </div>
);
