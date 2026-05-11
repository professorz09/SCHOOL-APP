import React, { useEffect, useState } from 'react';
import { ArrowLeft, TrendingUp, Users, Activity, IndianRupee, Building2 } from 'lucide-react';
import { useSchoolStore } from '@/roles/super-admin/schoolStore';
import { supabase } from '@/lib/supabase';
import { SchoolStatus } from '@/shared/config/constants';

interface Props {
  onBack: () => void;
}

// Reports view — pulls live aggregate from school_billing_installments
// (the new flat billing table). Plan-distribution / engagement panels
// were removed when the legacy BillingPlan + billing_years stack was
// dropped — those breakdowns no longer have meaningful inputs.
export const ReportsView: React.FC<Props> = ({ onBack }) => {
  const { schools, fetchSchools } = useSchoolStore();
  const [billing, setBilling] = useState<{ totalPaid: number; totalDue: number; perSchoolPct: { name: string; pct: number }[] } | null>(null);

  useEffect(() => {
    fetchSchools();
    void loadBilling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadBilling = async () => {
    const { data, error } = await supabase
      .from('school_billing_installments')
      .select('school_id, amount, paid_amount');
    if (error) return;
    type Row = { school_id: string; amount: number; paid_amount: number };
    const rows = (data ?? []) as Row[];
    const perSchool = new Map<string, { paid: number; due: number }>();
    let totalPaid = 0;
    let totalDue = 0;
    for (const r of rows) {
      const cur = perSchool.get(r.school_id) ?? { paid: 0, due: 0 };
      cur.paid += r.paid_amount; cur.due += r.amount;
      perSchool.set(r.school_id, cur);
      totalPaid += r.paid_amount;
      totalDue += r.amount;
    }
    const nameById = new Map(schools.map(s => [s.id, s.name]));
    const perSchoolPct = [...perSchool.entries()]
      .map(([id, { paid, due }]) => ({
        name: nameById.get(id) ?? 'Unknown',
        pct: due > 0 ? Math.round((paid / due) * 100) : 0,
      }))
      .filter(e => e.pct > 0)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 6);
    setBilling({ totalPaid, totalDue, perSchoolPct });
  };

  const totalRevenue = billing?.totalPaid ?? 0;
  const totalOutstanding = Math.max(0, (billing?.totalDue ?? 0) - (billing?.totalPaid ?? 0));
  const totalStudents = schools.reduce((a, s) => a + s.studentCount, 0);
  const totalTeachers = schools.reduce((a, s) => a + s.teacherCount, 0);
  const activeSchools = schools.filter(s => s.status === SchoolStatus.ACTIVE).length;
  const totalSchools = schools.length;
  const activePct = totalSchools ? Math.round((activeSchools / totalSchools) * 100) : 0;
  const collectedPct = (totalRevenue + totalOutstanding) > 0
    ? Math.round((totalRevenue / (totalRevenue + totalOutstanding)) * 100)
    : 0;

  const topSchools = [...schools]
    .sort((a, b) => b.studentCount - a.studentCount)
    .slice(0, 5);

  const kpis = [
    { label: 'Active Schools', value: `${activePct}%`, sub: `${activeSchools}/${totalSchools} on platform`, color: 'from-indigo-500 to-indigo-600', icon: Activity },
    { label: 'Collection Rate', value: `${collectedPct}%`, sub: 'Paid vs total due', color: 'from-blue-500 to-blue-600', icon: TrendingUp },
    { label: 'Revenue', value: `₹${(totalRevenue / 1000).toFixed(0)}k`, sub: 'All-time collected', color: 'from-emerald-500 to-emerald-600', icon: IndianRupee },
    { label: 'Users', value: `${((totalStudents + totalTeachers) / 1000).toFixed(1)}k`, sub: 'Students + teachers', color: 'from-amber-500 to-amber-600', icon: Users },
  ];

  return (
    <div className="w-full bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Reports</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4  space-y-5">
        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-3">
          {kpis.map(({ label, value, sub, color, icon: Icon }) => (
            <div key={label} className={`bg-gradient-to-br ${color} rounded-2xl p-4 text-white shadow-md`}>
              <div className="mb-2 w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                <Icon size={16} />
              </div>
              <div className="text-[10px] font-black uppercase tracking-widest mb-1 opacity-80">{label}</div>
              <div className="text-2xl font-black">{value}</div>
              <div className="text-[10px] mt-0.5 opacity-70">{sub}</div>
            </div>
          ))}
        </div>

        {/* Per-school collection rate */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={16} className="text-indigo-600" />
            <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-500">Collection Rate · Per School</h3>
          </div>
          <div className="space-y-3">
            {(!billing || billing.perSchoolPct.length === 0) && (
              <div className="text-xs text-slate-400 italic">No billing data yet</div>
            )}
            {billing?.perSchoolPct.map(({ name, pct }) => (
              <div key={name}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold text-slate-700 truncate max-w-[65%]">{name}</span>
                  <span className={`text-[10px] font-black ${pct >= 80 ? 'text-emerald-600' : pct >= 60 ? 'text-amber-600' : 'text-rose-500'}`}>{pct}%</span>
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
            {topSchools.map((s, i) => (
              <div key={s.id} className="flex items-center gap-3">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs ${i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-200 text-slate-600' : 'bg-orange-100 text-orange-600'}`}>
                  {i + 1}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-slate-700 truncate max-w-[65%]">{s.name}</span>
                    <span className="text-[10px] font-black text-blue-600">{s.studentCount.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5">
                    <div className="bg-blue-500 h-full rounded-full" style={{ width: `${Math.round((s.studentCount / (topSchools[0]?.studentCount || 1)) * 100)}%` }} />
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
