import { BillingPlan, PaymentStatus } from '../config/constants';

export type BillingCycle = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';

export interface BillingRecord {
  id: string;
  schoolId: string;
  schoolName: string;
  plan: BillingPlan;
  amount: number;
  cycleType: BillingCycle;
  dueDate: string;
  paidAt: string | null;
  status: PaymentStatus;
  transactionId: string | null;
  notes: string;
}

export interface PaymentHistoryEntry {
  id: string;
  schoolId: string;
  schoolName: string;
  amount: number;
  paidAt: string;
  method: 'UPI' | 'NEFT' | 'CHEQUE' | 'CARD';
  transactionId: string;
  plan: BillingPlan;
}

export type CreateBillingInput = Omit<BillingRecord, 'id' | 'paidAt' | 'transactionId'>;
