import React, { useState, useEffect } from 'react';
import { ShieldCheck, AlertCircle } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';

/**
 * Mobile-last-4 type-to-confirm gate. Used for sensitive actions
 * (Editor Mode enable, Correction Mode enable, Year Lock) where
 * a casual click would be too dangerous and a full password re-entry
 * is overkill / racy with Supabase auth.
 *
 * UX: principal types the last 4 digits of their own mobile number.
 * They know it from memory, no Supabase round-trip, no recovery flow,
 * no leaked-password risk. Same friction goal as a password gate.
 */
export const MobileConfirmModal: React.FC = () => {
  const req = useUIStore(s => s.mobileConfirmRequest);
  const resolve = useUIStore(s => s.resolveMobileConfirm);
  const [text, setText] = useState('');
  const [error, setError] = useState(false);

  // Reset on each new prompt
  useEffect(() => {
    if (req) { setText(''); setError(false); }
  }, [req]);

  if (!req) return null;

  const onCancel = () => resolve(false);
  const onConfirm = () => {
    if (text.replace(/\D/g, '').slice(-4) === req.expectedLast4) {
      resolve(true);
    } else {
      setError(true);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/50 flex items-end lg:items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-3xl w-full lg:max-w-md p-5 lg:p-6 shadow-2xl animate-in slide-in-from-bottom-4 lg:zoom-in-95 duration-200"
      >
        <div className="flex items-start gap-3 mb-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <ShieldCheck size={20}/>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-black text-slate-900">{req.title}</p>
            {req.message && (
              <p className="text-[12px] font-bold text-slate-500 mt-1 leading-relaxed">{req.message}</p>
            )}
          </div>
        </div>

        <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 mt-4 mb-2">
          Apke mobile ke last 4 digits daalein
        </p>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          autoFocus
          autoComplete="off"
          value={text}
          onChange={e => {
            setText(e.target.value.replace(/\D/g, '').slice(0, 4));
            setError(false);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' && text.length === 4) onConfirm();
          }}
          placeholder="••••"
          className={`w-full px-4 py-3.5 bg-slate-50 border rounded-xl font-black text-2xl text-center tracking-[0.5em] text-slate-900 outline-none transition-colors ${
            error
              ? 'border-rose-400 bg-rose-50 focus:border-rose-500'
              : 'border-slate-200 focus:border-amber-500'
          }`}
        />
        {error && (
          <div className="flex items-center gap-1.5 mt-2">
            <AlertCircle size={12} className="text-rose-500"/>
            <p className="text-[11px] font-black text-rose-600">
              Galat number — apne mobile ke last 4 digits check karein.
            </p>
          </div>
        )}

        <div className="flex gap-3 mt-5">
          <button
            onClick={onCancel}
            className="flex-1 py-3 bg-slate-100 text-slate-700 font-black rounded-2xl text-sm uppercase tracking-widest active:scale-95 transition-transform"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={text.length < 4}
            className="flex-1 py-3 bg-amber-600 hover:bg-amber-700 text-white font-black rounded-2xl text-sm uppercase tracking-widest active:scale-95 transition-transform disabled:opacity-50"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};
