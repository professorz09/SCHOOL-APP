import React, { useState } from 'react';
import { ShieldCheck, AlertCircle, Loader } from 'lucide-react';
import { apiAuth } from '@/lib/apiClient';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { CURRENT_CONSENT_VERSION, CONSENT_TEXT } from '@/shared/config/consent';

export const ConsentGate: React.FC = () => {
  const { session, setSession, logout } = useAuthStore();
  const { showToast } = useUIStore();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!session) return null;

  const handleAccept = async () => {
    setError('');
    setSubmitting(true);
    try {
      await apiAuth.recordConsent(CURRENT_CONSENT_VERSION);
      setSession({ ...session, mustGiveConsent: false });
      showToast('Thanks — consent recorded');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record consent');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-dvh bg-gradient-to-br from-emerald-600 to-emerald-800 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-6 pt-6 pb-7 text-white">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
              <ShieldCheck size={22} />
            </div>
            <div className="min-w-0">
              <div className="text-xl font-black leading-tight">Data Consent</div>
              <div className="text-[11px] font-bold text-emerald-100 mt-0.5">Under the DPDP Act, 2023</div>
            </div>
          </div>
        </div>

        <div className="p-6 pb-7 max-h-[calc(100dvh-220px)] overflow-y-auto">
          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 mb-4 flex gap-2 items-start">
              <AlertCircle size={18} className="text-rose-600 shrink-0 mt-0.5" />
              <div className="text-sm font-bold text-rose-700">{error}</div>
            </div>
          )}

          <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-slate-700 mb-6">
            {CONSENT_TEXT}
          </pre>

          <button
            onClick={handleAccept}
            disabled={submitting}
            className="w-full py-4 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white font-black text-lg rounded-xl shadow-lg active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
            {submitting
              ? <><Loader size={20} className="animate-spin" /> Saving…</>
              : 'I Agree'}
          </button>

          <button
            onClick={async () => { await logout(); }}
            className="w-full mt-3 py-3 text-slate-500 font-bold text-sm hover:text-slate-700 transition-colors">
            Disagree &amp; log out
          </button>
        </div>
      </div>
    </div>
  );
};
