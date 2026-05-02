import { create } from 'zustand';
import {
  SchoolBilling, BillingYear, Payment,
  SchoolBillingBreakdown, PaymentAllocationPreview,
} from '@/shared/types/billing.types';
import { billingService } from '@/roles/super-admin/billing.service';
import { BillingPlan } from '@/shared/config/constants';

interface BillingStore {
  schoolBillings: SchoolBilling[];
  billingYears: BillingYear[];
  isLoading: boolean;
  lastError: string | null;

  fetchAll: () => Promise<void>;
  recordPayment: (
    schoolId: string,
    yearId: string,
    amount: number,
    txnId: string,
    method: Payment['method'],
    notes: string,
  ) => Promise<{ year: BillingYear; payment: Payment }>;
  getSchoolPayments: (schoolId: string) => Promise<Payment[]>;
  getBillingBreakdown: (schoolId: string) => Promise<SchoolBillingBreakdown | null>;
  previewAllocation: (schoolId: string, amount: number) => Promise<PaymentAllocationPreview>;
  setupSchoolBilling: (
    schoolId: string,
    schoolName: string,
    plan: BillingPlan,
    startDate: string,
    customAmount?: number,
  ) => Promise<void>;
  createNextYear: (schoolId: string, carriedForward: number) => Promise<BillingYear>;
}

export const useBillingStore = create<BillingStore>((set) => ({
  schoolBillings: [],
  billingYears: [],
  isLoading: false,
  lastError: null,

  fetchAll: async () => {
    set({ isLoading: true, lastError: null });
    try {
      const [schoolBillings, billingYears] = await Promise.all([
        billingService.getSchoolBillings(),
        billingService.getBillingYears(),
      ]);
      set({ schoolBillings, billingYears });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load billing data';
      set({ lastError: msg });
      throw e;
    } finally {
      set({ isLoading: false });
    }
  },

  recordPayment: async (schoolId, yearId, amount, txnId, method, notes) => {
    const result = await billingService.recordPayment(schoolId, yearId, amount, txnId, method, notes);
    // The RPC allocates oldest-due-first and may also bump advance balances
    // on later years, so refresh every year for this school plus the
    // school-billing summary to keep the ledger accurate.
    const [schoolBillings, billingYears] = await Promise.all([
      billingService.getSchoolBillings(),
      billingService.getBillingYears(),
    ]);
    set({ schoolBillings, billingYears });
    return result;
  },

  getSchoolPayments: (schoolId) => billingService.getPaymentsForSchool(schoolId),

  getBillingBreakdown: (schoolId) => billingService.getBillingBreakdown(schoolId),

  previewAllocation: (schoolId, amount) =>
    billingService.previewAllocation(schoolId, amount),

  setupSchoolBilling: async (schoolId, schoolName, plan, startDate, customAmount) => {
    await billingService.setupSchoolBilling(schoolId, schoolName, plan, startDate, customAmount);
    const [schoolBillings, billingYears] = await Promise.all([
      billingService.getSchoolBillings(),
      billingService.getBillingYears(),
    ]);
    set({ schoolBillings, billingYears });
  },

  createNextYear: async (schoolId, carriedForward) => {
    const year = await billingService.createNextYear(schoolId, carriedForward);
    set(s => ({ billingYears: [...s.billingYears, year] }));
    return year;
  },
}));
