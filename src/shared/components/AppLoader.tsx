// Single source of truth for "something is loading" UI.
//
// Three variants — same visual language, three sizes:
//   • full   — fills the viewport on initial app boot / route gate.
//              Branded splash: white background, big "EduGrow" wordmark
//              with bouncing red+blue dots underneath. Replaces the
//              old blue gradient splash AND the plain slate spinner —
//              the user wanted something with brand identity here.
//   • centered — sits inside a panel, ~60vh tall. Used for tab bodies
//                while the first fetch runs. Stays minimal (just a
//                spinner) so it doesn't compete with page content.
//   • inline — small inline spinner + label, fits where the parent
//              already provides padding.
//
// Pages MUST pick one of these. Mixing local <Loader/> blocks with
// other ad-hoc spinners is what created the "do alag-alag loading"
// effect on the fees page (a chunk-suspense fallback fired AND a
// per-component spinner fired at the same time).

import React from 'react';
import { Loader } from 'lucide-react';

interface Props {
  variant?: 'full' | 'centered' | 'inline';
  label?: string;
}

export const AppLoader: React.FC<Props> = ({ variant = 'centered', label = 'Loading…' }) => {
  if (variant === 'full') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 relative overflow-hidden">
        {/* Inline keyframes — self-contained so the splash doesn't
            depend on any global CSS file or an animation utility
            class that might not exist. Runs the indeterminate bar
            and the soft pulse behind the logo. */}
        <style>{`
          @keyframes el_shimmer {
            0%   { transform: translateX(-110%); }
            100% { transform: translateX(310%); }
          }
          @keyframes el_pulse {
            0%, 100% { transform: scale(1);   opacity: 0.45; }
            50%      { transform: scale(1.08); opacity: 0.7; }
          }
        `}</style>

        {/* Soft ambient gradient blobs — barely visible, just enough
            to give the white canvas a hint of warmth. */}
        <div className="absolute -top-32 -right-24 w-[420px] h-[420px] rounded-full bg-blue-100/40 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-24 w-[420px] h-[420px] rounded-full bg-rose-100/40 blur-3xl pointer-events-none" />

        <div className="relative flex flex-col items-center animate-in fade-in slide-in-from-bottom-3 duration-700">
          {/* Logo mark — rounded gradient square with a stylized
              graduation-cap glyph. The soft halo behind it pulses
              gently to signal liveness without a noisy spinner. */}
          <div className="relative">
            <div
              className="absolute inset-0 rounded-3xl bg-gradient-to-br from-blue-400 to-blue-600 blur-2xl"
              style={{ animation: 'el_pulse 2.4s ease-in-out infinite' }}
            />
            <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 flex items-center justify-center shadow-xl shadow-blue-300/50">
              <svg viewBox="0 0 24 24" fill="none" className="w-10 h-10 text-white" aria-hidden="true">
                {/* Stylised graduation cap — top board + tassel. Plain
                    SVG so we don't pull a lucide icon for one render. */}
                <path d="M2 9.5L12 5l10 4.5-10 4.5L2 9.5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" fill="rgba(255,255,255,0.15)"/>
                <path d="M6 11.5v4.2c0 1.1 2.7 2.3 6 2.3s6-1.2 6-2.3v-4.2" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                <path d="M21 10v4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="21" cy="15.5" r="1" fill="currentColor"/>
              </svg>
            </div>
          </div>

          {/* Wordmark + tagline */}
          <h1 className="text-4xl font-black tracking-tight text-slate-900 mt-6">EduGrow</h1>
          <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400 mt-2">
            School operating system
          </p>

          {/* Indeterminate progress bar — narrow segment slides
              left-to-right indefinitely. Red→blue gradient on the
              segment echoes the brand without being loud. */}
          <div className="w-48 h-1 bg-slate-100 rounded-full overflow-hidden mt-9">
            <div
              className="h-full w-1/3 rounded-full bg-gradient-to-r from-rose-500 via-fuchsia-500 to-blue-600"
              style={{ animation: 'el_shimmer 1.6s ease-in-out infinite' }}
            />
          </div>

          {/* Optional contextual label — silent for the default. */}
          {label && label !== 'Loading…' && (
            <p className="text-[11px] font-bold text-slate-500 mt-5">{label}</p>
          )}
        </div>

        {/* Tiny copyright pinned to bottom — keeps the splash feeling
            like a finished product, not a developer placeholder. */}
        <p className="absolute bottom-6 text-[10px] font-bold text-slate-300 tracking-widest uppercase">
          © {new Date().getFullYear()} EduGrow
        </p>
      </div>
    );
  }
  if (variant === 'inline') {
    return (
      <span className="inline-flex items-center gap-2 text-slate-400">
        <Loader size={14} className="animate-spin" />
        <span className="text-xs font-bold">{label}</span>
      </span>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
      <Loader size={24} className="text-slate-400 animate-spin" />
      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{label}</span>
    </div>
  );
};
