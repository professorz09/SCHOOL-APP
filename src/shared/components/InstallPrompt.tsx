// Floating install-prompt banner. Surfaces the browser's
// `beforeinstallprompt` event as a small toast at the bottom of the
// screen — tapping it shows the native add-to-home-screen sheet.
// Hides itself after dismissal or successful install. Persists the
// "dismissed" flag in localStorage so it doesn't nag on every load.

import React, { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'edugrow.pwa.install.dismissed';
const DISMISS_TTL_DAYS = 7;

function recentlyDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    if (Number.isNaN(ts)) return false;
    const ageDays = (Date.now() - ts) / (1000 * 60 * 60 * 24);
    return ageDays < DISMISS_TTL_DAYS;
  } catch { return false; }
}

export const InstallPrompt: React.FC = () => {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (recentlyDismissed()) return;
    // If app already launched in standalone mode (already installed),
    // no point showing the prompt.
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if ((navigator as { standalone?: boolean }).standalone) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvent);
      setHidden(false);
    };
    const onInstalled = () => {
      setEvt(null);
      setHidden(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (hidden || !evt) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* noop */ }
    setHidden(true);
  };

  const install = async () => {
    try {
      await evt.prompt();
      const { outcome } = await evt.userChoice;
      if (outcome === 'accepted') {
        setHidden(true);
      } else {
        dismiss();
      }
    } catch {
      dismiss();
    }
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[200] flex justify-center pointer-events-none animate-in slide-in-from-bottom-4 duration-300">
      <div className="pointer-events-auto bg-slate-900 text-white rounded-2xl shadow-2xl flex items-center gap-3 px-4 py-3 max-w-md w-full">
        <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center shrink-0">
          <Download size={20} className="text-indigo-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black">Install EduGrow</p>
          <p className="text-[11px] font-bold text-white/60 mt-0.5">
            Phone par add karein — har baar browser kholne ki zaroorat nahi.
          </p>
        </div>
        <button
          onClick={install}
          className="bg-indigo-500 hover:bg-indigo-600 active:scale-95 transition-transform text-white text-xs font-black uppercase tracking-wide px-3 py-2 rounded-xl">
          Install
        </button>
        <button onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="text-white/40 hover:text-white/80 transition-colors p-1">
          <X size={16} />
        </button>
      </div>
    </div>
  );
};
