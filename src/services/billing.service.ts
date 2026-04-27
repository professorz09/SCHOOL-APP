import { SchoolBilling, BillingYear, Payment } from '../types/billing.types';
import { BillingPlan } from '../config/constants';

export const ANNUAL_PLAN_PRICES: Record<BillingPlan, number> = {
  [BillingPlan.BASIC]:    36_000,
  [BillingPlan.STANDARD]: 72_000,
  [BillingPlan.PREMIUM]: 1_20_000,
};

// ─── Mock School Billings ──────────────────────────────────────────────────────

let _schoolBillings: SchoolBilling[] = [
  { schoolId: 's1', schoolName: 'Delhi Public School',        plan: BillingPlan.PREMIUM,  annualAmount: 1_20_000, billingStartDate: '2024-04-01' },
  { schoolId: 's2', schoolName: 'Greenwood High School',      plan: BillingPlan.STANDARD, annualAmount:  72_000, billingStartDate: '2024-04-01' },
  { schoolId: 's3', schoolName: 'Sunrise Valley Academy',     plan: BillingPlan.BASIC,    annualAmount:  36_000, billingStartDate: '2024-04-01' },
  { schoolId: 's4', schoolName: "St. Mary's Convent",         plan: BillingPlan.PREMIUM,  annualAmount: 1_20_000, billingStartDate: '2024-04-01' },
  { schoolId: 's5', schoolName: 'Heritage International',     plan: BillingPlan.STANDARD, annualAmount:  72_000, billingStartDate: '2024-04-01' },
  { schoolId: 's6', schoolName: 'Oakridge International',     plan: BillingPlan.PREMIUM,  annualAmount: 1_20_000, billingStartDate: '2025-02-01' },
];

// ─── Mock Billing Years ────────────────────────────────────────────────────────

let _billingYears: BillingYear[] = [
  // s1 – Delhi Public School 2024-25: paid ₹80,000 / due ₹1,20,000
  { id: 'by-s1-2024', schoolId: 's1', schoolName: 'Delhi Public School',    yearLabel: '2024-25', startDate: '2024-04-01', endDate: '2025-03-31', annualAmount: 1_20_000, carriedForward: 0, totalDue: 1_20_000, totalPaid: 80_000, outstanding: 40_000 },
  // s2 – Greenwood 2024-25: fully paid
  { id: 'by-s2-2024', schoolId: 's2', schoolName: 'Greenwood High School',  yearLabel: '2024-25', startDate: '2024-04-01', endDate: '2025-03-31', annualAmount:  72_000, carriedForward: 0, totalDue:  72_000, totalPaid: 72_000, outstanding:      0 },
  // s3 – Sunrise 2024-25: paid ₹20,000 / due ₹36,000
  { id: 'by-s3-2024', schoolId: 's3', schoolName: 'Sunrise Valley Academy', yearLabel: '2024-25', startDate: '2024-04-01', endDate: '2025-03-31', annualAmount:  36_000, carriedForward: 0, totalDue:  36_000, totalPaid: 20_000, outstanding: 16_000 },
  // s4 – St. Mary's 2024-25: paid ₹60,000 / due ₹1,20,000
  { id: 'by-s4-2024', schoolId: 's4', schoolName: "St. Mary's Convent",     yearLabel: '2024-25', startDate: '2024-04-01', endDate: '2025-03-31', annualAmount: 1_20_000, carriedForward: 0, totalDue: 1_20_000, totalPaid: 60_000, outstanding: 60_000 },
  // s5 – Heritage 2024-25: no payments
  { id: 'by-s5-2024', schoolId: 's5', schoolName: 'Heritage International', yearLabel: '2024-25', startDate: '2024-04-01', endDate: '2025-03-31', annualAmount:  72_000, carriedForward: 0, totalDue:  72_000, totalPaid:      0, outstanding: 72_000 },
  // s6 – Oakridge 2025-26 (billing since Feb 2025): paid ₹40,000 / due ₹1,20,000
  { id: 'by-s6-2025', schoolId: 's6', schoolName: 'Oakridge International', yearLabel: '2025-26', startDate: '2025-02-01', endDate: '2026-01-31', annualAmount: 1_20_000, carriedForward: 0, totalDue: 1_20_000, totalPaid: 40_000, outstanding: 80_000 },
];

// ─── Mock Payments ─────────────────────────────────────────────────────────────

let _payments: Payment[] = [
  // DPS (s1)
  { id: 'p-s1-1', schoolId: 's1', yearId: 'by-s1-2024', amount: 30_000, paidAt: '2024-06-10', txnId: 'TXN-2406-S1-001', method: 'NEFT',   notes: '' },
  { id: 'p-s1-2', schoolId: 's1', yearId: 'by-s1-2024', amount: 25_000, paidAt: '2024-09-05', txnId: 'TXN-2409-S1-001', method: 'UPI',    notes: '' },
  { id: 'p-s1-3', schoolId: 's1', yearId: 'by-s1-2024', amount: 25_000, paidAt: '2025-01-15', txnId: 'TXN-2501-S1-001', method: 'UPI',    notes: '' },
  // Greenwood (s2)
  { id: 'p-s2-1', schoolId: 's2', yearId: 'by-s2-2024', amount: 36_000, paidAt: '2024-07-01', txnId: 'TXN-2407-S2-001', method: 'NEFT',   notes: '' },
  { id: 'p-s2-2', schoolId: 's2', yearId: 'by-s2-2024', amount: 36_000, paidAt: '2024-12-20', txnId: 'TXN-2412-S2-001', method: 'NEFT',   notes: '' },
  // Sunrise (s3)
  { id: 'p-s3-1', schoolId: 's3', yearId: 'by-s3-2024', amount: 20_000, paidAt: '2024-08-10', txnId: 'TXN-2408-S3-001', method: 'UPI',    notes: '' },
  // St. Mary's (s4)
  { id: 'p-s4-1', schoolId: 's4', yearId: 'by-s4-2024', amount: 30_000, paidAt: '2024-05-15', txnId: 'TXN-2405-S4-001', method: 'CHEQUE', notes: '' },
  { id: 'p-s4-2', schoolId: 's4', yearId: 'by-s4-2024', amount: 30_000, paidAt: '2024-10-20', txnId: 'TXN-2410-S4-001', method: 'CHEQUE', notes: '' },
  // Heritage (s5): no payments
  // Oakridge (s6)
  { id: 'p-s6-1', schoolId: 's6', yearId: 'by-s6-2025', amount: 40_000, paidAt: '2025-03-10', txnId: 'TXN-2503-S6-001', method: 'NEFT',   notes: '' },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function buildYearLabel(startDate: string): string {
  const d = new Date(startDate);
  const y = d.getFullYear();
  return `${y}-${String(y + 1).slice(-2)}`;
}

function yearEndDate(startDate: string): string {
  const d = new Date(startDate);
  d.setFullYear(d.getFullYear() + 1);
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

// ─── Service ───────────────────────────────────────────────────────────────────

export const billingService = {
  // All school billings
  async getSchoolBillings(): Promise<SchoolBilling[]> {
    return [..._schoolBillings];
  },

  // All billing years
  async getBillingYears(): Promise<BillingYear[]> {
    return [..._billingYears];
  },

  // Payments for a specific school (newest first)
  async getPaymentsForSchool(schoolId: string): Promise<Payment[]> {
    return _payments
      .filter(p => p.schoolId === schoolId)
      .sort((a, b) => b.paidAt.localeCompare(a.paidAt));
  },

  // All payments (newest first) — for global history if needed
  async getAllPayments(): Promise<Payment[]> {
    return [..._payments].sort((a, b) => b.paidAt.localeCompare(a.paidAt));
  },

  // Current (latest) billing year for a school
  async getCurrentYear(schoolId: string): Promise<BillingYear | null> {
    const years = _billingYears
      .filter(y => y.schoolId === schoolId)
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
    return years[0] ?? null;
  },

  // Record a payment (any amount)
  async recordPayment(
    schoolId: string,
    yearId: string,
    amount: number,
    txnId: string,
    method: Payment['method'],
    notes: string,
  ): Promise<{ year: BillingYear; payment: Payment }> {
    const payment: Payment = {
      id: `p-${Date.now()}`,
      schoolId,
      yearId,
      amount,
      paidAt: new Date().toISOString().split('T')[0],
      txnId,
      method,
      notes,
    };
    _payments = [payment, ..._payments];

    // Update billing year totals
    _billingYears = _billingYears.map(y => {
      if (y.id !== yearId) return y;
      const newPaid = y.totalPaid + amount;
      return { ...y, totalPaid: newPaid, outstanding: Math.max(0, y.totalDue - newPaid) };
    });

    const year = _billingYears.find(y => y.id === yearId)!;
    return { year, payment };
  },

  // Create a new billing year (rollover or fresh for new school)
  async createNextYear(
    schoolId: string,
    carriedForward: number,
  ): Promise<BillingYear> {
    const billing = _schoolBillings.find(b => b.schoolId === schoolId);
    if (!billing) throw new Error('School billing not found');

    const existingYears = _billingYears
      .filter(y => y.schoolId === schoolId)
      .sort((a, b) => b.startDate.localeCompare(a.startDate));

    let newStart: string;
    if (existingYears.length > 0) {
      const lastEnd = new Date(existingYears[0].endDate);
      lastEnd.setDate(lastEnd.getDate() + 1);
      newStart = lastEnd.toISOString().split('T')[0];
    } else {
      newStart = billing.billingStartDate;
    }

    const totalDue = billing.annualAmount + carriedForward;
    const year: BillingYear = {
      id: `by-${schoolId}-${Date.now()}`,
      schoolId,
      schoolName: billing.schoolName,
      yearLabel: buildYearLabel(newStart),
      startDate: newStart,
      endDate: yearEndDate(newStart),
      annualAmount: billing.annualAmount,
      carriedForward,
      totalDue,
      totalPaid: 0,
      outstanding: totalDue,
    };
    _billingYears = [..._billingYears, year];
    return year;
  },

  // Setup billing when a school is onboarded
  async setupSchoolBilling(
    schoolId: string,
    schoolName: string,
    plan: BillingPlan,
    billingStartDate: string,
    customAmount?: number,
  ): Promise<SchoolBilling> {
    const annualAmount = customAmount ?? ANNUAL_PLAN_PRICES[plan];
    const billing: SchoolBilling = { schoolId, schoolName, plan, annualAmount, billingStartDate };
    _schoolBillings = _schoolBillings.filter(b => b.schoolId !== schoolId);
    _schoolBillings = [..._schoolBillings, billing];

    // Create first billing year
    const totalDue = annualAmount;
    const year: BillingYear = {
      id: `by-${schoolId}-${Date.now()}`,
      schoolId,
      schoolName,
      yearLabel: buildYearLabel(billingStartDate),
      startDate: billingStartDate,
      endDate: yearEndDate(billingStartDate),
      annualAmount,
      carriedForward: 0,
      totalDue,
      totalPaid: 0,
      outstanding: totalDue,
    };
    _billingYears = [..._billingYears, year];
    return billing;
  },

  // Update plan for a school (affects future billing, not past)
  async updatePlan(schoolId: string, plan: BillingPlan, customAmount?: number): Promise<void> {
    const annualAmount = customAmount ?? ANNUAL_PLAN_PRICES[plan];
    _schoolBillings = _schoolBillings.map(b =>
      b.schoolId === schoolId ? { ...b, plan, annualAmount } : b
    );
  },
};
