// ─── Types ────────────────────────────────────────────────────────────────────

export type FeeType = 'TUITION' | 'TRANSPORT' | 'EXAM' | 'OTHER';
export type FeeStatus = 'PAID' | 'PARTIAL' | 'UNPAID' | 'WAIVED';

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
}

// ─── Seed Data ────────────────────────────────────────────────────────────────

// Tuition fee schedule (all students, all months)
const _tuitionSchedule: FeeInstallment[] = [
  // Student 1: Aakash
  { id: 'tui1', studentId: 'student1', academicYearId: 'ay1', month: 'April 2026', dueDate: '2026-04-10', feeType: 'TUITION', amount: 3500, paidAmount: 3500, writeOffAmount: 0, writeOffReason: '', status: 'PAID' },
  { id: 'tui2', studentId: 'student1', academicYearId: 'ay1', month: 'May 2026', dueDate: '2026-05-10', feeType: 'TUITION', amount: 3500, paidAmount: 2000, writeOffAmount: 0, writeOffReason: '', status: 'PARTIAL' },
  { id: 'tui3', studentId: 'student1', academicYearId: 'ay1', month: 'June 2026', dueDate: '2026-06-10', feeType: 'TUITION', amount: 3500, paidAmount: 0, writeOffAmount: 0, writeOffReason: '', status: 'UNPAID' },
  { id: 'tui4', studentId: 'student1', academicYearId: 'ay1', month: 'July 2026', dueDate: '2026-07-10', feeType: 'TUITION', amount: 3500, paidAmount: 0, writeOffAmount: 0, writeOffReason: '', status: 'UNPAID' },

  // Student 2: Priya
  { id: 'tui5', studentId: 'student2', academicYearId: 'ay1', month: 'April 2026', dueDate: '2026-04-10', feeType: 'TUITION', amount: 3500, paidAmount: 3500, writeOffAmount: 0, writeOffReason: '', status: 'PAID' },
  { id: 'tui6', studentId: 'student2', academicYearId: 'ay1', month: 'May 2026', dueDate: '2026-05-10', feeType: 'TUITION', amount: 3500, paidAmount: 3500, writeOffAmount: 0, writeOffReason: '', status: 'PAID' },
  { id: 'tui7', studentId: 'student2', academicYearId: 'ay1', month: 'June 2026', dueDate: '2026-06-10', feeType: 'TUITION', amount: 3500, paidAmount: 0, writeOffAmount: 0, writeOffReason: '', status: 'UNPAID' },

  // Student 3: Rahul
  { id: 'tui8', studentId: 'student3', academicYearId: 'ay1', month: 'April 2026', dueDate: '2026-04-10', feeType: 'TUITION', amount: 3000, paidAmount: 1000, writeOffAmount: 0, writeOffReason: '', status: 'PARTIAL' },
  { id: 'tui9', studentId: 'student3', academicYearId: 'ay1', month: 'May 2026', dueDate: '2026-05-10', feeType: 'TUITION', amount: 3000, paidAmount: 0, writeOffAmount: 0, writeOffReason: '', status: 'UNPAID' },
];

// Transport fee schedule (auto-generated when vehicle assigned)
let _transportSchedule: FeeInstallment[] = [
  // Student 1: Aakash assigned to Route A (₹500/month) from April onwards
  { id: 'tra1', studentId: 'student1', academicYearId: 'ay1', month: 'April 2026', dueDate: '2026-04-10', feeType: 'TRANSPORT', amount: 500, paidAmount: 500, writeOffAmount: 0, writeOffReason: '', status: 'PAID', relatedId: 'ta1' },
  { id: 'tra2', studentId: 'student1', academicYearId: 'ay1', month: 'May 2026', dueDate: '2026-05-10', feeType: 'TRANSPORT', amount: 500, paidAmount: 500, writeOffAmount: 0, writeOffReason: '', status: 'PAID', relatedId: 'ta1' },
  { id: 'tra3', studentId: 'student1', academicYearId: 'ay1', month: 'June 2026', dueDate: '2026-06-10', feeType: 'TRANSPORT', amount: 500, paidAmount: 0, writeOffAmount: 0, writeOffReason: '', status: 'UNPAID', relatedId: 'ta1' },

  // Student 2: Priya assigned to Route A (₹500/month) from April onwards
  { id: 'tra4', studentId: 'student2', academicYearId: 'ay1', month: 'April 2026', dueDate: '2026-04-10', feeType: 'TRANSPORT', amount: 500, paidAmount: 500, writeOffAmount: 0, writeOffReason: '', status: 'PAID', relatedId: 'ta2' },
  { id: 'tra5', studentId: 'student2', academicYearId: 'ay1', month: 'May 2026', dueDate: '2026-05-10', feeType: 'TRANSPORT', amount: 500, paidAmount: 500, writeOffAmount: 0, writeOffReason: '', status: 'PAID', relatedId: 'ta2' },
  { id: 'tra6', studentId: 'student2', academicYearId: 'ay1', month: 'June 2026', dueDate: '2026-06-10', feeType: 'TRANSPORT', amount: 500, paidAmount: 0, writeOffAmount: 0, writeOffReason: '', status: 'UNPAID', relatedId: 'ta2' },

  // Student 3: Rahul assigned to Route B (₹400/month) from April onwards
  { id: 'tra7', studentId: 'student3', academicYearId: 'ay1', month: 'April 2026', dueDate: '2026-04-10', feeType: 'TRANSPORT', amount: 400, paidAmount: 400, writeOffAmount: 0, writeOffReason: '', status: 'PAID', relatedId: 'ta3' },
  { id: 'tra8', studentId: 'student3', academicYearId: 'ay1', month: 'May 2026', dueDate: '2026-05-10', feeType: 'TRANSPORT', amount: 400, paidAmount: 0, writeOffAmount: 0, writeOffReason: '', status: 'UNPAID', relatedId: 'ta3' },
];

// ─── Service API ──────────────────────────────────────────────────────────────

export const feeService = {

  // ── Get all installments ────────────────────────────────────────────────
  getInstallments(): FeeInstallment[] {
    return [..._tuitionSchedule, ..._transportSchedule].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  },

  getStudentInstallments(studentId: string): FeeInstallment[] {
    return feeService.getInstallments().filter(i => i.studentId === studentId);
  },

  getStudentFeeProfile(studentId: string, name: string, className: string, admissionNo: string): StudentFeeProfile {
    return {
      studentId,
      name,
      className,
      admissionNo,
      academicYearId: 'ay1',
      installments: feeService.getStudentInstallments(studentId),
    };
  },

  // ── Add transport fee schedule when student assigned ────────────────────
  addTransportFeeSchedule(
    studentId: string,
    monthlyAmount: number,
    startDate: string, // YYYY-MM-DD
    endDate: string | null, // null if ongoing
    assignmentId: string,
  ): void {
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date('2026-12-31'); // Demo: end of year

    // Generate monthly entries from startDate to endDate
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
            relatedId: assignmentId,
          });
        }
      }
    }
  },

  // ── Remove future unpaid transport fees when assignment ends ────────────
  removeTransportFeeSchedule(assignmentId: string): void {
    const now = new Date();
    _transportSchedule = _transportSchedule.filter(t => {
      if (t.relatedId !== assignmentId) return true;
      // Keep paid/waived records, only remove future unpaid
      if (t.status === 'PAID' || t.status === 'WAIVED') return true;
      if (new Date(t.dueDate) < now) return true;
      return false; // Remove future unpaid transport fees
    });
  },

  // ── Record payment with oldest-due-first allocation ────────────────────
  recordPayment(studentId: string, amount: number): boolean {
    if (amount <= 0) return false;

    const installments = feeService.getStudentInstallments(studentId)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

    let remaining = amount;

    for (const inst of installments) {
      if (remaining <= 0) break;
      if (inst.status === 'PAID' || inst.status === 'WAIVED') continue;

      const due = inst.amount - inst.paidAmount - inst.writeOffAmount;
      if (due <= 0) continue;

      const applying = Math.min(remaining, due);
      inst.paidAmount += applying;
      remaining -= applying;

      // Update status
      const total = inst.amount - inst.writeOffAmount;
      if (inst.paidAmount >= total) {
        inst.status = 'PAID';
      } else if (inst.paidAmount > 0) {
        inst.status = 'PARTIAL';
      }
    }

    return remaining < amount;
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

  // ── Get fee summary by type ─────────────────────────────────────────────
  getFeeTypeSummary(studentId: string): { tuition: number; transport: number; total: number } {
    const insts = feeService.getStudentInstallments(studentId);
    const tuition = insts
      .filter(i => i.feeType === 'TUITION')
      .reduce((sum, i) => sum + (i.amount - i.paidAmount - i.writeOffAmount), 0);
    const transport = insts
      .filter(i => i.feeType === 'TRANSPORT')
      .reduce((sum, i) => sum + (i.amount - i.paidAmount - i.writeOffAmount), 0);
    return { tuition: Math.max(0, tuition), transport: Math.max(0, transport), total: tuition + transport };
  },
};
