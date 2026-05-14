import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, TrendingUp, Users, Activity, IndianRupee, Building2, AlertCircle } from 'lucide-react';
import { useSchoolStore } from '@/roles/super-admin/schoolStore';
import { supabase } from '@/lib/supabase';
import { SchoolStatus } from '@/shared/config/constants';
import { fmtINRCompact as fmtINR } from '@/shared/utils/currency';

interface Props { onBack: () => void; }

interface BillingRow {
  school_id: string;
  amount: number;
  paid_amount: number;
  paid_at: string | null;
}

/**
 * Super-admin Reports — same single query against
 * `school_billing_installments` as before, plus the schools list from
 * the store. No new round-trips: paid_at was already on the table; we
 * just select it to compute a 3-month revenue trend client-side.
 *
 * Earlier this view captured `schools` inside `loadBilling()`'s closure
 * via `useEffect(…, [])`, so per-school names rendered as "Unknown"
 * until a manual reload. Fixed by moving all derived state into a
 * `useMemo` that depends on both `schools` and the raw billing rows.
 */
export const ReportsView: React.FC<Props> = ({ onBack }) => {
  const { schools, fetchSchools } = useSchoolStore();
  const [billingRows, setBillingRows] = useState<BillingRow[] | null>(null);

  useEffect(() => {
    fetchSchools();
    void loadBilling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadBilling = async () => {
    const { data, error } = await supabase
      .from('school_billing_installments')
      .select('school_id, amount, paid_amount, paid_at');
    if (error) { setBillingRows([]); return; }
    setBillingRows((data ?? []) as BillingRow[]);
  };

  // All derived stats — recomputed when either schools or billingRows
  // change so a late-resolving fetch can't leave stale closure data.
  const derived = useMemo(() => {
    const rows = billingRows ?? [];
    const perSchool = new Map<string, { paid: number; due: number }>();
    let totalPaid = 0;
    let totalDue = 0;
    // Monthly buckets — last 3 calendar months by paid_at date.
    const monthBuckets = new Map<string, number>();
    const now = new Date();
    for (let i = 2; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthBuckets.set(k, 0);
    }
    for (const r of rows) {
      const cur = perSchool.get(r.school_id) ?? { paid: 0, due: 0 };
      cur.paid += r.paid_amount;
      cur.due += r.amount;
      perSchool.set(r.school_id, cur);
      totalPaid += r.paid_amount;
      totalDue += r.amount;
      if (r.paid_at) {
        const key = r.paid_at.slice(0, 7);
        if (monthBuckets.has(key)) {
          monthBuckets.set(key, (monthBuckets.get(key) ?? 0) + r.paid_amount);
        }
      }
    }
    const nameById = new Map(schools.map(s => [s.id, s.name]));
    const perSchoolPct = [...perSchool.entries()]
      .map(([id, { paid, due }]) => ({
        name: nameById.get(id) ?? 'Unknown',
        pct: due > 0 ? Math.round((paid / due) * 100) : 0,
        due,
      }))
      // Sort ascending — lowest-collection schools surface at the
      // top because that's where the super-admin's attention should go.
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 8);
    return {
      totalPaid,
      totalDue,
      perSchoolPct,
      monthlyTrend: [...monthBuckets.entries()].map(([k, v]) => ({
        label: new Date(`${k}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
        amount: v,
      })),
    };
  }, [billingRows, schools]);

  const totalRevenue = derived.totalPaid;
  const totalOutstanding = Math.max(0, derived.totalDue - derived.totalPaid);
  const totalStudents = schools.reduce((a, s) => a + s.studentCount, 0);
  const totalTeachers = schools.reduce((a, s) => a + s.teacherCount, 0);
  const activeSchools = schools.filter(s => s.status === SchoolStatus.ACTIVE).length;
  const trialSchools = schools.filter(s => s.status === SchoolStatus.TRIAL).length;
  const suspendedSchools = schools.filter(s => s.status === SchoolStatus.SUSPENDED).length;
  const inactiveSchools = schools.filter(s => s.status === SchoolStatus.INACTIVE).length;
  const totalSchools = schools.length;
  const activePct = totalSchools ? Math.round((activeSchools / totalSchools) * 100) : 0;
  const collectedPct = derived.totalDue > 0
    ? Math.round((totalRevenue / derived.totalDue) * 100)
    : 0;

  const topSchools = [...schools]
    .sort((a, b) => b.studentCount - a.studentCount)
    .slice(0, 5);

  const kpis = [
    { label: 'Active Schools', value: `${activePct}%`, sub: `${activeSchools}/${totalSchools} on platform`, color: 'from-indigo-500 to-indigo-600', icon: Activity },
    { label: 'Collection Rate', value: `${collectedPct}%`, sub: 'Paid vs total billed', color: 'from-blue-500 to-blue-600', icon: TrendingUp },
    { label: 'Revenue', value: fmtINR(totalRevenue), sub: 'All-time collected', color: 'from-emerald-500 to-emerald-600', icon: IndianRupee },
    { label: 'Users', value: fmtCompact(totalStudents + totalTeachers), sub: 'Students + teachers', color: 'from-amber-500 to-amber-600', icon: Users },
  ];

  const maxMonthly = Math.max(1, ...derived.monthlyTrend.map(m => m.amount));
  const statusBreakdown = [
    { label: 'Active',    count: activeSchools,    cls: 'bg-emerald-500' },
    { label: 'Trial',     count: trialSchools,     cls: 'bg-violet-500'  },
    { label: 'Suspended', count: suspendedSchools, cls: 'bg-rose-500'    },
    { label: 'Inactive',  count: inactiveSchools,  cls: 'bg-slate-400'   },
  ].filter(s => s.count > 0);

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Reports</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5 lg:max-w-5xl lg:mx-auto lg:w-full">
        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpis.map(({ label, value, sub, color, icon: Icon }) => (
            <div key={label} className={`bg-gradient-to-br ${color} rounded-2xl p-4 text-white shadow-md`}>
              <div className="mb-2 w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                <Icon size={16} />
              </div>
              <div className="text-[10px] font-black uppercase tracking-widest mb-1 opacity-80">{label}</div>
              <div className="text-2xl font-black tabular-nums">{value}</div>
              <div className="text-[10px] mt-0.5 opacity-70">{sub}</div>
            </div>
          ))}
        </div>

        {/* Outstanding banner — surfaces total dues to collect at a glance */}
        {totalOutstanding > 0 && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
              <AlertCircle size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-black uppercase tracking-widest text-rose-700">Outstanding</div>
              <div className="text-xl font-black text-slate-900 tabular-nums">{fmtINR(totalOutstanding)}</div>
              <div className="text-[10px] font-bold text-rose-600 mt-0.5">Across {derived.perSchoolPct.length} schools</div>
            </div>
          </div>
        )}

        {/* Last 3 months trend — bar list, no new queries (paid_at on
            same row we already fetch). Shows whether collections are
            climbing month-over-month. */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={16} className="text-emerald-600" />
            <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-500">Revenue · Last 3 Months</h3>
          </div>
          <div className="space-y-3">
            {derived.monthlyTrend.every(m => m.amount === 0) ? (
              <div className="text-xs text-slate-400 italic">No payments recorded in the last 3 months</div>
            ) : derived.monthlyTrend.map(m => (
              <div key={m.label}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold text-slate-700">{m.label}</span>
                  <span className="text-[10px] font-black text-emerald-700 tabular-nums">{fmtINR(m.amount)}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${(m.amount / maxMonthly) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Schools by status — derived from the schools store, no
            extra query. Helps super-admin spot drift (e.g. suspended
            count creeping up). Renders only statuses that actually
            have a non-zero count. */}
        {statusBreakdown.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-4">
              <Building2 size={16} className="text-indigo-600" />
              <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-500">Schools by Status</h3>
            </div>
            <div className="flex w-full h-3 rounded-full overflow-hidden bg-slate-100 mb-3">
              {statusBreakdown.map(s => (
                <div key={s.label} className={s.cls}
                  style={{ width: `${(s.count / totalSchools) * 100}%` }}
                  title={`${s.label}: ${s.count}`} />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              {statusBreakdown.map(s => (
                <div key={s.label} className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${s.cls}`} />
                  <span className="font-bold text-slate-700">{s.label}</span>
                  <span className="ml-auto font-black text-slate-900 tabular-nums">{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Per-school collection rate — sorted ASCENDING so the schools
            needing follow-up surface first. Includes 0 % rows (which the
            previous version filtered out). */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={16} className="text-indigo-600" />
            <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-500">Collection Rate · Schools Needing Follow-up</h3>
          </div>
          <div className="space-y-3">
            {billingRows === null ? (
              <div className="text-xs text-slate-400 italic">Loading…</div>
            ) : derived.perSchoolPct.length === 0 ? (
              <div className="text-xs text-slate-400 italic">No billing data yet</div>
            ) : derived.perSchoolPct.map(({ name, pct, due }) => (
              <div key={name}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold text-slate-700 truncate max-w-[60%]" title={name}>{name}</span>
                  <span className={`text-[10px] font-black tabular-nums ${pct >= 80 ? 'text-emerald-600' : pct >= 60 ? 'text-amber-600' : 'text-rose-500'}`}>
                    {pct}% <span className="opacity-60">· {fmtINR(due)}</span>
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div className={`h-full rounded-full transition-all ${pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-400' : 'bg-rose-400'}`}
                    style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top schools by size */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-4">
            <Building2 size={16} className="text-blue-600" />
            <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-500">Top Schools by Students</h3>
          </div>
          <div className="space-y-3">
            {topSchools.length === 0 ? (
              <div className="text-xs text-slate-400 italic">No schools onboarded yet</div>
            ) : topSchools.map((s, i) => (
              <div key={s.id} className="flex items-center gap-3">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs ${i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-200 text-slate-600' : 'bg-orange-100 text-orange-600'}`}>
                  {i + 1}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-slate-700 truncate max-w-[65%]">{s.name}</span>
                    <span className="text-[10px] font-black text-blue-600 tabular-nums">{s.studentCount.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5">
                    <div className="bg-blue-500 h-full rounded-full"
                      style={{ width: `${Math.round((s.studentCount / (topSchools[0]?.studentCount || 1)) * 100)}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};


function fmtCompact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
