import { create } from 'zustand';
import { SchoolBilling, BillingYear, Payment } from '../types/billing.types';
import { billingService } from '../services/billing.service';
import { BillingPlan } from '../config/constants';

interface BillingStore {
  schoolBillings: SchoolBilling[];
  billingYears: BillingYear[];
  isLoading: boolean;

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
  setupSchoolBilling: (
    schoolId: string,
    schoolName: string,
    plan: BillingPlan,
    startDate: string,
    customAmount?: number,
  ) => Promise<void>;
}

export const useBillingStore = create<BillingStore>((set) => ({
  schoolBillings: [],
  billingYears: [],
  isLoading: false,

  fetchAll: async () => {
    set({ isLoading: true });
    const [schoolBillings, billingYears] = await Promise.all([
      billingService.getSchoolBillings(),
      billingService.getBillingYears(),
    ]);
    set({ schoolBillings, billingYears, isLoading: false });
  },

  recordPayment: async (schoolId, yearId, amount, txnId, method, notes) => {
    const result = await billingService.recordPayment(schoolId, yearId, amount, txnId, method, notes);
    set(s => ({
      billingYears: s.billingYears.map(y => y.id === yearId ? result.year : y),
    }));
    return result;
  },

  getSchoolPayments: (schoolId) => billingService.getPaymentsForSchool(schoolId),

  setupSchoolBilling: async (schoolId, schoolName, plan, startDate, customAmount) => {
    await billingService.setupSchoolBilling(schoolId, schoolName, plan, startDate, customAmount);
    const [schoolBillings, billingYears] = await Promise.all([
      billingService.getSchoolBillings(),
      billingService.getBillingYears(),
    ]);
    set({ schoolBillings, billingYears });
  },
}));
