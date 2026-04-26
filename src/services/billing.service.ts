import { BillingRecord, CreateBillingInput, PaymentHistoryEntry } from '../types/billing.types';
import { BillingPlan, PaymentStatus, PLAN_PRICES } from '../config/constants';

const MOCK_BILLING: BillingRecord[] = [
  // DPS — 12 months, 4 paid (Apr/May/Jun/Jul) + 8 upcoming
  ...generateMonthlySchedule('s1', 'Delhi Public School', BillingPlan.PREMIUM, '2024-04-01', 4),
  ...generateMonthlySchedule('s2', 'Greenwood High School', BillingPlan.STANDARD, '2024-04-01', 3),
  ...generateMonthlySchedule('s3', 'Sunrise Valley Academy', BillingPlan.BASIC, '2024-04-01', 2),
  ...generateMonthlySchedule('s4', "St. Mary's Convent", BillingPlan.PREMIUM, '2024-04-01', 4),
  ...generateMonthlySchedule('s5', 'Heritage International School', BillingPlan.STANDARD, '2024-04-01', 0),
  ...generateMonthlySchedule('s6', 'Oakridge International', BillingPlan.PREMIUM, '2025-02-01', 0),
];

function generateMonthlySchedule(
  schoolId: string,
  schoolName: string,
  plan: BillingPlan,
  startDate: string,
  paidCount: number,
): BillingRecord[] {
  const records: BillingRecord[] = [];
  const start = new Date(startDate);
  const amount = PLAN_PRICES[plan];

  for (let i = 0; i < 12; i++) {
    const due = new Date(start);
    due.setMonth(due.getMonth() + i);
    const dueDate = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-01`;

    let status: PaymentStatus;
    let paidAt: string | null = null;
    let txnId: string | null = null;

    if (i < paidCount) {
      status = PaymentStatus.PAID;
      paidAt = dueDate;
      txnId = `TXN-${due.getFullYear()}${String(due.getMonth() + 1).padStart(2, '0')}-${schoolId.toUpperCase()}-001`;
    } else if (i === paidCount && new Date() > due) {
      status = PaymentStatus.OVERDUE;
    } else if (i === paidCount) {
      status = PaymentStatus.PENDING;
    } else {
      status = PaymentStatus.PENDING;
    }

    records.push({
      id: `b-${schoolId}-${i}`,
      schoolId,
      schoolName,
      plan,
      amount,
      cycleType: 'MONTHLY',
      dueDate,
      paidAt,
      status,
      transactionId: txnId,
      notes: '',
    });
  }
  return records;
}

const MOCK_PAYMENT_HISTORY: PaymentHistoryEntry[] = MOCK_BILLING
  .filter(b => b.status === PaymentStatus.PAID)
  .map(b => ({
    id: `ph-${b.id}`,
    schoolId: b.schoolId,
    schoolName: b.schoolName,
    amount: b.amount,
    paidAt: b.paidAt!,
    method: 'NEFT',
    transactionId: b.transactionId!,
    plan: b.plan,
  }));

let _billingDb: BillingRecord[] = [...MOCK_BILLING];
const _historyDb: PaymentHistoryEntry[] = [...MOCK_PAYMENT_HISTORY];

export const billingService = {
  async getAll(): Promise<BillingRecord[]> {
    return [..._billingDb];
  },

  async getBySchool(schoolId: string): Promise<BillingRecord[]> {
    return _billingDb.filter(b => b.schoolId === schoolId);
  },

  async getPaymentHistory(): Promise<PaymentHistoryEntry[]> {
    return [..._historyDb];
  },

  async generateScheduleForSchool(schoolId: string, schoolName: string, plan: BillingPlan, startDate: string): Promise<BillingRecord[]> {
    const records = generateMonthlySchedule(schoolId, schoolName, plan, startDate, 0);
    _billingDb = [..._billingDb, ...records];
    return records;
  },

  async create(input: CreateBillingInput): Promise<BillingRecord> {
    const record: BillingRecord = {
      ...input,
      id: `b${Date.now()}`,
      paidAt: null,
      transactionId: null,
    };
    _billingDb = [..._billingDb, record];
    return record;
  },

  async markPaid(id: string, transactionId: string): Promise<BillingRecord> {
    const record = _billingDb.find(b => b.id === id);
    if (!record) throw new Error('Billing record not found');
    const updated: BillingRecord = {
      ...record,
      status: PaymentStatus.PAID,
      paidAt: new Date().toISOString().split('T')[0],
      transactionId,
    };
    _billingDb = _billingDb.map(b => b.id === id ? updated : b);
    _historyDb.unshift({
      id: `ph${Date.now()}`,
      schoolId: updated.schoolId,
      schoolName: updated.schoolName,
      amount: updated.amount,
      paidAt: updated.paidAt!,
      method: 'NEFT',
      transactionId,
      plan: updated.plan,
    });

    // Auto-schedule next 12 months if all current 12 months are paid
    const schoolRecords = _billingDb.filter(b => b.schoolId === record.schoolId);
    const allPaid = schoolRecords.length >= 12 && schoolRecords.slice(0, 12).every(r => r.status === PaymentStatus.PAID);
    if (allPaid) {
      const lastRecord = schoolRecords[11];
      const nextStart = new Date(lastRecord.dueDate);
      nextStart.setMonth(nextStart.getMonth() + 1);
      const nextSchedule = generateMonthlySchedule(
        record.schoolId,
        record.schoolName,
        record.plan,
        nextStart.toISOString().split('T')[0],
        0
      );
      _billingDb = [..._billingDb, ...nextSchedule];
    }

    return updated;
  },

  // CHANGE PLAN: Only updates amount of UNPAID future schedules.
  // Already-paid records remain unchanged (historical accuracy).
  async updatePlan(schoolId: string, plan: BillingPlan): Promise<{ updated: number; unchanged: number }> {
    let updated = 0;
    let unchanged = 0;
    const newAmount = PLAN_PRICES[plan];
    _billingDb = _billingDb.map(b => {
      if (b.schoolId !== schoolId) return b;
      if (b.status === PaymentStatus.PAID) {
        unchanged++;
        return b;
      }
      updated++;
      return { ...b, plan, amount: newAmount };
    });
    return { updated, unchanged };
  },

  async deleteBySchool(schoolId: string): Promise<void> {
    _billingDb = _billingDb.filter(b => b.schoolId !== schoolId);
  },

  async delete(id: string): Promise<void> {
    _billingDb = _billingDb.filter(b => b.id !== id);
  },
};
