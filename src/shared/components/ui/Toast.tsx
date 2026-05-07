import React from 'react';
import { CheckCircle2, XCircle, AlertCircle, Info, X } from 'lucide-react';
import { useUIStore, Toast as ToastType } from '@/store/uiStore';

const ICONS = {
  success: <CheckCircle2 size={16} className="text-emerald-600" />,
  error: <XCircle size={16} className="text-rose-600" />,
  warning: <AlertCircle size={16} className="text-amber-600" />,
  info: <Info size={16} className="text-blue-600" />,
};

const BG = {
  success: 'bg-emerald-50 border-emerald-200',
  error: 'bg-rose-50 border-rose-200',
  warning: 'bg-amber-50 border-amber-200',
  info: 'bg-blue-50 border-blue-200',
};

const TEXT = {
  success: 'text-emerald-900',
  error: 'text-rose-900',
  warning: 'text-amber-900',
  info: 'text-blue-900',
};

export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast } = useUIStore();
  if (toasts.length === 0) return null;

  // Positioning rules:
  //   • Mobile  → bottom-centered band, sits above the bottom nav (bottom-24).
  //   • Desktop → bottom-right pill stack with a fixed max-width so it
  //     doesn't slide under the sidebar or stretch across the whole layout.
  // Earlier this used `absolute`, which positioned the toast relative to
  // whichever scroll container happened to be its ancestor — on desktop the
  // bar slid behind the sidebar and looked like it was cut off mid-screen.
  return (
    <div
      className="fixed z-[200] space-y-2 pointer-events-none
                 bottom-24 left-4 right-4
                 lg:bottom-6 lg:right-6 lg:left-auto lg:max-w-sm lg:w-full">
      {toasts.map(toast => (
        <div key={toast.id}
          role="alert"
          className={`flex items-start gap-3 px-4 py-3 rounded-2xl border shadow-lg pointer-events-auto animate-in slide-in-from-bottom-4 duration-300 ${BG[toast.type]}`}>
          <span className="mt-0.5 shrink-0">{ICONS[toast.type]}</span>
          <span className={`flex-1 text-sm font-bold leading-snug ${TEXT[toast.type]}`}>{toast.message}</span>
          <button onClick={() => dismissToast(toast.id)} className="shrink-0 text-slate-400 hover:text-slate-600">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
};
