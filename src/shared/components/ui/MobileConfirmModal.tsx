import React, { useState, useEffect } from 'react';
import { ShieldCheck, AlertCircle, AlertTriangle } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';

// Normalize for phrase comparison — collapse multi-whitespace, trim,
// case-fold. Keeps the gate strict on meaning while forgiving on
// formatting (a stray space won't reject an otherwise-correct typing).
const normalizePhrase = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

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
  const [phrase, setPhrase] = useState('');
  const [error, setError] = useState<'none' | 'mobile' | 'phrase'>('none');

  // Reset on each new prompt
  useEffect(() => {
    if (req) { setText(''); setPhrase(''); setError('none'); }
  }, [req]);

  if (!req) return null;

  const phraseRequired = !!req.requiredPhrase;
  const phraseOK = !phraseRequired
    || normalizePhrase(phrase) === normalizePhrase(req.requiredPhrase!);
  const mobileOK = text.length === 4;

  const onCancel = () => resolve(false);
  const onConfirm = () => {
    if (text.replace(/\D/g, '').slice(-4) !== req.expectedLast4) {
      setError('mobile');
      return;
    }
    if (phraseRequired && !phraseOK) {
      setError('phrase');
      return;
    }
    resolve(true);
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
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
            phraseRequired ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
          }`}>
            {phraseRequired ? <AlertTriangle size={20}/> : <ShieldCheck size={20}/>}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-black text-slate-900">{req.title}</p>
            {req.message && (
              <p className="text-[12px] font-bold text-slate-500 mt-1 leading-relaxed">{req.message}</p>
            )}
          </div>
        </div>

        {/* Extra-loud warning band for mid-year close (or any caller
            that wants a separate red banner above the inputs). */}
        {req.warningText && (
          <div className="bg-rose-50 border-2 border-rose-200 rounded-xl px-3 py-2.5 mt-2 flex items-start gap-2">
            <AlertTriangle size={14} className="text-rose-600 shrink-0 mt-0.5"/>
            <p className="text-[11px] font-black text-rose-700 leading-relaxed">
              {req.warningText}
            </p>
          </div>
        )}

        {phraseRequired && (
          <>
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 mt-4 mb-1.5">
              Yeh line exactly type karein
            </p>
            <p className="text-[12px] font-black text-slate-900 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 mb-2 leading-relaxed select-text">
              {req.requiredPhrase}
            </p>
            <textarea
              rows={2}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={phrase}
              onChange={e => {
                setPhrase(e.target.value);
                setError('none');
              }}
              placeholder="Upar wali line yahaan type karein"
              className={`w-full px-3 py-2.5 bg-slate-50 border rounded-xl font-bold text-sm text-slate-800 outline-none transition-colors resize-none ${
                error === 'phrase'
                  ? 'border-rose-400 bg-rose-50 focus:border-rose-500'
                  : phraseOK && phrase.trim().length > 0
                    ? 'border-emerald-400 bg-emerald-50/40 focus:border-emerald-500'
                    : 'border-slate-200 focus:border-rose-500'
              }`}
            />
            {error === 'phrase' && (
              <div className="flex items-center gap-1.5 mt-1">
                <AlertCircle size={12} className="text-rose-500"/>
                <p className="text-[11px] font-black text-rose-600">
                  Line exactly match nahi ho rahi — copy karke type karein.
                </p>
              </div>
            )}
          </>
        )}

        <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 mt-4 mb-2">
          Apke mobile ke last 4 digits daalein
        </p>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          autoFocus={!phraseRequired}
          autoComplete="off"
          value={text}
          onChange={e => {
            setText(e.target.value.replace(/\D/g, '').slice(0, 4));
            if (error === 'mobile') setError('none');
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' && mobileOK && (!phraseRequired || phraseOK)) onConfirm();
          }}
          placeholder="••••"
          className={`w-full px-4 py-3.5 bg-slate-50 border rounded-xl font-black text-2xl text-center tracking-[0.5em] text-slate-900 outline-none transition-colors ${
            error === 'mobile'
              ? 'border-rose-400 bg-rose-50 focus:border-rose-500'
              : 'border-slate-200 focus:border-amber-500'
          }`}
        />
        {error === 'mobile' && (
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
            disabled={!mobileOK || (phraseRequired && !phraseOK)}
            className={`flex-1 py-3 text-white font-black rounded-2xl text-sm uppercase tracking-widest active:scale-95 transition-transform disabled:opacity-50 ${
              phraseRequired ? 'bg-rose-600 hover:bg-rose-700' : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};
