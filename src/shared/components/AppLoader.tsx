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
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
        {/* Branded wordmark — "EduGrow" with the "Edu" in blue and
            "Grow" in red so the brand reads even at a glance. The
            tracking-tight + 5xl matches the LoginPage hero size. */}
        <div className="text-5xl font-black tracking-tight leading-none animate-in fade-in zoom-in-95 duration-500">
          <span className="text-blue-600">Edu</span>
          <span className="text-red-500">Grow</span>
        </div>
        <p className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400 mt-3">
          School operating system
        </p>

        {/* Three bouncing dots — the "loading" cue. Two blues + one
            red to echo the wordmark colours. Each dot is offset via an
            animation-delay style so they bounce in sequence rather
            than in lockstep. */}
        <div className="flex items-center gap-2 mt-8">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-bounce"  style={{ animationDelay: '150ms' }} />
          <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>

        {/* Optional contextual label — most callers don't pass one,
            so default "Loading…" stays subtle below the dots. */}
        {label && label !== 'Loading…' && (
          <p className="text-[11px] font-bold text-slate-400 mt-4">{label}</p>
        )}
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
