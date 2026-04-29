// Supabase-backed fee service.
//
// Strategy: Atomic writes go through SECURITY DEFINER RPCs (record_fee_payment,
// record_govt_payment, generate_student_fee_schedule). Reads pull from
// fee_installments + payment_records and are cached in memory so the existing
// FeeLedger / FeesView synchronous accessor pattern keeps working — components
// only need to call `await refreshAll()` once on mount and after any write.

import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { logAudit } from '../lib/audit';

// ─── Types ────────────────────────────────────────────────────────────────────

export type FeeType = 'TUITION' | 'TRANSPORT' | 'EXAM' | 'OTHER';
export type FeeStatus = 'PAID' | 'PARTIAL' | 'UNPAID' | 'OVERDUE' | 'WAIVED' | 'WRITTEN_OFF';
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
}

export interface FeeInstallment {
  id: string;
  studentId: string;
  academicYearId: string;
  month: string;
  dueDate: string;
  feeType: FeeType;
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
  academicYearId: string;
  installments: FeeInstallment[];
  isRte: boolean;
}

export interface GovernmentPaymentRecord {
  id: string;
  amount: number;
  date: string;
  referenceNo: string;
  note: string;
  allocatedStudentIds: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSchoolId(): string {
  const id = useAuthStore.getState().session?.schoolId;
  if (!id) throw new Error('No school in session');
  return id;
}

interface InstallmentRow {
  id: string; student_id: string; academic_year_id: string;
  month: string; due_date: string; fee_type: string;
  amount: number; paid_amount: number; write_off_amount: number;
  write_off_reason: string | null; status: string;
  payer_type: string; related_id: string | null;
}

const INST_FIELDS = 'id, student_id, academic_year_id, month, due_date, fee_type, amount, paid_amount, write_off_amount, write_off_reason, status, payer_type, related_id';

function rowToInstallment(r: InstallmentRow): FeeInstallment {
  return {
    id: r.id,
    studentId: r.student_id,
    academicYearId: r.academic_year_id,
    month: r.month,
    dueDate: r.due_date,
    feeType: (r.fee_type as FeeType) ?? 'OTHER',
    amount: Number(r.amount),
    paidAmount: Number(r.paid_amount),
    writeOffAmount: Number(r.write_off_amount),
    writeOffReason: r.write_off_reason ?? '',
    status: (r.status as FeeStatus) ?? 'UNPAID',
    payerType: (r.payer_type as PayerType) ?? 'PARENT',
    relatedId: r.related_id ?? undefined,
  };
}

// ─── In-memory cache (scoped to current session/school) ──────────────────────

let _installmentsCache: FeeInstallment[] = [];
let _paymentHistoryCache: PaymentRecord[] = [];
let _govtPaymentsCache: GovernmentPaymentRecord[] = [];
let _advanceCache = new Map<string, number>();
let _cacheLoadedFor: string | null = null;

// ─── Cache refresh ───────────────────────────────────────────────────────────

async function _loadInstallments(schoolId: string): Promise<void> {
  const { data, error } = await supabase
    .from('fee_installments').select(INST_FIELDS)
    .eq('school_id', schoolId)
    .order('due_date', { ascending: true });
  if (error) throw new Error(error.message);
  _installmentsCache = ((data ?? []) as InstallmentRow[]).map(rowToInstallment);
}

async function _loadPaymentHistory(schoolId: string): Promise<void> {
  const { data, error } = await supabase
    .from('payment_records')
    .select('id, student_id, amount, method, date, receipt_no, advance_amount, note, students(name, admission_no)')
    .eq('school_id', schoolId)
    .order('date', { ascending: false }).order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);

  type PRow = {
    id: string; student_id: string; amount: number; method: string;
    date: string; receipt_no: string; advance_amount: number; note: string | null;
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
      note: p.note ?? undefined,
    };
  });
}

async function _loadGovtPayments(schoolId: string): Promise<void> {
  const { data, error } = await supabase
    .from('government_payments')
    .select('id, amount, date, reference_no, note, govt_payment_student_links(student_id)')
    .eq('school_id', schoolId)
    .order('date', { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  _govtPaymentsCache = ((data ?? []) as Array<{
    id: string; amount: number; date: string; reference_no: string; note: string | null;
    govt_payment_student_links: { student_id: string }[];
  }>).map(g => ({
    id: g.id,
    amount: Number(g.amount),
    date: g.date,
    referenceNo: g.reference_no,
    note: g.note ?? '',
    allocatedStudentIds: (g.govt_payment_student_links ?? []).map(l => l.student_id),
  }));
}

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
  /** Load every fee table for the active school into memory. Call on mount + after writes. */
  async refreshAll(): Promise<void> {
    const schoolId = getSchoolId();
    await Promise.all([
      _loadInstallments(schoolId),
      _loadPaymentHistory(schoolId),
      _loadGovtPayments(schoolId),
      _loadAdvances(schoolId),
    ]);
    _cacheLoadedFor = schoolId;
  },

  // ── Sync read accessors (assume refreshAll() was called) ────────────────
  getInstallments(): FeeInstallment[] {
    return [..._installmentsCache];
  },

  getStudentInstallments(studentId: string): FeeInstallment[] {
    return _installmentsCache.filter(i => i.studentId === studentId);
  },

  getStudentFeeProfile(studentId: string, name: string, className: string, admissionNo: string, isRte = false): StudentFeeProfile {
    const insts = this.getStudentInstallments(studentId);
    return {
      studentId, name, className, admissionNo,
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

  nextReceiptNo(): string {
    return `RCT-${new Date().getFullYear()}-${String(_paymentHistoryCache.length + 1).padStart(4, '0')}`;
  },

  getAdvanceBalance(studentId: string): number {
    return _advanceCache.get(studentId) ?? 0;
  },

  getGovernmentPayments(): GovernmentPaymentRecord[] {
    return [..._govtPaymentsCache];
  },

  getPaidTillMonth(studentId: string): { lastClearedMonth: string | null; allCleared: boolean } {
    const insts = this.getStudentInstallments(studentId).filter(i => i.payerType === 'PARENT');
    if (!insts.length) return { lastClearedMonth: null, allCleared: false };
    const monthDueMap = new Map<string, string>();
    for (const inst of insts) if (!monthDueMap.has(inst.month)) monthDueMap.set(inst.month, inst.dueDate);
    const months = [...monthDueMap.entries()]
      .sort((a, b) => new Date(a[1]).getTime() - new Date(b[1]).getTime())
      .map(([m]) => m);
    let last: string | null = null;
    for (const m of months) {
      const allPaid = insts.filter(i => i.month === m).every(
        i => i.status === 'PAID' || i.status === 'WAIVED' || i.status === 'WRITTEN_OFF',
      );
      if (allPaid) last = m; else break;
    }
    return { lastClearedMonth: last, allCleared: last === months[months.length - 1] && months.length > 0 };
  },

  // Aggregate parent-payable outstanding across ALL years and ALL fee types
  // (TUITION, TRANSPORT, EXAM, OTHER — including any 'Late Fee' rows). The
  // top "Total Outstanding" card in FeesView reads `total`; per-type lines
  // render the individual fields. Government-payable (RTE) rows are excluded.
  getParentDueSummary(studentId: string): {
    tuition: number; transport: number; exam: number; other: number; total: number;
  } {
    const insts = this.getStudentInstallments(studentId).filter(i => i.payerType === 'PARENT');
    const sumOf = (t: FeeType) => insts
      .filter(i => i.feeType === t)
      .reduce((s, i) => s + Math.max(0, i.amount - i.paidAmount - i.writeOffAmount), 0);
    const tuition   = sumOf('TUITION');
    const transport = sumOf('TRANSPORT');
    const exam      = sumOf('EXAM');
    const other     = sumOf('OTHER');
    return { tuition, transport, exam, other, total: tuition + transport + exam + other };
  },

  getGovernmentDueSummary(studentId: string): { tuition: number; total: number } {
    const insts = this.getStudentInstallments(studentId).filter(i => i.payerType === 'GOVERNMENT');
    const tuition = insts.filter(i => i.feeType === 'TUITION').reduce((s, i) => s + Math.max(0, i.amount - i.paidAmount - i.writeOffAmount), 0);
    return { tuition, total: tuition };
  },

  getFeeTypeSummary(studentId: string): { tuition: number; transport: number; total: number } {
    const insts = this.getStudentInstallments(studentId);
    const tuition = insts.filter(i => i.feeType === 'TUITION').reduce((s, i) => s + Math.max(0, i.amount - i.paidAmount - i.writeOffAmount), 0);
    const transport = insts.filter(i => i.feeType === 'TRANSPORT').reduce((s, i) => s + Math.max(0, i.amount - i.paidAmount - i.writeOffAmount), 0);
    return { tuition, transport, total: tuition + transport };
  },

  getSchoolRtePending(): { totalGovtPending: number; totalParentPending: number; rteStudentCount: number } {
    const allInsts = _installmentsCache;
    const govtPending = allInsts
      .filter(i => i.payerType === 'GOVERNMENT' && (i.status === 'UNPAID' || i.status === 'PARTIAL' || i.status === 'OVERDUE'))
      .reduce((s, i) => s + Math.max(0, i.amount - i.paidAmount - i.writeOffAmount), 0);
    const parentPending = allInsts
      .filter(i => i.payerType === 'PARENT' && (i.status === 'UNPAID' || i.status === 'PARTIAL' || i.status === 'OVERDUE'))
      .reduce((s, i) => s + Math.max(0, i.amount - i.paidAmount - i.writeOffAmount), 0);
    const rte = new Set(allInsts.filter(i => i.payerType === 'GOVERNMENT').map(i => i.studentId));
    return { totalGovtPending: govtPending, totalParentPending: parentPending, rteStudentCount: rte.size };
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
   */
  async recordPayment(
    studentId: string, amount: number, method = 'CASH',
    date?: string, note?: string, useAdvance = false, applyLateFee = true,
  ): Promise<{ applied: number; advance: number; paymentId: string }> {
    if (amount <= 0) return { applied: 0, advance: 0, paymentId: '' };

    const beforeAdv = this.getAdvanceBalance(studentId);
    const beforeDue = this.getStudentInstallments(studentId)
      .filter(i => i.payerType === 'PARENT')
      .reduce((s, i) => s + Math.max(0, i.amount - i.paidAmount - i.writeOffAmount), 0);

    const { data, error } = await supabase.rpc('record_fee_payment', {
      p_student_id: studentId,
      p_amount: amount,
      p_method: method,
      p_date: date ?? new Date().toISOString().slice(0, 10),
      p_note: note ?? null,
      p_use_advance: useAdvance,
      p_apply_late_fee: applyLateFee,
    });
    if (error) throw new Error(error.message);
    const paymentId = data as string;

    await this.refreshAll();

    const afterDue = this.getStudentInstallments(studentId)
      .filter(i => i.payerType === 'PARENT')
      .reduce((s, i) => s + Math.max(0, i.amount - i.paidAmount - i.writeOffAmount), 0);
    const afterAdv = this.getAdvanceBalance(studentId);
    const applied = Math.max(0, beforeDue - afterDue);
    const advance = Math.max(0, afterAdv - (useAdvance ? 0 : beforeAdv));
    return { applied, advance, paymentId };
  },

  /** Bulk RTE / govt payment over multiple students' tuition installments. */
  async recordGovernmentPayment(
    studentIds: string[], totalAmount: number, referenceNo: string, note: string,
  ): Promise<boolean> {
    if (totalAmount <= 0 || !studentIds.length) return false;
    const { error } = await supabase.rpc('record_govt_payment', {
      p_amount: totalAmount,
      p_date: new Date().toISOString().slice(0, 10),
      p_reference: referenceNo,
      p_note: note,
      p_student_ids: studentIds,
    });
    if (error) throw new Error(error.message);
    await this.refreshAll();
    return true;
  },

  /** Apply a write-off directly to a single installment. */
  async writeOffFee(installmentId: string, amount: number, reason: string): Promise<boolean> {
    const inst = _installmentsCache.find(i => i.id === installmentId);
    if (!inst) return false;
    const maxWriteOff = Math.max(0, inst.amount - inst.paidAmount - inst.writeOffAmount);
    const writeOff = Math.min(amount, maxWriteOff);
    if (writeOff <= 0) return false;

    const schoolId = getSchoolId();

    // Insert audit row first — abort the whole write-off if it fails so the
    // installment row never drifts out of sync with the audit log.
    const { error: woErr } = await supabase.from('fee_write_offs').insert({
      installment_id: installmentId, school_id: schoolId,
      amount: writeOff, reason,
    });
    if (woErr) throw new Error(woErr.message);

    const newWriteOff = inst.writeOffAmount + writeOff;
    const total = inst.amount - newWriteOff;
    const newStatus: FeeStatus = inst.paidAmount >= total ? 'PAID' :
                                 inst.paidAmount + newWriteOff >= inst.amount ? 'WAIVED' :
                                 inst.paidAmount > 0 ? 'PARTIAL' : 'UNPAID';

    const { error } = await supabase.from('fee_installments').update({
      write_off_amount: newWriteOff,
      write_off_reason: reason,
      status: newStatus,
      updated_at: new Date().toISOString(),
    }).eq('id', installmentId);
    if (error) throw new Error(error.message);

    await logAudit('fee_writeoff', 'fee_installment', installmentId, { amount: writeOff, reason });
    await this.refreshAll();
    return true;
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
    const { data, error } = await supabase.rpc('generate_student_fee_schedule', {
      p_student_id: studentId,
      p_year_id: academicYearId,
      p_heads: heads,
      p_due_dates: dueDates,
      p_is_rte: isRte,
      p_discount_amount: discountAmount,
      p_discount_pct: discountPct,
    });
    if (error) throw new Error(error.message);
    await this.refreshAll();
    return Number(data) || 0;
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

    const rows: Record<string, unknown>[] = [];
    while (cursor <= end && cursor <= yearEnd) {
      rows.push({
        student_id: studentId, school_id: schoolId, academic_year_id: ayRow.id,
        month: cursor.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
        due_date: cursor.toISOString().slice(0, 10),
        fee_type: 'TRANSPORT',
        amount: monthlyAmount,
        payer_type: 'PARENT',
        related_id: assignmentId,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    if (rows.length) {
      const { error } = await supabase.from('fee_installments').insert(rows);
      if (error) throw new Error(error.message);
      await this.refreshAll();
    }
  },

  async removeTransportFeeSchedule(assignmentId: string): Promise<void> {
    // Drop only future, unpaid rows tied to this assignment.
    const { error } = await supabase.from('fee_installments').delete()
      .eq('related_id', assignmentId)
      .eq('paid_amount', 0)
      .gte('due_date', new Date().toISOString().slice(0, 10));
    if (error) throw new Error(error.message);
    await this.refreshAll();
  },

  // ── Backwards-compat helpers (no-op cache writes — RPCs do the work) ────
  addPaymentRecord(_record: PaymentRecord): void {
    // No-op: the record_fee_payment RPC inserts the payment row atomically.
    // Kept for API compatibility with the older synchronous code path.
  },

  /** Force-load cache for a single student (used by FeesView etc). */
  async loadForStudent(studentId: string): Promise<void> {
    if (_cacheLoadedFor === useAuthStore.getState().session?.schoolId && _installmentsCache.some(i => i.studentId === studentId)) return;
    await this.refreshAll();
  },
};
