import React, { useState } from 'react';
import { Database, Download, AlertTriangle, Image as ImageIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useUIStore } from '@/store/uiStore';

interface Props {
  /** API endpoint that accepts `?kind=quick|full` and returns a ZIP. */
  apiPath: string;
  /** Optional — passed through unused, kept so callers can document
   *  which school the card belongs to without affecting render. */
  schoolId?: string;
}

/**
 * Two-button backup surface used by both SuperAdmin (per-school) and
 * Principal Settings (own school). Streams a ZIP directly to the
 * browser — nothing stored on Supabase. Server enforces rate limits;
 * this UI just disables the buttons during an in-flight request and
 * surfaces the rate-limit error verbatim.
 */
export const BackupCard: React.FC<Props> = ({ apiPath }) => {
  const { showToast } = useUIStore();
  const [busy, setBusy] = useState<'QUICK' | 'FULL' | null>(null);

  const handleDownload = async (kind: 'QUICK' | 'FULL') => {
    setBusy(kind);
    try {
      // Server gates by Bearer token; same auth contract as apiClient.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Session expired — please log in again.');

      const res = await fetch(`${apiPath}?kind=${kind.toLowerCase()}`, {
        method: 'GET',
        headers: { authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        // Server sends JSON error envelope on failure; ZIP on success.
        // Read as text first to tolerate edge cases (empty body, html).
        const text = await res.text();
        let msg = `Backup failed (HTTP ${res.status})`;
        try { msg = JSON.parse(text).error ?? msg; } catch { /* keep default */ }
        throw new Error(msg);
      }

      // Pull the filename from Content-Disposition; fall back to a
      // sensible default if the header is missing or malformed.
      const cd = res.headers.get('Content-Disposition') ?? '';
      const match = cd.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `school-backup-${new Date().toISOString().slice(0, 10)}.zip`;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      // Backup ZIPs can be 50+ MB — Safari + older WebKit need the
      // blob URL alive while they fetch + write the file. Synchronous
      // revoke after click() races the download and the user gets a
      // truncated / 0-byte zip silently.
      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
      }, 1000);

      showToast(`${kind === 'QUICK' ? 'Quick' : 'Full'} backup downloaded · ${(blob.size / 1024 / 1024).toFixed(1)} MB`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Backup failed', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Backup</p>
        <span className="text-[9px] font-bold text-slate-400">Streams to your device</span>
      </div>

      <div className="space-y-2.5">
        {/* Quick — JSON only, daily limit. */}
        <button
          type="button"
          onClick={() => handleDownload('QUICK')}
          disabled={busy !== null}
          className="w-full flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/40 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-wait text-left">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Database size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-black text-slate-900 text-sm">Quick Backup (JSON)</div>
            <div className="text-[10px] font-bold text-slate-500 mt-0.5 leading-relaxed">
              All school records — students, fees, payments, attendance, results.
              <br/><span className="text-slate-400">~3–5 MB · once per 24 hours</span>
            </div>
          </div>
          <Download size={16} className={`text-emerald-500 shrink-0 mt-1 ${busy === 'QUICK' ? 'animate-pulse' : ''}`} />
        </button>

        {/* Full — JSON + storage. Weekly limit. */}
        <button
          type="button"
          onClick={() => handleDownload('FULL')}
          disabled={busy !== null}
          className="w-full flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-wait text-left">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <ImageIcon size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-black text-slate-900 text-sm">Full Archive</div>
            <div className="text-[10px] font-bold text-slate-500 mt-0.5 leading-relaxed">
              Quick backup + photos, signatures, payment QR, student/staff documents.
              <br/><span className="text-slate-400">~25–30 MB · once per 7 days</span>
            </div>
          </div>
          <Download size={16} className={`text-blue-500 shrink-0 mt-1 ${busy === 'FULL' ? 'animate-pulse' : ''}`} />
        </button>
      </div>

      <div className="mt-3 flex items-start gap-2 text-[10px] font-bold text-slate-500 leading-relaxed">
        <AlertTriangle size={11} className="text-amber-500 shrink-0 mt-0.5" />
        <p>
          Login passwords security ke liye backup me <strong>nahi</strong> hain. App band ho jaye to log-in fresh banane padenge — but saara records / photos safe rahenge.
        </p>
      </div>
    </div>
  );
};
