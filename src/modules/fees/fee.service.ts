// Supabase-backed fee service.
//
// Strategy: Atomic writes go through SECURITY DEFINER RPCs (record_fee_payment,
// record_govt_payment, generate_student_fee_schedule). Reads pull from
// fee_installments + payment_records and are cached in memory so the existing
// FeeLedger / FeesView synchronous accessor pattern keeps working — components
// only need to call `await refreshAll()` once on mount and after any write.

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { registerCacheResetter } from '@/lib/cacheBus';
import { apiFees, apiPrincipal } from '@/lib/apiClient';
import type {
  FeeUploadStatus, FeePaymentUploadRecord,
  BillingCycle, FeeStructureType, FeeStructureRecord,
} from '@/modules/fees/fees.types';
// NOTE: All writes go through /api/fees/* — writeOffFee migrated to server

// ─── Types ────────────────────────────────────────────────────────────────────

export type FeeType = 'TUITION' | 'TRANSPORT' | 'EXAM' | 'OTHER';
// CANCELLED is written by `cancelTransportInstallmentsAfter` for partially-paid
// transport installments after a vehicle change/un-assign — frozen at the paid
// portion so historical receipts still tie out. UI must render it (it does NOT
// indicate a future bill).
// Status values:
//   • UPCOMING     — due_date in the future, nothing paid yet (slate UI)
//   • DUE          — due_date today/past, balance > 0, no payment yet (rose)
//   • PARTIAL      — paid > 0, balance > 0, due_date still in future (amber)
//   • PARTIAL_DUE  — paid > 0, balance > 0, due_date passed (rose, action needed)
//   • PAID         — fully cleared (paid + write-off ≥ amount)
//   • WAIVED / WRITTEN_OFF / CANCELLED — terminal states set explicitly by ops
//   • UNPAID / OVERDUE — legacy values from older rows; the JS layer always
//     overrides them via computeEffectiveStatus() on read so the UI never
//     shows stale categories.
export type FeeStatus = 'PAID' | 'PARTIAL' | 'PARTIAL_DUE' | 'UPCOMING' | 'DUE' | 'UNPAID' | 'OVERDUE' | 'WAIVED' | 'WRITTEN_OFF' | 'CANCELLED';
export type PayerType = 'PARENT' | 'GOVERNMENT';

export interface PaymentRecord {
  id: string;
  studentId: string;
  studentName: string;
  className: string;
  admissionNo: string;
  amount: number;
  method: string;
  date: string;
  receiptNo: string;
  installmentIds: string[];
  installmentDetails: { month: string; feeType: FeeType; amount: number }[];
  advanceAmount: number;
  note?: string;
  createdAt?: string;
  // Reversal metadata. If `reversedAt` is set, this row was reversed by a later
  // negative-amount entry whose id is `reversedByPaymentId`. If `reversesPaymentId`
  // is set, THIS row IS the reversal of an earlier payment.
  reversedAt?: string;
  reversedBy?: string;
  reversalReason?: string;
  reversesPaymentId?: string;
  // Discount applied at payment time. Stored on payment_records.discount_amount.
  // Surfaced on PaymentRecord so Payment History can show it as a separate
  // sub-line under the cash-received row, matching the spec where a
  // discount is its own ledger entry alongside the payment.
  discountAmount?: number;
}

export interface FeeInstallment {
  id: string;
  studentId: string;
  academicYearId: string;
  month: string;
  dueDate: string;
  feeType: FeeType;
  /** Original fee-head name from the fee_structures.fee_heads JSON
   *  (e.g. "Library Fees", "Smart Class Fee"). NULL on legacy rows
   *  generated before migration 0106; UI falls back to feeType then. */
  headName: string | null;
  amount: number;
  paidAmount: number;
  writeOffAmount: number;
  writeOffReason: string;
  status: FeeStatus;
  payerType: PayerType;
  relatedId?: string;
}

export interface StudentTransportAssignment {
  id: string;
  studentId: string;
  academicYearId: string;
  vehicleId: string;
  stopId: string;
  monthlyAmount: number;
  startDate: string;
  endDate: string | null;
}

export interface StudentFeeProfile {
  studentId: string;
  name: string;
  className: string;
  admissionNo: string;
  /** Optional — surfaces in the FeeLedger list card so the principal
   *  can disambiguate students who share a name. Falls back to '' when
   *  not yet hydrated from the slim list (older callers). */
  rollNo?: string;
  academicYearId: string;
  installments: FeeInstallment[];
  isRte: boolean;
}

// GovernmentPaymentRecord removed — government_payments table dropped.
// See migration 0083_drop_govt_payments.sql. Components that previously
// consumed this should record govt grants as regular payments with a note.

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSchoolId(): string {
  const id = useAuthStore.getState().session?.schoolId;
  if (!id) throw new Error('No school in session');
  return id;
}

interface InstallmentRow {
  id: string; student_id: string; academic_year_id: string;
  month: string; due_date: string; fee_type: string;
  head_name: string | null;
  amount: number; paid_amount: number; write_off_amount: number;
  write_off_reason: string | null; status: string;
  payer_type: string; related_id: string | null;
}

const INST_FIELDS = 'id, student_id, academic_year_id, month, due_date, fee_type, head_name, amount, paid_amount, write_off_amount, write_off_reason, status, payer_type, related_id';

/** Today's date in IST (Asia/Kolkata), YYYY-MM-DD. We never use the raw UTC
 *  date here because school operations are IST: a parent opening the app at
 *  5 AM IST on Apr 5 must see Apr 5 as today, not "2025-04-04" (UTC). */
function todayIST(): string {
  // 'en-CA' locale formats as YYYY-MM-DD natively, so no manual splitting.
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/** Compute the effective status the UI should show. Cron-free: derived every
 *  read from amount, paid_amount, write_off_amount and due_date.
 *
 *  Decision order (precedence top → bottom):
 *    1. Terminal DB states win (WAIVED / WRITTEN_OFF / CANCELLED)
 *    2. Fully cleared → PAID
 *    3. Partially paid + due_date passed → PARTIAL_DUE  (rose, action needed)
 *    4. Partially paid + still future       → PARTIAL    (amber, on track)
 *    5. Nothing paid + due_date passed      → DUE         (rose)
 *    6. Otherwise                           → UPCOMING    (slate, info)
 */
function computeEffectiveStatus(
  amount: number, paidAmount: number, writeOff: number,
  dueDate: string | null | undefined, dbStatus: string,
): FeeStatus {
  if (dbStatus === 'WAIVED' || dbStatus === 'WRITTEN_OFF' || dbStatus === 'CANCELLED') {
    return dbStatus;
  }
  const balance = Math.max(0, amount - paidAmount - writeOff);
  if (balance <= 0) return 'PAID';
  // Missing due_date — legacy / hand-inserted rows may have null. Treat as
  // not-yet-due so a freshly-typed row doesn't flip to DUE on first read
  // (empty string compared against today otherwise satisfied "<=" trivially).
  if (!dueDate) return paidAmount > 0 ? 'PARTIAL' : 'UPCOMING';
  const today = todayIST();
  const datePassed = dueDate <= today;
  if (paidAmount > 0) return datePassed ? 'PARTIAL_DUE' : 'PARTIAL';
  return datePassed ? 'DUE' : 'UPCOMING';
}

function rowToInstallment(r: InstallmentRow): FeeInstallment {
  const amount    = Number(r.amount);
  const paid      = Number(r.paid_amount);
  const writeOff  = Number(r.write_off_amount);
  return {
    id: r.id,
    studentId: r.student_id,
    academicYearId: r.academic_year_id,
    month: r.month,
    dueDate: r.due_date,
    feeType: (r.fee_type as FeeType) ?? 'OTHER',
    headName: r.head_name ?? null,
    amount,
    paidAmount: paid,
    writeOffAmount: writeOff,
    writeOffReason: r.write_off_reason ?? '',
    status: computeEffectiveStatus(amount, paid, writeOff, r.due_date, r.status),
    payerType: (r.payer_type as PayerType) ?? 'PARENT',
    relatedId: r.related_id ?? undefined,
  };
}

// ─── In-memory cache (scoped to current session/school) ──────────────────────

let _installmentsCache: FeeInstallment[] = [];
let _paymentHistoryCache: PaymentRecord[] = [];
let _advanceCache = new Map<string, number>();
let _cacheLoadedFor: string | null = null;
// In-flight refresh promise — coalesces concurrent refreshAll() calls so
// rapid writes (back-to-back recordPayment, transport ops, etc.) don't fan
// out N parallel reads that race against each other.
let _refreshInFlight: Promise<void> | null = null;

// Drop everything so the next refreshAll() pulls fresh rows. Wired to the
// cache bus so AcademicYearContext can flush us on year switch.
function _resetCache(): void {
  _installmentsCache = [];
  _paymentHistoryCache = [];
  _advanceCache = new Map<string, number>();
  _cacheLoadedFor = null;
  _refreshInFlight = null;
}
registerCacheResetter(_resetCache);

// ─── Cache refresh ───────────────────────────────────────────────────────────

async function _loadInstallments(schoolId: string): Promise<void> {
  const { data, error } = await supabase
    .from('fee_installments').select(INST_FIELDS)
    .eq('school_id', schoolId)
    .order('due_date', { ascending: true })
    // Safety cap. Above this (≈ 800 students × 12 months × 3 heads ≈ 28k)
    // the cache pattern stops being practical and the app should switch
    // to pagination + per-student fetch. Better to truncate visibly than
    // silently OOM the browser.
    .limit(50000);
  if (error) throw new Error(error.message);
  _installmentsCache = ((data ?? []) as InstallmentRow[]).map(rowToInstallment);
}

// Differential refresh — replace ONE student's installments + linked
// payment-history rows in the in-memory cache instead of refetching the
// whole school. Use after a write that affects a single student
// (recordPayment, writeOff, regenerateSchedule for that student). Avoids
// the O(school) reload cost on every payment, so the FeeLedger stays
// snappy regardless of total student count.
async function _refreshOneStudent(studentId: string): Promise<void> {
  const schoolId = getSchoolId();
  // 1. Pull this student's installments fresh.
  const { data: instData, error: instErr } = await supabase
    .from('fee_installments').select(INST_FIELDS)
    .eq('school_id', schoolId)
    .eq('student_id', studentId)
    .order('due_date', { ascending: true });
  if (instErr) throw new Error(instErr.message);
  const fresh = ((instData ?? []) as InstallmentRow[]).map(rowToInstallment);

  // Replace this student's rows in cache (preserve other students).
  _installmentsCache = [
    ..._installmentsCache.filter(i => i.studentId !== studentId),
    ...fresh,
  ];

  // 2. Pull this student's recent payments (cap at 100 — UI never shows
  // more) and rewire payment_installment_links for them.
  const { data: payRows } = await supabase
    .from('payment_records')
    .select('id, student_id, amount, method, date, receipt_no, advance_amount, discount_amount, note, created_at, reverses_payment_id, reversed_at, reversed_by, reversal_reason, students(name, admission_no)')
    .eq('school_id', schoolId).eq('student_id', studentId)
    .order('date', { ascending: false }).order('created_at', { ascending: false })
    .limit(100);

  const payments = (payRows ?? []) as unknown as Array<{
    id: string; student_id: string; amount: number; method: string;
    date: string; receipt_no: string; advance_amount: number; discount_amount: number | null;
    note: string | null; created_at: string;
    reverses_payment_id: string | null; reversed_at: string | null;
    reversed_by: string | null; reversal_reason: string | null;
    students: { name: string; admission_no: string } | { name: string; admission_no: string }[] | null;
  }>;
  const flatPayments = payments.map(p => ({
    ...p,
    students: Array.isArray(p.students) ? (p.students[0] ?? null) : p.students,
  }));

  if (flatPayments.length) {
    const ids = flatPayments.map(p => p.id);
    const { data: linksData } = await supabase
      .from('payment_installment_links')
      .select('payment_id, installment_id, amount_applied, fee_installments(month, fee_type, amount)')
      .in('payment_id', ids);
    type LinkRow = {
      payment_id: string; installment_id: string; amount_applied: number;
      fee_installments: { month: string; fee_type: string; amount: number } | { month: string; fee_type: string; amount: number }[] | null;
    };
    const linksByPayment = new Map<string, Array<{ installment_id: string; amount_applied: number; fee_installments: { month: string; fee_type: string; amount: number } | null }>>();
    for (const l of ((linksData ?? []) as LinkRow[])) {
      const flat = { installment_id: l.installment_id, amount_applied: l.amount_applied,
        fee_installments: Array.isArray(l.fee_installments) ? (l.fee_installments[0] ?? null) : l.fee_installments };
      const arr = linksByPayment.get(l.payment_id) ?? [];
      arr.push(flat);
      linksByPayment.set(l.payment_id, arr);
    }

    const refreshedPayments: PaymentRecord[] = flatPayments.map(p => {
      const lk = linksByPayment.get(p.id) ?? [];
      return {
        id: p.id,
        studentId: p.student_id,
        studentName: p.students?.name ?? '',
        className: '',
        admissionNo: p.students?.admission_no ?? '',
        amount: Number(p.amount),
        method: p.method,
        date: p.date,
        receiptNo: p.receipt_no,
        installmentIds: lk.map(l => l.installment_id),
        installmentDetails: lk.map(l => ({
          month: l.fee_installments?.month ?? '',
          feeType: (l.fee_installments?.fee_type as FeeType) ?? 'OTHER',
          amount: Number(l.amount_applied),
        })),
        advanceAmount: Number(p.advance_amount),
        discountAmount: Number(p.discount_amount ?? 0) || undefined,
        note: p.note ?? undefined,
        createdAt: p.created_at,
        reversedAt: p.reversed_at ?? undefined,
        reversedBy: p.reversed_by ?? undefined,
        reversalReason: p.reversal_reason ?? undefined,
        reversesPaymentId: p.reverses_payment_id ?? undefined,
      };
    });

    // Replace this student's payments in cache, dedupe by id (a write may
    // have produced a new row that wasn't in the previous cache).
    const otherPayments = _paymentHistoryCache.filter(p => p.studentId !== studentId);
    _paymentHistoryCache = [...refreshedPayments, ...otherPayments]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  } else {
    _paymentHistoryCache = _paymentHistoryCache.filter(p => p.studentId !== studentId);
  }

  // 3. Refresh advance for this student.
  const { data: advRow } = await supabase
    .from('advance_balances').select('amount')
    .eq('student_id', studentId).maybeSingle();
  const advAmt = (advRow as { amount: number } | null)?.amount ?? 0;
  if (advAmt > 0) _advanceCache.set(studentId, advAmt);
  else _advanceCache.delete(studentId);
}

async function _loadPaymentHistory(schoolId: string): Promise<void> {
  const { data, error } = await supabase
    .from('payment_records')
    .select('id, student_id, amount, method, date, receipt_no, advance_amount, discount_amount, note, created_at, reverses_payment_id, reversed_at, reversed_by, reversal_reason, students(name, admission_no)')
    .eq('school_id', schoolId)
    .order('date', { ascending: false }).order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);

  type PRow = {
    id: string; student_id: string; amount: number; method: string;
    date: string; receipt_no: string; advance_amount: number; discount_amount: number | null;
    note: string | null;
    created_at: string;
    reverses_payment_id: string | null;
    reversed_at: string | null;
    reversed_by: string | null;
    reversal_reason: string | null;
    students: { name: string; admission_no: string } | { name: string; admission_no: string }[] | null;
  };
  const payments = ((data ?? []) as unknown as PRow[]).map(p => ({
    ...p,
    students: Array.isArray(p.students) ? (p.students[0] ?? null) : p.students,
  }));

  if (!payments.length) { _paymentHistoryCache = []; return; }

  // Pull installment links in one query.
  const paymentIds = payments.map(p => p.id);
  const { data: linksData } = await supabase
    .from('payment_installment_links')
    .select('payment_id, installment_id, amount_applied, fee_installments(month, fee_type, amount)')
    .in('payment_id', paymentIds);
  type LinkRow = {
    payment_id: string; installment_id: string; amount_applied: number;
    fee_installments: { month: string; fee_type: string; amount: number } | { month: string; fee_type: string; amount: number }[] | null;
  };
  const links = ((linksData ?? []) as unknown as LinkRow[]).map(l => ({
    ...l,
    fee_installments: Array.isArray(l.fee_installments) ? (l.fee_installments[0] ?? null) : l.fee_installments,
  }));
  const linksByPayment = new Map<string, typeof links>();
  for (const l of links) {
    const arr = linksByPayment.get(l.payment_id) ?? [];
    arr.push(l);
    linksByPayment.set(l.payment_id, arr);
  }

  _paymentHistoryCache = payments.map(p => {
    const lk = linksByPayment.get(p.id) ?? [];
    return {
      id: p.id,
      studentId: p.student_id,
      studentName: p.students?.name ?? '',
      className: '',
      admissionNo: p.students?.admission_no ?? '',
      amount: Number(p.amount),
      method: p.method,
      date: p.date,
      receiptNo: p.receipt_no,
      installmentIds: lk.map(l => l.installment_id),
      installmentDetails: lk.map(l => ({
        month: l.fee_installments?.month ?? '',
        feeType: (l.fee_installments?.fee_type as FeeType) ?? 'OTHER',
        amount: Number(l.amount_applied),
      })),
      advanceAmount: Number(p.advance_amount),
      discountAmount: Number(p.discount_amount ?? 0) || undefined,
      note: p.note ?? undefined,
      createdAt: p.created_at,
      reversedAt: p.reversed_at ?? undefined,
      reversedBy: p.reversed_by ?? undefined,
      reversalReason: p.reversal_reason ?? undefined,
      reversesPaymentId: p.reverses_payment_id ?? undefined,
    };
  });
}

// _loadGovtPayments removed — government_payments table dropped (migration
// 0083). FeeLedger no longer renders a separate RTE/govt history; if a
// school receives a government grant, the principal records it as a
// regular payment with a note like "Govt grant 2026-Q1".

async function _loadAdvances(schoolId: string): Promise<void> {
  const { data, error } = await supabase
    .from('advance_balances')
    .select('student_id, amount, students!inner(school_id)')
    .eq('students.school_id', schoolId);
  if (error) throw new Error(error.message);
  _advanceCache = new Map();
  ((data ?? []) as { student_id: string; amount: number }[]).forEach(r => {
    _advanceCache.set(r.student_id, Number(r.amount));
  });
}

// ─── Service API ──────────────────────────────────────────────────────────────

export const feeService = {
  /** Load every fee table for the active school into memory. Call on mount + after writes.
   *  Concurrent calls coalesce into a single in-flight load so back-to-back writes
   *  don't fire 4×N parallel reads that can clobber each other. */
  /** Server-side school-wide fee aggregate. Replaces the pattern of
   *  walking every student's cached installments to compute summary
   *  tiles — that walk forces FeeLedger to pre-load the entire school's
   *  fee_installments cache. With this RPC, totals are one round-trip
   *  regardless of school size. Use for the principal FeeLedger header
   *  cards and the dashboard. */
  async getSchoolAggregate(): Promise<{
    totalStudents: number;
    pendingCount: number;
    dueCount: number;
    clearedCount: number;
    totalCollected: number;
    totalParentDue: number;          // overdue + partial (due_date <= today)
    totalGovtDue: number;
    totalParentUpcoming: number;     // future (due_date > today, unpaid)
    totalGovtUpcoming: number;
  }> {
    const { data, error } = await supabase.rpc('get_school_fee_aggregate');
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as {
      total_students: number; pending_count: number; due_count: number;
      cleared_count: number; total_collected: number;
      total_parent_due: number; total_govt_due: number;
      total_parent_upcoming: number; total_govt_upcoming: number;
    } | null;
    return {
      totalStudents:       Number(row?.total_students       ?? 0),
      pendingCount:        Number(row?.pending_count        ?? 0),
      dueCount:            Number(row?.due_count            ?? 0),
      clearedCount:        Number(row?.cleared_count        ?? 0),
      totalCollected:      Number(row?.total_collected      ?? 0),
      totalParentDue:      Number(row?.total_parent_due     ?? 0),
      totalGovtDue:        Number(row?.total_govt_due       ?? 0),
      totalParentUpcoming: Number(row?.total_parent_upcoming ?? 0),
      totalGovtUpcoming:   Number(row?.total_govt_upcoming   ?? 0),
    };
  },

  async refreshAll(): Promise<void> {
    if (_refreshInFlight) return _refreshInFlight;
    const schoolId = getSchoolId();
    _refreshInFlight = (async () => {
      try {
        await Promise.all([
          _loadInstallments(schoolId),
          _loadPaymentHistory(schoolId),
          _loadAdvances(schoolId),
        ]);
        _cacheLoadedFor = schoolId;
      } finally {
        _refreshInFlight = null;
      }
    })();
    return _refreshInFlight;
  },

  /** Differential refresh — pulls fresh rows for ONE student and patches
   *  the in-memory cache. Use after a write that affects exactly one
   *  student (recordPayment, recordPaymentForInstallment, writeOff,
   *  generateSchedule for a single student) AND for lazy on-selection
   *  loading in views like FeeLedger. Always single-student; never
   *  cascades to refreshAll, so it's safe to call on a fresh cache. */
  async refreshStudent(studentId: string): Promise<void> {
    try {
      await _refreshOneStudent(studentId);
    } catch (err) {
      console.warn('[fees] per-student refresh failed', err);
      throw err;
    }
  },

  /** Lite refresh — loads only the school-wide payment history, govt
   *  payments, and advances. Skips the school-wide installment load
   *  (the biggest blob, scales with student × month × heads). Use this
   *  on FeeLedger mount; per-student installments are then fetched
   *  lazily via refreshStudent() when the principal taps a student. */
  async refreshLite(): Promise<void> {
    const schoolId = getSchoolId();
    await Promise.all([
      _loadPaymentHistory(schoolId),
      _loadAdvances(schoolId),
    ]);
  },

  // ── Sync read accessors (assume refreshAll() was called) ────────────────
  getInstallments(): FeeInstallment[] {
    return [..._installmentsCache];
  },

  getStudentInstallments(studentId: string): FeeInstallment[] {
    return _installmentsCache.filter(i => i.studentId === studentId);
  },

  getStudentFeeProfile(
    studentId: string, name: string, className: string,
    admissionNo: string, isRte = false, rollNo = '',
  ): StudentFeeProfile {
    const insts = this.getStudentInstallments(studentId);
    return {
      studentId, name, className, admissionNo, rollNo,
      academicYearId: insts[0]?.academicYearId ?? '',
      installments: insts,
      isRte,
    };
  },

  getPaymentHistory(studentId?: string): PaymentRecord[] {
    return studentId
      ? _paymentHistoryCache.filter(r => r.studentId === studentId)
      : [..._paymentHistoryCache];
  },

  getPaymentRecordByInstallmentId(installmentId: string): PaymentRecord | null {
    return _paymentHistoryCache.find(r => r.installmentIds.includes(installmentId)) ?? null;
  },

  /** Authoritative lookup of a freshly-recorded payment by RPC-returned id. */
  getPaymentRecordById(paymentId: string): PaymentRecord | null {
    if (!paymentId) return null;
    return _paymentHistoryCache.find(r => r.id === paymentId) ?? null;
  },

  // nextReceiptNo() removed — client-side counter would collide across tabs
  // and races. Receipt numbers must come from the server (apiFees.pay returns
  // the canonical receipt_no on the persisted payment row).

  // getAdvanceBalance removed in 0084 — advance credit feature dropped.
  // Stub kept to avoid breaking any external caller mid-deploy; always 0.
  getAdvanceBalance(_studentId: string): number {
    return 0;
  },

  /** Direct DB query for a single student's installments, bypassing cache.
   *  Use in contexts where a full refreshAll() would be too heavy (e.g.,
   *  opening a student profile in the principal's Students view). */
  async getStudentInstallmentsDirect(
    studentId: string,
    academicYearId?: string,
  ): Promise<FeeInstallment[]> {
    let query = supabase
      .from('fee_installments')
      .select(INST_FIELDS)
      .eq('student_id', studentId)
      .order('due_date', { ascending: true });
    if (academicYearId) {
      query = query.eq('academic_year_id', academicYearId) as typeof query;
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return ((data ?? []) as InstallmentRow[]).map(rowToInstallment);
  },

  getPaidTillMonth(studentId: string): { lastClearedMonth: string | null; allCleared: boolean } {
    const insts = this.getStudentInstallments(studentId);
    if (!insts.length) return { lastClearedMonth: null, allCleared: false };
    const monthDueMap = new Map<string, string>();
    for (const inst of insts) if (!monthDueMap.has(inst.month)) monthDueMap.set(inst.month, inst.dueDate);
    const months = [...monthDueMap.entries()]
      .sort((a, b) => new Date(a[1]).getTime() - new Date(b[1]).getTime())
      .map(([m]) => m);
    let last: string | null = null;
    for (const m of months) {
      const allPaid = insts.filter(i => i.month === m).every(
        // CANCELLED rows (frozen transport after vehicle change) count as
        // settled — they aren't future obligations and shouldn't block the
        // "paid through" marker from advancing.
        i => i.status === 'PAID' || i.status === 'WAIVED' || i.status === 'WRITTEN_OFF' || i.status === 'CANCELLED',
      );
      if (allPaid) last = m; else break;
    }
    return { lastClearedMonth: last, allCleared: last === months[months.length - 1] && months.length > 0 };
  },

  // Aggregate outstanding across ALL years and ALL fee types
  // (TUITION, TRANSPORT, EXAM, OTHER — including any 'Late Fee' rows). The
  // top "Total Outstanding" card in FeesView reads `total`; per-type lines
  // render the individual fields. RTE/govt distinction removed in 0083 —
  // every installment is now treated as parent-payable; if a school
  // receives a government grant, the principal records it as a regular
  // payment with a note.
  /** Outstanding amount per fee_type bucket for a student, restricted
   *  to installments whose due_date is on or before today (i.e. OVERDUE
   *  + PARTIAL). Upcoming months are deliberately excluded so the
   *  principal's "₹X due" pill matches the global TOTAL DUE KPI in the
   *  hub — earlier this summed the entire year's schedule which was
   *  alarming and inconsistent. */
  getParentDueSummary(studentId: string): {
    tuition: number; transport: number; exam: number; other: number; total: number;
  } {
    const insts = this.getStudentInstallments(studentId);
    const today = todayIST();
    const isOverdueNow = (i: FeeInstallment) => i.dueDate <= today;
    const sumOf = (t: FeeType) => insts
      .filter(i => i.feeType === t && isOverdueNow(i))
      .reduce((s, i) => s + Math.max(0, i.amount - i.paidAmount - i.writeOffAmount), 0);
    const tuition   = sumOf('TUITION');
    const transport = sumOf('TRANSPORT');
    const exam      = sumOf('EXAM');
    const other     = sumOf('OTHER');
    return { tuition, transport, exam, other, total: tuition + transport + exam + other };
  },

  /** Future schedule still owed — installments with due_date strictly
   *  in the future. Use for the "Upcoming" subtitle so the principal
   *  can still see lifetime exposure without it inflating the panic
   *  number. */
  getParentUpcomingTotal(studentId: string): number {
    const insts = this.getStudentInstallments(studentId);
    const today = todayIST();
    return insts
      .filter(i => i.dueDate > today)
      .reduce((s, i) => s + Math.max(0, i.amount - i.paidAmount - i.writeOffAmount), 0);
  },

  getFeeTypeSummary(studentId: string): { tuition: number; transport: number; total: number } {
    const insts = this.getStudentInstallments(studentId);
    const tuition = insts.filter(i => i.feeType === 'TUITION').reduce((s, i) => s + Math.max(0, i.amount - i.paidAmount - i.writeOffAmount), 0);
    const transport = insts.filter(i => i.feeType === 'TRANSPORT').reduce((s, i) => s + Math.max(0, i.amount - i.paidAmount - i.writeOffAmount), 0);
    return { tuition, transport, total: tuition + transport };
  },

  /** Total school-wide outstanding (any payer kind, any fee type). Replaces
   *  the old getSchoolRtePending() which split rows into PARENT vs GOVT —
   *  RTE/govt distinction removed in 0083. */
  getSchoolPending(): { totalPending: number } {
    const allInsts = _installmentsCache;
    const isOutstanding = (i: FeeInstallment) =>
      i.status !== 'PAID' && i.status !== 'WAIVED' &&
      i.status !== 'WRITTEN_OFF' && i.status !== 'CANCELLED' &&
      (i.amount - i.paidAmount - i.writeOffAmount) > 0;
    const totalPending = allInsts
      .filter(isOutstanding)
      .reduce((s, i) => s + Math.max(0, i.amount - i.paidAmount - i.writeOffAmount), 0);
    return { totalPending };
  },

  /** Get unpaid/partial fees from previous academic years (not current active year). */
  getPreviousYearDues(studentId: string, currentAcademicYearId?: string): Array<{
    academicYearId: string;
    yearLabel: string;
    outstanding: number;
    installments: FeeInstallment[];
  }> {
    const insts = this.getStudentInstallments(studentId);
    const outstanding = insts.filter(i => {
      if (currentAcademicYearId && i.academicYearId === currentAcademicYearId) return false;
      // See getSchoolRtePending: legacy statuses are rewritten by
      // computeEffectiveStatus, so use a settled-status denylist + actual
      // outstanding amount.
      return i.status !== 'PAID' && i.status !== 'WAIVED'
          && i.status !== 'WRITTEN_OFF' && i.status !== 'CANCELLED'
          && (i.amount - i.paidAmount - i.writeOffAmount) > 0;
    });
    if (outstanding.length === 0) return [];

    const yearIds: string[] = Array.from(new Set(outstanding.map(i => i.academicYearId).filter((s): s is string => !!s)));
    const yearMetaMap = new Map<string, string>();

    yearIds.forEach(yearId => {
      const sample = insts.find(i => i.academicYearId === yearId);
      if (!sample) return;
      const installedCount = insts.filter(i => i.academicYearId === yearId).length;
      yearMetaMap.set(yearId, `Year (${installedCount} records)`);
    });

    return yearIds.map(yearId => {
      const yearInsts = outstanding.filter(i => i.academicYearId === yearId);
      const totalOutstanding = yearInsts.reduce((s, i) => s + Math.max(0, i.amount - i.paidAmount - i.writeOffAmount), 0);
      return {
        academicYearId: yearId,
        yearLabel: yearMetaMap.get(yearId) ?? 'Unknown',
        outstanding: totalOutstanding,
        installments: yearInsts,
      };
    }).sort((a, b) => (b.yearLabel).localeCompare(a.yearLabel));
  },

  // ── Async writes (RPC-backed) ───────────────────────────────────────────

  /**
   * Record a parent payment. Atomic oldest-due-first allocation via the
   * record_fee_payment RPC; whatever's left becomes advance balance.
   *
   * `applyLateFee` (default TRUE) lets the RPC compute the configured late
   * fee from the class' fee_structures.late_fee JSONB and insert a single
   * aggregated 'Late Fee' installment dated yesterday so it sorts FIRST in
   * the oldest-due-first allocation walk. Pass FALSE if the principal has
   * explicitly waived the late fee for this collection.
   *
   * `discountAmount` (optional) is included in the note/receipt for tracking.
   * Principal reduces amount by discount at UI level (pays less, records in note).
   */
  async recordPayment(
    studentId: string, amount: number, method = 'CASH',
    date?: string, note?: string, applyLateFee = true, discountAmount = 0,
  ): Promise<{ applied: number; paymentId: string }> {
    if (amount < 0) throw new Error('Amount must be non-negative');
    if (!Number.isInteger(amount)) {
      throw new Error('Fee amount must be a whole rupee value (decimals not allowed)');
    }
    if (!Number.isInteger(discountAmount)) {
      throw new Error('Discount must be a whole rupee value');
    }
    if (amount === 0 && discountAmount === 0) {
      throw new Error('Amount and discount cannot both be zero');
    }
    // Server hard-rejects overpay since 0084 — advance credit removed.
    const result = await apiFees.pay({
      studentId, amount, method,
      date, note, applyLateFee, discountAmount,
    });
    const paymentId = (result as any).paymentId as string;
    const links = ((result as any).payment?.payment_installment_links ?? []) as {
      amount_applied: number | string;
    }[];
    const applied = links.reduce((s, r) => s + Number(r.amount_applied ?? 0), 0);
    await this.refreshStudent(studentId);
    return { applied, paymentId };
  },

  /**
   * Strict per-installment payment. Applies cash + optional discount to ONE
   * specific installment chosen by the principal — bypasses the oldest-first
   * allocator, so payments cannot silently slip into advance_balances.
   *
   * Server (pay_installment RPC) hard-rejects overpay: cash + discount must
   * be ≤ outstanding on that row. Both `paid_amount` and `write_off_amount`
   * are bumped atomically and a fee_write_offs row is logged when discount > 0,
   * so the expand-on-tap history shows every cash + discount entry tied to
   * the row.
   */
  async recordPaymentForInstallment(
    installmentId: string, amount: number, discount = 0,
    method = 'CASH', date?: string, note?: string,
  ): Promise<{ paymentId: string }> {
    if (!Number.isInteger(amount) || amount < 0) {
      throw new Error('Amount must be a non-negative whole rupee value');
    }
    if (!Number.isInteger(discount) || discount < 0) {
      throw new Error('Discount must be a non-negative whole rupee value');
    }
    if (amount === 0 && discount === 0) {
      throw new Error('Enter an amount or discount before submitting');
    }
    const result = await apiFees.payInstallment({
      installmentId, amount, discount, method, date, note,
    });
    // Differential refresh — only the affected student needs fresh data.
    // Look up student_id from the in-memory cache (we know the installment).
    const inst = _installmentsCache.find(i => i.id === installmentId);
    if (inst) await this.refreshStudent(inst.studentId);
    else      await this.refreshAll();
    return { paymentId: (result as any).paymentId as string };
  },

  /** Apply a write-off directly to a single installment. */
  async writeOffFee(installmentId: string, amount: number, reason: string): Promise<boolean> {
    const inst = _installmentsCache.find(i => i.id === installmentId);
    if (!inst) return false;
    const maxWriteOff = Math.max(0, inst.amount - inst.paidAmount - inst.writeOffAmount);
    const writeOff = Math.min(amount, maxWriteOff);
    if (writeOff <= 0) return false;

    await apiFees.writeoff({ installmentId, amount: writeOff, reason });
    await logAudit('fee_writeoff', 'fee_installment', installmentId, { amount: writeOff, reason });
    // Single-student differential refresh — same reason as recordPayment.
    await this.refreshStudent(inst.studentId);
    return true;
  },

  /** Reverse a previously-recorded payment. All guards (Editor Mode session
   *  on the server, same-day IST, daily cap, ownership) are enforced
   *  server-side via `users.editor_mode_until`. The client no longer sends an
   *  Editor-Mode flag — toggling the UI store calls the enable/disable
   *  RPCs and the server reads the persisted timestamp. */
  async reversePayment(paymentId: string, reason: string): Promise<{ reversalId: string }> {
    const result = await apiFees.reversePayment({ paymentId, reason });
    await logAudit('fee_payment_reversed', 'payment_record', paymentId, {
      reason, reversalId: result.reversalId,
    });
    await this.refreshAll();
    return result;
  },

  /**
   * Generate (or regenerate) a fee schedule for a student via the
   * `generate_student_fee_schedule` RPC. The RPC DELETEs all unpaid /
   * non-written-off installments for the (student, year) BEFORE re-inserting,
   * so calling this is the same as "regenerate schedule": already-paid rows
   * are preserved, the rest are rebuilt from `heads` + `dueDates`.
   *
   * Heads/dueDates follow the JSONB shape in migration 0017. The optional
   * discount params are forwarded to the RPC; the larger of the two wins
   * per installment when both are set. RTE flips payer_type to GOVERNMENT.
   */
  async generateSchedule(
    studentId: string, academicYearId: string,
    heads: { name: string; amount: number; frequency: string; description?: string }[],
    dueDates: { month: string; date: string }[],
    isRte = false,
    discountAmount = 0,
    discountPct = 0,
  ): Promise<number> {
    const { installmentCount } = await apiFees.generateSchedule({
      studentId, yearId: academicYearId, heads, dueDates, isRte, discountAmount, discountPct,
    });
    // generateSchedule mutates one student's installments only.
    await this.refreshStudent(studentId);
    return Number(installmentCount) || 0;
  },

  /**
   * Regenerate the schedule from a *fee_structures* row. Looks the
   * structure up by id and forwards heads + monthly_due_dates to
   * generateSchedule(). Convenience wrapper for principals using the
   * "Regenerate Schedule" action in FeeLedger.
   */
  async regenerateScheduleFromStructure(
    studentId: string, academicYearId: string, structureId: string,
    isRte = false, discountAmount = 0, discountPct = 0,
  ): Promise<number> {
    const { data: row, error } = await supabase
      .from('fee_structures')
      .select('fee_heads, monthly_due_dates')
      .eq('id', structureId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error('Fee structure not found');
    const r = row as { fee_heads: unknown; monthly_due_dates: unknown };
    return this.generateSchedule(
      studentId, academicYearId,
      (r.fee_heads as { name: string; amount: number; frequency: string }[]) ?? [],
      (r.monthly_due_dates as { month: string; date: string }[]) ?? [],
      isRte, discountAmount, discountPct,
    );
  },

  /**
   * Live preview of late fees the student currently owes per the configured
   * fee_structures.late_fee policy. Returns the per-installment breakdown
   * and the total. Safe for both principal (FeeLedger) and parent (FeesView)
   * — RPC authorises by school for staff and by linked_student_ids() for
   * the parent/student themselves.
   */
  async computeLateFeePreview(studentId: string): Promise<{
    total: number;
    perInstallment: { installmentId: string; dueDate: string; daysLate: number; lateFee: number; source: string }[];
  }> {
    const { data, error } = await supabase.rpc('preview_student_late_fees', {
      p_student_id: studentId,
    });
    if (error) throw new Error(error.message);
    type Row = { installment_id: string; due_date: string; days_late: number; late_fee: number; source: string };
    const rows = (data ?? []) as Row[];
    const perInstallment = rows
      .filter(r => Number(r.late_fee) > 0)
      .map(r => ({
        installmentId: r.installment_id,
        dueDate: r.due_date,
        daysLate: Number(r.days_late),
        lateFee: Number(r.late_fee),
        source: r.source,
      }));
    const total = perInstallment.reduce((s, r) => s + r.lateFee, 0);
    return { total, perInstallment };
  },

  /**
   * Group installments of a student by academic_year_id, with the year
   * label resolved via a Supabase lookup. Used by FeesView (parent) and
   * FeeLedger (principal detail) to render per-year card stacks.
   */
  async getStudentInstallmentsByYear(studentId: string): Promise<Array<{
    academicYearId: string;
    yearLabel: string;
    isActive: boolean;
    installments: FeeInstallment[];
  }>> {
    const insts = this.getStudentInstallments(studentId);
    const yearIds: string[] = Array.from(new Set(insts.map(i => i.academicYearId).filter((s): s is string => !!s)));
    if (yearIds.length === 0) return [];
    const { data, error } = await supabase
      .from('academic_years')
      .select('id, label, is_active, start_date')
      .in('id', yearIds);
    if (error) throw new Error(error.message);
    type AY = { id: string; label: string; is_active: boolean; start_date: string };
    const meta = new Map<string, AY>(((data ?? []) as AY[]).map(a => [a.id, a]));
    return yearIds
      .map(id => ({
        academicYearId: id,
        yearLabel: meta.get(id)?.label ?? 'Unknown year',
        isActive: !!meta.get(id)?.is_active,
        startDate: meta.get(id)?.start_date ?? '',
        installments: insts.filter(i => i.academicYearId === id),
      }))
      // Active first, then most recent year first.
      .sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return (b.startDate || '').localeCompare(a.startDate || '');
      })
      .map(({ academicYearId, yearLabel, isActive, installments }) => ({
        academicYearId, yearLabel, isActive, installments,
      }));
  },

  // ── Transport schedule helpers (auto-create installments) ───────────────
  async addTransportFeeSchedule(
    studentId: string, monthlyAmount: number,
    startDate: string, endDate: string | null, assignmentId: string,
  ): Promise<void> {
    const schoolId = getSchoolId();
    const { data: ay } = await supabase
      .from('academic_years').select('id, start_date, end_date')
      .eq('school_id', schoolId).eq('is_active', true).maybeSingle();
    if (!ay) return;
    const ayRow = ay as { id: string; start_date: string; end_date: string };

    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date(ayRow.end_date);
    const yearStart = new Date(ayRow.start_date);
    const yearEnd = new Date(ayRow.end_date);
    const cursor = new Date(Math.max(start.getTime(), yearStart.getTime()));
    cursor.setDate(10);
    // setDate(10) can rewind cursor to BEFORE the actual start date (e.g.
    // assignment effective Apr 25 becomes Apr 10) — that creates an extra
    // installment for time before the bus actually started. Bump forward
    // one month if we just wound back past the start.
    if (cursor < start) {
      cursor.setMonth(cursor.getMonth() + 1);
    }

    // Build YYYY-MM-DD from local-tz fields directly so IST-vs-UTC
    // doesn't shift the month boundary back a day for late-month dates.
    const fmtYmd = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const rows: Record<string, unknown>[] = [];
    while (cursor <= end && cursor <= yearEnd) {
      rows.push({
        student_id: studentId, school_id: schoolId, academic_year_id: ayRow.id,
        month: cursor.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
        due_date: fmtYmd(cursor),
        fee_type: 'TRANSPORT',
        amount: monthlyAmount,
        payer_type: 'PARENT',
        related_id: assignmentId,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    if (rows.length) {
      // Atomic delete-unpaid + insert-new via SECURITY DEFINER RPC. The
      // previous two-round-trip approach could lose all unpaid TRANSPORT
      // installments if the second call failed.
      const { error } = await supabase.rpc('transport_replace_unpaid_installments', {
        p_assignment_id: assignmentId,
        p_rows: rows,
      });
      if (error) throw new Error(error.message);
      await this.refreshAll();
    }
  },

  async removeTransportFeeSchedule(assignmentId: string): Promise<void> {
    // Backwards-compat shim: cancel from today forward.
    await this.cancelTransportInstallmentsAfter(
      assignmentId, new Date().toISOString().slice(0, 10),
    );
  },

  /**
   * Cancel TRANSPORT installments tied to `assignmentId` whose `due_date >=
   * fromDate`. UNPAID rows are deleted; PARTIAL rows have their `amount`
   * frozen at `paid_amount + write_off_amount` and are flagged
   * `status = 'CANCELLED'` so they no longer show as outstanding but the
   * receipt history is preserved.
   */
  async cancelTransportInstallmentsAfter(
    assignmentId: string, fromDate: string,
  ): Promise<{ deleted: number; cancelled: number }> {
    // Atomic via SECURITY DEFINER RPC — previous version did 1 + N round-trips
    // (one DELETE then UPDATE per partial row), so a network drop mid-loop
    // would freeze some rows and leave others untouched.
    const { data, error } = await supabase.rpc('transport_cancel_after', {
      p_assignment_id: assignmentId,
      p_from_date: fromDate,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    const deleted = Number(row?.deleted_count ?? 0);
    const cancelled = Number(row?.cancelled_count ?? 0);
    await this.refreshAll();
    return { deleted, cancelled };
  },

  /**
   * Preview the installment delta a transport change will produce — how
   * many UNPAID rows (and total ₹) will be cancelled vs how many new rows
   * (and total ₹) will be created. Read-only.
   */
  async previewTransportInstallmentDelta(input: {
    studentId: string;
    currentAssignmentId: string | null;
    effectiveDate: string;
    newMonthlyAmount: number;
    newEndDate?: string | null;
  }): Promise<{
    cancelCount: number; cancelAmount: number;
    newCount: number; newAmount: number;
  }> {
    // Cancellation side: existing future rows on the current assignment.
    let cancelCount = 0, cancelAmount = 0;
    if (input.currentAssignmentId) {
      const { data: rows } = await supabase
        .from('fee_installments')
        .select('amount, paid_amount, write_off_amount')
        .eq('related_id', input.currentAssignmentId)
        .eq('fee_type', 'TRANSPORT')
        .gte('due_date', input.effectiveDate);
      const list = (rows ?? []) as { amount: number; paid_amount: number; write_off_amount: number }[];
      cancelCount = list.length;
      cancelAmount = list.reduce(
        (s, r) => s + Math.max(0, Number(r.amount) - Number(r.paid_amount) - Number(r.write_off_amount)),
        0,
      );
    }

    // Creation side: count months in [effectiveDate, end-of-AY or newEndDate].
    const schoolId = getSchoolId();
    const { data: ay } = await supabase
      .from('academic_years').select('id, end_date')
      .eq('school_id', schoolId).eq('is_active', true).maybeSingle();
    const ayRow = ay as { id: string; end_date: string } | null;
    if (!ayRow) return { cancelCount, cancelAmount, newCount: 0, newAmount: 0 };

    const start = new Date(input.effectiveDate);
    const end = input.newEndDate ? new Date(input.newEndDate) : new Date(ayRow.end_date);
    const yearEnd = new Date(ayRow.end_date);
    const cap = end < yearEnd ? end : yearEnd;
    const cursor = new Date(start);
    cursor.setDate(10);
    // Mirror addTransportFeeSchedule: if setDate(10) winds before the
    // effective start, advance a month so preview matches actual creation.
    if (cursor < start) cursor.setMonth(cursor.getMonth() + 1);
    let newCount = 0;
    while (cursor <= cap) {
      newCount += 1;
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return { cancelCount, cancelAmount, newCount, newAmount: newCount * input.newMonthlyAmount };
  },

  // ── Backwards-compat helpers (no-op cache writes — RPCs do the work) ────
  addPaymentRecord(_record: PaymentRecord): void {
    // No-op: the record_fee_payment RPC inserts the payment row atomically.
    // Kept for API compatibility with the older synchronous code path.
  },

  /** Force-load cache for a single student (used by FeesView etc).
   *  Always refreshes — the previous early-return on "any cached row for
   *  this student" silently served stale data after payments/reversals. */
  async loadForStudent(_studentId: string): Promise<void> {
    await this.refreshAll();
  },

  // ─── Fee Structures ────────────────────────────────────────────────────────

  async getFeeStructures(yearId?: string): Promise<FeeStructureRecord[]> {
    const schoolId = useAuthStore.getState().session?.schoolId;
    if (!schoolId) return [];

    let ayId = yearId;
    if (!ayId) {
      const { data: ay } = await supabase
        .from('academic_years').select('id')
        .eq('school_id', schoolId).eq('is_active', true).maybeSingle();
      if (!ay) return [];
      ayId = (ay as { id: string }).id;
    }

    const read = async () => {
      const { data, error } = await supabase
        .from('fee_structures')
        .select('id, name, class_name, structure_type, billing_cycle, fee_heads, monthly_due_dates, late_fee')
        .eq('school_id', schoolId).eq('academic_year_id', ayId!)
        .order('class_name');
      if (error) throw new Error(error.message);
      return ((data ?? []) as any[]).map(r => ({
        id: r.id,
        name: r.name,
        className: r.class_name,
        structureType: (r.structure_type ?? 'CLASS') as FeeStructureType,
        billingCycle: (r.billing_cycle ?? 'MONTHLY') as BillingCycle,
        feeHeads: r.fee_heads ?? [],
        monthlyDueDates: r.monthly_due_dates ?? [],
        lateFee: r.late_fee ?? { enabled: false, gracePeriodDays: 0, type: 'FIXED', amount: 0, maxCap: 0 },
      })) as FeeStructureRecord[];
    };

    let rows = await read();
    if (rows.length === 0 && !yearId) {
      try {
        await apiPrincipal.feeStructureSeed(ayId!);
        rows = await read();
      } catch { /* seed failure is non-fatal */ }
    }
    return rows;
  },

  async saveFeeStructure(input: FeeStructureRecord): Promise<FeeStructureRecord> {
    const result = await apiPrincipal.feeStructureSave({
      id: input.id, name: input.name, className: input.className,
      structureType: input.structureType ?? 'CLASS', billingCycle: input.billingCycle,
      feeHeads: input.feeHeads, monthlyDueDates: input.monthlyDueDates, lateFee: input.lateFee,
    });
    await logAudit('fee_structure_saved', 'fee_structures', result.id, { name: input.name, mode: result.mode });
    return { ...input, structureType: input.structureType ?? 'CLASS', id: result.id };
  },

  async saveFeeStructureForYear(
    yearId: string,
    input: Omit<FeeStructureRecord, 'id'>,
  ): Promise<FeeStructureRecord> {
    const result = await apiPrincipal.feeStructureSaveForYear({
      yearId, name: input.name, className: input.className,
      structureType: input.structureType ?? 'CLASS', billingCycle: input.billingCycle,
      feeHeads: input.feeHeads, monthlyDueDates: input.monthlyDueDates, lateFee: input.lateFee,
    });
    await logAudit('fee_structure_saved', 'fee_structures', result.id, { name: input.name, mode: 'create' });
    return { ...input, structureType: input.structureType ?? 'CLASS', id: result.id };
  },

  async deleteFeeStructure(id: string): Promise<void> {
    await apiPrincipal.feeStructureDelete(id);
    await logAudit('fee_structure_deleted', 'fee_structures', id);
  },

  // ─── Fee Payment Uploads ────────────────────────────────────────────────────

  async getFeePaymentUploads(
    status: FeeUploadStatus | 'ALL' = 'ALL',
  ): Promise<FeePaymentUploadRecord[]> {
    const schoolId = useAuthStore.getState().session?.schoolId;
    if (!schoolId) return [];
    let query = supabase
      .from('fee_payment_uploads')
      .select('id, student_id, submitted_by, amount, description, transaction_id, status, reviewed_at, reviewer_note, recorded_payment_id, created_at')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false });
    if (status !== 'ALL') query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];

    const ids = Array.from(new Set(rows.map((r: any) => r.student_id)));
    const nameMap = new Map<string, { name: string; admissionNo: string | null }>();
    if (ids.length) {
      const { data: stu } = await supabase
        .from('students').select('id, name, admission_no').in('id', ids);
      for (const s of (stu ?? []) as any[]) {
        nameMap.set(s.id, { name: s.name, admissionNo: s.admission_no });
      }
    }

    return rows.map((r: any) => ({
      id: r.id,
      studentId: r.student_id,
      studentName: nameMap.get(r.student_id)?.name ?? 'Unknown',
      admissionNo: nameMap.get(r.student_id)?.admissionNo ?? null,
      submittedBy: r.submitted_by,
      amount: r.amount,
      description: r.description ?? '',
      transactionId: r.transaction_id ?? '',
      status: r.status as FeeUploadStatus,
      submittedAt: r.created_at,
      reviewedAt: r.reviewed_at,
      reviewerNote: r.reviewer_note,
      recordedPaymentId: r.recorded_payment_id,
    }));
  },

  async reviewFeePaymentUpload(
    id: string,
    decision: 'APPROVED' | 'REJECTED',
    note?: string,
  ): Promise<{ paymentId: string | null }> {
    return apiPrincipal.feeUploadReview({ uploadId: id, decision, note });
  },

};
