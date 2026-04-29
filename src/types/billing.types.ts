import { BillingPlan } from '../config/constants';

export interface SchoolBilling {
  schoolId: string;
  schoolName: string;
  plan: BillingPlan;
  annualAmount: number;
  billingStartDate: string; // YYYY-MM-DD (yearly renewal date)
}

export interface BillingYear {
  id: string;
  schoolId: string;
  schoolName: string;
  yearLabel: string;        // e.g. "2024-25"
  startDate: string;        // YYYY-MM-DD
  endDate: string;          // YYYY-MM-DD
  annualAmount: number;
  carriedForward: number;   // unpaid balance from previous year
  totalDue: number;         // annualAmount + carriedForward
  totalPaid: number;        // sum of payments in this year
  outstanding: number;      // totalDue - totalPaid
}

export interface Payment {
  id: string;
  schoolId: string;
  yearId: string;
  amount: number;
  paidAt: string;           // YYYY-MM-DD
  txnId: string;
  method: 'UPI' | 'NEFT' | 'CHEQUE' | 'CASH';
  notes: string;
}
