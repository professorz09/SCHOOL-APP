import { BillingPlan } from '@/shared/config/constants';

export interface SchoolBilling {
  schoolId: string;
  schoolName: string;
  plan: BillingPlan;
  annualAmount: number;
  billingStartDate: string; // YYYY-MM-DD (yearly renewal date)
  /**
   * Schedule-level credit parked from prior overpayments. Surplus from a
   * `record_school_payment` call that exceeds every outstanding year is
   * accumulated here instead of pushing the latest year's `outstanding`
   * negative. Defaults to 0.
   */
  advanceBalance: number;
}

/**
 * Per-school billing breakdown for the super-admin UI: every billing year
 * (oldest first), the schedule-level advance balance, and the rolled-up
 * outstanding total across all years for the school.
 */
export interface SchoolBillingBreakdown {
  schoolId: string;
  years: BillingYear[];          // ordered by start_date ASC
  advanceBalance: number;        // from school_billing_schedules
  totalOutstanding: number;      // sum of years[].outstanding (>=0)
}

/**
 * Single line in a payment-allocation preview: how much of the incoming
 * amount would land on this billing year, and whether that allocation
 * would fully settle the year.
 */
export interface PaymentAllocationLine {
  yearId: string;
  yearLabel: string;
  outstandingBefore: number;
  amountApplied: number;
  outstandingAfter: number;
  willClose: boolean;
}

/**
 * Read-only preview of how `record_school_payment` would distribute an
 * incoming payment across this school's outstanding billing years
 * (oldest-first), plus any leftover that would land in the schedule's
 * advance balance.
 */
export interface PaymentAllocationPreview {
  totalAmount: number;
  allocations: PaymentAllocationLine[];
  advanceCredit: number;         // surplus that would be parked
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

/**
 * One row from `school_payment_allocations`: how much of a single
 * `school_payments` row the RPC applied to a specific billing year.
 */
export interface PaymentAllocation {
  yearId: string;
  yearLabel: string;
  amountApplied: number;
}

export interface Payment {
  id: string;
  schoolId: string;
  /**
   * Back-compat: the first allocation's billing year, or `''` if the
   * entire payment was parked as advance credit. Prefer iterating
   * `allocations` for the full split.
   */
  yearId: string;
  amount: number;
  paidAt: string;           // YYYY-MM-DD
  txnId: string;
  method: 'UPI' | 'NEFT' | 'CHEQUE' | 'CASH';
  notes: string;
  /** Per-year split written by `record_school_payment` (oldest-first). */
  allocations: PaymentAllocation[];
  /**
   * Surplus that landed in `school_billing_schedules.advance_balance`
   * instead of any year row. Computed as `amount - sum(allocations.amountApplied)`.
   */
  parkedAdvance: number;
}
