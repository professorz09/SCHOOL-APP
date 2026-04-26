import { BillingRecord, CreateBillingInput, PaymentHistoryEntry } from '../types/billing.types';
import { BillingPlan, PaymentStatus } from '../config/constants';

const MOCK_BILLING: BillingRecord[] = [
  { id: 'b1', schoolId: 's1', schoolName: 'Delhi Public School', plan: BillingPlan.PREMIUM, amount: 9999, cycleType: 'MONTHLY', dueDate: '2025-05-01', paidAt: '2025-04-28', status: PaymentStatus.PAID, transactionId: 'TXN-2504-DPS-001', notes: '' },
  { id: 'b2', schoolId: 's2', schoolName: 'Greenwood High School', plan: BillingPlan.STANDARD, amount: 5999, cycleType: 'MONTHLY', dueDate: '2025-05-01', paidAt: '2025-04-25', status: PaymentStatus.PAID, transactionId: 'TXN-2504-GWH-001', notes: '' },
  { id: 'b3', schoolId: 's3', schoolName: 'Sunrise Valley Academy', plan: BillingPlan.BASIC, amount: 2999, cycleType: 'MONTHLY', dueDate: '2025-05-01', paidAt: null, status: PaymentStatus.PENDING, transactionId: null, notes: '' },
  { id: 'b4', schoolId: 's4', schoolName: "St. Mary's Convent", plan: BillingPlan.PREMIUM, amount: 9999, cycleType: 'QUARTERLY', dueDate: '2025-06-01', paidAt: '2025-04-10', status: PaymentStatus.PAID, transactionId: 'TXN-2504-SMC-001', notes: 'Q1 advance paid' },
  { id: 'b5', schoolId: 's5', schoolName: 'Heritage International School', plan: BillingPlan.STANDARD, amount: 5999, cycleType: 'MONTHLY', dueDate: '2025-04-01', paidAt: null, status: PaymentStatus.OVERDUE, transactionId: null, notes: 'Follow-up sent on 10th April' },
  { id: 'b6', schoolId: 's6', schoolName: 'Oakridge International', plan: BillingPlan.PREMIUM, amount: 0, cycleType: 'MONTHLY', dueDate: '2025-05-31', paidAt: null, status: PaymentStatus.PENDING, transactionId: null, notes: 'Trial period active' },
];

const MOCK_PAYMENT_HISTORY: PaymentHistoryEntry[] = [
  { id: 'ph1', schoolId: 's1', schoolName: 'Delhi Public School', amount: 9999, paidAt: '2025-04-28', method: 'NEFT', transactionId: 'TXN-2504-DPS-001', plan: BillingPlan.PREMIUM },
  { id: 'ph2', schoolId: 's2', schoolName: 'Greenwood High School', amount: 5999, paidAt: '2025-04-25', method: 'UPI', transactionId: 'TXN-2504-GWH-001', plan: BillingPlan.STANDARD },
  { id: 'ph3', schoolId: 's4', schoolName: "St. Mary's Convent", amount: 9999, paidAt: '2025-04-10', method: 'NEFT', transactionId: 'TXN-2504-SMC-001', plan: BillingPlan.PREMIUM },
  { id: 'ph4', schoolId: 's1', schoolName: 'Delhi Public School', amount: 9999, paidAt: '2025-03-28', method: 'NEFT', transactionId: 'TXN-2503-DPS-001', plan: BillingPlan.PREMIUM },
  { id: 'ph5', schoolId: 's2', schoolName: 'Greenwood High School', amount: 5999, paidAt: '2025-03-25', method: 'UPI', transactionId: 'TXN-2503-GWH-001', plan: BillingPlan.STANDARD },
];

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
    return updated;
  },

  async updatePlan(schoolId: string, plan: BillingPlan): Promise<void> {
    _billingDb = _billingDb.map(b =>
      b.schoolId === schoolId ? { ...b, plan, amount: { BASIC: 2999, STANDARD: 5999, PREMIUM: 9999 }[plan] } : b,
    );
  },

  async delete(id: string): Promise<void> {
    _billingDb = _billingDb.filter(b => b.id !== id);
  },
};
