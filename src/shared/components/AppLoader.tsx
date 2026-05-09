// Single source of truth for "something is loading" UI.
//
// Three variants — same visual language, three sizes:
//   • full   — fills the viewport on initial app boot / route gate
//              (replaces the old blue gradient splash). White
//              background so it doesn't strobe between the splash
//              and the white app shell that loads after.
//   • centered — sits inside a panel, ~60vh tall. Used for tab bodies
//                while the first fetch runs.
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
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-3">
        <Loader size={28} className="text-slate-400 animate-spin" />
        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{label}</span>
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
