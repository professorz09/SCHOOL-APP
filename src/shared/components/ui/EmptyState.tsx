import React from 'react';

interface Props {
  /** Lucide icon component, e.g. `Building2` or `BookOpen`. Rendered
   *  large + muted inside the empty-state. */
  icon: React.ComponentType<{ size?: number; className?: string }>;
  /** Short headline, e.g. "No schools onboarded yet". */
  title: string;
  /** Optional 1-2 line hint explaining what to do next. */
  hint?: string;
  /** Optional primary CTA (label + onClick). Pass `null` for view-only
   *  states (e.g. roles that can't create). */
  cta?: { label: string; onClick: () => void };
  /** Override the tone of the CTA button. Default emerald. */
  ctaTone?: 'emerald' | 'blue' | 'indigo' | 'violet' | 'rose';
}

const CTA_TONES: Record<NonNullable<Props['ctaTone']>, string> = {
  emerald: 'bg-emerald-600 hover:bg-emerald-700',
  blue:    'bg-blue-600 hover:bg-blue-700',
  indigo:  'bg-indigo-600 hover:bg-indigo-700',
  violet:  'bg-violet-600 hover:bg-violet-700',
  rose:    'bg-rose-600 hover:bg-rose-700',
};

/**
 * Standardised empty-state for every list / collection screen.
 * Every empty state in the app converges on: muted icon → headline →
 * hint → optional CTA. Replaces the assorted "No data" / "—" /
 * "Koi exam nahi mila" one-liners that were scattered everywhere.
 */
export const EmptyState: React.FC<Props> = ({ icon: Icon, title, hint, cta, ctaTone = 'emerald' }) => (
  <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
    <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
      <Icon size={26} />
    </div>
    <p className="font-black text-slate-700 text-sm">{title}</p>
    {hint && (
      <p className="text-[11px] font-bold text-slate-400 mt-1 leading-relaxed max-w-xs">{hint}</p>
    )}
    {cta && (
      <button onClick={cta.onClick}
        className={`mt-4 px-4 py-2.5 text-white font-black text-[11px] uppercase tracking-widest rounded-xl active:scale-95 transition-transform shadow-sm ${CTA_TONES[ctaTone]}`}>
        {cta.label}
      </button>
    )}
  </div>
);
