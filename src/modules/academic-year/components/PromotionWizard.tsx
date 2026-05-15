import React, { useMemo, useState, useEffect } from 'react';
import {
  ArrowLeft, ArrowRight, CheckCircle2,
  ChevronDown, ChevronUp, GraduationCap, AlertTriangle,
  Users, FileText, IndianRupee,
} from 'lucide-react';
import { useAcademicYear } from '@/shared/context/AcademicYearContext';
import { useUIStore } from '@/store/uiStore';
import { apiPromotion, apiAcademicYear } from '@/lib/apiClient';
import { feeService } from '@/modules/fees/fee.service';
import { studentService } from '@/modules/students/student.service';
import type { FeeStructureRecord } from '@/modules/fees/fees.types';
import { todayIST } from '@/shared/utils/date';

interface StudentPromotion {
  studentId: string;
  recordId: string;
  studentName: string;
  admissionNo: string;
  fromClass: string;
  fromSection: string;
  rollNo: string;
  toClass: string;
  toSection: string;
  decision: 'PROMOTE' | 'RETAIN' | 'TC';
  status: 'PENDING' | 'ALREADY_ASSIGNED';
  examPassed: boolean | null;
  hasExamData: boolean;
  tcDate: string;
  tcRemarks: string;
  feeStructureId: string;
}

interface Props {
  onBack: () => void;
}

const STREAMS = ['Science', 'Commerce', 'Arts', 'Maths'] as const;

const CLASS_OPTIONS = [
  'Nursery', 'LKG', 'UKG',
  'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
  'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10',
  '11th Science', '11th Commerce', '11th Arts', '11th Maths',
  '12th Science', '12th Commerce', '12th Arts', '12th Maths',
];

const isClass10 = (cls: string) => /^Class\s*10$/i.test(cls.trim());
const isClass11 = (cls: string) => /^11th/i.test(cls.trim());
const isClass12 = (cls: string) => /^12th/i.test(cls.trim());

const bumpClass = (cls: string): string => {
  if (cls === 'Nursery') return 'LKG';
  if (cls === 'LKG')     return 'UKG';
  if (cls === 'UKG')     return 'Class 1';
  const m = cls.match(/Class\s*(\d+)/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n === 10) return '11th Science';
    return `Class ${n + 1}`;
  }
  if (cls.startsWith('11th')) return cls.replace('11th', '12th');
  return cls;
};

type Step = 'SELECT_YEARS' | 'DECIDE' | 'DONE';

/**
 * Per-class bulk action strip. Picks a target class+section and applies
 * to every PENDING row in the focused source class. For Class 10 → 11,
 * stream chips replace the class dropdown so the principal can bulk-set
 * "All Sci → 11 Sci A" and then flip individual rows to other streams —
 * half-Science / half-Commerce becomes two taps + a few flips.
 */
const BulkStrip: React.FC<{
  focusClass: string;
  count: number;
  destSectionsByClass: Map<string, string[]>;
  feeStructures: FeeStructureRecord[];
  onPromoteAll: (toClass: string, toSection: string, feeStructureId: string) => void;
  onRetainAll: () => void;
  onTCAll: () => void;
}> = ({ focusClass, count, destSectionsByClass, feeStructures, onPromoteAll, onRetainAll, onTCAll }) => {
  const is10 = isClass10(focusClass);
  const is12 = isClass12(focusClass);
  const defaultTo = is12 ? '' : bumpClass(focusClass);
  const [bulkClass, setBulkClass] = useState(is10 ? '11th Science' : defaultTo);
  // Bulk section default = first available section in dest year for the
  // target class, else 'A'. Keeps the dropdown valid out-of-the-box.
  const sectionsForBulk = destSectionsByClass.get(bulkClass) ?? [];
  const [bulkSection, setBulkSection] = useState(sectionsForBulk[0] ?? 'A');
  const matchingFees = feeStructures.filter(
    fs => !bulkClass || fs.className === bulkClass || fs.className === 'ALL_CLASSES',
  );
  const [bulkFeeStructureId, setBulkFeeStructureId] = useState('');

  useEffect(() => {
    const cls = isClass10(focusClass) ? '11th Science'
      : (isClass12(focusClass) ? '' : bumpClass(focusClass));
    setBulkClass(cls);
    const secs = destSectionsByClass.get(cls) ?? [];
    setBulkSection(secs[0] ?? 'A');
  }, [focusClass, destSectionsByClass]);

  // When the bulk class is flipped (e.g. Sci → Com for Class 10), re-pick
  // a valid section for the new class AND drop the fee structure if it
  // no longer matches the new class.
  useEffect(() => {
    const secs = destSectionsByClass.get(bulkClass) ?? [];
    if (secs.length > 0 && !secs.includes(bulkSection)) setBulkSection(secs[0]);
    if (bulkFeeStructureId) {
      const fs = feeStructures.find(f => f.id === bulkFeeStructureId);
      if (fs && fs.className !== bulkClass && fs.className !== 'ALL_CLASSES') {
        setBulkFeeStructureId('');
      }
    }
  }, [bulkClass, destSectionsByClass, bulkSection, bulkFeeStructureId, feeStructures]);

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-3 space-y-2">
      <p className="text-[10px] font-black uppercase tracking-widest text-indigo-700">
        Bulk · {focusClass} ({count} pending)
      </p>
      {!is12 && (
        <div className="grid grid-cols-12 gap-1.5">
          {is10 ? (
            <div className="col-span-7 grid grid-cols-4 gap-1">
              {STREAMS.map(stream => {
                const target = `11th ${stream}`;
                const sel = bulkClass === target;
                return (
                  <button key={stream}
                    onClick={() => setBulkClass(target)}
                    className={`py-1.5 px-1 rounded-lg text-[10px] font-black uppercase border ${
                      sel ? 'bg-violet-600 text-white border-violet-600'
                      : 'bg-white border-slate-200 text-slate-600'
                    }`}>
                    {stream.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          ) : (
            <select value={bulkClass}
              onChange={e => setBulkClass(e.target.value)}
              className="col-span-7 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold bg-white">
              {CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {sectionsForBulk.length > 0 ? (
            <select value={bulkSection}
              onChange={e => setBulkSection(e.target.value)}
              className="col-span-2 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold bg-white">
              {sectionsForBulk.map(sec => <option key={sec} value={sec}>{sec}</option>)}
            </select>
          ) : (
            <input value={bulkSection}
              onChange={e => setBulkSection(e.target.value)}
              placeholder="Sec"
              className="col-span-2 border border-amber-300 rounded-lg px-2 py-1.5 text-xs font-bold bg-amber-50"
              title="Destination year me iss class ke liye koi section nahi mila — manual type karna padega" />
          )}
          <button
            onClick={() => onPromoteAll(bulkClass, bulkSection, bulkFeeStructureId)}
            disabled={!bulkClass || !bulkSection || !bulkFeeStructureId}
            className="col-span-3 py-1.5 px-2 bg-emerald-600 text-white text-[10px] font-black uppercase rounded-lg active:scale-95 disabled:opacity-50">
            All → Promote
          </button>
        </div>
      )}
      {!is12 && (
        <div>
          <select
            value={bulkFeeStructureId}
            onChange={e => setBulkFeeStructureId(e.target.value)}
            className={`w-full border rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none ${
              !bulkFeeStructureId
                ? 'border-rose-300 bg-rose-50'
                : 'border-slate-200 bg-white focus:border-indigo-400'
            }`}>
            <option value="">— Fee structure choose karein (zaroori) —</option>
            {matchingFees.map(fs => (
              <option key={fs.id} value={fs.id}>{fs.name} ({fs.className})</option>
            ))}
          </select>
          {matchingFees.length === 0 && (
            <p className="text-[9px] font-black text-amber-700 mt-1">
              Is class ke liye koi fee structure nahi mila — Settings → Fees me banayein
            </p>
          )}
        </div>
      )}
      <div className="flex gap-1.5">
        {!is12 && (
          <button onClick={onRetainAll}
            className="flex-1 py-1.5 bg-amber-100 text-amber-700 border border-amber-200 text-[10px] font-black uppercase rounded-lg active:scale-95">
            All → Retain
          </button>
        )}
        <button
          onClick={() => {
            // Bulk-TC is destructive — a stray tap would exit an entire
            // source class from the school. Confirm before applying.
            const msg = is12
              ? `Issue TC to all ${count} students of ${focusClass}? (Normal for graduating batch.)`
              : `Mark ALL ${count} students of ${focusClass} as TC?\n\nYeh students school se exit ho jayenge.`;
            if (window.confirm(msg)) onTCAll();
          }}
          className="flex-1 py-1.5 bg-blue-100 text-blue-700 border border-blue-200 text-[10px] font-black uppercase rounded-lg active:scale-95">
          {is12 ? 'All → Issue TC' : 'All → TC'}
        </button>
      </div>
    </div>
  );
};

/**
 * Per-row section picker. Reads the destination year's actual sections
 * for the chosen target class — prevents typing a section that doesn't
 * exist (which would FK-fail on server with an opaque error). Falls
 * back to a free-text input only if the destination year has no
 * sections defined for that class, with a visible warning tint.
 */
const SectionPicker: React.FC<{
  toClass: string;
  value: string;
  onChange: (v: string) => void;
  destSectionsByClass: Map<string, string[]>;
}> = ({ toClass, value, onChange, destSectionsByClass }) => {
  const sections = destSectionsByClass.get(toClass) ?? [];
  if (!toClass) {
    return (
      <input value={value}
        disabled
        placeholder="Sec"
        className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold bg-slate-100 text-slate-400" />
    );
  }
  if (sections.length === 0) {
    return (
      <input value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Sec"
        title="Destination year me is class ke liye koi section nahi mila — naya year setup karein"
        className="border border-amber-300 rounded-lg px-2 py-1.5 text-xs font-bold bg-amber-50 focus:outline-none focus:border-amber-500" />
    );
  }
  return (
    <select value={value}
      onChange={e => onChange(e.target.value)}
      className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold bg-white focus:outline-none focus:border-indigo-400">
      <option value="">Sec…</option>
      {sections.map(sec => <option key={sec} value={sec}>{sec}</option>)}
    </select>
  );
};

export const PromotionWizard: React.FC<Props> = ({ onBack }) => {
  const { academicYears } = useAcademicYear();
  const { showToast } = useUIStore();

  const [step, setStep]             = useState<Step>('SELECT_YEARS');
  const [fromYearId, setFromYearId] = useState('');
  const [toYearId,   setToYearId]   = useState('');
  const [loading, setLoading]       = useState(false);
  const [busy, setBusy]             = useState(false);
  const [students, setStudents]     = useState<StudentPromotion[]>([]);
  const [hasAnyExamData, setHasAnyExamData] = useState(false);
  const [feeStructures, setFeeStructures] = useState<FeeStructureRecord[]>([]);
  // Set of studentIds with outstanding fees in the FROM year — these get
  // a red tint in the list so the principal sees collection-pending cases
  // before promoting them out. Loaded once when preview returns.
  const [unpaidIds, setUnpaidIds] = useState<Set<string>>(new Set());
  const [unpaidLoading, setUnpaidLoading] = useState(false);
  // Accordion-per-source-class. Each source class is a collapsible card;
  // principal expands one (or several) to work on them, taps the header
  // again to collapse. Multi-open allowed so two classes can be compared
  // when shuffling sections across them.
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());
  const toggleClassExpanded = (cls: string) => {
    setExpandedClasses(prev => {
      const next = new Set(prev);
      if (next.has(cls)) next.delete(cls); else next.add(cls);
      return next;
    });
  };

  // Sections that exist in the DESTINATION year. Drives the per-row
  // section dropdown so a principal can't type a section name that
  // doesn't exist in the next year's structure (which would fail on
  // server with an opaque FK error). Map: class_name → section[].
  const [destSectionsByClass, setDestSectionsByClass] = useState<Map<string, string[]>>(new Map());

  useEffect(() => {
    if (!toYearId) { setDestSectionsByClass(new Map()); return; }
    let cancelled = false;
    apiAcademicYear.getSections(toYearId)
      .then(rows => {
        if (cancelled) return;
        const map = new Map<string, string[]>();
        for (const r of (rows ?? []) as { class_name: string; section: string }[]) {
          const list = map.get(r.class_name) ?? [];
          if (r.section && !list.includes(r.section)) list.push(r.section);
          map.set(r.class_name, list);
        }
        // Sort sections alphabetically for stable ordering.
        for (const [k, v] of map.entries()) {
          map.set(k, [...v].sort());
        }
        setDestSectionsByClass(map);
      })
      .catch(() => setDestSectionsByClass(new Map()));
    return () => { cancelled = true; };
  }, [toYearId]);
  // Final confirmation gate before commit. Principal must type the
  // destination year's label (e.g. "2026-2027") — defends against the
  // "wrong toYear picked" foot-gun that would silently bulk-promote 500
  // students into the wrong year. Modal opens on Confirm tap, executes
  // only when typed text matches toYear.name exactly.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  useEffect(() => {
    feeService.getFeeStructures().then(setFeeStructures).catch(() => {});
  }, []);
  const [result, setResult]         = useState<{
    promoted: number; retained: number; tcIssued: number; skipped: number;
  } | null>(null);

  // IST today — earlier the UTC version put TC date defaults
  // a day in the past during early-morning IST hours, surprising
  // principals who thought they were issuing TC for "today".
  const today = todayIST();

  const fromYear = academicYears.find(y => y.id === fromYearId);
  const toYear   = academicYears.find(y => y.id === toYearId);

  // Direction guard. Promotion only flows forward in time: the
  // destination year must start AFTER the source year. Promoting a
  // 2024-25 student into 2023-24 would silently overwrite the past
  // year's records via the upsert in promote_students. Filter the
  // toYear dropdown so the foot-gun isn't even reachable.
  const eligibleToYears = useMemo(() => {
    if (!fromYear) return academicYears.filter(y => y.id !== fromYearId);
    return academicYears.filter(y =>
      y.id !== fromYearId
      && y.startDate > fromYear.startDate
    );
  }, [academicYears, fromYear, fromYearId]);

  // If the source year changes and the previously picked destination
  // is no longer eligible (e.g. user picked toYear first, then changed
  // fromYear to a later year), drop the stale selection.
  useEffect(() => {
    if (!toYearId) return;
    if (!eligibleToYears.find(y => y.id === toYearId)) setToYearId('');
  }, [eligibleToYears, toYearId]);

  const loadPreview = async () => {
    if (!fromYearId || !toYearId) return;
    setLoading(true);
    setStudents([]);
    try {
      const data = await apiPromotion.preview(fromYearId, toYearId);
      setHasAnyExamData(!!(data as any).hasAnyExamData);
      const list: StudentPromotion[] = ((data as any).preview ?? []).map((p: any) => {
        const fc: string = p.fromClass ?? '';
        const is12 = isClass12(fc);
        // Default-safe decision: when exam data exists and the student
        // failed, default to RETAIN so a principal who never clicks
        // "Promote All Passed" can't accidentally graduate a failed
        // student. Server's suggestedDecision wins when present.
        const safeDefault: StudentPromotion['decision'] =
          (p.hasExamData && p.examPassed === false)
            ? 'RETAIN'
            : (is12 ? 'TC' : 'PROMOTE');
        const suggested: StudentPromotion['decision'] = p.suggestedDecision ?? safeDefault;
        return {
          studentId:   p.studentId,
          recordId:    p.recordId ?? '',
          studentName: p.studentName ?? 'Unknown',
          admissionNo: p.admissionNo ?? '',
          fromClass:   fc,
          fromSection: p.fromSection ?? '',
          rollNo:      p.rollNo ?? '',
          toClass:     is12 ? '' : bumpClass(fc),
          toSection:   is12 ? '' : (p.fromSection ?? ''),
          decision:    p.status === 'ALREADY_ASSIGNED' ? 'PROMOTE' : suggested,
          status:      p.status,
          examPassed:  p.examPassed ?? null,
          hasExamData: p.hasExamData ?? false,
          tcDate:          today,
          tcRemarks:       '',
          feeStructureId:  '',
        };
      });
      setStudents(list);
      setStep('DECIDE');
      // Auto-expand the first source class so the principal lands on a
      // ready-to-work view instead of a stack of collapsed headers.
      const classes = Array.from(new Set(list.map(s => s.fromClass))).sort(
        (a, b) => CLASS_OPTIONS.indexOf(a) - CLASS_OPTIONS.indexOf(b),
      );
      setExpandedClasses(classes[0] ? new Set([classes[0]]) : new Set());
      // Fire-and-forget unpaid lookup. Failure → no red tint; the rest
      // of the wizard still works.
      const ids = list.map(s => s.studentId);
      setUnpaidLoading(true);
      studentService.unpaidStudentsInYear(ids, fromYearId)
        .then(setUnpaidIds)
        .catch(() => setUnpaidIds(new Set()))
        .finally(() => setUnpaidLoading(false));
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Preview failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const patch = (id: string, changes: Partial<StudentPromotion>) =>
    setStudents(prev => prev.map(x => x.studentId === id ? { ...x, ...changes } : x));

  // "Promote All Passed" — only for students with exam data who passed
  const promoteAllPassed = () => {
    setStudents(prev => prev.map(x => {
      if (x.status !== 'PENDING' || isClass12(x.fromClass)) return x;
      if (x.hasExamData && x.examPassed === true)  return { ...x, decision: 'PROMOTE' };
      if (x.hasExamData && x.examPassed === false) return { ...x, decision: 'RETAIN' };
      return x;
    }));
    showToast('Exam results ke hisab se decisions set ho gaye');
  };

  const executePromotion = async () => {
    // Lock the button BEFORE any awaits — a fast double-click would otherwise
    // dispatch two execute calls before busy gates the second.
    if (busy) return;
    setBusy(true);

    try {
      const pending = students.filter(s => s.status === 'PENDING');
      if (pending.length === 0) {
        showToast('No pending students', 'error');
        return;
      }

      // Validate: PROMOTE without toClass — apply to ALL classes (previous
      // Class-10 exemption let students get promoted with empty class/section
      // and produced NULL-class enrolment rows downstream).
      const missingClass = pending.filter(
        s => s.decision === 'PROMOTE' && !isClass12(s.fromClass) && !s.toClass.trim(),
      );
      if (missingClass.length > 0) {
        showToast(`${missingClass.length} students are missing "To Class"`, 'error');
        return;
      }
      // Validate: PROMOTE without fee structure — earlier "Auto-generate
      // later" was allowed but in practice nobody ever came back to set
      // it, so students landed in the new year with zero installments
      // and parents got a ₹0 ledger. Now it's mandatory at promote-time.
      const missingFee = pending.filter(
        s => s.decision === 'PROMOTE' && !isClass12(s.fromClass) && !s.feeStructureId,
      );
      if (missingFee.length > 0) {
        showToast(`${missingFee.length} students don't have a fee structure selected`, 'error');
        return;
      }
      // Validate: TC without date
      const missingDate = pending.filter(s => s.decision === 'TC' && !s.tcDate);
      if (missingDate.length > 0) {
        showToast(`${missingDate.length} students ki TC date missing hai`, 'error');
        return;
      }

      // Validate: NO duplicate roll-no within the SAME (toClass, toSection).
      // The DB has a partial unique index on (academic_year_id, section_id,
      // roll_no), so the server would reject a duplicate anyway — but the
      // failure surfaces as an opaque "duplicate key" string and only the
      // FIRST conflict gets reported, leaving the principal hunting through
      // 30 cards. Client-side catch lists ALL collisions upfront.
      const rollByGroup = new Map<string, Map<string, string[]>>();
      for (const s of pending) {
        if (s.decision !== 'PROMOTE') continue;
        const roll = (s.rollNo ?? '').trim();
        if (!roll) continue; // empty roll is allowed (NULL → ignored by index)
        const groupKey = `${s.toClass}|${s.toSection || ''}`;
        const inner = rollByGroup.get(groupKey) ?? new Map<string, string[]>();
        const arr = inner.get(roll) ?? [];
        arr.push(s.studentName);
        inner.set(roll, arr);
        rollByGroup.set(groupKey, inner);
      }
      const dupes: string[] = [];
      for (const [groupKey, rolls] of rollByGroup.entries()) {
        for (const [roll, names] of rolls.entries()) {
          if (names.length > 1) {
            const [cls, sec] = groupKey.split('|');
            const where = sec ? `${cls}-${sec}` : cls;
            dupes.push(`Roll #${roll} in ${where}: ${names.join(', ')}`);
          }
        }
      }
      if (dupes.length > 0) {
        showToast(
          `Duplicate roll numbers — fix before promoting:\n${dupes.slice(0, 3).join(' | ')}${dupes.length > 3 ? ` | …+${dupes.length - 3} more` : ''}`,
          'error',
        );
        return;
      }

      // Re-fetch the preview to detect cross-tab / parallel-promotion races.
      // If another principal already promoted some of these rows, the server
      // will now return them as ALREADY_ASSIGNED — abort so the user can re-decide.
      const fresh = await apiPromotion.preview(fromYearId, toYearId);
      const freshById = new Map<string, string>(
        ((fresh as any).preview ?? []).map((p: any) => [p.studentId, p.status]),
      );
      const conflicted = pending.filter(p => freshById.get(p.studentId) === 'ALREADY_ASSIGNED');
      if (conflicted.length > 0) {
        showToast(
          `${conflicted.length} students were promoted in another session. Reload preview & retry.`,
          'error',
        );
        return;
      }

      const res = await apiPromotion.execute({
        fromYearId,
        toYearId,
        promotions: pending.map(s => ({
          studentId:  s.studentId,
          recordId:   s.recordId,
          decision:   s.decision,
          toClassName:    s.decision === 'PROMOTE' ? s.toClass : undefined,
          toSection:      s.decision === 'PROMOTE' ? s.toSection : undefined,
          rollNo:         s.rollNo || undefined,
          tcDate:         s.decision === 'TC' ? s.tcDate : undefined,
          tcRemarks:      s.decision === 'TC' ? s.tcRemarks : undefined,
          feeStructureId: s.decision === 'PROMOTE' && s.feeStructureId ? s.feeStructureId : undefined,
        })),
      });
      setResult({
        promoted: (res as any).promoted ?? 0,
        retained: (res as any).retained ?? 0,
        tcIssued: (res as any).tcIssued ?? 0,
        skipped:  (res as any).skipped  ?? 0,
      });
      setStep('DONE');
      showToast(`Promotion complete — ${(res as any).promoted ?? 0} promoted, ${(res as any).retained ?? 0} retained, ${(res as any).tcIssued ?? 0} TC issued`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Promotion failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const counts = useMemo(() => ({
    promote: students.filter(s => s.decision === 'PROMOTE' && s.status === 'PENDING').length,
    retain:  students.filter(s => s.decision === 'RETAIN'  && s.status === 'PENDING').length,
    tc:      students.filter(s => s.decision === 'TC'      && s.status === 'PENDING').length,
    done:    students.filter(s => s.status === 'ALREADY_ASSIGNED').length,
  }), [students]);

  // Set of studentIds whose roll number collides with another row in the
  // same target (toClass, toSection). Surfaced as a red badge in the row
  // header so the principal sees the conflict before tapping Confirm.
  const duplicateRollIds = useMemo(() => {
    const dupSet = new Set<string>();
    const rollByGroup = new Map<string, Map<string, string[]>>();
    for (const s of students) {
      if (s.status !== 'PENDING' || s.decision !== 'PROMOTE') continue;
      const roll = (s.rollNo ?? '').trim();
      if (!roll) continue;
      const groupKey = `${s.toClass}|${s.toSection || ''}`;
      const inner = rollByGroup.get(groupKey) ?? new Map<string, string[]>();
      const arr = inner.get(roll) ?? [];
      arr.push(s.studentId);
      inner.set(roll, arr);
      rollByGroup.set(groupKey, inner);
    }
    for (const inner of rollByGroup.values()) {
      for (const ids of inner.values()) {
        if (ids.length > 1) ids.forEach(id => dupSet.add(id));
      }
    }
    return dupSet;
  }, [students]);

  const decisionColor = (d: string) =>
    d === 'PROMOTE' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
    d === 'RETAIN'  ? 'bg-amber-100  text-amber-700  border-amber-200'  :
                      'bg-blue-100   text-blue-700   border-blue-200';

  // Distinct source classes in the preview, in academic order. Drives the
  // pill bar at the top of STEP 2.
  const sourceClasses = useMemo<string[]>(() => {
    const set = new Set<string>(students.map(s => s.fromClass || 'Unknown'));
    return Array.from(set).sort((a, b) => {
      const order = CLASS_OPTIONS.indexOf(a) - CLASS_OPTIONS.indexOf(b);
      return order !== 0 ? order : a.localeCompare(b);
    });
  }, [students]);

  // Students grouped by source class, each list sorted by section + roll
  // for stable scanning order. One memo instead of per-card re-filters.
  const studentsByClass = useMemo(() => {
    const map = new Map<string, StudentPromotion[]>();
    for (const s of students) {
      const k = s.fromClass || 'Unknown';
      const list = map.get(k) ?? [];
      list.push(s);
      map.set(k, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        const sec = (a.fromSection || '').localeCompare(b.fromSection || '');
        if (sec !== 0) return sec;
        const aR = parseInt(a.rollNo, 10), bR = parseInt(b.rollNo, 10);
        if (Number.isFinite(aR) && Number.isFinite(bR)) return aR - bR;
        return (a.studentName || '').localeCompare(b.studentName || '');
      });
    }
    return map;
  }, [students]);

  // Per-source-class summary for the pill bar.
  const classSummary = useMemo(() => {
    const m = new Map<string, { total: number; unpaid: number }>();
    for (const s of students) {
      const k = s.fromClass || 'Unknown';
      const e = m.get(k) ?? { total: 0, unpaid: 0 };
      e.total += 1;
      if (unpaidIds.has(s.studentId)) e.unpaid += 1;
      m.set(k, e);
    }
    return m;
  }, [students, unpaidIds]);

  // Whenever the destination sections load OR a student's toClass
  // changes to a class whose dest sections are known, drop any
  // `toSection` value that no longer exists in the destination. Keeps
  // the underlying state in sync with the dropdown's actual options,
  // so a submit never sends "Section A" when A doesn't exist in the
  // destination year's class config.
  useEffect(() => {
    if (destSectionsByClass.size === 0) return;
    setStudents(prev => {
      let mutated = false;
      const next = prev.map(s => {
        if (!s.toClass || !s.toSection) return s;
        const valid = destSectionsByClass.get(s.toClass);
        if (!valid) return s; // no info → keep what the user typed
        if (valid.length === 0) return s; // free-text fallback in effect
        if (!valid.includes(s.toSection)) {
          mutated = true;
          return { ...s, toSection: '' };
        }
        return s;
      });
      return mutated ? next : prev;
    });
  }, [destSectionsByClass]);

  // Bulk: set decision+target for every PENDING student of the given
  // source class. Half-A / half-B split = two taps + a few row flips
  // instead of 32 dropdown twiddles.
  const bulkSetForClass = (cls: string, changes: Partial<StudentPromotion>) => {
    setStudents(prev => prev.map(s => {
      if ((s.fromClass || 'Unknown') !== cls) return s;
      if (s.status !== 'PENDING') return s;
      if (isClass12(s.fromClass) && changes.decision === 'PROMOTE') return s;
      return { ...s, ...changes };
    }));
  };

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300 min-h-screen">

      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 sticky top-0 z-10 shadow-sm flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Promotion Wizard</h2>
          <p className="text-[10px] font-bold text-slate-400">Students ko next year mein promote karein</p>
        </div>
        {step === 'DECIDE' && (
          <div className="text-right">
            <div className="text-xs font-black text-slate-900">{students.length}</div>
            <div className="text-[9px] font-bold text-slate-400 uppercase">Students</div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-32">

        {/* ── STEP 1: Select Years ── */}
        {step === 'SELECT_YEARS' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Step 1 · Years chunein</p>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1.5">
                  From Year (Source)
                </label>
                <select value={fromYearId} onChange={e => setFromYearId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 font-bold text-sm text-slate-800 focus:outline-none focus:border-indigo-400 bg-white">
                  <option value="">Source year chunein…</option>
                  {academicYears.map(y => (
                    <option key={y.id} value={y.id}>
                      {y.name} {y.status === 'LOCKED' ? '🔒' : y.isActive ? '✅' : ''}
                    </option>
                  ))}
                </select>
                {fromYearId && !academicYears.find(y => y.id === fromYearId && y.status === 'LOCKED') && (
                  <p className="text-[9px] font-bold text-amber-600 mt-1">
                    ⚠️ Yeh year close nahi hai — ideally closed year se promote karein
                  </p>
                )}
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1.5">
                  To Year (Destination)
                </label>
                <select value={toYearId} onChange={e => setToYearId(e.target.value)}
                  disabled={!fromYearId}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 font-bold text-sm text-slate-800 focus:outline-none focus:border-indigo-400 bg-white disabled:opacity-50">
                  <option value="">
                    {!fromYearId ? 'Pehle source year chunein…' : 'Destination year chunein…'}
                  </option>
                  {eligibleToYears.map(y => (
                    <option key={y.id} value={y.id}>{y.name}</option>
                  ))}
                </select>
                {fromYearId && eligibleToYears.length === 0 && (
                  <p className="text-[10px] font-bold text-amber-600 mt-1 leading-snug">
                    Is source year ke aage koi academic year created nahi hai —
                    pehle Settings → Academic Years me naya year banayein.
                    Promotion sirf aage ke year me ho sakta hai, peeche nahi.
                  </p>
                )}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-[10px] font-bold text-blue-800 space-y-1">
                <p className="font-black">Kaise kaam karta hai:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>PROMOTE — student next class mein move hoga</li>
                  <li>RETAIN — student same class mein rahega (fail/back)</li>
                  <li>TC — Transfer Certificate; school se exit (12th ke liye)</li>
                  <li>Class 10 → 11th ke liye stream chunna hoga</li>
                  <li>Agar final exam results hain, auto-suggest milegi</li>
                </ul>
              </div>
            </div>

            <button
              onClick={loadPreview}
              disabled={!fromYearId || !toYearId || loading}
              className="w-full py-4 bg-indigo-600 text-white font-black text-sm uppercase rounded-2xl active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-2">
              {loading
                ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Loading…</>
                : <><ArrowRight size={16} /> Students ka Preview Dekho</>
              }
            </button>
          </div>
        )}

        {/* ── STEP 2: Per-student decisions ── */}
        {step === 'DECIDE' && (
          <>
            {/* Summary banner */}
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-4 text-white">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-3">
                {fromYear?.name} → {toYear?.name}
              </p>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <div className="text-lg font-black text-emerald-400">{counts.promote}</div>
                  <div className="text-[8px] font-bold text-white/40 uppercase">Promote</div>
                </div>
                <div>
                  <div className="text-lg font-black text-amber-400">{counts.retain}</div>
                  <div className="text-[8px] font-bold text-white/40 uppercase">Retain</div>
                </div>
                <div>
                  <div className="text-lg font-black text-blue-400">{counts.tc}</div>
                  <div className="text-[8px] font-bold text-white/40 uppercase">TC</div>
                </div>
                <div>
                  <div className="text-lg font-black text-slate-400">{counts.done}</div>
                  <div className="text-[8px] font-bold text-white/40 uppercase">Done</div>
                </div>
              </div>
            </div>

            {/* Unpaid lookup hint. Until this resolves, the red ⚠ Unpaid
                pills on rows haven't appeared yet — show a small chip so
                the principal doesn't promote unpaid kids in the gap. */}
            {unpaidLoading && (
              <div className="bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 flex items-center gap-2">
                <div className="w-3 h-3 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                <p className="text-[10px] font-bold text-slate-600">
                  Fees paid status check ho raha hai — unpaid markers thoda baad dikhenge
                </p>
              </div>
            )}

            {/* Soft pagination warning. The preview endpoint has no
                explicit page param and Supabase caps PostgREST responses
                at 1000 rows by default — schools with >1000 STUDYING
                students would silently lose the tail. */}
            {students.length >= 1000 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-start gap-2">
                <AlertTriangle size={12} className="text-amber-600 mt-0.5 shrink-0" />
                <p className="text-[10px] font-bold text-amber-700 leading-snug">
                  {students.length} students load hue — agar isse zyada hain to baaki kat sakte hain.
                  Class-wise alag promote karke verify karein.
                </p>
              </div>
            )}

            {/* Exam data notice */}
            {hasAnyExamData && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex items-start gap-2">
                <FileText size={14} className="text-indigo-600 mt-0.5 shrink-0" />
                <p className="text-[10px] font-bold text-indigo-800">
                  Final exam results mil gaye — green = pass, orange = fail. Ye suggestions hain, aap override kar sakte hain.
                </p>
              </div>
            )}

            {/* Global quick-select — applies across all source classes */}
            <div className="flex gap-2 flex-wrap">
              {hasAnyExamData && (
                <button
                  onClick={promoteAllPassed}
                  className="flex-1 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 font-black text-[10px] uppercase rounded-xl active:scale-95 flex items-center justify-center gap-1.5">
                  <Users size={11} /> Promote All Passed (Exam Results)
                </button>
              )}
            </div>

            {/* Accordion of source classes. Each card has a header with
                class summary; tap header to expand/collapse. Multi-open
                allowed so two classes can be open side-by-side. */}
            <div className="space-y-3">
            {sourceClasses.map(cls => {
              const sum = classSummary.get(cls) ?? { total: 0, unpaid: 0 };
              const isOpen = expandedClasses.has(cls);
              const classStudents = studentsByClass.get(cls) ?? [];
              const pendingCount = classStudents.filter(s => s.status === 'PENDING').length;
              return (
                <div key={cls} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  {/* Header — always visible, click to toggle */}
                  <button
                    onClick={() => toggleClassExpanded(cls)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                      isOpen ? 'bg-indigo-50' : 'bg-white active:bg-slate-50'
                    }`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${
                      isOpen ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {cls.replace(/^Class\s*/i, '').slice(0, 3)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-slate-900 text-sm">{cls}</span>
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          {sum.total} students
                        </span>
                        {sum.unpaid > 0 && (
                          <span className="text-[10px] font-black text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">
                            ⚠ {sum.unpaid} unpaid
                          </span>
                        )}
                        {pendingCount > 0 && pendingCount < sum.total && (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                            {sum.total - pendingCount} done
                          </span>
                        )}
                      </div>
                    </div>
                    {isOpen
                      ? <ChevronUp size={18} className="text-indigo-600 shrink-0" />
                      : <ChevronDown size={18} className="text-slate-400 shrink-0" />
                    }
                  </button>

                  {/* Expanded body — bulk strip + student rows */}
                  {isOpen && (
                  <div className="border-t border-slate-100 p-3 space-y-3 bg-slate-50/40">
                    <BulkStrip
                      focusClass={cls}
                      count={pendingCount}
                      destSectionsByClass={destSectionsByClass}
                      feeStructures={feeStructures}
                      onPromoteAll={(toClass, toSection, feeStructureId) =>
                        bulkSetForClass(cls, { decision: 'PROMOTE', toClass, toSection, feeStructureId })}
                      onRetainAll={() => bulkSetForClass(cls, { decision: 'RETAIN' })}
                      onTCAll={() => bulkSetForClass(cls, { decision: 'TC' })}
                    />
                    <div className="space-y-2">
              {classStudents.map(s => {
                const isDone = s.status === 'ALREADY_ASSIGNED';
                const is10   = isClass10(s.fromClass);
                const is11   = isClass11(s.fromClass);
                const is12   = isClass12(s.fromClass);
                const unpaid = unpaidIds.has(s.studentId);
                const dupRoll = duplicateRollIds.has(s.studentId);

                return (
                  <div key={s.studentId}
                    className={`rounded-2xl border shadow-sm overflow-hidden ${
                      isDone ? 'bg-slate-50 border-slate-100 opacity-60'
                      : unpaid ? 'bg-rose-50/50 border-rose-200'
                      : 'bg-white border-slate-100'
                    }`}>

                    {/* Row 1: identity */}
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-[10px] shrink-0 ${
                        s.hasExamData && s.examPassed === true  ? 'bg-emerald-100 text-emerald-700' :
                        s.hasExamData && s.examPassed === false ? 'bg-amber-100 text-amber-700' :
                        'bg-indigo-100 text-indigo-700'
                      }`}>
                        {s.studentName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="font-black text-slate-900 text-sm truncate flex-1">{s.studentName}</div>
                          {s.fromSection && (
                            <span className="text-[9px] font-black text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              {s.fromSection}·#{s.rollNo || '—'}
                            </span>
                          )}
                          {s.hasExamData && (
                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase ${
                              s.examPassed ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                            }`}>{s.examPassed ? 'Pass' : 'Fail'}</span>
                          )}
                          {unpaid && (
                            <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 uppercase">
                              ⚠ Unpaid
                            </span>
                          )}
                        </div>
                      </div>
                      {isDone && (
                        <span className="text-[9px] font-black text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full uppercase">Done</span>
                      )}
                    </div>

                    {/* Row 2: decision + target (always visible) */}
                    {!isDone && (
                      <div className="px-3 pb-3 space-y-2">
                        {/* Decision pills */}
                        <div className="flex gap-1.5">
                          {(is12 ? (['TC'] as const) : (['PROMOTE', 'RETAIN', 'TC'] as const)).map(d => (
                            <button key={d}
                              onClick={() => patch(s.studentId, { decision: d })}
                              className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase border transition-colors ${
                                s.decision === d ? decisionColor(d) : 'bg-white border-slate-200 text-slate-500'
                              }`}>
                              {d === 'PROMOTE' ? '⬆ Promote' : d === 'RETAIN' ? '↩ Retain' : '📋 TC'}
                            </button>
                          ))}
                        </div>

                        {/* Target picker — inline when PROMOTE */}
                        {s.decision === 'PROMOTE' && !is12 && (
                          is10 ? (
                            // Stream chips for Class 10 → 11.
                            // Half-Science / half-Commerce: tap each row's
                            // stream chip individually. Bulk strip above
                            // can pre-fill "all Sci" then user flips a few
                            // to Com.
                            <div className="space-y-1.5">
                              <div className="grid grid-cols-4 gap-1">
                                {STREAMS.map(stream => {
                                  const target = `11th ${stream}`;
                                  const selected = s.toClass === target;
                                  return (
                                    <button key={stream}
                                      onClick={() => {
                                        const secs = destSectionsByClass.get(target) ?? [];
                                        const keep = s.toSection && secs.includes(s.toSection);
                                        patch(s.studentId, { toClass: target, toSection: keep ? s.toSection : (secs[0] ?? '') });
                                      }}
                                      className={`py-1.5 px-1 rounded-lg text-[10px] font-black uppercase border transition-colors ${
                                        selected
                                          ? 'bg-violet-600 text-white border-violet-600'
                                          : 'bg-white border-slate-200 text-slate-600'
                                      }`}>
                                      {stream.slice(0, 3)}
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="grid grid-cols-2 gap-1.5">
                                <SectionPicker
                                  toClass={s.toClass}
                                  value={s.toSection}
                                  onChange={v => patch(s.studentId, { toSection: v })}
                                  destSectionsByClass={destSectionsByClass}
                                />
                                <input value={s.rollNo}
                                  onChange={e => patch(s.studentId, { rollNo: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                                  inputMode="numeric"
                                  placeholder="Roll"
                                  className={`border rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none ${
                                    dupRoll ? 'border-rose-400 bg-rose-50' : 'border-slate-200 focus:border-indigo-400'
                                  }`} />
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-3 gap-1.5">
                              <select value={s.toClass}
                                onChange={e => {
                                  const next = e.target.value;
                                  const secs = destSectionsByClass.get(next) ?? [];
                                  const keep = s.toSection && secs.includes(s.toSection);
                                  patch(s.studentId, { toClass: next, toSection: keep ? s.toSection : (secs[0] ?? '') });
                                }}
                                className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold bg-white focus:outline-none focus:border-indigo-400">
                                <option value="">Class…</option>
                                {(is11 ? CLASS_OPTIONS.filter(c => c.startsWith('12th')) : CLASS_OPTIONS).map(c => (
                                  <option key={c} value={c}>{c}</option>
                                ))}
                              </select>
                              <SectionPicker
                                toClass={s.toClass}
                                value={s.toSection}
                                onChange={v => patch(s.studentId, { toSection: v })}
                                destSectionsByClass={destSectionsByClass}
                              />
                              <input value={s.rollNo}
                                onChange={e => patch(s.studentId, { rollNo: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                                inputMode="numeric"
                                placeholder="Roll"
                                className={`border rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none ${
                                  dupRoll ? 'border-rose-400 bg-rose-50' : 'border-slate-200 focus:border-indigo-400'
                                }`} />
                            </div>
                          )
                        )}
                        {dupRoll && (
                          <p className="text-[9px] font-black text-rose-600">
                            ⚠ Roll #{s.rollNo} duplicate in {s.toClass}{s.toSection ? `-${s.toSection}` : ''}
                          </p>
                        )}

                        {/* Fee structure — mandatory for PROMOTE.
                            Always inline (used to be in the expand-only
                            panel which most principals never opened, so
                            students landed in the new year with no fee
                            schedule). Red-tint when unset to draw the
                            eye before Confirm. */}
                        {s.decision === 'PROMOTE' && !is12 && feeStructures.length > 0 && (() => {
                          const matching = feeStructures.filter(
                            fs => !s.toClass || fs.className === s.toClass || fs.className === 'ALL_CLASSES',
                          );
                          const unset = !s.feeStructureId;
                          return (
                            <div>
                              <label className={`text-[9px] font-black uppercase flex items-center gap-1 mb-1 ${
                                unset ? 'text-rose-600' : 'text-slate-400'
                              }`}>
                                <IndianRupee size={9} /> Fee Structure *
                              </label>
                              <select value={s.feeStructureId}
                                onChange={e => patch(s.studentId, { feeStructureId: e.target.value })}
                                className={`w-full border rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none ${
                                  unset
                                    ? 'border-rose-300 bg-rose-50 focus:border-rose-500'
                                    : 'border-slate-200 bg-white focus:border-indigo-400'
                                }`}>
                                <option value="">— Choose fee structure —</option>
                                {matching.map(fs => (
                                  <option key={fs.id} value={fs.id}>{fs.name} ({fs.className})</option>
                                ))}
                              </select>
                              {unset && (
                                <p className="text-[9px] font-black text-rose-600 mt-0.5">
                                  Fee structure choose karna zaroori hai
                                </p>
                              )}
                            </div>
                          );
                        })()}

                        {/* TC date + remarks — only when relevant */}
                        {(s.decision === 'TC' || is12) && (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 space-y-1.5">
                            <input type="date" value={s.tcDate}
                              onChange={e => patch(s.studentId, { tcDate: e.target.value })}
                              className="w-full border border-slate-200 rounded px-2 py-1 text-xs font-bold bg-white" />
                            <input type="text" value={s.tcRemarks}
                              onChange={e => patch(s.studentId, { tcRemarks: e.target.value })}
                              placeholder="TC remarks (optional)"
                              className="w-full border border-slate-200 rounded px-2 py-1 text-xs font-bold bg-white" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {classStudents.length === 0 && (
                <div className="text-center py-6 text-slate-400 text-xs font-bold">
                  Is class me koi student nahi
                </div>
              )}
                    </div>
                  </div>
                  )}
                </div>
              );
            })}
            </div>

            {/* Validation warning. Lists the specific source classes
                that still have students without a target — clicking
                expands that class so the principal lands on the rows
                that need fixing. */}
            {(() => {
              const missing = students.filter(s =>
                s.status === 'PENDING' && s.decision === 'PROMOTE'
                && !isClass12(s.fromClass) && !s.toClass.trim()
              );
              if (missing.length === 0) return null;
              const classesWithMissing = Array.from(new Set(missing.map(m => m.fromClass)));
              return (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start gap-2">
                  <AlertTriangle size={14} className="text-rose-600 mt-0.5 shrink-0" />
                  <div className="text-[10px] font-bold text-rose-700 leading-snug">
                    {missing.length} students ka "To Class" missing —{' '}
                    {classesWithMissing.map((c, i) => (
                      <button key={c}
                        onClick={() => setExpandedClasses(prev => new Set(prev).add(c))}
                        className="underline text-rose-800 font-black mx-0.5">
                        {c}{i < classesWithMissing.length - 1 ? ',' : ''}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {/* ── DONE ── */}
        {step === 'DONE' && result && (
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center space-y-3">
              <CheckCircle2 size={44} className="text-emerald-500 mx-auto" />
              <div className="font-black text-slate-900 text-xl">Promotion Complete!</div>
              <div className="grid grid-cols-3 gap-3 mt-2">
                <div className="bg-white rounded-xl p-3 border border-emerald-200">
                  <div className="text-lg font-black text-emerald-600">{result.promoted}</div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase">Promoted</div>
                </div>
                <div className="bg-white rounded-xl p-3 border border-amber-200">
                  <div className="text-lg font-black text-amber-600">{result.retained}</div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase">Retained</div>
                </div>
                <div className="bg-white rounded-xl p-3 border border-blue-200">
                  <div className="text-lg font-black text-blue-600">{result.tcIssued}</div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase">TC Issued</div>
                </div>
              </div>
              {result.skipped > 0 && (
                <div className="text-[11px] font-bold text-slate-400">{result.skipped} already assigned (skipped)</div>
              )}
            </div>
            <button onClick={onBack}
              className="w-full py-4 bg-slate-900 text-white font-black text-sm uppercase rounded-2xl active:scale-95">
              Done — Wapas Jao
            </button>
          </div>
        )}
      </div>

      {/* ── Bottom bar (DECIDE step) ── */}
      {step === 'DECIDE' && (
        <div className="fixed bottom-0 left-0 right-0 lg:sticky lg:left-auto lg:right-auto lg:bottom-0 p-4 lg:p-6 bg-white border-t border-slate-100 flex gap-2 z-30 lg:rounded-t-2xl lg:shadow-lg">
          <button onClick={() => setStep('SELECT_YEARS')}
            className="flex-shrink-0 px-4 py-3 bg-slate-100 text-slate-700 font-black text-xs uppercase rounded-xl active:scale-95">
            Back
          </button>
          <button
            onClick={() => { setConfirmText(''); setConfirmOpen(true); }}
            disabled={busy || (counts.promote + counts.retain + counts.tc === 0)}
            className="flex-1 py-3 bg-emerald-600 text-white font-black text-sm uppercase rounded-xl active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-2">
            {busy
              ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Processing…</>
              : <><GraduationCap size={16} /> Confirm ({counts.promote + counts.retain + counts.tc} students)</>
            }
          </button>
        </div>
      )}

      {/* ── Final confirmation modal ── */}
      {confirmOpen && toYear && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4"
          onClick={() => !busy && setConfirmOpen(false)}>
          <div onClick={e => e.stopPropagation()}
            className="bg-white w-full sm:max-w-md rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <AlertTriangle size={20} className="text-amber-600" />
              </div>
              <div>
                <p className="text-base font-black text-slate-900">Confirm Promotion</p>
                <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                  Yeh action irreversible hai
                </p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5">
              <div className="flex justify-between text-[11px] font-bold">
                <span className="text-slate-500">Source year</span>
                <span className="text-slate-900 font-black">{fromYear?.name ?? '—'}</span>
              </div>
              <div className="flex justify-between text-[11px] font-bold">
                <span className="text-slate-500">Destination year</span>
                <span className="text-emerald-700 font-black">→ {toYear.name}</span>
              </div>
              <div className="h-px bg-slate-200 my-1" />
              <div className="flex justify-between text-[11px] font-bold">
                <span className="text-emerald-600">Promote</span>
                <span className="text-slate-900 font-black">{counts.promote}</span>
              </div>
              <div className="flex justify-between text-[11px] font-bold">
                <span className="text-amber-600">Retain</span>
                <span className="text-slate-900 font-black">{counts.retain}</span>
              </div>
              <div className="flex justify-between text-[11px] font-bold">
                <span className="text-blue-600">TC Issued</span>
                <span className="text-slate-900 font-black">{counts.tc}</span>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1.5">
                Type "{toYear.name}" to confirm
              </label>
              <input
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                autoFocus
                placeholder={toYear.name}
                className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 font-bold text-sm focus:outline-none focus:border-emerald-500"
              />
              <p className="text-[9px] font-bold text-slate-400 mt-1">
                Galat year pick hone se 500 students galat year me chale jayenge — type karke verify karein.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={busy}
                className="flex-1 py-3 bg-slate-100 text-slate-700 font-black text-xs uppercase rounded-xl active:scale-95 disabled:opacity-50">
                Cancel
              </button>
              <button
                onClick={async () => {
                  setConfirmOpen(false);
                  await executePromotion();
                }}
                disabled={busy || confirmText.trim() !== toYear.name}
                className="flex-1 py-3 bg-emerald-600 text-white font-black text-xs uppercase rounded-xl active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
                <GraduationCap size={14} /> Promote Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
