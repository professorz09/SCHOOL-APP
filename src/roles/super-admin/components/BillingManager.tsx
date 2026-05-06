import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  ArrowLeft, IndianRupee, CheckCircle2, AlertCircle, Plus, CreditCard, Clock, CalendarPlus, Settings,
} from 'lucide-react';
import { useBillingStore } from '@/roles/super-admin/billingStore';
import { useUIStore } from '@/store/uiStore';
import {
  Payment, SchoolBillingBreakdown, PaymentAllocationPreview,
} from '@/roles/super-admin/billing.types';
import { PLAN_COLORS, PLAN_PRICES, BillingPlan } from '@/shared/config/constants';

type View = 'LIST' | 'SCHOOL_DETAIL' | 'RECORD_PAYMENT' | 'SETUP_BILLING';
type PayMethod = Payment['method'];

interface Props { onBack: () => void; }

const fmt = (n: number) =>
  n >= 1_00_000 ? `₹${(n / 1_00_000).toFixed(1)}L`
  : n >= 1000   ? `₹${(n / 1000).toFixed(0)}K`
  : `₹${n}`;

const fmtFull = (n: number) => `₹${Math.abs(n).toLocaleString('en-IN')}`;

const fmtDate = (d: string) => {
  const dt = new Date(d);
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const METHOD_COLORS: Record<PayMethod, string> = {
  UPI:    'bg-violet-50 text-violet-700',
  NEFT:   'bg-blue-50 text-blue-700',
  CHEQUE: 'bg-amber-50 text-amber-700',
  CASH:   'bg-emerald-50 text-emerald-700',
};

export const BillingManager: React.FC<Props> = ({ onBack }) => {
  const {
    schoolBillings, billingYears,
    fetchAll, recordPayment, getSchoolPayments,
    getBillingBreakdown, previewAllocation, createNextYear,
  } = useBillingStore();
  const { showToast } = useUIStore();

  const [view, setView]                       = useState<View>('LIST');
  const [selectedId, setSelectedId]           = useState<string | null>(null);
  const [breakdown, setBreakdown]             = useState<SchoolBillingBreakdown | null>(null);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [breakdownError, setBreakdownError]   = useState<string | null>(null);
  const [schoolPayments, setSchoolPayments]   = useState<Payment[]>([]);
  const [creatingNextYear, setCreatingNextYear] = useState(false);

  const [setupPlan, setSetupPlan]             = useState<BillingPlan>(BillingPlan.STANDARD);
  const [setupStartDate, setSetupStartDate]   = useState(() => new Date().toISOString().split('T')[0]);
  const [setupAmount, setSetupAmount]         = useState('');
  const [settingUp, setSettingUp]             = useState(false);

  const [amount, setAmount]                   = useState('');
  const [txnId, setTxnId]                     = useState('');
  const [method, setMethod]                   = useState<PayMethod>('NEFT');
  const [notes, setNotes]                     = useState('');
  const [submitting, setSubmitting]           = useState(false);
  const [allocPreview, setAllocPreview]       = useState<PaymentAllocationPreview | null>(null);
  const [previewLoading, setPreviewLoading]   = useState(false);

  useEffect(() => {
    fetchAll().catch(e => showToast(e instanceof Error ? e.message : 'Failed to load billing data', 'error'));
  }, []);

  // Aggregate every billing year per school so the list-view "Outstanding"
  // pill matches the per-school detail breakdown.
  const perSchoolAgg = useMemo(() => {
    const map = new Map<string, { paid: number; due: number; outstanding: number; latestYearLabel: string | null; latestStartDate: string | null }>();
    for (const y of billingYears) {
      const cur = map.get(y.schoolId) ?? { paid: 0, due: 0, outstanding: 0, latestYearLabel: null, latestStartDate: null };
      cur.paid += y.totalPaid;
      cur.due  += y.totalDue;
      cur.outstanding += Math.max(0, y.outstanding);
      if (!cur.latestStartDate || y.startDate > cur.latestStartDate) {
        cur.latestStartDate = y.startDate;
        cur.latestYearLabel = y.yearLabel;
      }
      map.set(y.schoolId, cur);
    }
    return map;
  }, [billingYears]);

  const schoolList = schoolBillings.map(sb => {
    const agg = perSchoolAgg.get(sb.schoolId);
    // `outstanding` is the gross sum of year-row outstanding. Schedule-level
    // `advance_balance` is shown separately as a credit pill, not netted in.
    return {
      billing: sb,
      paid: agg?.paid ?? 0,
      due:  agg?.due  ?? sb.annualAmount,
      outstanding: agg?.outstanding ?? sb.annualAmount,
      latestYearLabel: agg?.latestYearLabel ?? null,
    };
  });

  const totalCollected   = billingYears.reduce((s, y) => s + y.totalPaid, 0);
  const totalOutstanding = schoolList.reduce((s, x) => s + x.outstanding, 0);
  const overdueCount     = schoolList.filter(x => x.outstanding > 0).length;

  // ── Selected school ──────────────────────────────────────────────────────
  const selectedRow = selectedId ? schoolList.find(s => s.billing.schoolId === selectedId) : null;

  const loadSchoolDetail = useCallback(async (schoolId: string) => {
    setBreakdownLoading(true);
    setBreakdownError(null);
    try {
      const [bd, payments] = await Promise.all([
        getBillingBreakdown(schoolId),
        getSchoolPayments(schoolId),
      ]);
      setBreakdown(bd);
      setSchoolPayments(payments);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load school billing';
      setBreakdownError(msg);
      showToast(msg, 'error');
    } finally {
      setBreakdownLoading(false);
    }
  }, [getBillingBreakdown, getSchoolPayments, showToast]);

  const openSchool = async (schoolId: string) => {
    setSelectedId(schoolId);
    setBreakdown(null);
    setSchoolPayments([]);
    setBreakdownError(null);
    setView('SCHOOL_DETAIL');
    await loadSchoolDetail(schoolId);
  };

  // Latest year is the LAST one in breakdown.years (sorted ASC by start_date).
  const latestYear = breakdown && breakdown.years.length > 0
    ? breakdown.years[breakdown.years.length - 1]
    : null;
  // Allowed whenever a schedule exists — `create_next_billing_year` carries
  // the latest year's outstanding (arrears or advance) into the new year, so
  // gating on a clean balance would block legitimate annual rollovers.
  const canCreateNextYear = !!breakdown;
  const carryForwardHint = breakdown && latestYear && latestYear.outstanding !== 0
    ? latestYear.outstanding > 0
      ? `Arrears of ${fmtFull(latestYear.outstanding)} from ${latestYear.yearLabel} will be carried forward.`
      : `Advance of ${fmtFull(latestYear.outstanding)} from ${latestYear.yearLabel} will be carried forward as credit.`
    : null;

  const handleCreateNextYear = async () => {
    if (!selectedId) return;
    setCreatingNextYear(true);
    try {
      const y = await createNextYear(selectedId, 0);
      showToast(`Created billing year ${y.yearLabel}`);
      await loadSchoolDetail(selectedId);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not create next year', 'error');
    } finally {
      setCreatingNextYear(false);
    }
  };

  const openSetupBilling = (sb: { schoolId: string; annualAmount: number; plan: BillingPlan }) => {
    setSelectedId(sb.schoolId);
    setSetupPlan(sb.plan ?? BillingPlan.STANDARD);
    setSetupStartDate(new Date().toISOString().split('T')[0]);
    setSetupAmount('');
    setView('SETUP_BILLING');
  };

  const handleSetupBilling = async () => {
    if (!selectedRow || !selectedId) return;
    const customAmount = setupAmount.trim()
      ? parseInt(setupAmount.replace(/,/g, ''), 10)
      : undefined;
    if (customAmount !== undefined && (Number.isNaN(customAmount) || customAmount <= 0)) {
      showToast('Annual amount must be a positive number', 'error');
      return;
    }
    setSettingUp(true);
    try {
      await useBillingStore.getState().setupSchoolBilling(
        selectedId,
        selectedRow.billing.schoolName,
        setupPlan,
        setupStartDate,
        customAmount,
      );
      await fetchAll();
      await loadSchoolDetail(selectedId);
      showToast('Billing schedule created');
      setView('SCHOOL_DETAIL');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not create billing schedule', 'error');
    } finally {
      setSettingUp(false);
    }
  };

  // ── Record-payment view ──────────────────────────────────────────────────
  // Re-compute the allocation preview whenever the amount changes (debounced
  // through a tiny 200ms timer to avoid hammering the DB on every keystroke).
  useEffect(() => {
    if (view !== 'RECORD_PAYMENT' || !selectedId) return;
    const num = parseInt(amount.replace(/,/g, ''), 10);
    if (!Number.isFinite(num) || num <= 0) {
      setAllocPreview(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    const t = window.setTimeout(async () => {
      try {
        const p = await previewAllocation(selectedId, num);
        if (!cancelled) setAllocPreview(p);
      } catch (e) {
        if (!cancelled) {
          setAllocPreview(null);
          showToast(e instanceof Error ? e.message : 'Preview failed', 'error');
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 200);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [amount, view, selectedId, previewAllocation, showToast]);

  const handlePay = async () => {
    if (!selectedId || !latestYear) {
      showToast('No billing year for this school', 'error');
      return;
    }
    const num = parseInt(amount.replace(/,/g, ''), 10);
    if (!num || num <= 0) { showToast('Enter a valid amount', 'error'); return; }
    if (!txnId.trim())    { showToast('Enter transaction ID', 'error'); return; }

    setSubmitting(true);
    try {
      // The yearId arg is back-compat noise — the RPC walks oldest-first
      // regardless. Pass latestYear.id so the response can resolve a year
      // for any legacy callers that still inspect the return value.
      await recordPayment(selectedId, latestYear.id, num, txnId.trim(), method, notes.trim());
      showToast(`${fmtFull(num)} recorded for ${selectedRow?.billing.schoolName ?? 'school'}`);
      setAmount(''); setTxnId(''); setNotes('');
      setAllocPreview(null);
      setView('SCHOOL_DETAIL');
      await loadSchoolDetail(selectedId);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Payment failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Shared header ────────────────────────────────────────────────────────
  const Header = ({ title, back, right }: { title: string; back: () => void; right?: React.ReactNode }) => (
    <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
      <div className="flex items-center gap-3 min-w-0">
        <button onClick={back} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600 shrink-0">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight truncate">{title}</h2>
      </div>
      {right}
    </div>
  );

  // ── LIST view ────────────────────────────────────────────────────────────
  if (view === 'LIST') return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <Header title="Billing" back={onBack} />
      <div className="flex-1 overflow-y-auto ">
        <div className="grid grid-cols-3 gap-2 px-4 pt-3 pb-2">
          {[
            { label: 'Collected', value: fmt(totalCollected),   color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Outstanding', value: fmt(totalOutstanding), color: 'text-rose-600',    bg: 'bg-rose-50'    },
            { label: 'Schools',    value: String(schoolList.length), color: 'text-blue-600', bg: 'bg-blue-50'    },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className={`rounded-2xl px-2 py-3 text-center shadow-sm ${bg}`}>
              <div className={`text-lg font-black leading-none ${color}`}>{value}</div>
              <div className="text-[9px] font-black text-slate-400 uppercase tracking-wide mt-1">{label}</div>
            </div>
          ))}
        </div>

        {overdueCount > 0 && (
          <div className="mx-4 mb-2 flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3">
            <AlertCircle size={16} className="text-rose-500 shrink-0" />
            <p className="text-xs font-black text-rose-700">{overdueCount} school{overdueCount > 1 ? 's' : ''} with outstanding balance</p>
          </div>
        )}

        <div className="px-4 space-y-2 pt-1">
          {schoolList.map(({ billing, paid, due, outstanding, latestYearLabel }) => {
            const settled = outstanding === 0;
            const pct = due > 0 ? Math.min(100, Math.round((paid / due) * 100)) : 0;
            return (
              <button key={billing.schoolId}
                onClick={() => openSchool(billing.schoolId)}
                className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-4 text-left active:scale-[0.98] transition-transform">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center font-black text-sm shrink-0">
                    {billing.schoolName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-extrabold text-slate-900 text-sm truncate">{billing.schoolName}</span>
                      {settled
                        ? <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full shrink-0">PAID</span>
                        : <span className="text-sm font-black text-rose-600 shrink-0">{fmt(outstanding)}</span>
                      }
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${PLAN_COLORS[billing.plan]}`}>{billing.plan}</span>
                      <span className="text-[10px] font-bold text-slate-400">{latestYearLabel ?? '—'}</span>
                      {billing.advanceBalance > 0 && (
                        <span className="text-[10px] font-black text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full">
                          +{fmt(billing.advanceBalance)} credit
                        </span>
                      )}
                    </div>
                    <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${settled ? 'bg-emerald-500' : 'bg-blue-500'}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[9px] font-bold text-slate-400">Paid {fmtFull(paid)}</span>
                      <span className="text-[9px] font-bold text-slate-400">{pct}%</span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}

          {schoolList.length === 0 && (
            <div className="flex flex-col items-center py-16 text-slate-400">
              <IndianRupee size={32} className="mb-3 opacity-40" />
              <p className="font-bold text-sm">No schools with billing</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ── SCHOOL DETAIL view ──────────────────────────────────────────────────
  if (view === 'SCHOOL_DETAIL' && selectedRow) {
    const { billing } = selectedRow;
    const years = breakdown?.years ?? [];
    const totalPaidAcrossYears = years.reduce((s, y) => s + y.totalPaid, 0);
    const totalDueAcrossYears  = years.reduce((s, y) => s + y.totalDue,  0);

    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        <Header title={billing.schoolName}
          back={() => { setView('LIST'); setSelectedId(null); setBreakdown(null); }}
          right={
            years.length > 0 ? (
              <button onClick={() => setView('RECORD_PAYMENT')}
                className="flex items-center gap-1.5 bg-blue-600 text-white text-[11px] font-black px-3 py-2 rounded-full active:scale-90 transition-transform">
                <Plus size={13} /> Add Payment
              </button>
            ) : null
          }
        />

        <div className="flex-1 overflow-y-auto space-y-3 px-4 pt-3 pb-6">

          {/* Plan info card */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Plan Details</span>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${PLAN_COLORS[billing.plan]}`}>{billing.plan}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[9px] font-black uppercase text-slate-400 mb-0.5">Annual Amount</div>
                <div className="font-black text-slate-900">{fmtFull(billing.annualAmount)}</div>
              </div>
              <div>
                <div className="text-[9px] font-black uppercase text-slate-400 mb-0.5">Billing Since</div>
                <div className="font-black text-slate-900">{fmtDate(billing.billingStartDate)}</div>
              </div>
            </div>
            {billing.advanceBalance > 0 && (
              <div className="mt-3 flex items-center justify-between gap-2 bg-violet-50 border border-violet-100 rounded-xl px-3 py-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-violet-600">Advance Credit</span>
                <span className="font-black text-violet-700 text-sm">+{fmtFull(billing.advanceBalance)}</span>
              </div>
            )}
          </div>

          {/* Per-year breakdown table */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Billing Years ({years.length})
              </span>
              {breakdown && (
                <span className="text-[10px] font-black text-slate-500">
                  {fmtFull(totalPaidAcrossYears)} / {fmtFull(totalDueAcrossYears)}
                </span>
              )}
            </div>

            {breakdownLoading ? (
              <div className="px-4 py-8 text-center text-xs font-bold text-slate-400">Loading…</div>
            ) : breakdownError ? (
              <div className="px-4 py-8 text-center">
                <AlertCircle size={24} className="mx-auto mb-2 text-rose-400" />
                <p className="text-xs font-bold text-rose-600">{breakdownError}</p>
                <button onClick={() => selectedId && loadSchoolDetail(selectedId)}
                  className="mt-2 text-[10px] font-black text-blue-600 underline">
                  Retry
                </button>
              </div>
            ) : years.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <IndianRupee size={24} className="mx-auto mb-2 text-slate-300" />
                {breakdown ? (
                  <p className="text-xs font-bold text-slate-400">
                    No billing years yet — create the first one below.
                  </p>
                ) : (
                  <>
                    <p className="text-xs font-bold text-slate-500">
                      No billing schedule yet for this school.
                    </p>
                    <p className="text-[10px] font-bold text-slate-400 mt-1 mb-3">
                      Pick a plan and start date to begin charging fees.
                    </p>
                    <button
                      onClick={() => openSetupBilling(selectedRow.billing)}
                      className="inline-flex items-center gap-1.5 bg-emerald-600 text-white text-[11px] font-black px-3 py-2 rounded-full active:scale-95 transition-transform"
                    >
                      <Settings size={13} />
                      Set Up Billing
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-[9px] font-black uppercase tracking-widest text-slate-500">
                      <th className="px-4 py-2">Year</th>
                      <th className="px-3 py-2 text-right">Annual</th>
                      <th className="px-3 py-2 text-right">Paid</th>
                      <th className="px-3 py-2 text-right">Outstanding</th>
                      <th className="px-3 py-2 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {years.map((y, idx) => {
                      const settled = y.outstanding <= 0;
                      const isLatest = idx === years.length - 1;
                      return (
                        <tr key={y.id}
                          className={`border-t border-slate-100 ${isLatest ? 'bg-blue-50/40' : ''}`}>
                          <td className="px-4 py-3">
                            <div className="font-black text-slate-900">{y.yearLabel}</div>
                            <div className="text-[9px] font-bold text-slate-400">
                              {fmtDate(y.startDate)} – {fmtDate(y.endDate)}
                            </div>
                            {y.carriedForward !== 0 && (
                              <div className={`text-[9px] font-black mt-0.5 ${y.carriedForward > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                {y.carriedForward > 0 ? '+' : ''}{fmtFull(y.carriedForward)} c/f
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right font-bold text-slate-700">{fmtFull(y.annualAmount)}</td>
                          <td className="px-3 py-3 text-right font-bold text-emerald-700">{fmtFull(y.totalPaid)}</td>
                          <td className={`px-3 py-3 text-right font-black ${settled ? 'text-slate-400' : 'text-rose-600'}`}>
                            {settled ? '—' : fmtFull(y.outstanding)}
                          </td>
                          <td className="px-3 py-3 text-right">
                            {settled
                              ? <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full"><CheckCircle2 size={10} /> Paid</span>
                              : <span className="inline-flex items-center gap-1 text-[10px] font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full"><Clock size={10} /> Due</span>
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Create-next-year action */}
          {breakdown && !breakdownError && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <CalendarPlus size={18} />
                </div>
                <div className="flex-1">
                  <div className="font-black text-slate-900 text-sm">Next Billing Year</div>
                  <div className="text-[10px] font-bold text-slate-500 mt-0.5">
                    {years.length === 0
                      ? `Open the first billing year for this school (${fmtFull(billing.annualAmount)} annual).`
                      : `Roll over to a new ${billing.plan.toLowerCase()} year (${fmtFull(billing.annualAmount)} annual).`}
                  </div>
                  {carryForwardHint && (
                    <div className={`text-[10px] font-black mt-1 ${
                      latestYear && latestYear.outstanding > 0 ? 'text-amber-600' : 'text-violet-600'
                    }`}>
                      {carryForwardHint}
                    </div>
                  )}
                  <button onClick={handleCreateNextYear}
                    disabled={creatingNextYear || !canCreateNextYear}
                    className="mt-2 inline-flex items-center gap-1.5 bg-emerald-600 text-white text-[11px] font-black px-3 py-2 rounded-full active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed">
                    <CalendarPlus size={13} />
                    {creatingNextYear ? 'Creating…' : years.length === 0 ? 'Create First Year' : 'Create Next Year'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Payment history */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 px-1">
              Payment History ({schoolPayments.length})
            </p>
            {schoolPayments.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center text-slate-400">
                <IndianRupee size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-xs font-bold">No payments yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {schoolPayments.map(p => (
                  <div key={p.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                        <CheckCircle2 size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-extrabold text-slate-900 text-sm">{fmtFull(p.amount)}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${METHOD_COLORS[p.method]}`}>{p.method}</span>
                          <span className="text-[9px] font-bold text-slate-400 truncate">{p.txnId}</span>
                        </div>
                        {p.notes && <div className="text-[9px] text-slate-400 mt-0.5">{p.notes}</div>}
                      </div>
                      <div className="text-[10px] font-bold text-slate-400 shrink-0">{fmtDate(p.paidAt)}</div>
                    </div>

                    {/* Per-payment allocation breakdown (oldest-first) */}
                    {(p.allocations.length > 0 || p.parkedAdvance > 0) && (
                      <div className="mt-2 ml-12 pt-2 border-t border-slate-100">
                        <div className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1">
                          Applied to
                        </div>
                        <div className="space-y-0.5">
                          {p.allocations.map((a, i) => (
                            <div key={`${a.yearId}-${i}`} className="flex items-center justify-between text-[10px] font-bold">
                              <span className="text-slate-600 truncate">{a.yearLabel || 'Year'}</span>
                              <span className="text-emerald-700 shrink-0 ml-2">{fmtFull(a.amountApplied)}</span>
                            </div>
                          ))}
                          {p.parkedAdvance > 0 && (
                            <div className="flex items-center justify-between text-[10px] font-bold">
                              <span className="text-violet-600 truncate">Advance credit (parked)</span>
                              <span className="text-violet-600 shrink-0 ml-2">{fmtFull(p.parkedAdvance)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── SETUP BILLING view (legacy schools without a schedule) ──────────────
  if (view === 'SETUP_BILLING' && selectedRow) {
    const { billing } = selectedRow;
    const planAmount = setupAmount.trim()
      ? parseInt(setupAmount.replace(/,/g, ''), 10) || 0
      : PLAN_PRICES[setupPlan];

    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        <Header title="Set Up Billing" back={() => setView('SCHOOL_DETAIL')} />
        <div className="flex-1 overflow-y-auto px-4 pt-4 space-y-4 pb-6">

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="font-extrabold text-slate-900 truncate">{billing.schoolName}</div>
            <div className="text-[11px] font-bold text-slate-500 mt-0.5">
              First-time billing setup
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Plan
              </label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {(Object.values(BillingPlan) as BillingPlan[]).map((p) => (
                  <button key={p} onClick={() => setSetupPlan(p)}
                    className={`px-2 py-2 rounded-xl text-[11px] font-black transition-colors ${
                      setupPlan === p
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                    {p}
                    <div className={`text-[9px] font-bold mt-0.5 ${
                      setupPlan === p ? 'text-emerald-100' : 'text-slate-400'
                    }`}>
                      {fmt(PLAN_PRICES[p])}/yr
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Billing Start Date
              </label>
              <input type="date" value={setupStartDate}
                onChange={(e) => setSetupStartDate(e.target.value)}
                className="w-full mt-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-900" />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Annual Amount (optional)
              </label>
              <input type="text" inputMode="numeric" value={setupAmount}
                onChange={(e) => setSetupAmount(e.target.value.replace(/[^\d]/g, ''))}
                placeholder={`Default: ${fmtFull(PLAN_PRICES[setupPlan])}`}
                className="w-full mt-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-900 placeholder:text-slate-400 placeholder:font-normal" />
              <p className="text-[10px] font-bold text-slate-400 mt-1">
                Leave blank to use the standard plan price.
              </p>
            </div>
          </div>

          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-emerald-700">
              First Year Will Be Created
            </div>
            <div className="text-sm font-extrabold text-emerald-900 mt-1">
              {fmtFull(planAmount)} due — starting {fmtDate(setupStartDate)}
            </div>
          </div>

          <button onClick={handleSetupBilling}
            disabled={settingUp || !setupStartDate}
            className="w-full bg-emerald-600 text-white font-black py-3 rounded-2xl active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed">
            {settingUp ? 'Creating…' : 'Create Billing Schedule'}
          </button>
        </div>
      </div>
    );
  }

  // ── RECORD PAYMENT view ─────────────────────────────────────────────────
  if (view === 'RECORD_PAYMENT' && selectedRow && breakdown) {
    const { billing } = selectedRow;
    const totalOut = breakdown.totalOutstanding;

    return (
      <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
        <Header title="Add Payment" back={() => setView('SCHOOL_DETAIL')} />
        <div className="flex-1 overflow-y-auto px-4 pt-4 space-y-4 pb-6">

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-slate-100 flex items-center justify-center font-black text-sm text-slate-700">
              {billing.schoolName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-extrabold text-slate-900 truncate">{billing.schoolName}</div>
              <div className="text-xs font-bold text-rose-600 mt-0.5">
                Outstanding: {fmtFull(totalOut)}
              </div>
              {billing.advanceBalance > 0 && (
                <div className="text-[10px] font-black text-violet-700 mt-0.5">
                  Existing advance credit: {fmtFull(billing.advanceBalance)}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                Amount (₹) *
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400">₹</span>
                <input
                  type="number" value={amount} onChange={e => setAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl pl-8 pr-4 py-3 font-black text-sm outline-none focus:border-blue-500 focus:bg-white transition-colors"
                />
              </div>
              {totalOut > 0 && (
                <button onClick={() => setAmount(String(totalOut))}
                  className="mt-1.5 text-[10px] font-black text-blue-600 underline">
                  Pay full balance ({fmtFull(totalOut)})
                </button>
              )}
            </div>

            {/* Allocation preview — read-only mirror of the RPC's oldest-first walk */}
            {allocPreview && allocPreview.totalAmount > 0 && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-blue-700">
                    How this payment will be applied
                  </span>
                  {previewLoading && <span className="text-[9px] font-bold text-blue-400">Updating…</span>}
                </div>
                {allocPreview.allocations.length === 0 && allocPreview.advanceCredit > 0 && (
                  <p className="text-xs font-bold text-violet-700">
                    All years are settled — entire {fmtFull(allocPreview.totalAmount)} will be parked as advance credit.
                  </p>
                )}
                {allocPreview.allocations.map((a) => (
                  <div key={a.yearId} className="flex items-center justify-between text-xs">
                    <span className="font-black text-slate-700">
                      {a.yearLabel}
                      {a.willClose
                        ? <span className="ml-1.5 text-[9px] font-black text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full">closes</span>
                        : <span className="ml-1.5 text-[9px] font-black text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">partial</span>
                      }
                    </span>
                    <span className="font-black text-slate-900">{fmtFull(a.amountApplied)}</span>
                  </div>
                ))}
                {allocPreview.advanceCredit > 0 && allocPreview.allocations.length > 0 && (
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-blue-200">
                    <span className="font-black text-violet-700">Parked as advance credit</span>
                    <span className="font-black text-violet-700">{fmtFull(allocPreview.advanceCredit)}</span>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                Transaction ID *
              </label>
              <input value={txnId} onChange={e => setTxnId(e.target.value)}
                placeholder="e.g. TXN-2504-XXX-001"
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500 focus:bg-white transition-colors"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                Payment Method
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(['UPI', 'NEFT', 'CHEQUE', 'CASH'] as PayMethod[]).map(m => (
                  <button key={m} onClick={() => setMethod(m)}
                    className={`py-2 rounded-xl text-[11px] font-black uppercase transition-all ${
                      method === m ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                Notes (optional)
              </label>
              <input value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Q1 installment"
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-sm outline-none focus:border-blue-500 focus:bg-white transition-colors"
              />
            </div>
          </div>

          <button onClick={handlePay} disabled={submitting}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl active:scale-95 transition-transform shadow-lg disabled:opacity-60">
            <CreditCard size={16} />
            {submitting ? 'Saving…' : 'Confirm Payment'}
          </button>
        </div>
      </div>
    );
  }

  return null;
};
