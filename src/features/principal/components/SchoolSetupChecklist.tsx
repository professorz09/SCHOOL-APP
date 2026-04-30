import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar, BookOpen, IndianRupee, UserCheck, Users,
  CheckCircle2, ChevronDown, ChevronUp, ChevronRight, Sparkles, Lock,
} from 'lucide-react';
import { PrincipalView } from '../pages/PrincipalLayout';

interface Props {
  schoolId: string | null;
  /**
   * Truthy only when the school currently has at least one OPEN
   * (non-closed) academic year. Closed years still exist as historical
   * records but cannot host new sections / fees / staff / students, so
   * they MUST NOT mark Step 1 as done — otherwise the principal sees
   * subsequent steps unlocked while saves fail with "no active year".
   */
  hasActiveYear: boolean;
  sectionsCount: number;
  feeStructuresCount: number;
  staffCount: number;
  studentsCount: number;
  onNavigate: (view: PrincipalView) => void;
}

interface Step {
  key: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  desc: string;
  view: PrincipalView;
  done: boolean;
}

export const SchoolSetupChecklist: React.FC<Props> = ({
  schoolId, hasActiveYear, sectionsCount, feeStructuresCount,
  staffCount, studentsCount, onNavigate,
}) => {
  const storageKey = schoolId ? `eg.setup_collapsed_${schoolId}` : null;
  const [collapsed, setCollapsed] = useState<boolean>(false);

  // Rehydrate the collapse state whenever the school id changes (e.g. session
  // hydrates after first render, or principal switches schools). Without this
  // useEffect, the lazy useState initializer captures a null schoolId and
  // never re-reads the per-school localStorage entry.
  useEffect(() => {
    if (!storageKey) { setCollapsed(false); return; }
    try { setCollapsed(localStorage.getItem(storageKey) === 'true'); }
    catch { setCollapsed(false); }
  }, [storageKey]);

  // Step order is intentional and matches real-world Indian school onboarding.
  // The academic year is the parent record for sections/fees/staff/students,
  // so each subsequent step is gated on the previous one being done — the
  // principal MUST complete them in this exact sequence.
  const steps: Step[] = useMemo(() => [
    {
      key: 'academic_year',
      icon: <Calendar size={18} />,
      iconBg: 'bg-rose-100',
      iconColor: 'text-rose-600',
      title: 'Academic Year',
      desc: 'Start date, end date aur board (CBSE / ICSE / State) set karein',
      view: 'YEAR_CLOSING',
      // Closed-only years count as zero here — Step 1 stays "todo" until
      // the principal opens a fresh year via the wizard.
      done: hasActiveYear,
    },
    {
      key: 'classes',
      icon: <BookOpen size={18} />,
      iconBg: 'bg-purple-100',
      iconColor: 'text-purple-600',
      title: 'Classes & Sections',
      desc: 'Kitne se kitni tak classes (e.g. Nursery se 12th) aur sections',
      view: 'SETTINGS_CLASSES',
      done: sectionsCount > 0,
    },
    {
      key: 'fee_structure',
      icon: <IndianRupee size={18} />,
      iconBg: 'bg-emerald-100',
      iconColor: 'text-emerald-600',
      title: 'Fee Structure',
      desc: 'Class-wise fee setup karein (tuition, transport, etc.)',
      view: 'SETTINGS_FEE_STRUCT',
      done: feeStructuresCount > 0,
    },
    {
      key: 'staff',
      icon: <UserCheck size={18} />,
      iconBg: 'bg-violet-100',
      iconColor: 'text-violet-600',
      title: 'Add Staff',
      desc: 'Teachers / Drivers ko add karein',
      view: 'STAFF',
      done: staffCount > 0,
    },
    {
      key: 'students',
      icon: <Users size={18} />,
      iconBg: 'bg-orange-100',
      iconColor: 'text-orange-600',
      title: 'Add Students',
      desc: 'Naye students enroll karein (Admission)',
      view: 'ADMISSION',
      done: studentsCount > 0,
    },
  ], [hasActiveYear, sectionsCount, feeStructuresCount, staffCount, studentsCount]);

  const doneCount = steps.filter(s => s.done).length;
  const totalCount = steps.length;
  const allDone = doneCount === totalCount;

  // Once everything is done, hide the card entirely.
  if (allDone) return null;

  const handleToggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (storageKey) {
      try { localStorage.setItem(storageKey, String(next)); } catch { /* ignore */ }
    }
  };

  return (
    <div className="bg-gradient-to-br from-blue-50 via-white to-violet-50 border border-blue-100 rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-blue-50/50 transition-colors"
      >
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center shrink-0 shadow-sm">
          <Sparkles size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-black text-slate-900 leading-tight">
            School Setup
          </p>
          <p className="text-[11px] font-bold text-slate-500 mt-0.5">
            {doneCount} of {totalCount} steps done · Step by step setup karein
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-black text-blue-600 bg-blue-100 rounded-full px-2 py-0.5 tabular-nums">
            {doneCount}/{totalCount}
          </span>
          {collapsed
            ? <ChevronDown size={16} className="text-slate-400" />
            : <ChevronUp   size={16} className="text-slate-400" />}
        </div>
      </button>

      {/* Progress bar */}
      <div className="h-1 bg-slate-100">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all duration-300"
          style={{ width: `${(doneCount / totalCount) * 100}%` }}
        />
      </div>

      {/* Steps */}
      {!collapsed && (
        <div className="divide-y divide-slate-100">
          {steps.map((step, idx) => {
            // Sequential gating: a step is locked if any previous step is not
            // done. The first step (Academic Year) is never locked.
            const locked = idx > 0 && !steps[idx - 1].done;
            return (
              <button
                key={step.key}
                onClick={() => { if (!locked) onNavigate(step.view); }}
                disabled={locked}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                  locked ? 'opacity-50 cursor-not-allowed' : 'active:bg-slate-50'
                }`}
              >
                {/* Step number / done check / lock */}
                <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[11px] font-black tabular-nums">
                  {step.done ? (
                    <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center">
                      <CheckCircle2 size={16} className="text-white" />
                    </div>
                  ) : locked ? (
                    <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
                      <Lock size={12} />
                    </div>
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-blue-500 text-white flex items-center justify-center font-black">
                      {idx + 1}
                    </div>
                  )}
                </div>

                {/* Icon */}
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${step.iconBg} ${step.iconColor}`}>
                  {step.icon}
                </div>

                {/* Title + desc */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-[13px] font-black leading-tight ${
                      step.done ? 'text-slate-400 line-through' :
                      locked   ? 'text-slate-500' : 'text-slate-900'
                    }`}>
                      {step.title}
                    </p>
                    {idx === 0 && !step.done && (
                      <span className="text-[9px] font-black text-rose-700 bg-rose-100 rounded-full px-1.5 py-0.5 uppercase tracking-wide">
                        Required First
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] font-bold text-slate-500 mt-0.5 leading-tight truncate">
                    {locked ? `Pehle "${steps[idx - 1].title}" complete karein` : step.desc}
                  </p>
                </div>

                {/* CTA */}
                <div className="shrink-0 flex items-center gap-1">
                  <span className={`text-[10px] font-black uppercase tracking-wide ${
                    step.done ? 'text-emerald-600' :
                    locked   ? 'text-slate-400' : 'text-blue-600'
                  }`}>
                    {step.done ? 'Done' : locked ? 'Locked' : 'Configure'}
                  </span>
                  {!locked && (
                    <ChevronRight size={13} className={step.done ? 'text-emerald-400' : 'text-blue-400'} />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
