import React, { useEffect } from 'react';
import { ArrowLeft, TrendingUp, Users, Activity, IndianRupee, Building2, Award } from 'lucide-react';
import { useSchoolStore } from '../../../store/schoolStore';
import { useBillingStore } from '../../../store/billingStore';
import { SchoolStatus, BillingPlan, PaymentStatus, PLAN_COLORS } from '../../../config/constants';

interface Props {
  onBack: () => void;
}

export const ReportsView: React.FC<Props> = ({ onBack }) => {
  const { schools, fetchSchools } = useSchoolStore();
  const { records, fetchAll } = useBillingStore();

  useEffect(() => {
    fetchSchools();
    fetchAll();
  }, []);

  const totalRevenue = records.filter(r => r.status === PaymentStatus.PAID).reduce((a, r) => a + r.amount, 0);
  const totalStudents = schools.reduce((a, s) => a + s.studentCount, 0);
  const totalTeachers = schools.reduce((a, s) => a + s.teacherCount, 0);
  const activeSchools = schools.filter(s => s.status === SchoolStatus.ACTIVE).length;

  const planBreakdown = Object.values(BillingPlan).map(plan => ({
    plan,
    count: schools.filter(s => s.plan === plan).length,
    pct: schools.length ? Math.round((schools.filter(s => s.plan === plan).length / schools.length) * 100) : 0,
  }));

  const topSchools = [...schools]
    .sort((a, b) => b.studentCount - a.studentCount)
    .slice(0, 5);

  const engagementMock = [
    { name: 'Delhi Public School', pct: 98 },
    { name: "St. Mary's Convent", pct: 94 },
    { name: 'Greenwood High', pct: 87 },
    { name: 'Heritage International', pct: 72 },
    { name: 'Sunrise Valley', pct: 65 },
    { name: 'Oakridge International', pct: 42 },
  ];

  const kpis = [
    { label: 'Platform Usage', value: '94%', sub: 'Daily active users', color: 'from-indigo-500 to-indigo-600', icon: Activity },
    { label: 'Growth', value: '+24%', sub: 'vs last quarter', color: 'from-blue-500 to-blue-600', icon: TrendingUp },
    { label: 'Revenue', value: `₹${(totalRevenue / 1000).toFixed(0)}k`, sub: 'This month', color: 'from-emerald-500 to-emerald-600', icon: IndianRupee },
    { label: 'Users', value: `${((totalStudents + totalTeachers) / 1000).toFixed(1)}k`, sub: 'Active users', color: 'from-amber-500 to-amber-600', icon: Users },
  ];

  return (
    <div className="absolute inset-0 z-50 bg-slate-50 flex flex-col animate-in slide-in-from-right-8 duration-300">
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button onClick={onBack} className="p-2 -ml-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Reports</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-5">
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

        {/* Plan distribution */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-4">
            <Award size={16} className="text-amber-600" />
            <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-500">Plan Distribution</h3>
          </div>
          <div className="space-y-3">
            {planBreakdown.map(({ plan, count, pct }) => (
              <div key={plan}>
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${PLAN_COLORS[plan]}`}>{plan}</span>
                    <span className="text-xs font-bold text-slate-700">{count} school{count !== 1 ? 's' : ''}</span>
                  </div>
                  <span className="text-[10px] font-black text-slate-500">{pct}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div className={`h-full rounded-full ${plan === BillingPlan.PREMIUM ? 'bg-amber-400' : plan === BillingPlan.STANDARD ? 'bg-blue-500' : 'bg-slate-400'}`}
                    style={{ width: `${pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Platform engagement */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={16} className="text-indigo-600" />
            <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-500">Platform Engagement</h3>
          </div>
          <div className="space-y-3">
            {engagementMock.map(({ name, pct }) => (
              <div key={name}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold text-slate-700 truncate max-w-[65%]">{name}</span>
                  <span className={`text-[10px] font-black ${pct >= 80 ? 'text-emerald-600' : pct >= 60 ? 'text-amber-600' : 'text-rose-500'}`}>{pct}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div className={`h-full rounded-full transition-all ${pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-400' : 'bg-rose-400'}`}
                    style={{ width: `${pct}%` }} />
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
