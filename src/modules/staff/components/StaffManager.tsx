import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ArrowLeft, Plus, Search, UserCheck, Phone, Mail, X, Save, Edit3,
  IndianRupee, FileText, Calendar, History, Upload, Eye, Trash2, Download,
  Loader2, BadgeAlert, BookOpen, AlertTriangle, CheckCircle2, Clock,
} from 'lucide-react';
import { staffService } from '@/modules/staff/staff.service';
import { staffAttendanceService } from '@/modules/attendance/attendance.service';
import { exportCsv } from '@/shared/utils/csv';
import {
  StaffMember, StaffRole, StaffStatus, SalaryPaymentMethod,
  StaffSalaryHistoryEntry, StaffStatusHistoryEntry, StaffDocument, SalaryPayment,
} from '@/modules/staff/staff.types';
import { useUIStore } from '@/store/uiStore';
import { useEditorModeStore } from '@/store/editorModeStore';
import { todayIST } from '@/shared/utils/date';
import { apiPrincipal, apiStaff } from '@/lib/apiClient';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { principalService } from '@/roles/principal/principal.service';

// School-wide permissions for one teacher. Currently only one toggle
// (CREATE_ADMISSION); built as a self-fetching card so the parent
// StaffManager doesn't need to pre-load the permission list for every
// teacher in the directory. Loads on mount when the principal opens
// the teacher's profile.
const SchoolPermissionsCard: React.FC<{ staffId: string }> = ({ staffId }) => {
  const { showToast } = useUIStore();
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    principalService.getStaffSchoolWidePermissions(staffId)
      .then(list => { if (!cancelled) setPerms(new Set(list)); })
      .catch(e => { if (!cancelled) showToast(e instanceof Error ? e.message : 'Failed to load permissions', 'error'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [staffId, showToast]);

  const toggle = async (key: string, enabled: boolean) => {
    setSaving(key);
    try {
      await principalService.setStaffSchoolWidePermission(staffId, key, enabled);
      setPerms(prev => {
        const next = new Set(prev);
        if (enabled) next.add(key); else next.delete(key);
        return next;
      });
      showToast(enabled ? 'Permission granted' : 'Permission revoked');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed', 'error');
    } finally {
      setSaving(null);
    }
  };

  const ITEMS: { key: string; label: string; help: string }[] = [
    {
      key:   'CREATE_ADMISSION',
      label: 'Admission Form bhar sakta hai',
      help:  'Teacher draft submit karega; principal review/edit karke approve karega.',
    },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Permissions (school-wide)</p>
      {loading ? (
        <p className="text-xs font-bold text-slate-400">Loading…</p>
      ) : ITEMS.map(item => {
        const on = perms.has(item.key);
        const busy = saving === item.key;
        return (
          <div key={item.key} className="flex items-start justify-between gap-3 py-1">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-slate-800">{item.label}</p>
              <p className="text-[10px] font-bold text-slate-400 mt-0.5">{item.help}</p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => toggle(item.key, !on)}
              className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                on ? 'bg-indigo-600' : 'bg-slate-200'
              }`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                on ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
        );
      })}
    </div>
  );
};

type View = 'LIST' | 'CREATE' | 'PROFILE' | 'EDIT';
type Tab = 'INFO' | 'SALARY' | 'ATTENDANCE' | 'CLASSES' | 'DOCS' | 'LOG';

interface Props { onBack: () => void; }

const ROLE_OPTIONS: StaffRole[] = ['TEACHER', 'VICE_PRINCIPAL', 'ACCOUNTANT', 'LIBRARIAN', 'LAB_INCHARGE', 'DRIVER', 'PEON', 'SECURITY'];

const PAY_METHODS: SalaryPaymentMethod[] = ['CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'OTHER'];

const DOC_TYPES = ['PAN', 'AADHAAR', 'RESUME', 'OFFER_LETTER', 'EXPERIENCE_LETTER', 'PHOTO', 'OTHER'] as const;

const roleColor = (role: StaffRole) => {
  const map: Record<StaffRole, string> = {
    TEACHER: 'bg-blue-50 text-blue-700', VICE_PRINCIPAL: 'bg-violet-50 text-violet-700',
    ACCOUNTANT: 'bg-emerald-50 text-emerald-700', LIBRARIAN: 'bg-amber-50 text-amber-700',
    LAB_INCHARGE: 'bg-cyan-50 text-cyan-700', DRIVER: 'bg-orange-50 text-orange-700',
    PEON: 'bg-slate-100 text-slate-600', SECURITY: 'bg-rose-50 text-rose-700',
  };
  return map[role];
};

const statusColor = (s: StaffStatus) =>
  s === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' :
  s === 'ON_LEAVE' ? 'bg-amber-50 text-amber-700' :
  s === 'RELIEVED' ? 'bg-slate-200 text-slate-700' :
  'bg-rose-50 text-rose-700';

// IST today — UTC version backdated salary-pay default by 1 day in
// the small hours of the morning. Single source of truth in
// shared/utils/date.ts.
const todayIso = () => todayIST();

const monthLabel = (d: Date) =>
  d.toLocaleString('en-IN', { month: 'long', year: 'numeric' });

const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

/** Yields first-of-month dates from `from` to `to` (both inclusive). */
function* monthRange(from: Date, to: Date): Generator<Date> {
  let cur = monthStart(from);
  const end = monthStart(to);
  while (cur <= end) {
    yield new Date(cur);
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
}

/** Returns the staff salary that was in effect on a given month-start, using
 *  the salary history (most-recent effective_from <= monthStart). Falls back
 *  to `currentSalary` when no history covers the month. */
function expectedSalaryFor(
  monthStartDate: Date,
  history: { amount: number; effectiveFrom: string }[],
  currentSalary: number,
): number {
  const sorted = [...history].sort((a, b) =>
    a.effectiveFrom.localeCompare(b.effectiveFrom),
  );
  let amount = 0;
  for (const h of sorted) {
    if (new Date(h.effectiveFrom) <= monthStartDate) amount = h.amount;
    else break;
  }
  return amount || currentSalary;
}

interface MonthRow {
  label: string;
  expected: number;
  paid: number;
  status: 'PAID' | 'PARTIAL' | 'PENDING';
}

/** Build an expected-vs-paid grid for the Salary tab. Hardened against
 *  bad inputs: invalid dates, null/undefined salary, oversized ranges
 *  (e.g. joining date set to 1970 by mistake) used to crash this tab
 *  with a white screen the moment a payment landed and the memo recomputed.
 */
function buildMonthlyGrid(
  staff: StaffMember,
  history: StaffSalaryHistoryEntry[],
  payments: SalaryPayment[],
): MonthRow[] {
  try {
    // salary_start_date wins — that's when the school *starts paying*.
    // Falls back to joining_date for legacy rows that haven't been
    // migrated. If neither is set, no grid (we'd have nothing to bound).
    const fromIso = staff.salaryStartDate || staff.joiningDate;
    if (!fromIso) return [];
    const fromDate = new Date(fromIso);
    if (Number.isNaN(fromDate.getTime())) return [];
    const today = new Date();
    let toDate = today;
    if (staff.relievingDate) {
      const r = new Date(staff.relievingDate);
      if (!Number.isNaN(r.getTime()) && r < today) toDate = r;
    }
    if (fromDate > toDate) return [];

    // Sanity cap — refuse to build a 600-row grid because somebody typed
    // 1970 as the joining date. Eight years is generous for a real career
    // window and keeps the render cheap.
    const maxMonths = 96;
    const monthsApart =
      (toDate.getFullYear() - fromDate.getFullYear()) * 12
      + (toDate.getMonth() - fromDate.getMonth());
    let effectiveFrom = fromDate;
    if (monthsApart > maxMonths) {
      effectiveFrom = new Date(toDate.getFullYear(), toDate.getMonth() - maxMonths, 1);
    }

    const paidByMonth = new Map<string, number>();
    for (const p of payments ?? []) {
      if (!p?.month) continue;
      paidByMonth.set(p.month, (paidByMonth.get(p.month) ?? 0) + Number(p.amount || 0));
    }

    const baseSalary = Number(staff.salary) || 0;
    const rows: MonthRow[] = [];
    for (const m of monthRange(effectiveFrom, toDate)) {
      const label = monthLabel(m);
      const expected = expectedSalaryFor(m, history ?? [], baseSalary);
      const paid = paidByMonth.get(label) ?? 0;
      const status: MonthRow['status'] =
        paid >= expected && expected > 0 ? 'PAID' :
        paid > 0 ? 'PARTIAL' : 'PENDING';
      rows.push({ label, expected, paid, status });
    }
    return rows.reverse();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[staff salary] buildMonthlyGrid failed', err);
    return [];
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Salary tab — month-wise Expected vs Paid grid + amount-history panel.
// Lifted out of <StaffManager/> so the heavy useMemo work doesn't re-run on
// unrelated state changes (search, filters, modal toggles).
// ──────────────────────────────────────────────────────────────────────────

const monthRowColor: Record<MonthRow['status'], string> = {
  PAID:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  PARTIAL: 'bg-amber-50 text-amber-700 border-amber-200',
  PENDING: 'bg-rose-50 text-rose-700 border-rose-200',
};

const monthRowIcon = (s: MonthRow['status']) =>
  s === 'PAID'    ? <CheckCircle2 size={11} className="text-emerald-500" /> :
  s === 'PARTIAL' ? <AlertTriangle size={11} className="text-amber-500" /> :
                    <Clock size={11} className="text-rose-500" />;

interface SalaryTabProps {
  staff: StaffMember;
  salaryHistory: StaffSalaryHistoryEntry[];
  paymentHistory: SalaryPayment[];
  onEditSalary: () => void;
  onOpenPayModal: (month: string, expected: number) => void;
  // Drives whether the "Edit Salary" link renders. Pay action stays open
  // because that's a routine monthly disbursement, not a payroll rewrite.
  canEdit: boolean;
  /** Reverse a payment within the 24-hour window. Reason is collected by
   *  the parent before this is called; SalaryTab just exposes the button. */
  onReversePayment: (p: SalaryPayment) => void;
}

const SalaryTab: React.FC<SalaryTabProps> = ({
  staff, salaryHistory, paymentHistory, onEditSalary, onOpenPayModal, canEdit, onReversePayment,
}) => {
  const monthly = useMemo(
    () => buildMonthlyGrid(staff, salaryHistory, paymentHistory),
    [staff, salaryHistory, paymentHistory],
  );
  const totals = useMemo(() => {
    const expected = monthly.reduce((a, m) => a + m.expected, 0);
    const paid     = monthly.reduce((a, m) => a + m.paid, 0);
    return { expected, paid, pending: Math.max(0, expected - paid) };
  }, [monthly]);

  const isRelieved = staff.status === 'RELIEVED';

  return (
    <>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="flex items-start justify-between mb-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Current Salary</p>
          {!isRelieved && canEdit && (
            <button onClick={onEditSalary} className="flex items-center gap-1 text-[10px] font-black text-blue-600">
              <Edit3 size={11} /> Edit Salary
            </button>
          )}
        </div>
        <div className="text-3xl font-black text-emerald-600 tabular-nums">{fmtIN(staff.salary)}</div>
        <div className="text-[10px] font-bold text-slate-400 mt-0.5">per month</div>
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="bg-slate-50 rounded-xl p-2 text-center">
            <div className="text-xs font-black text-slate-700 tabular-nums">{fmtIN(totals.expected)}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">Expected</div>
          </div>
          <div className="bg-slate-50 rounded-xl p-2 text-center">
            <div className="text-xs font-black text-emerald-600 tabular-nums">{fmtIN(totals.paid)}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">Paid</div>
          </div>
          <div className="bg-slate-50 rounded-xl p-2 text-center">
            <div className={`text-xs font-black tabular-nums ${totals.pending > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{fmtIN(totals.pending)}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">Pending</div>
          </div>
        </div>
        {!isRelieved && (
          <button onClick={() => {
            const cur = monthLabel(new Date());
            const expected = monthly.find(m => m.label === cur)?.expected ?? staff.salary;
            const paid = monthly.find(m => m.label === cur)?.paid ?? 0;
            onOpenPayModal(cur, Math.max(0, expected - paid));
          }}
            className="mt-3 w-full py-3 bg-slate-900 text-white text-xs font-black rounded-xl uppercase tracking-wide active:scale-95 transition-transform">
            Pay This Month
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Monthly Expected vs Paid</p>
        {monthly.length === 0 ? (
          <p className="text-xs font-bold text-slate-400 py-3 text-center">No months to show yet — joining date is in the future.</p>
        ) : (
          <div className="space-y-2">
            {monthly.map(row => {
              const pending = Math.max(0, row.expected - row.paid);
              return (
                <div key={row.label} className="bg-slate-50 rounded-xl p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-black text-slate-800 text-sm">{row.label}</div>
                      <div className={`inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full border mt-1 ${monthRowColor[row.status]}`}>
                        {monthRowIcon(row.status)} {row.status}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Paid / Expected</div>
                      <div className="text-xs font-black text-slate-800 tabular-nums">
                        <span className={row.paid >= row.expected ? 'text-emerald-600' : 'text-slate-700'}>{fmtIN(row.paid)}</span>
                        <span className="text-slate-400"> / </span>
                        <span>{fmtIN(row.expected)}</span>
                      </div>
                      {pending > 0 && (
                        <div className="text-[10px] font-black text-rose-600 mt-0.5 tabular-nums">{fmtIN(pending)} pending</div>
                      )}
                    </div>
                  </div>
                  {row.status !== 'PAID' && !isRelieved && (
                    <button onClick={() => onOpenPayModal(row.label, pending || row.expected)}
                      className="mt-2 w-full py-2 bg-slate-900 text-white text-[10px] font-black rounded-xl active:scale-95 transition-transform">
                      Record Payment
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Salary Amount History</p>
        {salaryHistory.length === 0 ? (
          <p className="text-xs font-bold text-slate-400 py-3 text-center">No salary changes recorded.</p>
        ) : (
          <div className="space-y-2">
            {salaryHistory.map(h => (
              <div key={h.id} className="flex items-center justify-between bg-slate-50 rounded-xl p-3">
                <div>
                  <div className="font-black text-slate-800 text-sm tabular-nums">{fmtIN(h.amount)}</div>
                  <div className="text-[10px] font-bold text-slate-400 mt-0.5">From {fmtDate(h.effectiveFrom)}{h.reason ? ` · ${h.reason}` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Payment Log</p>
        {paymentHistory.length === 0 ? (
          <p className="text-xs font-bold text-slate-400 py-3 text-center">No payments yet.</p>
        ) : (
          <div className="space-y-2">
            {paymentHistory.map(p => {
              const isReversed = !!p.reversedAt;
              // Within-24h check uses created_at (when the row was actually
              // recorded) rather than paid_at, so a back-dated entry is
              // still reversible immediately after it was typed in.
              const within24h =
                !isReversed
                && p.createdAt
                && (Date.now() - new Date(p.createdAt).getTime()) <= 24 * 60 * 60 * 1000;
              return (
                <div key={p.id}
                  className={`bg-slate-50 rounded-xl p-3 ${isReversed ? 'border border-rose-100 bg-rose-50/40' : ''}`}>
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <div className={`font-black text-sm ${isReversed ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                        {p.month}
                      </div>
                      <div className={`text-[10px] font-bold mt-0.5 ${isReversed ? 'text-slate-400 line-through' : 'text-slate-400'}`}>
                        {fmtDate(p.paidAt)}{p.method ? ` · ${p.method.replace('_', ' ')}` : ''}{p.transactionId ? ` · ${p.transactionId}` : ''}
                      </div>
                      {p.note && (
                        <div className={`text-[10px] font-bold mt-0.5 ${isReversed ? 'text-slate-400 line-through' : 'text-slate-500'}`}>
                          {p.note}
                        </div>
                      )}
                    </div>
                    <div className={`font-black text-sm shrink-0 ${isReversed ? 'text-slate-400 line-through' : 'text-emerald-600'}`}>
                      {fmtIN(p.amount)}
                    </div>
                  </div>

                  {isReversed && (
                    <div className="mt-2 pt-2 border-t border-rose-200 flex items-start gap-2">
                      <span className="text-[9px] font-black uppercase tracking-widest bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full shrink-0">
                        Reversed
                      </span>
                      <div className="text-[10px] font-bold text-rose-700 leading-snug">
                        {p.reversalReason || 'Reversed'}
                        {p.reversedByName && <> · by {p.reversedByName}</>}
                        {p.reversedAt && <> · {fmtDate(p.reversedAt.slice(0, 10))}</>}
                      </div>
                    </div>
                  )}

                  {!isReversed && within24h && canEdit && (
                    <button onClick={() => onReversePayment(p)}
                      className="mt-2 w-full py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] font-black uppercase tracking-widest rounded-lg border border-rose-200 transition-colors">
                      Revert (within 24h)
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};

// Typed field-map for the create / edit text inputs. Keys are restricted to
// the string-typed fields on StaffMember so the form indexing is type-safe
// (replaces the previous `as unknown as Record<string, string>` cast).
type StaffTextKey = 'name' | 'subject' | 'phone' | 'email' | 'aadhaarNo' | 'address';
const STAFF_TEXT_FIELDS: ReadonlyArray<{ label: string; key: StaffTextKey; placeholder: string }> = [
  { label: 'Full Name *', key: 'name',      placeholder: 'Staff full name' },
  { label: 'Subject',     key: 'subject',   placeholder: 'e.g. Mathematics' },
  // Contact mobile is the personal number shown on the staff card /
  // printable sheets. Login mobile (rendered separately below for
  // TEACHER + DRIVER only) is what provisions the EduGrow app account.
  { label: 'Contact Mobile (display)', key: 'phone', placeholder: '+91 XXXXX XXXXX' },
  { label: 'Email',       key: 'email',     placeholder: 'staff@school.edu.in' },
  { label: 'Aadhaar No.', key: 'aadhaarNo', placeholder: 'XXXX XXXX XXXX' },
  { label: 'Address',     key: 'address',   placeholder: 'Residential address' },
];

/** First-of-next-month relative to a YYYY-MM-DD ISO date. Used as the
 *  default salaryStartDate when the principal picks a joining date — a
 *  staff member joining on Oct-18 should have their first paid month be
 *  November, not a partial October. */
function firstOfNextMonth(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  // Format YYYY-MM-DD locally (avoid UTC drift across timezones).
  const yyyy = next.getFullYear();
  const mm = String(next.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}-01`;
}

const BLANK: Omit<StaffMember, 'id'> = {
  name: '', role: 'TEACHER', subject: '', phone: '', email: '', aadhaarNo: '',
  salary: 0, joiningDate: todayIso(), salaryStartDate: firstOfNextMonth(todayIso()),
  status: 'ACTIVE',
  assignedClasses: [], address: '', photo: '',
};

const fmtIN = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const StaffManager: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useUIStore();
  // Edit-mode gate. Edit / Suspend / Set Relieving / Edit Salary are
  // structural changes that distort payroll + lifecycle history if done
  // by accident, so we hide the controls behind the same Editor Mode flag
  // used by attendance corrections. Pay (salary disbursement) stays open
  // because that's a routine monthly action, not a rewrite of past data.
  const editorModeActive = useEditorModeStore(s => s.isActive());
  // Suggestions for the "Subject" field — distinct values already used in
  // this school. The Add/Edit form renders a dropdown of these + an "Other"
  // entry so the user picks from the existing list (typical case) or
  // explicitly opts into typing a new one (rare). Earlier this was a
  // datalist on a text input which kept popping up an autocomplete sheet
  // every time the user tapped — annoying on mobile, and on desktop the
  // dropdown appeared even when the user wanted to type a brand-new value.
  const [subjectOptions, setSubjectOptions] = useState<string[]>([]);
  useEffect(() => {
    apiPrincipal.subjectSuggestions()
      .then(setSubjectOptions)
      .catch(() => setSubjectOptions([]));
  }, []);
  // Per-form "custom" toggles. When ON, a free-text input shows up next to
  // the dropdown so the principal can type a subject not in the list.
  const [createSubjectCustom, setCreateSubjectCustom] = useState(false);
  const [editSubjectCustom, setEditSubjectCustom]     = useState(false);

  const [view, setView] = useState<View>('LIST');
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [selected, setSelected] = useState<StaffMember | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<StaffRole | 'ALL'>('ALL');
  const [shown, setShown] = useState(50);
  const [form, setForm] = useState<Omit<StaffMember, 'id'>>(BLANK);
  // Login mobile is kept outside `form` because it's not a stored field on
  // the staff row — it's only used at create-time to provision the auth
  // user via /api/admin/create-school-user. Only TEACHER + DRIVER roles
  // get an account; other staff (PEON / ACCOUNTANT / OTHER) are records
  // only, no login.
  const [loginPhone, setLoginPhone] = useState('');
  const [editForm, setEditForm] = useState<Omit<StaffMember, 'id'>>(BLANK);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmSuspend, setConfirmSuspend] = useState<StaffMember | null>(null);
  const [confirmRejoin, setConfirmRejoin]   = useState<StaffMember | null>(null);

  // Profile / tabs
  const [tab, setTab] = useState<Tab>('INFO');
  const [salaryHistory, setSalaryHistory] = useState<StaffSalaryHistoryEntry[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<SalaryPayment[]>([]);
  const [statusHistory, setStatusHistory] = useState<StaffStatusHistoryEntry[]>([]);
  const [docs, setDocs] = useState<StaffDocument[]>([]);
  const [tabLoading, setTabLoading] = useState(false);
  const [staffAttendance, setStaffAttendance] = useState<{
    days: Array<{ date: string; status: string }>;
    counts: Record<string, number>;
  } | null>(null);
  const [staffAttLoading, setStaffAttLoading] = useState(false);

  // Modals
  const [editSalaryOpen, setEditSalaryOpen] = useState(false);
  const [editSalaryAmt, setEditSalaryAmt] = useState('');
  const [editSalaryFrom, setEditSalaryFrom] = useState(todayIso());
  const [editSalaryReason, setEditSalaryReason] = useState('');
  const [editSalaryBusy, setEditSalaryBusy] = useState(false);

  const [payOpen, setPayOpen] = useState(false);
  const [payMonth, setPayMonth] = useState(monthLabel(new Date()));
  const [payAmt, setPayAmt] = useState('');
  const [payMethod, setPayMethod] = useState<SalaryPaymentMethod>('BANK_TRANSFER');
  const [payTxn, setPayTxn] = useState('');
  const [payNote, setPayNote] = useState('');
  const [payBusy, setPayBusy] = useState(false);
  // Date defaults to today and stays hidden behind the Advanced disclosure
  // — most payments are recorded on the same day they happen, so dragging
  // the field into the primary form added friction. Open Advanced only
  // when back-dating a cash payment that was disbursed earlier.
  const [payDate, setPayDate] = useState(todayIso());
  const [payAdvancedOpen, setPayAdvancedOpen] = useState(false);

  const [relieveOpen, setRelieveOpen] = useState(false);
  const [relieveDate, setRelieveDate] = useState(todayIso());
  const [relieveReason, setRelieveReason] = useState('');
  const [relieveBusy, setRelieveBusy] = useState(false);

  // Reverse-payment modal state. Replaces a window.prompt() that exposed
  // the codespaces dev hostname as the dialog title — an alarming look
  // for a school principal who sees "v6jqvww-5000.app.github.dev says…"
  // in the middle of a salary reversal.
  const [reverseTarget, setReverseTarget] = useState<SalaryPayment | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reverseBusy, setReverseBusy] = useState(false);

  const [docType, setDocType] = useState<string>('PAN');
  // Documents queued during the CREATE flow — uploaded after the staff row is
  // inserted (we need the staffId before we can attach files).
  const [pendingDocs, setPendingDocs] = useState<{ type: string; file: File }[]>([]);
  const [docBusy, setDocBusy] = useState(false);

  useEffect(() => { staffService.getAll().then(setStaff); }, []);

  const loadProfileTabs = useCallback(async (staffId: string) => {
    setTabLoading(true);
    try {
      const [history, payments, statuses, documents] = await Promise.all([
        staffService.getSalaryHistory(staffId),
        staffService.getPaymentHistory(staffId),
        staffService.getStatusHistory(staffId),
        staffService.getDocuments(staffId),
      ]);
      setSalaryHistory(history);
      setPaymentHistory(payments);
      setStatusHistory(statuses);
      setDocs(documents);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load profile data', 'error');
    } finally {
      setTabLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (view === 'PROFILE' && selected) {
      loadProfileTabs(selected.id);
      // Reset stale attendance data so the next staff opened shows their own,
      // not the previous selection's summary.
      setStaffAttendance(null);
    }
  }, [view, selected, loadProfileTabs]);

  // Load attendance for the selected staff when their Attendance tab is
  // opened. Pulls a 90-day window — enough to feel like "recent activity"
  // without hammering the wire on every profile open. Re-fetched per
  // selected.id change so swapping staff in PROFILE shows fresh data.
  useEffect(() => {
    if (view !== 'PROFILE' || tab !== 'ATTENDANCE' || !selected || staffAttendance) return;
    setStaffAttLoading(true);
    const today = new Date();
    const start = new Date(today); start.setDate(today.getDate() - 89);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    staffAttendanceService.getStaffAttendanceForRange(selected.id, fmt(start), fmt(today))
      .then(r => setStaffAttendance(r))
      .catch(e => showToast(e instanceof Error ? e.message : 'Failed to load attendance', 'error'))
      .finally(() => setStaffAttLoading(false));
  }, [view, tab, selected, staffAttendance, showToast]);

  const filtered = staff.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) || s.subject.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === 'ALL' || s.role === roleFilter;
    return matchSearch && matchRole;
  });

  // Reset to first page when filters narrow.
  useEffect(() => { setShown(50); }, [search, roleFilter]);
  const visibleStaff = filtered.slice(0, shown);
  const remainingStaff = filtered.length - visibleStaff.length;

  const handleCreate = async () => {
    // Aggregate every missing-field check into one banner-style toast so the
    // principal sees the full to-do list at once, not the click → fix → click
    // → fix loop the old code created.
    const missing: string[] = [];
    if (!form.name?.trim() || form.name.trim().length < 2) missing.push('Staff name (min 2 letters)');
    if (!Number.isFinite(form.salary) || form.salary <= 0) missing.push('Monthly salary');
    if (!form.joiningDate)                                 missing.push('Joining date');
    if (!form.salaryStartDate)                             missing.push('First salary month');
    if (missing.length > 0) {
      showToast(`Yeh fields chahiye: ${missing.join(', ')}`, 'error');
      return;
    }
    if (form.salary > 10_000_000) {
      showToast('Salary ₹1,00,00,000 se zyada nahi ho sakti', 'error'); return;
    }
    if (!Number.isInteger(form.salary)) {
      showToast('Salary whole rupee value me likhna', 'error'); return;
    }
    // Sanity: first-salary-from cannot be before joining date.
    if (form.salaryStartDate < form.joiningDate) {
      showToast('First salary month joining date se pehle nahi ho sakta', 'error'); return;
    }
    // Joining date sanity — refuse 1970-style typos and absurdly future dates.
    const jd = new Date(form.joiningDate);
    const minJd = new Date(); minJd.setFullYear(minJd.getFullYear() - 50);
    const maxJd = new Date(); maxJd.setFullYear(maxJd.getFullYear() + 1);
    if (jd < minJd || jd > maxJd) {
      showToast('Joining date 50 saal pehle ya 1 saal aage se zyada nahi ho sakti', 'error');
      return;
    }
    // Contact phone (optional) — if provided, must be 10 digits.
    if (form.phone && form.phone.trim()) {
      const cleaned = form.phone.replace(/\D/g, '').slice(-10);
      if (cleaned.length !== 10) {
        showToast('Contact mobile 10-digit hona chahiye', 'error'); return;
      }
    }
    // Login mobile (TEACHER + DRIVER only, optional) — must also be 10 digits.
    const needsLogin = form.role === 'TEACHER' || form.role === 'DRIVER';
    const loginPhoneClean = loginPhone.replace(/\D/g, '').slice(-10);
    if (needsLogin && loginPhone.trim() && loginPhoneClean.length !== 10) {
      showToast('Login mobile 10-digit hona chahiye', 'error'); return;
    }
    // Email (optional) — if provided, basic shape check.
    if (form.email && form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      showToast('Email format galat hai', 'error'); return;
    }
    // Aadhaar (optional) — if provided, must be exactly 12 digits.
    if (form.aadhaarNo && form.aadhaarNo.trim()) {
      const cleaned = form.aadhaarNo.replace(/\D/g, '');
      if (cleaned.length !== 12) {
        showToast('Aadhaar number 12 digits ka hota hai', 'error'); return;
      }
    }
    setIsSubmitting(true);
    try {
      // Atomic create: staffService.create inserts the staff row AND seeds
      // the initial salary-history entry; if the seed fails it deletes the
      // staff row and throws, so we never end up with a salaried staff
      // member that has no salary history.
      const member = await staffService.create(form, {
        // Only TEACHER + DRIVER get a login. Pass the explicit login mobile
        // (separate from contact). Empty string → no auth user created.
        loginMobile: needsLogin ? loginPhoneClean : '',
      });

      // Upload any documents queued during creation — best-effort. Staff is
      // already inserted, so failed uploads don't abort the flow; we surface
      // the first error so the principal knows why (silent failures used to
      // leave them guessing — was it the file size? type? bucket?).
      let uploadFailures = 0;
      let firstErrMsg = '';
      for (const { type, file } of pendingDocs) {
        try { await staffService.uploadDocument(member.id, type, file); }
        catch (err) {
          console.error('[staff create] doc upload failed:', type, file.name, err);
          uploadFailures++;
          if (!firstErrMsg) firstErrMsg = err instanceof Error ? err.message : String(err);
        }
      }
      if (uploadFailures > 0) {
        showToast(
          `Staff added — ${uploadFailures} document(s) failed: ${firstErrMsg}`,
          'error',
        );
      } else {
        showToast(`${member.name} added${pendingDocs.length ? ` with ${pendingDocs.length} document(s)` : ''}`);
      }

      setStaff(prev => [...prev, member]);
      setForm(BLANK);
      setLoginPhone('');
      setPendingDocs([]);
      setView('LIST');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to create staff', 'error');
    } finally { setIsSubmitting(false); }
  };

  const handleUpdate = async () => {
    if (!selected || !editForm.name) { showToast('Name required', 'error'); return; }
    setIsSubmitting(true);
    try {
      const updated = await staffService.update(selected.id, editForm);
      setStaff(prev => prev.map(s => s.id === updated.id ? updated : s));
      setSelected(updated);
      showToast(`${updated.name} updated`);
      setView('PROFILE');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Update failed', 'error');
    } finally { setIsSubmitting(false); }
  };

  const handleSuspend = async (member: StaffMember) => {
    // Defensive guard — UI hides the action for RELIEVED staff, but a stale
    // confirmSuspend reference (e.g. relieving completes while the modal is
    // still open) shouldn't be allowed to re-open the lifecycle.
    if (member.status === 'RELIEVED') {
      showToast('Cannot change status of a relieved staff member', 'error');
      setConfirmSuspend(null);
      return;
    }
    try {
      const updated = member.status === 'SUSPENDED'
        ? await staffService.reinstate(member.id)
        : await staffService.suspend(member.id);
      setStaff(prev => prev.map(s => s.id === updated.id ? updated : s));
      if (selected?.id === updated.id) setSelected(updated);
      showToast(updated.status === 'SUSPENDED' ? `${updated.name} suspended` : `${updated.name} reinstated`);
      setConfirmSuspend(null);
      if (view === 'PROFILE' && selected) await loadProfileTabs(selected.id);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Action failed', 'error');
    }
  };

  const handleRejoin = async (member: StaffMember) => {
    if (member.status !== 'RELIEVED') return;
    try {
      await apiStaff.rejoin(member.id);
      // Refetch the row to pick up cleared relieving_date / status flip.
      const fresh = await staffService.getById(member.id);
      if (fresh) {
        setStaff(prev => prev.map(s => s.id === fresh.id ? fresh : s));
        if (selected?.id === fresh.id) setSelected(fresh);
      }
      showToast(`${member.name} re-activated. Re-assign classes & permissions next.`);
      setConfirmRejoin(null);
      if (view === 'PROFILE' && selected) await loadProfileTabs(selected.id);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Rejoin failed', 'error');
    }
  };

  const handleEditSalary = async () => {
    if (!selected) return;
    const amt = Number(editSalaryAmt);
    if (!Number.isFinite(amt) || amt < 0) { showToast('Enter a valid amount', 'error'); return; }
    setEditSalaryBusy(true);
    try {
      await staffService.updateSalary(selected.id, amt, editSalaryFrom, editSalaryReason || 'Revision');
      const fresh = await staffService.getById(selected.id);
      if (fresh) {
        setSelected(fresh);
        setStaff(prev => prev.map(s => s.id === fresh.id ? fresh : s));
      }
      await loadProfileTabs(selected.id);
      showToast(`Salary updated to ${fmtIN(amt)}`);
      setEditSalaryOpen(false);
      setEditSalaryAmt(''); setEditSalaryReason('');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to update salary', 'error');
    } finally {
      setEditSalaryBusy(false);
    }
  };

  const handlePay = async () => {
    if (!selected) return;
    const amt = Number(payAmt);
    if (!Number.isFinite(amt) || amt <= 0) { showToast('Enter a valid amount', 'error'); return; }
    if (payDate && payDate > todayIso()) {
      showToast('Paid on date cannot be in the future', 'error'); return;
    }
    setPayBusy(true);
    try {
      await staffService.recordSalaryPayment(
        selected.id, payMonth, amt, payNote, payMethod, payTxn || null,
        // Pass undefined when the user kept the default (today) so the
        // server still falls through to CURRENT_DATE — no behaviour
        // change vs the old flow if Advanced was never opened.
        payDate && payDate !== todayIso() ? payDate : undefined,
      );
      await loadProfileTabs(selected.id);
      showToast(`${fmtIN(amt)} recorded for ${payMonth}`);
      setPayOpen(false);
      setPayAmt(''); setPayTxn(''); setPayNote('');
      setPayDate(todayIso()); setPayAdvancedOpen(false);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Payment failed', 'error');
    } finally {
      setPayBusy(false);
    }
  };

  // Reverse a payment within the 24-hour window. Editor mode is gated
  // up front, then a modal collects the reason (server enforces both;
  // the modal just keeps the UX consistent with other in-app prompts
  // instead of falling back to window.prompt).
  const openReversePayment = (payment: SalaryPayment) => {
    if (!editorModeActive) {
      showToast('Enable Editor Mode (Settings → Security) first', 'error'); return;
    }
    setReverseTarget(payment);
    setReverseReason('');
  };

  const submitReversePayment = async () => {
    if (!selected || !reverseTarget) return;
    const reason = reverseReason.trim();
    if (!reason) { showToast('Reason required', 'error'); return; }
    setReverseBusy(true);
    try {
      await staffService.reverseSalaryPayment(reverseTarget.id, reason);
      await loadProfileTabs(selected.id);
      showToast(`Reversed ${fmtIN(reverseTarget.amount)} for ${reverseTarget.month}`);
      setReverseTarget(null);
      setReverseReason('');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Reversal failed', 'error');
    } finally {
      setReverseBusy(false);
    }
  };

  const handleRelieve = async () => {
    if (!relieveReason.trim()) { showToast('Reason is required when relieving staff', 'error'); return; }
    if (!selected) return;
    if (!relieveDate) { showToast('Date required', 'error'); return; }
    setRelieveBusy(true);
    try {
      await staffService.setRelievingDate(selected.id, relieveDate, relieveReason);
      const fresh = await staffService.getById(selected.id);
      if (fresh) {
        setSelected(fresh);
        setStaff(prev => prev.map(s => s.id === fresh.id ? fresh : s));
      }
      await loadProfileTabs(selected.id);
      showToast(`${selected.name} relieved on ${fmtDate(relieveDate)}`);
      setRelieveOpen(false);
      setRelieveReason('');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to set relieving date', 'error');
    } finally {
      setRelieveBusy(false);
    }
  };

  const MAX_STAFF_DOCS = 5;
  const handleUpload = async (file: File) => {
    if (!selected) return;
    // Per-staff cap. Earlier there was no UI gate — uploads kept piling up
    // and the bucket cost crept silently. 5 covers the typical PAN /
    // Aadhaar / resume / cert / photo set.
    if (docs.length >= MAX_STAFF_DOCS) {
      showToast(`Limit reached — max ${MAX_STAFF_DOCS} documents per staff. Delete an existing one first.`, 'error');
      return;
    }
    setDocBusy(true);
    try {
      const doc = await staffService.uploadDocument(selected.id, docType, file);
      try {
        setDocs(prev => [doc, ...prev]);
        showToast(`${file.name} uploaded`);
      } catch (uiErr) {
        // Defensive: a render error in the docs list shouldn't crash the
        // whole panel. The doc is already saved, so the list will pick it
        // up on next reload.
        // eslint-disable-next-line no-console
        console.error('[staff doc upload] post-upload UI failed', uiErr);
        showToast('Uploaded — please reopen profile to refresh list', 'info');
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Upload failed', 'error');
    } finally {
      setDocBusy(false);
    }
  };

  const handleViewDoc = async (path: string) => {
    const url = await staffService.getDocumentSignedUrl(path);
    if (!url) { showToast('Could not open document', 'error'); return; }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  /** Force-download the actual file (not just open it). Fetches the signed URL,
   *  pulls the blob, and triggers a save dialog with the original filename. */
  const handleDownloadDoc = async (path: string, filename: string) => {
    try {
      const url = await staffService.getDocumentSignedUrl(path);
      if (!url) { showToast('Could not fetch document', 'error'); return; }
      const res = await fetch(url);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = filename || 'document';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      // Deferred cleanup — synchronous revoke races the download
      // fetch on Safari / older WebKit. See csv.ts:downloadCsv for
      // the same pattern.
      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(objUrl);
      }, 1000);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Download failed', 'error');
    }
  };

  const handleDeleteDoc = async (id: string) => {
    if (!selected) return;
    try {
      await staffService.removeDocument(id);
      setDocs(prev => prev.filter(d => d.id !== id));
      showToast('Document deleted');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Delete failed', 'error');
    }
  };

  const renderHeader = (title: string, back: () => void, action?: React.ReactNode) => (
    <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
      <div className="flex items-center gap-3">
        <button onClick={back} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600"><ArrowLeft size={20} /></button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">{title}</h2>
      </div>
      {action}
    </div>
  );

  // ─── LIST view ─────────────────────────────────────────────────────────────
  // Suspend / Reinstate confirmation must render BEFORE the view-specific
  // early returns; otherwise the LIST/PROFILE/etc return-statement below
  // wins and the modal never appears.
  if (confirmRejoin) return (
    <div className="absolute inset-0 z-60 bg-slate-900/60 flex items-end justify-center animate-in fade-in">
      <div className="bg-white w-full rounded-t-3xl p-6 pb-10 animate-in slide-in-from-bottom-4">
        <h3 className="font-black text-slate-900 text-lg mb-2">Rejoin {confirmRejoin.name}?</h3>
        <p className="text-sm text-slate-500 mb-2">
          The relieving date and reason will be cleared, status flips back to <span className="font-black">ACTIVE</span>,
          and login is re-enabled.
        </p>
        <p className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-6">
          You'll need to re-add class assignments &amp; permissions afterwards — those were cleared at relieving time.
        </p>
        <div className="flex gap-3">
          <button onClick={() => setConfirmRejoin(null)} className="flex-1 py-3 rounded-2xl border border-slate-200 font-black text-slate-600">Cancel</button>
          <button onClick={() => handleRejoin(confirmRejoin)} className="flex-1 py-3 rounded-2xl text-white font-black bg-emerald-600">
            Rejoin
          </button>
        </div>
      </div>
    </div>
  );

  if (confirmSuspend) return (
    <div className="absolute inset-0 z-60 bg-slate-900/60 flex items-end justify-center animate-in fade-in">
      <div className="bg-white w-full rounded-t-3xl p-6 pb-10 animate-in slide-in-from-bottom-4">
        <h3 className="font-black text-slate-900 text-lg mb-2">
          {confirmSuspend.status === 'SUSPENDED' ? 'Reinstate' : 'Suspend'} {confirmSuspend.name}?
        </h3>
        <p className="text-sm text-slate-500 mb-6">
          {confirmSuspend.status === 'SUSPENDED'
            ? 'This will restore their access and active status.'
            : 'This will revoke access. Salary payments will be put on hold.'}
        </p>
        <div className="flex gap-3">
          <button onClick={() => setConfirmSuspend(null)} className="flex-1 py-3 rounded-2xl border border-slate-200 font-black text-slate-600">Cancel</button>
          <button onClick={() => handleSuspend(confirmSuspend)} className={`flex-1 py-3 rounded-2xl text-white font-black ${confirmSuspend.status === 'SUSPENDED' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
            {confirmSuspend.status === 'SUSPENDED' ? 'Reinstate' : 'Suspend'}
          </button>
        </div>
      </div>
    </div>
  );

  if (view === 'LIST') return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Staff', onBack,
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportCsv(
              `staff_list_${new Date().toISOString().slice(0, 10)}`,
              filtered.map(s => ({
                name: s.name,
                role: s.role,
                subject: s.subject ?? '',
                phone: s.phone ?? '',
                email: s.email ?? '',
                status: s.status,
                salary: s.salary,
                joined_on: s.joiningDate ?? '',
                relieved_on: s.relievingDate ?? '',
                relieving_reason: s.relievingReason ?? '',
                is_active: s.isActive ? 'YES' : 'NO',
              })),
            )}
            disabled={filtered.length === 0}
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs rounded-xl active:scale-95 transition-all disabled:opacity-40">
            <Download size={13} /> CSV
          </button>
          <button onClick={() => setView('CREATE')} className="w-9 h-9 bg-blue-600 text-white rounded-full shadow-md flex items-center justify-center active:scale-90 transition-transform"><Plus size={18} /></button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto ">

        <div className="grid grid-cols-4 gap-2 px-4 pt-3 pb-1">
          {[
            { label: 'Total',     val: staff.length,                                          num: 'text-slate-900', bg: 'bg-white border border-slate-100' },
            { label: 'Active',    val: staff.filter(s => s.status === 'ACTIVE').length,       num: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'On Leave',  val: staff.filter(s => s.status === 'ON_LEAVE').length,     num: 'text-amber-600',  bg: 'bg-amber-50' },
            { label: 'Suspended', val: staff.filter(s => s.status === 'SUSPENDED').length,    num: 'text-rose-600',   bg: 'bg-rose-50' },
          ].map(({ label, val, num, bg }) => (
            <div key={label} className={`rounded-2xl px-2 py-3 text-center shadow-sm ${bg}`}>
              <div className={`text-xl font-black leading-none ${num}`}>{val}</div>
              <div className="text-[9px] font-black text-slate-400 uppercase tracking-wide mt-1">{label}</div>
            </div>
          ))}
        </div>

        <div className="relative px-4 pt-2">
          <Search size={15} className="absolute left-8 top-1/2 -translate-y-1/2 text-slate-400 mt-1" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or subject…"
            className="w-full bg-white border border-slate-200 rounded-2xl pl-10 pr-4 py-2.5 font-bold text-sm outline-none shadow-sm focus:border-blue-400 transition-colors" />
        </div>

        <div className="flex gap-2 overflow-x-auto px-4 py-2.5 pb-1 hide-scrollbar">
          {(['ALL', ...ROLE_OPTIONS] as const).map(r => (
            <button key={r} onClick={() => setRoleFilter(r as StaffRole | 'ALL')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wide transition-all ${
                roleFilter === r ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-500 border border-slate-200'
              }`}>
              {String(r).replace(/_/g, ' ')}
            </button>
          ))}
        </div>

        <div className="space-y-2 px-4 pt-1">
          {visibleStaff.map(member => (
            <button key={member.id} onClick={() => { setSelected(member); setTab('INFO'); setView('PROFILE'); }}
              className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3.5 text-left active:scale-[0.98] transition-transform">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 ${roleColor(member.role)}`}>
                  {member.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold text-slate-900 text-sm truncate">{member.name}</div>
                  <div className="text-[11px] font-bold text-slate-400 mt-0.5">
                    {member.role.replace(/_/g, ' ')}{member.subject && member.subject !== '—' ? ` · ${member.subject}` : ''}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide ${statusColor(member.status)}`}>
                    {member.status.replace('_', ' ')}
                  </span>
                  <span className="text-xs font-black text-slate-600">₹{(member.salary / 1000).toFixed(0)}K</span>
                </div>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center py-16 text-slate-400">
              <UserCheck size={32} className="mb-3 opacity-40" />
              <p className="font-bold text-sm">No staff found</p>
            </div>
          )}
          {remainingStaff > 0 && (
            <button onClick={() => setShown(s => s + 50)}
              className="w-full py-3 bg-white border border-slate-200 rounded-2xl font-black text-xs text-blue-700 hover:bg-blue-50 transition-colors">
              Load More ({remainingStaff} remaining)
            </button>
          )}
          {filtered.length > 0 && (
            <p className="text-center text-[10px] font-bold text-slate-300 pt-1 pb-2">
              Showing {visibleStaff.length} of {filtered.length} staff
            </p>
          )}
        </div>
      </div>
    </div>
  );

  // ─── CREATE view ───────────────────────────────────────────────────────────
  if (view === 'CREATE') return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {/* Full-screen submit overlay — blocks every tap while the staff
          create round-trip runs (auth user + staff row + salary history
          + class assignments + document uploads). Replaces the silent
          "is this hung?" period the principal used to stare at. */}
      {isSubmitting && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl px-8 py-6 flex flex-col items-center gap-3 max-w-xs">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/>
            <p className="font-black text-slate-900 text-sm">Adding staff…</p>
            <p className="text-[11px] font-bold text-slate-500 text-center leading-relaxed">
              Login account, salary history, documents set up ho rahe hain. 5–10 second lagega.
            </p>
          </div>
        </div>
      )}
      {renderHeader('Add Staff', () => setView('LIST'))}
      <div className="flex-1 overflow-y-auto p-4  space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
          {STAFF_TEXT_FIELDS.filter(f => f.key !== 'subject').map(({ label, key, placeholder }) => (
            <div key={key}>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">{label}</label>
              <input
                value={(form[key] ?? '') as string}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500 focus:bg-white transition-colors" />
            </div>
          ))}

          {/* Subject is teacher-only. Hide it entirely for non-TEACHER
              roles (DRIVER / PEON / ACCOUNTANT / OTHER) where it never
              applies — the optional dropdown was just visual noise on
              those records. */}
          {form.role === 'TEACHER' && (
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Subject</label>
            {createSubjectCustom ? (
              <div className="flex gap-2">
                <input
                  value={form.subject ?? ''}
                  onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                  placeholder="Type subject name"
                  autoFocus
                  className="flex-1 border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500 focus:bg-white transition-colors" />
                <button type="button"
                  onClick={() => { setCreateSubjectCustom(false); setForm(f => ({ ...f, subject: '' })); }}
                  className="px-3 py-3 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest">
                  List
                </button>
              </div>
            ) : (
              <select
                value={form.subject ?? ''}
                onChange={e => {
                  if (e.target.value === '__OTHER__') {
                    setForm(f => ({ ...f, subject: '' }));
                    setCreateSubjectCustom(true);
                  } else {
                    setForm(f => ({ ...f, subject: e.target.value }));
                  }
                }}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-blue-500 focus:bg-white transition-colors">
                <option value="">— Select subject (optional) —</option>
                {subjectOptions.map(s => <option key={s} value={s}>{s}</option>)}
                <option value="__OTHER__">+ Other (type a new one)…</option>
              </select>
            )}
          </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Role</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as StaffRole }))}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none">
                {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Monthly Salary (₹) *</label>
              <input type="number" value={form.salary} onChange={e => setForm(f => ({ ...f, salary: +e.target.value }))}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500" />
            </div>
          </div>
          {/* Login Mobile — TEACHER + DRIVER only. Other staff (peon,
              accountant, etc.) are records only and never log in, so this
              field is hidden entirely for them. Leaving this empty also
              skips user provisioning, useful when the staff member doesn't
              have a smartphone yet — principal can add it later via edit. */}
          {(form.role === 'TEACHER' || form.role === 'DRIVER') && (
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                Login Mobile · for app access
              </label>
              <input value={loginPhone} onChange={e => setLoginPhone(e.target.value)}
                placeholder="10-digit mobile used to log in"
                inputMode="numeric"
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500 focus:bg-white" />
              <p className="text-[10px] font-bold text-slate-400 mt-1.5 leading-relaxed">
                {form.role === 'TEACHER' ? 'Teacher' : 'Driver'} apne mobile se login karenge. Default password = mobile (first-login pe change karna padega). Khali chhodne par koi login account nahi banega — record sirf school ke paas rahega.
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Joining Date</label>
              <input type="date" value={form.joiningDate}
                onChange={e => {
                  const next = e.target.value;
                  setForm(f => ({
                    ...f,
                    joiningDate: next,
                    // Auto-shift salaryStartDate when the principal hasn't
                    // already manually picked one outside the auto-derived
                    // value. We treat "still equal to the previous default"
                    // as "untouched" so manual edits stick.
                    salaryStartDate:
                      f.salaryStartDate === firstOfNextMonth(f.joiningDate)
                        ? firstOfNextMonth(next)
                        : f.salaryStartDate,
                  }));
                }}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">First Salary From *</label>
              <input type="date" value={form.salaryStartDate}
                onChange={e => setForm(f => ({ ...f, salaryStartDate: e.target.value }))}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-blue-500" />
            </div>
          </div>
          <p className="text-[10px] font-bold text-slate-400 leading-relaxed">
            <span className="text-slate-600 font-black">First Salary From</span> = jis month se salary deni hai. Default: joining ke <span className="text-slate-600 font-black">agle month ki 1 tarikh</span> (kyunki joining day me partial salary nahi deni). The amount you enter is recorded as the &quot;Initial&quot; entry in salary history — revise any time from the Salary tab.
          </p>
        </div>

        {/* Optional documents — queued and uploaded after staff is created */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Documents (optional)</p>
              <p className="text-[10px] font-bold text-slate-400 mt-0.5">Add PAN, Aadhaar, resume etc. — uploaded after staff is created. You can also add later from the profile.</p>
            </div>
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border shrink-0 ${
              pendingDocs.length >= MAX_STAFF_DOCS
                ? 'bg-rose-50 text-rose-600 border-rose-200'
                : 'bg-slate-50 text-slate-500 border-slate-200'
            }`}>
              {pendingDocs.length}/{MAX_STAFF_DOCS}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <select value={docType} onChange={e => setDocType(e.target.value)}
              disabled={pendingDocs.length >= MAX_STAFF_DOCS}
              className="border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-blue-500 disabled:opacity-60">
              {DOC_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
            </select>
            <label className={`flex items-center justify-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-700 font-black text-xs rounded-xl px-3 py-2.5 cursor-pointer hover:bg-blue-100 transition-colors ${pendingDocs.length >= MAX_STAFF_DOCS ? 'opacity-60 pointer-events-none' : ''}`}>
              <Upload size={13}/>
              <span>Add File</span>
              <input type="file" accept="image/*,application/pdf" className="hidden"
                disabled={pendingDocs.length >= MAX_STAFF_DOCS}
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (!f) { e.target.value = ''; return; }
                  if (pendingDocs.length >= MAX_STAFF_DOCS) {
                    showToast(`Limit reached — max ${MAX_STAFF_DOCS} documents`, 'error');
                    e.target.value = '';
                    return;
                  }
                  setPendingDocs(p => [...p, { type: docType, file: f }]);
                  e.target.value = '';
                }} />
            </label>
          </div>

          {pendingDocs.length > 0 && (
            <div className="space-y-1.5">
              {pendingDocs.map((d, i) => (
                <div key={i} className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
                  <FileText size={13} className="text-slate-500 shrink-0"/>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-black text-slate-800 truncate">{d.file.name}</div>
                    <div className="text-[9px] font-bold text-slate-400">{d.type.replace('_', ' ')} · {(d.file.size / 1024).toFixed(0)} KB</div>
                  </div>
                  <button onClick={() => setPendingDocs(p => p.filter((_, idx) => idx !== i))}
                    className="p-1.5 bg-rose-100 text-rose-600 rounded-lg hover:bg-rose-200 transition-colors" title="Remove">
                    <Trash2 size={12}/>
                  </button>
                </div>
              ))}
            </div>
          )}

          <p className="text-[10px] font-bold text-slate-400">JPG/PNG/WEBP/HEIC/PDF · photo 1 MB · others 2 MB</p>
        </div>

        <button onClick={handleCreate} disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-60">
          {isSubmitting ? 'Adding…' : <><Plus size={16} /> Add Staff Member{pendingDocs.length > 0 ? ` + ${pendingDocs.length} doc${pendingDocs.length > 1 ? 's' : ''}` : ''}</>}
        </button>
      </div>
    </div>
  );

  // ─── EDIT view ─────────────────────────────────────────────────────────────
  if (view === 'EDIT' && selected) return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      {renderHeader('Edit Staff', () => setView('PROFILE'))}
      <div className="flex-1 overflow-y-auto p-4  space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
          {STAFF_TEXT_FIELDS.filter(f => f.key !== 'subject').map(({ label, key, placeholder }) => (
            <div key={key}>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">{label}</label>
              <input
                value={(editForm[key] ?? '') as string}
                onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500 focus:bg-white transition-colors" />
            </div>
          ))}

          {/* Subject is teacher-only. Hide for non-TEACHER roles —
              dropping the field cleans up the form for DRIVER / PEON /
              ACCOUNTANT staff who never have a subject. */}
          {editForm.role === 'TEACHER' && (
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Subject</label>
            {(() => {
              // Auto-flip into custom mode if the saved subject isn't in
              // the suggestions list — covers the case where edit opens
              // and the value was typed historically as Other.
              const showCustom =
                editSubjectCustom
                || (!!editForm.subject && !subjectOptions.includes(editForm.subject));
              return showCustom ? (
                <div className="flex gap-2">
                  <input
                    value={editForm.subject ?? ''}
                    onChange={e => setEditForm(f => ({ ...f, subject: e.target.value }))}
                    placeholder="Type subject name"
                    autoFocus
                    className="flex-1 border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500 focus:bg-white transition-colors" />
                  <button type="button"
                    onClick={() => { setEditSubjectCustom(false); setEditForm(f => ({ ...f, subject: '' })); }}
                    className="px-3 py-3 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest">
                    List
                  </button>
                </div>
              ) : (
                <select
                  value={editForm.subject ?? ''}
                  onChange={e => {
                    if (e.target.value === '__OTHER__') {
                      setEditForm(f => ({ ...f, subject: '' }));
                      setEditSubjectCustom(true);
                    } else {
                      setEditForm(f => ({ ...f, subject: e.target.value }));
                    }
                  }}
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-blue-500 focus:bg-white transition-colors">
                  <option value="">— Select subject (optional) —</option>
                  {subjectOptions.map(s => <option key={s} value={s}>{s}</option>)}
                  <option value="__OTHER__">+ Other (type a new one)…</option>
                </select>
              );
            })()}
          </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Role</label>
              <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value as StaffRole }))}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none">
                {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Joining Date</label>
              <input type="date" value={editForm.joiningDate} onChange={e => setEditForm(f => ({ ...f, joiningDate: e.target.value }))}
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">First Salary From</label>
            <input type="date" value={editForm.salaryStartDate}
              onChange={e => setEditForm(f => ({ ...f, salaryStartDate: e.target.value }))}
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-blue-500" />
            <p className="text-[10px] font-bold text-slate-400 mt-1 leading-relaxed">
              Salary ledger ke months iss tarikh se start honge. Past payments touch nahi honge.
            </p>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Status</label>
            <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value as StaffStatus }))}
              className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none">
              {(['ACTIVE', 'ON_LEAVE', 'SUSPENDED'] as StaffStatus[]).map(s => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
            <p className="text-[10px] font-bold text-slate-400 mt-1.5">
              Use the &quot;Set Relieving Date&quot; button on the Info tab to mark a staff member as RELIEVED — that flow records the date and reason.
            </p>
          </div>
          <p className="text-[10px] font-bold text-slate-400">
            Salary is managed from the Salary tab so every change is recorded with an effective-from date and reason. Use the &quot;Edit Salary&quot; button there.
          </p>
        </div>
        <button onClick={handleUpdate} disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-60">
          {isSubmitting ? 'Saving…' : <><Save size={16} /> Save Changes</>}
        </button>
      </div>
    </div>
  );

  // ─── PROFILE view (6 tabs) ─────────────────────────────────────────────────
  if (view === 'PROFILE' && selected) {
    // Wrap the whole profile so a render error in any tab falls back to
    // an error card instead of blanking the app.
    //
    // CRITICAL: we INVOKE renderStaffProfileBody() instead of using
    // <StaffProfileBody /> as a component. Earlier the JSX form created
    // a fresh function reference every render of StaffManager, which
    // React treats as a different component type → unmount+remount the
    // whole subtree on each keystroke → input loses focus and the
    // mobile keyboard collapses. Calling it as a plain function returns
    // an already-built JSX tree that reconciles cleanly.
    return (
      <ErrorBoundary label="Staff profile">
        {renderStaffProfileBody()}
      </ErrorBoundary>
    );
  }

  // Note this is a regular helper, not a component. It accesses the parent
  // hooks via closure but doesn't itself call any hooks — verified safe.
  function renderStaffProfileBody(): React.ReactElement | null {
    if (!selected) return null;
    const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
      { id: 'INFO',       label: 'Info',       icon: <UserCheck size={14} /> },
      { id: 'SALARY',     label: 'Salary',     icon: <IndianRupee size={14} /> },
      { id: 'ATTENDANCE', label: 'Attendance', icon: <Calendar size={14} /> },
      { id: 'CLASSES',    label: 'Classes',    icon: <BookOpen size={14} /> },
      { id: 'DOCS',       label: 'Docs',       icon: <FileText size={14} /> },
      { id: 'LOG',        label: 'Log',        icon: <History size={14} /> },
    ];

    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        {renderHeader(selected.name, () => setView('LIST'),
          editorModeActive ? (
            <button onClick={() => { setEditForm({ ...selected }); setView('EDIT'); }}
              title="Edit staff (Editor Mode)"
              className="p-2 bg-slate-100 rounded-full text-slate-600">
              <Edit3 size={18} />
            </button>
          ) : null,
        )}

        {/* Identity card */}
        <div className="bg-white border-b border-slate-100 px-4 pt-3 pb-3">
          <div className="flex items-center gap-3">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl shrink-0 ${roleColor(selected.role)}`}>
              {selected.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-black text-slate-900">{selected.name}</div>
              <div className="flex flex-wrap gap-1.5 mt-1">
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${roleColor(selected.role)}`}>{selected.role.replace('_', ' ')}</span>
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${statusColor(selected.status)}`}>{selected.status.replace('_', ' ')}</span>
                {selected.relievingDate && (
                  <span className="text-[9px] font-black px-2 py-0.5 rounded-full uppercase bg-slate-200 text-slate-700">
                    Relieved {fmtDate(selected.relievingDate)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tab strip */}
        <div className="bg-white border-b border-slate-100 overflow-x-auto hide-scrollbar sticky top-0 z-10">
          <div className="flex">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-3 text-[10px] font-black uppercase tracking-wide whitespace-nowrap border-b-2 transition-colors ${
                  tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400'
                }`}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-24">
          {tabLoading && tab !== 'INFO' && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex justify-center text-slate-400">
              <Loader2 size={20} className="animate-spin" />
            </div>
          )}

          {tab === 'INFO' && (
            <>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Contact</p>
                <div className="flex items-center gap-2"><Phone size={13} className="text-slate-400" /><span className="text-xs font-bold text-slate-600">{selected.phone || '—'}</span></div>
                <div className="flex items-center gap-2"><Mail size={13} className="text-slate-400" /><span className="text-xs font-bold text-slate-600">{selected.email || '—'}</span></div>
                {selected.aadhaarNo && <div className="text-xs font-bold text-slate-500">Aadhaar: {selected.aadhaarNo}</div>}
                {selected.address && <div className="text-xs font-bold text-slate-400 pt-1">{selected.address}</div>}
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Salary',  val: `₹${(selected.salary / 1000).toFixed(0)}K/mo`, color: 'text-emerald-600' },
                  { label: 'Joined',  val: selected.joiningDate.slice(0, 7), color: 'text-slate-700' },
                  { label: 'Classes', val: selected.assignedClasses.length > 0 ? selected.assignedClasses.length : '—', color: 'text-blue-600' },
                ].map(({ label, val, color }) => (
                  <div key={label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 text-center">
                    <div className={`text-base font-black ${color}`}>{val}</div>
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>

              {selected.relievingDate && (
                <div className="bg-slate-100 rounded-2xl p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Relieving</p>
                  <div className="text-xs font-black text-slate-800">{fmtDate(selected.relievingDate)}</div>
                  {selected.relievingReason && <div className="text-xs font-bold text-slate-500 mt-1">{selected.relievingReason}</div>}
                </div>
              )}

              <div className="space-y-2">
                {selected.status !== 'RELIEVED' && editorModeActive && (
                  <>
                    <button onClick={() => { setRelieveDate(todayIso()); setRelieveReason(''); setRelieveOpen(true); }}
                      className="w-full py-3 rounded-2xl font-black text-sm bg-amber-50 text-amber-700 border border-amber-200 active:scale-95 transition-transform">
                      Set Relieving Date
                    </button>
                    {/* Suspend / Reinstate is only meaningful while staff is in
                        the active lifecycle. Once RELIEVED the only valid
                        forward state is staying RELIEVED, so the action is
                        hidden to keep the lifecycle log truthful. */}
                    <button onClick={() => setConfirmSuspend(selected)}
                      className={`w-full py-3 rounded-2xl font-black text-sm active:scale-95 transition-transform ${selected.status === 'SUSPENDED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                      {selected.status === 'SUSPENDED' ? 'Reinstate Staff Member' : 'Suspend Staff Member'}
                    </button>
                  </>
                )}
                {selected.status !== 'RELIEVED' && !editorModeActive && (
                  <p className="text-[10px] font-bold text-slate-400 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-center">
                    Enable Editor Mode (Settings → Security) to suspend or set relieving date.
                  </p>
                )}
                {selected.status === 'RELIEVED' && (
                  <>
                    {/* Rejoin — for the genuine "teacher came back next year"
                        case. Server endpoint clears relieving_date/reason,
                        flips status to ACTIVE, re-enables the auth user.
                        Class assignments / permissions still need to be
                        re-added separately so the lifecycle log reflects
                        re-onboarding, not "as if nothing happened". */}
                    <button onClick={() => setConfirmRejoin(selected)}
                      className="w-full py-3 rounded-2xl font-black text-sm bg-emerald-50 text-emerald-700 border border-emerald-200 active:scale-95 transition-transform">
                      Rejoin Staff Member
                    </button>
                    <p className="text-[10px] font-bold text-slate-400 text-center px-3">
                      Rejoining clears the relieving date and re-enables login.
                      You'll need to re-assign their classes & permissions.
                    </p>
                  </>
                )}
              </div>

              {selected.role === 'TEACHER' && (
                <SchoolPermissionsCard staffId={selected.id} />
              )}
            </>
          )}

          {tab === 'SALARY' && !tabLoading && (
            // ErrorBoundary keeps the white-screen on a render error confined
            // to this tab. Earlier a corrupted salary-history entry (one
            // pre-prod row had a non-ISO effective_from) tripped buildMonthlyGrid
            // and the entire app blanked out the moment a payment was recorded
            // — the pay POST succeeded but the optimistic re-render killed
            // everything.
            <ErrorBoundary label="Salary tab">
            <SalaryTab
              staff={selected}
              salaryHistory={salaryHistory}
              paymentHistory={paymentHistory}
              canEdit={editorModeActive}
              onReversePayment={openReversePayment}
              onEditSalary={() => { setEditSalaryAmt(String(selected.salary)); setEditSalaryFrom(todayIso()); setEditSalaryReason(''); setEditSalaryOpen(true); }}
              onOpenPayModal={(month, expected) => {
                setPayMonth(month);
                setPayAmt(String(expected));
                setPayMethod('BANK_TRANSFER');
                setPayTxn(''); setPayNote('');
                setPayOpen(true);
              }}
            />
            </ErrorBoundary>
          )}

          {tab === 'ATTENDANCE' && !tabLoading && (() => {
            if (staffAttLoading) return (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 text-center text-slate-400">
                <Loader2 size={20} className="mx-auto animate-spin opacity-60"/>
              </div>
            );
            if (!staffAttendance) return (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 text-center text-slate-400">
                <Calendar size={28} className="mx-auto mb-2 opacity-40"/>
                <p className="font-bold text-sm">No attendance recorded in the last 90 days.</p>
              </div>
            );
            const c = staffAttendance.counts;
            const workDays = (c.PRESENT ?? 0) + (c.ABSENT ?? 0) + (c.HALF_DAY ?? 0) + (c.LATE ?? 0);
            const pct = workDays > 0
              ? Math.round((((c.PRESENT ?? 0) + (c.LATE ?? 0) + (c.HALF_DAY ?? 0) * 0.5) / workDays) * 100)
              : null;
            const STATUS_TINT: Record<string, string> = {
              PRESENT: 'bg-emerald-500', ABSENT: 'bg-rose-500',
              HALF_DAY: 'bg-amber-400', LEAVE: 'bg-blue-400',
              LATE: 'bg-violet-400', HOLIDAY: 'bg-slate-300',
            };
            return (
              <div className="space-y-3">
                {/* Headline % + 90-day window note */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Last 90 Days</p>
                    <p className="text-2xl font-black text-slate-900 mt-0.5">{pct === null ? '—' : `${pct}%`}</p>
                    <p className="text-[10px] font-bold text-slate-400">attendance rate · {workDays} working days</p>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Calendar size={20}/>
                  </div>
                </div>

                {/* Status breakdown */}
                <div className="grid grid-cols-3 gap-2">
                  {(['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'LATE', 'HOLIDAY'] as const).map(k => (
                    <div key={k} className="bg-white border border-slate-100 rounded-xl p-2.5 text-center">
                      <div className="text-base font-black text-slate-900">{c[k] ?? 0}</div>
                      <div className="text-[9px] font-black text-slate-400 uppercase tracking-wide mt-0.5">{k.replace('_', ' ')}</div>
                    </div>
                  ))}
                </div>

                {/* Recent days strip */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Recent</p>
                  <div className="flex flex-wrap gap-1.5">
                    {staffAttendance.days.slice(-30).reverse().map(d => (
                      <div key={d.date} className="flex flex-col items-center" title={`${d.date} · ${d.status}`}>
                        <div className={`w-7 h-7 rounded-md ${STATUS_TINT[d.status] ?? 'bg-slate-200'}`}/>
                        <div className="text-[8px] font-bold text-slate-400 mt-0.5">{new Date(d.date).getDate()}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="text-[10px] font-bold text-slate-400 text-center">
                  Attendance is shown for visibility only — salary is fixed monthly per the simple model.
                </p>
              </div>
            );
          })()}

          {tab === 'CLASSES' && !tabLoading && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Assigned Classes</p>
              {selected.assignedClasses.length === 0 ? (
                <p className="text-xs font-bold text-slate-400 py-3 text-center">No classes assigned in the active year.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {selected.assignedClasses.map(cls => (
                    <span key={cls} className="text-xs font-black bg-blue-50 text-blue-700 px-3 py-1 rounded-xl">{cls}</span>
                  ))}
                </div>
              )}
              <p className="text-[10px] font-bold text-slate-400 mt-3">Use Edit to revise class assignments for the active academic year.</p>
            </div>
          )}

          {tab === 'DOCS' && !tabLoading && (
            <>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Upload Document</p>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                    docs.length >= MAX_STAFF_DOCS
                      ? 'bg-rose-50 text-rose-600 border-rose-200'
                      : 'bg-slate-50 text-slate-500 border-slate-200'
                  }`}>
                    {docs.length}/{MAX_STAFF_DOCS}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select value={docType} onChange={e => setDocType(e.target.value)}
                    disabled={docs.length >= MAX_STAFF_DOCS}
                    className="border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none disabled:opacity-60">
                    {DOC_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                  </select>
                  <label className={`flex items-center justify-center gap-2 bg-blue-600 text-white text-xs font-black rounded-xl px-4 py-2.5 cursor-pointer active:scale-95 transition-transform ${(docBusy || docs.length >= MAX_STAFF_DOCS) ? 'opacity-60 pointer-events-none' : ''}`}>
                    {docBusy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    <span>{docBusy ? 'Uploading…' : 'Choose File'}</span>
                    <input type="file" accept="image/*,application/pdf" className="hidden"
                      disabled={docs.length >= MAX_STAFF_DOCS}
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }} />
                  </label>
                </div>
                <p className="text-[10px] font-bold text-slate-400">
                  JPG/PNG/WEBP/HEIC/PDF · photo 1 MB · others 2 MB · max {MAX_STAFF_DOCS} per staff
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Submitted Documents</p>
                {docs.length === 0 ? (
                  <p className="text-xs font-bold text-slate-400 py-3 text-center">No documents uploaded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {docs.map(d => (
                      <div key={d.id} className="flex items-center justify-between bg-slate-50 rounded-xl p-3">
                        <div className="min-w-0 flex-1">
                          <div className="font-black text-slate-800 text-xs truncate">{d.docName}</div>
                          <div className="text-[10px] font-bold text-slate-400 mt-0.5">{d.docType.replace('_', ' ')} · {fmtDate(d.uploadedAt)}</div>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => handleViewDoc(d.storagePath)} className="p-2 bg-blue-100 text-blue-600 rounded-lg active:scale-90 hover:bg-blue-200 transition-all" title="View">
                            <Eye size={13} />
                          </button>
                          <button onClick={() => handleDownloadDoc(d.storagePath, d.docName)} className="p-2 bg-emerald-100 text-emerald-600 rounded-lg active:scale-90 hover:bg-emerald-200 transition-all" title="Download">
                            <Download size={13} />
                          </button>
                          <button onClick={() => handleDeleteDoc(d.id)} className="p-2 bg-rose-100 text-rose-600 rounded-lg active:scale-90 hover:bg-rose-200 transition-all" title="Delete">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {tab === 'LOG' && !tabLoading && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Status History</p>
              {statusHistory.length === 0 ? (
                <p className="text-xs font-bold text-slate-400 py-3 text-center">No status changes recorded.</p>
              ) : (
                <div className="space-y-2">
                  {statusHistory.map(h => (
                    <div key={h.id} className="flex items-start gap-3 bg-slate-50 rounded-xl p-3">
                      <BadgeAlert size={14} className="text-slate-400 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-black text-slate-800">
                          {h.oldStatus ? `${h.oldStatus.replace('_', ' ')} → ${h.newStatus.replace('_', ' ')}` : h.newStatus.replace('_', ' ')}
                        </div>
                        <div className="text-[10px] font-bold text-slate-400 mt-0.5">{fmtDate(h.changedAt)}{h.reason ? ` · ${h.reason}` : ''}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── Edit Salary modal ───────────────────────────────────────────── */}
        {editSalaryOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-end justify-center sm:items-center">
            <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl p-6 pb-8 animate-in slide-in-from-bottom-8 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-black text-slate-900">Edit Salary</h3>
                <button onClick={() => setEditSalaryOpen(false)} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500"><X size={16} /></button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">New Monthly Salary (₹)</label>
                  <input type="number" value={editSalaryAmt} onChange={e => setEditSalaryAmt(e.target.value)}
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-black text-slate-900 text-lg outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Effective From</label>
                  <input type="date" value={editSalaryFrom} onChange={e => setEditSalaryFrom(e.target.value)}
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Reason</label>
                  <input value={editSalaryReason} onChange={e => setEditSalaryReason(e.target.value)}
                    placeholder="Annual revision, promotion, etc."
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500" />
                </div>
              </div>
              <button onClick={handleEditSalary} disabled={editSalaryBusy}
                className="mt-5 w-full py-3 bg-blue-600 text-white font-black text-sm rounded-xl disabled:opacity-40 flex items-center justify-center gap-2">
                {editSalaryBusy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {editSalaryBusy ? 'Saving…' : 'Save Salary'}
              </button>
            </div>
          </div>
        )}

        {/* ─── Pay modal ───────────────────────────────────────────────────── */}
        {payOpen && (
          // fixed (not absolute) so the modal renders over the whole
          // viewport — including the sidebar — instead of being clipped
          // to the staff panel's bounds. On desktop the sheet centres
          // itself with a max-width so it doesn't sprawl across the
          // entire screen; on mobile it stays a bottom sheet.
          <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-end justify-center sm:items-center">
            <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl p-6 pb-8 animate-in slide-in-from-bottom-8 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-black text-slate-900">Record Payment</h3>
                <button onClick={() => setPayOpen(false)} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500"><X size={16} /></button>
              </div>
              <p className="text-[10px] font-bold text-slate-400 mb-3">{selected.name}</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Month</label>
                  <input value={payMonth} onChange={e => setPayMonth(e.target.value)}
                    placeholder="e.g. April 2026"
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Amount Paid (₹)</label>
                  <input type="number" value={payAmt} onChange={e => setPayAmt(e.target.value)}
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-black text-slate-900 text-lg outline-none focus:border-blue-500" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Method</label>
                    <select value={payMethod} onChange={e => setPayMethod(e.target.value as SalaryPaymentMethod)}
                      className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none">
                      {PAY_METHODS.map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Txn ID (optional)</label>
                    <input value={payTxn} onChange={e => setPayTxn(e.target.value)}
                      placeholder="UTR / Cheque #"
                      className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-blue-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Note (optional)</label>
                  <input value={payNote} onChange={e => setPayNote(e.target.value)}
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500" />
                </div>

                {/* Advanced — back-date a payment that was actually given
                    earlier (e.g. cash on the 1st but recorded on the 3rd).
                    Default stays today so the common path is one click. */}
                <button type="button"
                  onClick={() => setPayAdvancedOpen(v => !v)}
                  className="w-full text-left text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-700 transition-colors flex items-center justify-between">
                  <span>Advanced</span>
                  <span className="text-slate-400">{payAdvancedOpen ? '−' : '+'}</span>
                </button>
                {payAdvancedOpen && (
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Paid on</label>
                    <input
                      type="date"
                      value={payDate}
                      max={todayIso()}
                      onChange={e => setPayDate(e.target.value)}
                      className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-blue-500" />
                    <p className="text-[10px] font-bold text-slate-400 mt-1">
                      Defaults to today. Change only if the payment was actually disbursed on a different date.
                    </p>
                  </div>
                )}
              </div>
              <button onClick={handlePay} disabled={payBusy || !payAmt}
                className="mt-5 w-full py-3 bg-emerald-600 text-white font-black text-sm rounded-xl disabled:opacity-40 flex items-center justify-center gap-2">
                {payBusy ? <Loader2 size={14} className="animate-spin" /> : <IndianRupee size={14} />}
                {payBusy ? 'Saving…' : 'Save Payment'}
              </button>
            </div>
          </div>
        )}

        {/* ─── Relieving date modal ───────────────────────────────────────── */}
        {relieveOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-end justify-center sm:items-center">
            <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl p-6 pb-8 animate-in slide-in-from-bottom-8 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-black text-slate-900">Set Relieving Date</h3>
                <button onClick={() => setRelieveOpen(false)} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500"><X size={16} /></button>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex gap-2">
                <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
                <p className="text-[11px] font-bold text-amber-700">This will mark {selected.name} as RELIEVED. Salary reminders will stop after the relieving date.</p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Relieving Date</label>
                  <input type="date" value={relieveDate} onChange={e => setRelieveDate(e.target.value)}
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-3 font-bold text-sm outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Reason *</label>
                  <textarea value={relieveReason} onChange={e => setRelieveReason(e.target.value)}
                    rows={3} required placeholder="Resignation / End of contract / Termination…"
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500 resize-none" />
                </div>
              </div>
              <button onClick={handleRelieve} disabled={relieveBusy}
                className="mt-5 w-full py-3 bg-amber-600 text-white font-black text-sm rounded-xl disabled:opacity-40 flex items-center justify-center gap-2">
                {relieveBusy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {relieveBusy ? 'Saving…' : 'Confirm Relieving'}
              </button>
            </div>
          </div>
        )}

        {/* Reverse-payment confirmation. Replaces a window.prompt() that
            showed the dev hostname as the dialog title on Codespaces. */}
        {reverseTarget && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-end justify-center sm:items-center p-4"
            onClick={() => !reverseBusy && setReverseTarget(null)}>
            <div onClick={e => e.stopPropagation()}
              className="w-full sm:max-w-md bg-white rounded-3xl p-5 pb-6 animate-in slide-in-from-bottom-4 sm:zoom-in-95">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-11 h-11 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                  <AlertTriangle size={20}/>
                </div>
                <div className="min-w-0">
                  <p className="text-base font-black text-slate-900">Reverse this payment?</p>
                  <p className="text-[11px] font-bold text-slate-400 mt-0.5 truncate">
                    {fmtIN(reverseTarget.amount)} · {reverseTarget.month}
                  </p>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 flex gap-2">
                <AlertTriangle size={13} className="text-amber-600 mt-0.5 shrink-0"/>
                <p className="text-[11px] font-bold text-amber-700 leading-relaxed">
                  Reversal works only within 24 hours of the original payment.
                  A negative entry will be added; the original row stays for audit.
                </p>
              </div>
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Reason *</span>
                <textarea
                  value={reverseReason}
                  onChange={e => setReverseReason(e.target.value)}
                  rows={3}
                  placeholder="Wrong amount / wrong staff / cash bounced…"
                  className="mt-1 w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 font-bold text-sm outline-none focus:border-rose-500 resize-none"
                />
              </label>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setReverseTarget(null)}
                  disabled={reverseBusy}
                  className="flex-1 py-3 bg-slate-100 text-slate-700 font-black rounded-2xl text-sm uppercase tracking-widest active:scale-95 transition-transform disabled:opacity-50">
                  Cancel
                </button>
                <button
                  onClick={submitReversePayment}
                  disabled={reverseBusy || !reverseReason.trim()}
                  className="flex-1 flex items-center justify-center gap-1.5 py-3 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-2xl text-sm uppercase tracking-widest active:scale-95 transition-transform disabled:opacity-60">
                  {reverseBusy ? 'Reversing…' : <><AlertTriangle size={14}/> Reverse</>}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
};
