import React, { useEffect, useState } from 'react';
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
  // CRITICAL: every hook must run on every render. The earlier code
  // returned `null` here BEFORE useViewportIsDesktop, so when toasts
  // toggled on/off React saw a different hook count between renders and
  // crashed with "Rendered fewer hooks than expected" — and because this
  // container lives at the app root, every action that fired a toast (add,
  // edit, delete, save, anything) blanked the whole app. Always call the
  // hook first; gate output via the JSX below instead.
  const { toasts, dismissToast } = useUIStore();
  const isDesktop = useViewportIsDesktop();

  // Drop empty-message toasts — those used to render as blank rose pills
  // when an Error was thrown with `''` as its message.
  const visible = toasts.filter(t => (t.message ?? '').trim().length > 0);

  // Positioning rules:
  //   • Mobile  → bottom-centered band above the bottom nav.
  //   • Desktop → bottom-right pill stack, max-width so it doesn't slide
  //     under the sidebar or stretch across the whole layout.
  // Inline style is intentional — Tailwind's lg: prefix variants kept
  // losing on cached desktop reloads because CSS specificity ties were
  // resolving to the unprefixed (full-width) rule.
  const containerStyle: React.CSSProperties = isDesktop
    ? { position: 'fixed', right: 24, bottom: 24, maxWidth: '24rem', width: 'calc(100% - 48px)', zIndex: 200 }
    : { position: 'fixed', left: 16, right: 16, bottom: 96, zIndex: 200 };

  if (visible.length === 0) return null;

  return (
    <div className="space-y-2 pointer-events-none" style={containerStyle}>
      {visible.map(toast => (
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

// Local viewport-size hook. Kept private to this file so we don't reach into
// app-level layout state from a shared UI primitive.
function useViewportIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window === 'undefined' ? false : window.innerWidth >= 1024,
  );
  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isDesktop;
}
