// Supabase-backed billing service. The oldest-due-first allocation logic
// lives in the public.record_school_payment() RPC.

import { supabase } from '../lib/supabase';
import { logAudit } from '../lib/audit';
import { SchoolBilling, BillingYear, Payment } from '../types/billing.types';
import { BillingPlan, PLAN_PRICES } from '../config/constants';

// Back-compat re-export — older call sites import this name from the service.
export const ANNUAL_PLAN_PRICES = PLAN_PRICES;

interface ScheduleRow {
  school_id: string;
  plan: string;
  annual_amount: number;
  billing_start_date: string;
  schools: { name: string } | null;
}

interface YearRow {
  id: string;
  school_id: string;
  year_label: string;
  start_date: string;
  end_date: string;
  annual_amount: number;
  carried_forward: number;
  total_due: number;
  total_paid: number;
  outstanding: number;
  schools: { name: string } | null;
}

interface PaymentRow {
  id: string;
  school_id: string;
  amount: number;
  paid_at: string;
  txn_id: string | null;
  method: string | null;
  notes: string | null;
  allocations?: { billing_year_id: string }[];
}

function scheduleRowToBilling(r: ScheduleRow): SchoolBilling {
  return {
    schoolId: r.school_id,
    schoolName: r.schools?.name ?? '',
    plan: r.plan as BillingPlan,
    annualAmount: r.annual_amount,
    billingStartDate: r.billing_start_date,
  };
}

function yearRowToBillingYear(r: YearRow): BillingYear {
  return {
    id: r.id,
    schoolId: r.school_id,
    schoolName: r.schools?.name ?? '',
    yearLabel: r.year_label,
    startDate: r.start_date,
    endDate: r.end_date,
    annualAmount: r.annual_amount,
    carriedForward: r.carried_forward,
    totalDue: r.total_due,
    totalPaid: r.total_paid,
    outstanding: r.outstanding,
  };
}

function paymentRowToPayment(r: PaymentRow, defaultYearId: string): Payment {
  // A payment can be allocated across years (oldest-first); for the UI we
  // surface the first allocation as the "primary" year. The sum/total is
  // unaffected — it just decides which year tab the payment appears under.
  const yearId = r.allocations?.[0]?.billing_year_id ?? defaultYearId;
  const method = (r.method ?? 'NEFT') as Payment['method'];
  return {
    id: r.id,
    schoolId: r.school_id,
    yearId,
    amount: r.amount,
    paidAt: r.paid_at,
    txnId: r.txn_id ?? '',
    method,
    notes: r.notes ?? '',
  };
}

export const billingService = {
  async getSchoolBillings(): Promise<SchoolBilling[]> {
    const { data, error } = await supabase
      .from('school_billing_schedules')
      .select('school_id, plan, annual_amount, billing_start_date, schools!inner(name, is_deleted)')
      .eq('schools.is_deleted', false);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => scheduleRowToBilling(r as unknown as ScheduleRow));
  },

  async getBillingYears(): Promise<BillingYear[]> {
    const { data, error } = await supabase
      .from('school_billing_years')
      .select('id, school_id, year_label, start_date, end_date, annual_amount, carried_forward, total_due, total_paid, outstanding, schools!inner(name, is_deleted)')
      .eq('schools.is_deleted', false)
      .order('start_date', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => yearRowToBillingYear(r as unknown as YearRow));
  },

  async getPaymentsForSchool(schoolId: string): Promise<Payment[]> {
    const { data, error } = await supabase
      .from('school_payments')
      .select('id, school_id, amount, paid_at, txn_id, method, notes, allocations:school_payment_allocations(billing_year_id)')
      .eq('school_id', schoolId)
      .order('paid_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => paymentRowToPayment(r as unknown as PaymentRow, ''));
  },

  async recordPayment(
    schoolId: string,
    yearId: string,
    amount: number,
    txnId: string,
    method: Payment['method'],
    notes: string,
  ): Promise<{ year: BillingYear; payment: Payment }> {
    const { data: payId, error: rpcErr } = await supabase.rpc('record_school_payment', {
      p_school_id: schoolId,
      p_amount: amount,
      p_txn_id: txnId,
      p_method: method,
      p_notes: notes,
    });
    if (rpcErr) throw new Error(rpcErr.message);

    // The RPC may have allocated to *older* years before the caller's selected
    // one (oldest-due-first), so re-read the requested year to get fresh
    // totals; if it no longer exists, fall back to the school's current year.
    const { data: yearRow, error: yErr } = await supabase
      .from('school_billing_years')
      .select('id, school_id, year_label, start_date, end_date, annual_amount, carried_forward, total_due, total_paid, outstanding, schools!inner(name, is_deleted)')
      .eq('id', yearId)
      .maybeSingle();
    if (yErr) throw new Error(yErr.message);

    const { data: payRow, error: pErr } = await supabase
      .from('school_payments')
      .select('id, school_id, amount, paid_at, txn_id, method, notes, allocations:school_payment_allocations(billing_year_id)')
      .eq('id', payId as string)
      .single();
    if (pErr) throw new Error(pErr.message);

    let year: BillingYear | null = yearRow
      ? yearRowToBillingYear(yearRow as unknown as YearRow)
      : null;
    if (!year) year = await this.getCurrentYear(schoolId);
    if (!year) throw new Error('no billing year available for school after payment');

    return {
      year,
      payment: paymentRowToPayment(payRow as unknown as PaymentRow, yearId),
    };
  },

  async getCurrentYear(schoolId: string): Promise<BillingYear | null> {
    // The "current" year is the most recent one whose start_date has passed,
    // or the latest one if none have started yet.
    const today = new Date().toISOString().split('T')[0];
    const { data: started } = await supabase
      .from('school_billing_years')
      .select('id, school_id, year_label, start_date, end_date, annual_amount, carried_forward, total_due, total_paid, outstanding, schools!inner(name, is_deleted)')
      .eq('school_id', schoolId)
      .eq('schools.is_deleted', false)
      .lte('start_date', today)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (started) return yearRowToBillingYear(started as unknown as YearRow);

    const { data: latest } = await supabase
      .from('school_billing_years')
      .select('id, school_id, year_label, start_date, end_date, annual_amount, carried_forward, total_due, total_paid, outstanding, schools!inner(name, is_deleted)')
      .eq('school_id', schoolId)
      .eq('schools.is_deleted', false)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    return latest ? yearRowToBillingYear(latest as unknown as YearRow) : null;
  },

  async createNextYear(schoolId: string, _carriedForward: number): Promise<BillingYear> {
    // Server computes the carry-forward from the latest year's outstanding
    // (negative outstanding = advance credit). The argument is preserved for
    // call-site compatibility but ignored.
    void _carriedForward;
    const { data: newId, error } = await supabase.rpc('create_next_billing_year', {
      p_school_id: schoolId,
    });
    if (error) throw new Error(error.message);
    const { data: yearRow, error: yErr } = await supabase
      .from('school_billing_years')
      .select('id, school_id, year_label, start_date, end_date, annual_amount, carried_forward, total_due, total_paid, outstanding, schools!inner(name, is_deleted)')
      .eq('id', newId as string)
      .single();
    if (yErr) throw new Error(yErr.message);
    return yearRowToBillingYear(yearRow as unknown as YearRow);
  },

  async setupSchoolBilling(
    schoolId: string,
    schoolName: string,
    plan: BillingPlan,
    billingStartDate: string,
    customAmount?: number,
  ): Promise<SchoolBilling> {
    // Idempotent: the SA onboard flow already creates the schedule + first
    // year via the API. If this is called again (the SchoolsManager UI does
    // call it back-to-back with create()), we just return the existing one.
    const { data: existing } = await supabase
      .from('school_billing_schedules')
      .select('school_id, plan, annual_amount, billing_start_date, schools!inner(name, is_deleted)')
      .eq('school_id', schoolId)
      .maybeSingle();
    if (existing) {
      return scheduleRowToBilling(existing as unknown as ScheduleRow);
    }

    // Otherwise create from scratch (rare path: schedule was deleted out-of-band).
    const annualAmount = customAmount ?? PLAN_PRICES[plan];
    const { data: schedule, error: sErr } = await supabase
      .from('school_billing_schedules')
      .insert({
        school_id: schoolId,
        plan,
        annual_amount: annualAmount,
        billing_start_date: billingStartDate,
      })
      .select('school_id, plan, annual_amount, billing_start_date, schools!inner(name, is_deleted)')
      .single();
    if (sErr) throw new Error(sErr.message);

    const start = new Date(billingStartDate);
    const end = new Date(start);
    end.setFullYear(end.getFullYear() + 1);
    end.setDate(end.getDate() - 1);
    const yearLabel = `${start.getUTCFullYear()}-${String(end.getUTCFullYear()).slice(2)}`;
    await supabase.from('school_billing_years').insert({
      school_id: schoolId,
      year_label: yearLabel,
      start_date: billingStartDate,
      end_date: end.toISOString().split('T')[0],
      annual_amount: annualAmount,
      carried_forward: 0,
      total_due: annualAmount,
      total_paid: 0,
      outstanding: annualAmount,
    });

    await logAudit('setup_billing', 'school', schoolId, { schoolName, plan, annualAmount });
    return scheduleRowToBilling(schedule as unknown as ScheduleRow);
  },

  async updatePlan(
    schoolId: string,
    plan: BillingPlan,
    customAmount?: number,
  ): Promise<void> {
    const annualAmount = customAmount ?? PLAN_PRICES[plan];
    const { error } = await supabase
      .from('school_billing_schedules')
      .update({
        plan,
        annual_amount: annualAmount,
        updated_at: new Date().toISOString(),
      })
      .eq('school_id', schoolId);
    if (error) throw new Error(error.message);
    await supabase.from('schools').update({ plan, updated_at: new Date().toISOString() }).eq('id', schoolId);
    await logAudit('update_plan', 'school', schoolId, { plan, annualAmount });
  },
};
