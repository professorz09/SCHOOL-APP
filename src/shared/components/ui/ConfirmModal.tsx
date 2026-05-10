import React from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';

/**
 * Root-level yes/no confirmation modal. Mounted once next to
 * <ToastContainer /> + <ReasonPromptModal />. Triggered via:
 *
 *     const ok = await useUIStore.getState().askConfirm({
 *       title: 'Mark Aarav as FAILED?',
 *       message: 'This affects promotion records.',
 *       confirmLabel: 'Mark Failed',
 *       destructive: true,
 *     });
 *     if (!ok) return;
 *
 * Replaces window.confirm() — which on mobile Chromium / Codespaces
 * showed the dev hostname as the dialog title and looked like a
 * phishing prompt to non-technical users.
 */
export const ConfirmModal: React.FC = () => {
  const req = useUIStore(s => s.confirmRequest);
  const resolve = useUIStore(s => s.resolveConfirm);
  if (!req) return null;

  const onCancel = () => resolve(false);
  const onConfirm = () => resolve(true);
  const Icon = req.destructive ? AlertTriangle : HelpCircle;
  const tint = req.destructive ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600';
  const cta = req.destructive
    ? 'bg-rose-600 hover:bg-rose-700 text-white'
    : 'bg-blue-600 hover:bg-blue-700 text-white';

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
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${tint}`}>
            <Icon size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-black text-slate-900">{req.title}</p>
            {req.message && (
              <p className="text-[12px] font-bold text-slate-500 mt-1 leading-relaxed">{req.message}</p>
            )}
          </div>
        </div>
        <div className="flex gap-3 mt-4">
          <button
            onClick={onCancel}
            className="flex-1 py-3 bg-slate-100 text-slate-700 font-black rounded-2xl text-sm uppercase tracking-widest active:scale-95 transition-transform"
          >
            {req.cancelLabel ?? 'Cancel'}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-3 font-black rounded-2xl text-sm uppercase tracking-widest active:scale-95 transition-transform ${cta}`}
          >
            {req.confirmLabel ?? (req.destructive ? 'Delete' : 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  );
};
