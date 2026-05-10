import React, { useEffect, useState } from 'react';
import { useUIStore } from '@/store/uiStore';

/**
 * Root-level modal that consumes `useUIStore.reasonRequest`. Mounted
 * once next to <ToastContainer /> at the app root. Any caller anywhere
 * in the tree can trigger it via:
 *
 *     const reason = await useUIStore.getState().askReason({
 *       message: 'Reason for editing this locked record',
 *     });
 *
 * Replaces window.prompt() — which on mobile Chromium / Codespaces
 * showed the dev hostname as the dialog title and looked like a
 * phishing prompt to non-technical users.
 */
export const ReasonPromptModal: React.FC = () => {
  const reasonRequest = useUIStore(s => s.reasonRequest);
  const resolveReason = useUIStore(s => s.resolveReason);
  const [text, setText] = useState('');

  useEffect(() => {
    setText(''); // reset whenever a new prompt opens
  }, [reasonRequest]);

  if (!reasonRequest) return null;

  const trimmed = text.trim();
  const canSubmit = !reasonRequest.required || trimmed.length > 0;
  const submit = () => resolveReason(canSubmit ? (trimmed || null) : null);
  const cancel = () => resolveReason(null);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/50 flex items-end lg:items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={cancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-3xl w-full lg:max-w-md p-5 lg:p-6 shadow-2xl animate-in slide-in-from-bottom-4 lg:zoom-in-95 duration-200"
      >
        <p className="text-base font-black text-slate-900">{reasonRequest.message}</p>
        <p className="text-[11px] font-bold text-slate-400 mt-1 mb-3">
          Audit log me ye reason save hoga.
        </p>
        <textarea
          autoFocus
          value={text}
          onChange={e => setText(e.target.value)}
          rows={3}
          placeholder={reasonRequest.placeholder ?? 'Likhne ka reason…'}
          className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-blue-500 resize-none"
        />
        <div className="flex gap-3 mt-4">
          <button
            onClick={cancel}
            className="flex-1 py-3 bg-slate-100 text-slate-700 font-black rounded-2xl text-sm uppercase tracking-widest active:scale-95 transition-transform"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl text-sm uppercase tracking-widest active:scale-95 transition-transform disabled:opacity-60"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
