// ─── Types ────────────────────────────────────────────────────────────────────

export type FeeType = 'TUITION' | 'TRANSPORT' | 'EXAM' | 'OTHER';
export type FeeStatus = 'PAID' | 'PARTIAL' | 'UNPAID' | 'WAIVED';
export type PayerType = 'PARENT' | 'GOVERNMENT';

export interface PaymentRecord {
  id: string;
  studentId: string;
  studentName: string;
  className: string;
  admissionNo: string;
  amount: number;
  method: string;        // display label, e.g. "Cash", "UPI"
  date: string;          // YYYY-MM-DD
  receiptNo: string;
  installmentIds: string[];
  installmentDetails: { month: string; feeType: FeeType; amount: number }[];
  advanceAmount: number;
}

export interface FeeInstallment {
  id: string;
  studentId: string;
  academicYearId: string;
  month: string; // e.g., "April 2026"
  dueDate: string; // YYYY-MM-DD
  feeType: FeeType;
  amount: number;
  paidAmount: number;
  writeOffAmount: number;
  writeOffReason: string;
  status: FeeStatus;
  payerType: PayerType; // PARENT = parent pays, GOVERNMENT = RTE govt pays
  relatedId?: string; // For transport: vehicle assignment ID
}

export interface StudentTransportAssignment {
  id: string;
  studentId: string;
  academicYearId: string;
  vehicleId: string;
  stopId: string;
  monthlyAmount: number; // Auto-calculated from stop/route
  startDate: string; // YYYY-MM-DD (when transport starts)
  endDate: string | null; // YYYY-MM-DD or null if ongoing
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

// ─── Seed Data ────────────────────────────────────────────────────────────────

// Tuition fee schedule (all students, all months)
// student2 = Priya Gupta (RTE) → payerType: GOVERNMENT for tuition
const _tuitionSchedule: FeeInstallment[] = [
  // Student 1: Aakash (Normal) → PARENT pays
  { id: 'tui1', studentId: 'student1', academicYearId: 'ay1', month: 'April 2026', dueDate: '2026-04-10', feeType: 'TUITION', amount: 3500, paidAmount: 3500, writeOffAmount: 0, writeOffReason: '', status: 'PAID', payerType: 'PARENT' },
  { id: 'tui2', studentId: 'student1', academicYearId: 'ay1', month: 'May 2026', dueDate: '2026-05-10', feeType: 'TUITION', amount: 3500, paidAmount: 2000, writeOffAmount: 0, writeOffReason: '', status: 'PARTIAL', payerType: 'PARENT' },
  { id: 'tui3', studentId: 'student1', academicYearId: 'ay1', month: 'June 2026', dueDate: '2026-06-10', feeType: 'TUITION', amount: 3500, paidAmount: 0, writeOffAmount: 0, writeOffReason: '', status: 'UNPAID', payerType: 'PARENT' },
  { id: 'tui4', studentId: 'student1', academicYearId: 'ay1', month: 'July 2026', dueDate: '2026-07-10', feeType: 'TUITION', amount: 3500, paidAmount: 0, writeOffAmount: 0, writeOffReason: '', status: 'UNPAID', payerType: 'PARENT' },

  // Student 2: Priya (RTE) → GOVERNMENT pays tuition
  { id: 'tui5', studentId: 'student2', academicYearId: 'ay1', month: 'April 2026', dueDate: '2026-04-10', feeType: 'TUITION', amount: 3500, paidAmount: 3500, writeOffAmount: 0, writeOffReason: '', status: 'PAID', payerType: 'GOVERNMENT' },
  { id: 'tui6', studentId: 'student2', academicYearId: 'ay1', month: 'May 2026', dueDate: '2026-05-10', feeType: 'TUITION', amount: 3500, paidAmount: 3500, writeOffAmount: 0, writeOffReason: '', status: 'PAID', payerType: 'GOVERNMENT' },
  { id: 'tui7', studentId: 'student2', academicYearId: 'ay1', month: 'June 2026', dueDate: '2026-06-10', feeType: 'TUITION', amount: 3500, paidAmount: 0, writeOffAmount: 0, writeOffReason: '', status: 'UNPAID', payerType: 'GOVERNMENT' },
  { id: 'tui8', studentId: 'student2', academicYearId: 'ay1', month: 'July 2026', dueDate: '2026-07-10', feeType: 'TUITION', amount: 3500, paidAmount: 0, writeOffAmount: 0, writeOffReason: '', status: 'UNPAID', payerType: 'GOVERNMENT' },

  // Student 3: Rahul (Normal) → PARENT pays
  { id: 'tui9', studentId: 'student3', academicYearId: 'ay1', month: 'April 2026', dueDate: '2026-04-10', feeType: 'TUITION', amount: 3000, paidAmount: 1000, writeOffAmount: 0, writeOffReason: '', status: 'PARTIAL', payerType: 'PARENT' },
  { id: 'tui10', studentId: 'student3', academicYearId: 'ay1', month: 'May 2026', dueDate: '2026-05-10', feeType: 'TUITION', amount: 3000, paidAmount: 0, writeOffAmount: 0, writeOffReason: '', status: 'UNPAID', payerType: 'PARENT' },
];

// Transport fee schedule (auto-generated when vehicle assigned)
// RTE student transport is PARENT responsibility (government only covers tuition)
let _transportSchedule: FeeInstallment[] = [
  // Student 1: Aakash assigned to Route A (₹500/month)
  { id: 'tra1', studentId: 'student1', academicYearId: 'ay1', month: 'April 2026', dueDate: '2026-04-10', feeType: 'TRANSPORT', amount: 500, paidAmount: 500, writeOffAmount: 0, writeOffReason: '', status: 'PAID', payerType: 'PARENT', relatedId: 'ta1' },
  { id: 'tra2', studentId: 'student1', academicYearId: 'ay1', month: 'May 2026', dueDate: '2026-05-10', feeType: 'TRANSPORT', amount: 500, paidAmount: 500, writeOffAmount: 0, writeOffReason: '', status: 'PAID', payerType: 'PARENT', relatedId: 'ta1' },
  { id: 'tra3', studentId: 'student1', academicYearId: 'ay1', month: 'June 2026', dueDate: '2026-06-10', feeType: 'TRANSPORT', amount: 500, paidAmount: 0, writeOffAmount: 0, writeOffReason: '', status: 'UNPAID', payerType: 'PARENT', relatedId: 'ta1' },

  // Student 2: Priya (RTE) — transport still PARENT responsibility
  { id: 'tra4', studentId: 'student2', academicYearId: 'ay1', month: 'April 2026', dueDate: '2026-04-10', feeType: 'TRANSPORT', amount: 500, paidAmount: 500, writeOffAmount: 0, writeOffReason: '', status: 'PAID', payerType: 'PARENT', relatedId: 'ta2' },
  { id: 'tra5', studentId: 'student2', academicYearId: 'ay1', month: 'May 2026', dueDate: '2026-05-10', feeType: 'TRANSPORT', amount: 500, paidAmount: 500, writeOffAmount: 0, writeOffReason: '', status: 'PAID', payerType: 'PARENT', relatedId: 'ta2' },
  { id: 'tra6', studentId: 'student2', academicYearId: 'ay1', month: 'June 2026', dueDate: '2026-06-10', feeType: 'TRANSPORT', amount: 500, paidAmount: 0, writeOffAmount: 0, writeOffReason: '', status: 'UNPAID', payerType: 'PARENT', relatedId: 'ta2' },

  // Student 3: Rahul assigned to Route B (₹400/month)
  { id: 'tra7', studentId: 'student3', academicYearId: 'ay1', month: 'April 2026', dueDate: '2026-04-10', feeType: 'TRANSPORT', amount: 400, paidAmount: 400, writeOffAmount: 0, writeOffReason: '', status: 'PAID', payerType: 'PARENT', relatedId: 'ta3' },
  { id: 'tra8', studentId: 'student3', academicYearId: 'ay1', month: 'May 2026', dueDate: '2026-05-10', feeType: 'TRANSPORT', amount: 400, paidAmount: 0, writeOffAmount: 0, writeOffReason: '', status: 'UNPAID', payerType: 'PARENT', relatedId: 'ta3' },
];

// ─── localStorage helpers ─────────────────────────────────────────────────────

const LS_ADVANCE = 'school_fee_advance_v1';
const LS_HISTORY = 'school_fee_history_v1';

function _lsLoad<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback; }
  catch { return fallback; }
}

function _lsSave(key: string, data: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* storage quota */ }
}

// ─── Runtime state ────────────────────────────────────────────────────────────

// Advance balance per student — persisted to localStorage
let _advanceBalances: Record<string, number> = _lsLoad(LS_ADVANCE, {});

// Full payment allocation history — persisted to localStorage
let _paymentHistory: PaymentRecord[] = _lsLoad(LS_HISTORY, []);

// Government payment history
let _governmentPayments: GovernmentPaymentRecord[] = [
  {
    id: 'gp1',
    amount: 7000,
    date: '2026-05-05',
    referenceNo: 'RTE/2026/APR-MAY/001',
    note: 'RTE reimbursement April-May 2026',
    allocatedStudentIds: ['student2'],
  },
];

// ─── Private helpers ──────────────────────────────────────────────────────────

// Drain existing advance balance into open PARENT dues (called when new dues arrive)
function _applyAdvance(studentId: string): void {
  const advance = _advanceBalances[studentId] ?? 0;
  if (advance <= 0) return;

  _advanceBalances[studentId] = 0;
  let remaining = advance;

  const all = [..._tuitionSchedule, ..._transportSchedule]
    .filter(i => i.studentId === studentId && i.payerType === 'PARENT' &&
                 (i.status === 'UNPAID' || i.status === 'PARTIAL'))
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  for (const inst of all) {
    if (remaining <= 0) break;
    const due = inst.amount - inst.paidAmount - inst.writeOffAmount;
    if (due <= 0) continue;
    const applying = Math.min(remaining, due);
    inst.paidAmount += applying;
    remaining -= applying;
    const total = inst.amount - inst.writeOffAmount;
    if (inst.paidAmount >= total) inst.status = 'PAID';
    else if (inst.paidAmount > 0) inst.status = 'PARTIAL';
  }

  if (remaining > 0) _advanceBalances[studentId] = remaining;
  _lsSave(LS_ADVANCE, _advanceBalances);
}

// ─── Service API ──────────────────────────────────────────────────────────────

export const feeService = {

  // ── Get all installments ────────────────────────────────────────────────
  getInstallments(): FeeInstallment[] {
    return [..._tuitionSchedule, ..._transportSchedule].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  },

  getStudentInstallments(studentId: string): FeeInstallment[] {
    return feeService.getInstallments().filter(i => i.studentId === studentId);
  },

  getStudentFeeProfile(studentId: string, name: string, className: string, admissionNo: string, isRte = false): StudentFeeProfile {
    return {
      studentId,
      name,
      className,
      admissionNo,
      academicYearId: 'ay1',
      installments: feeService.getStudentInstallments(studentId),
      isRte,
    };
  },

  // ── Add transport fee schedule when student assigned ────────────────────
  addTransportFeeSchedule(
    studentId: string,
    monthlyAmount: number,
    startDate: string,
    endDate: string | null,
    assignmentId: string,
    isRte = false,
  ): void {
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date('2026-12-31');

    const months = [
      { name: 'April 2026', date: '2026-04-10' },
      { name: 'May 2026', date: '2026-05-10' },
      { name: 'June 2026', date: '2026-06-10' },
      { name: 'July 2026', date: '2026-07-10' },
      { name: 'August 2026', date: '2026-08-10' },
      { name: 'September 2026', date: '2026-09-10' },
      { name: 'October 2026', date: '2026-10-10' },
    ];

    for (const month of months) {
      const monthDate = new Date(month.date);
      if (monthDate >= start && monthDate <= end) {
        const existing = _transportSchedule.find(
          t => t.studentId === studentId && t.month === month.name
        );
        if (!existing) {
          _transportSchedule.push({
            id: `tra${Date.now()}`,
            studentId,
            academicYearId: 'ay1',
            month: month.name,
            dueDate: month.date,
            feeType: 'TRANSPORT',
            amount: monthlyAmount,
            paidAmount: 0,
            writeOffAmount: 0,
            writeOffReason: '',
            status: 'UNPAID',
            // Transport always stays PARENT even for RTE students (govt only covers tuition)
            payerType: 'PARENT',
            relatedId: assignmentId,
          });
        }
      }
    }

    // Auto-apply any existing advance balance to the newly created dues
    _applyAdvance(studentId);
  },

  // ── Remove future unpaid transport fees when assignment ends ────────────
  removeTransportFeeSchedule(assignmentId: string): void {
    const now = new Date();
    _transportSchedule = _transportSchedule.filter(t => {
      if (t.relatedId !== assignmentId) return true;
      if (t.status === 'PAID' || t.status === 'WAIVED') return true;
      if (new Date(t.dueDate) < now) return true;
      return false;
    });
  },

  // ── Record payment (parent pays) — allocates oldest PARENT dues first; excess → advance ──
  recordPayment(studentId: string, amount: number): { applied: number; advance: number } {
    if (amount <= 0) return { applied: 0, advance: 0 };

    // Combine new payment with any existing advance balance
    const existingAdvance = _advanceBalances[studentId] ?? 0;
    let remaining = amount + existingAdvance;
    _advanceBalances[studentId] = 0;

    const installments = feeService.getStudentInstallments(studentId)
      .filter(i => i.payerType === 'PARENT')
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

    const startRemaining = remaining;

    for (const inst of installments) {
      if (remaining <= 0) break;
      if (inst.status === 'PAID' || inst.status === 'WAIVED') continue;

      const due = inst.amount - inst.paidAmount - inst.writeOffAmount;
      if (due <= 0) continue;

      const applying = Math.min(remaining, due);
      inst.paidAmount += applying;
      remaining -= applying;

      const total = inst.amount - inst.writeOffAmount;
      if (inst.paidAmount >= total) {
        inst.status = 'PAID';
      } else if (inst.paidAmount > 0) {
        inst.status = 'PARTIAL';
      }
    }

    // Store excess as advance balance for future dues, then persist
    if (remaining > 0) {
      _advanceBalances[studentId] = remaining;
    }
    _lsSave(LS_ADVANCE, _advanceBalances);

    return { applied: startRemaining - remaining, advance: remaining };
  },

  // ── Payment history ────────────────────────────────────────────────────
  addPaymentRecord(record: PaymentRecord): void {
    _paymentHistory.push(record);
    _lsSave(LS_HISTORY, _paymentHistory);
  },

  getPaymentHistory(studentId?: string): PaymentRecord[] {
    const all = [..._paymentHistory].sort((a, b) => b.date.localeCompare(a.date));
    return studentId ? all.filter(r => r.studentId === studentId) : all;
  },

  getPaymentRecordByInstallmentId(installmentId: string): PaymentRecord | null {
    return [..._paymentHistory].reverse().find(r => r.installmentIds.includes(installmentId)) ?? null;
  },

  nextReceiptNo(): string {
    return `RCT-${new Date().getFullYear()}-${String(_paymentHistory.length + 1).padStart(4, '0')}`;
  },

  // ── Advance balance for a student ──────────────────────────────────────
  getAdvanceBalance(studentId: string): number {
    return _advanceBalances[studentId] ?? 0;
  },

  // ── Compute "paid till" month (all installments cleared consecutively) ──
  getPaidTillMonth(studentId: string): { lastClearedMonth: string | null; allCleared: boolean } {
    const installments = feeService.getStudentInstallments(studentId)
      .filter(i => i.payerType === 'PARENT');

    if (installments.length === 0) return { lastClearedMonth: null, allCleared: false };

    // Build sorted unique months
    const monthDueMap = new Map<string, string>();
    for (const inst of installments) {
      if (!monthDueMap.has(inst.month)) monthDueMap.set(inst.month, inst.dueDate);
    }
    const months = [...monthDueMap.entries()]
      .sort((a, b) => new Date(a[1]).getTime() - new Date(b[1]).getTime())
      .map(([month]) => month);

    let lastClearedMonth: string | null = null;
    for (const month of months) {
      const allPaid = installments
        .filter(i => i.month === month)
        .every(i => i.status === 'PAID' || i.status === 'WAIVED');
      if (allPaid) {
        lastClearedMonth = month;
      } else {
        break;
      }
    }

    const allCleared = lastClearedMonth === months[months.length - 1] && months.length > 0;
    return { lastClearedMonth, allCleared };
  },

  // ── Record government payment (bulk) — allocates GOVERNMENT payer installments ──
  recordGovernmentPayment(
    studentIds: string[],
    totalAmount: number,
    referenceNo: string,
    note: string,
  ): boolean {
    if (totalAmount <= 0 || studentIds.length === 0) return false;

    let remaining = totalAmount;

    for (const studentId of studentIds) {
      if (remaining <= 0) break;

      const govtInstallments = feeService.getStudentInstallments(studentId)
        .filter(i => i.payerType === 'GOVERNMENT' && (i.status === 'UNPAID' || i.status === 'PARTIAL'))
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

      for (const inst of govtInstallments) {
        if (remaining <= 0) break;
        const due = inst.amount - inst.paidAmount - inst.writeOffAmount;
        if (due <= 0) continue;
        const applying = Math.min(remaining, due);
        inst.paidAmount += applying;
        remaining -= applying;
        const total = inst.amount - inst.writeOffAmount;
        if (inst.paidAmount >= total) inst.status = 'PAID';
        else if (inst.paidAmount > 0) inst.status = 'PARTIAL';
      }
    }

    _governmentPayments.push({
      id: `gp${Date.now()}`,
      amount: totalAmount,
      date: new Date().toISOString().split('T')[0],
      referenceNo,
      note,
      allocatedStudentIds: studentIds,
    });

    return true;
  },

  // ── Write off installment ───────────────────────────────────────────────
  writeOffFee(installmentId: string, amount: number, reason: string): boolean {
    const tuition = _tuitionSchedule.find(t => t.id === installmentId);
    const transport = _transportSchedule.find(t => t.id === installmentId);
    const inst = tuition || transport;

    if (!inst) return false;

    const maxWriteOff = inst.amount - inst.paidAmount;
    const writeOff = Math.min(amount, maxWriteOff);
    inst.writeOffAmount += writeOff;
    inst.writeOffReason = reason;

    const total = inst.amount - inst.writeOffAmount;
    if (inst.paidAmount >= total) {
      inst.status = 'PAID';
    } else if (inst.paidAmount + inst.writeOffAmount >= inst.amount) {
      inst.status = 'WAIVED';
    }

    return true;
  },

  // ── Fee summary for PARENT-payer dues only (for student/parent view) ────
  getParentDueSummary(studentId: string): { tuition: number; transport: number; total: number } {
    const insts = feeService.getStudentInstallments(studentId).filter(i => i.payerType === 'PARENT');
    const tuition = insts.filter(i => i.feeType === 'TUITION').reduce((sum, i) => sum + (i.amount - i.paidAmount - i.writeOffAmount), 0);
    const transport = insts.filter(i => i.feeType === 'TRANSPORT').reduce((sum, i) => sum + (i.amount - i.paidAmount - i.writeOffAmount), 0);
    return { tuition: Math.max(0, tuition), transport: Math.max(0, transport), total: Math.max(0, tuition + transport) };
  },

  // ── Fee summary for GOVERNMENT-payer dues (for principal RTE tracking) ─
  getGovernmentDueSummary(studentId: string): { tuition: number; total: number } {
    const insts = feeService.getStudentInstallments(studentId).filter(i => i.payerType === 'GOVERNMENT');
    const tuition = insts.filter(i => i.feeType === 'TUITION').reduce((sum, i) => sum + (i.amount - i.paidAmount - i.writeOffAmount), 0);
    return { tuition: Math.max(0, tuition), total: Math.max(0, tuition) };
  },

  // ── Combined summary (for principal all-in view) ────────────────────────
  getFeeTypeSummary(studentId: string): { tuition: number; transport: number; total: number } {
    const insts = feeService.getStudentInstallments(studentId);
    const tuition = insts.filter(i => i.feeType === 'TUITION').reduce((sum, i) => sum + (i.amount - i.paidAmount - i.writeOffAmount), 0);
    const transport = insts.filter(i => i.feeType === 'TRANSPORT').reduce((sum, i) => sum + (i.amount - i.paidAmount - i.writeOffAmount), 0);
    return { tuition: Math.max(0, tuition), transport: Math.max(0, transport), total: Math.max(0, tuition + transport) };
  },

  // ── School-wide RTE pending (for principal dashboard) ─────────────────
  getSchoolRtePending(): { totalGovtPending: number; totalParentPending: number; rteStudentCount: number } {
    const allInsts = feeService.getInstallments();
    const govtPending = allInsts
      .filter(i => i.payerType === 'GOVERNMENT' && (i.status === 'UNPAID' || i.status === 'PARTIAL'))
      .reduce((sum, i) => sum + (i.amount - i.paidAmount - i.writeOffAmount), 0);
    const parentPending = allInsts
      .filter(i => i.payerType === 'PARENT' && (i.status === 'UNPAID' || i.status === 'PARTIAL'))
      .reduce((sum, i) => sum + (i.amount - i.paidAmount - i.writeOffAmount), 0);
    const rteStudents = new Set(allInsts.filter(i => i.payerType === 'GOVERNMENT').map(i => i.studentId));
    return {
      totalGovtPending: Math.max(0, govtPending),
      totalParentPending: Math.max(0, parentPending),
      rteStudentCount: rteStudents.size,
    };
  },

  // ── Get government payment history ─────────────────────────────────────
  getGovernmentPayments(): GovernmentPaymentRecord[] {
    return [..._governmentPayments].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  },
};
