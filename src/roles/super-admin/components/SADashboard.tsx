import React, { useEffect, useState } from 'react';
import {
  Building2, ShieldCheck, IndianRupee, BarChart3, MailPlus, History,
  AlertCircle, TrendingUp, Users, Settings as SettingsIcon, Sparkles,
} from 'lucide-react';
import { useSchoolStore } from '@/roles/super-admin/schoolStore';
import { supabase } from '@/lib/supabase';
import { SchoolStatus } from '@/shared/config/constants';

interface SADashboardProps {
  onNavigate: (view: string) => void;
}

/**
 * Super-admin home. Renders a single mobile-first column that re-flows
 * to a wider two-column layout on md+. Sidebar nav handles section
 * routing on desktop, so the mobile-only quick-action grid surfaces
 * the five sections that don't appear in BottomNav (Admins, Reports,
 * Broadcast, Logs, Settings).
 */
export const SADashboard: React.FC<SADashboardProps> = ({ onNavigate }) => {
  const { schools, fetchSchools } = useSchoolStore();

  const [thisMonthCollected, setThisMonthCollected] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  const [settledCount, setSettledCount] = useState(0);

  useEffect(() => {
    fetchSchools();
    void loadBillingRollup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadBillingRollup = async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const { data, error } = await supabase
      .from('school_billing_installments')
      .select('school_id, amount, paid_amount, paid_at');
    if (error) return;
    type Row = { school_id: string; amount: number; paid_amount: number; paid_at: string | null };
    const rows = (data ?? []) as Row[];

    let monthSum = 0;
    const perSchool = new Map<string, number>();
    for (const r of rows) {
      const outstanding = r.amount - r.paid_amount;
      perSchool.set(r.school_id, (perSchool.get(r.school_id) ?? 0) + outstanding);
      if (r.paid_at && r.paid_at >= monthStart) monthSum += r.paid_amount;
    }
    setThisMonthCollected(monthSum);
    const schoolStates = [...perSchool.values()];
    setOverdueCount(schoolStates.filter(o => o > 0).length);
    setSettledCount(schoolStates.filter(o => o === 0).length);
  };

  const activeSchools = schools.filter(s => s.status === SchoolStatus.ACTIVE).length;
  const trialSchools = schools.filter(s => s.status === SchoolStatus.TRIAL).length;
  const totalUsers = schools.reduce((acc, s) => acc + s.studentCount + s.teacherCount, 0);

  // Mobile-only shortcuts to the five sections that don't fit in the
  // 4-button BottomNav. Desktop users reach the same sections via the
  // persistent SidebarNav, so this grid is hidden there.
  const mobileQuickActions = [
    { label: 'Admins',    icon: ShieldCheck,  view: 'admins',    tint: 'bg-rose-50 text-rose-600' },
    { label: 'Reports',   icon: BarChart3,    view: 'reports',   tint: 'bg-indigo-50 text-indigo-600' },
    { label: 'Broadcast', icon: MailPlus,     view: 'broadcast', tint: 'bg-amber-50 text-amber-600' },
    { label: 'Logs',      icon: History,      view: 'logs',      tint: 'bg-slate-100 text-slate-600' },
    { label: 'Settings',  icon: SettingsIcon, view: 'settings',  tint: 'bg-violet-50 text-violet-600' },
  ];

  const today = new Date();
  const monthLabel = today.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const fmtRupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

  return (
    <div className="flex flex-col gap-4 lg:gap-6 px-4 lg:px-8 pt-4 lg:pt-8 pb-10 lg:max-w-7xl lg:mx-auto animate-in fade-in duration-300">

      {/* Greeting + month chip */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-black text-slate-900 tracking-tight">Platform Overview</h1>
          <p className="text-[11px] lg:text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">
            EduGrow · Super Admin
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1.5 rounded-full shadow-sm">
          <Sparkles size={12} className="text-amber-500" />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">{monthLabel}</span>
        </div>
      </div>

      {/* Revenue hero — full-width slate gradient card with the headline
          number and split stats. Always at the top because monthly
          collection is the primary KPI a super-admin opens the app for. */}
      <button onClick={() => onNavigate('billing')}
        className="text-left bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 rounded-3xl p-5 lg:p-7 text-white shadow-xl shadow-slate-900/20 active:scale-[0.99] transition-transform">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center">
              <IndianRupee size={18} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] lg:text-xs font-black uppercase tracking-widest text-white/60">This Month</p>
              <p className="text-[10px] font-bold text-white/40">Cross-school collections</p>
            </div>
          </div>
          <div className="flex items-center gap-1 bg-emerald-500/20 text-emerald-300 text-[10px] font-black px-2.5 py-1 rounded-full">
            <TrendingUp size={10} /> {today.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
          </div>
        </div>
        <div className="text-4xl lg:text-5xl font-black tracking-tight">{fmtRupees(thisMonthCollected)}</div>
        <div className="grid grid-cols-2 gap-3 mt-5 pt-5 border-t border-white/10">
          <div>
            <div className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Settled</div>
            <div className="text-lg font-black text-emerald-400 mt-0.5">{settledCount} schools</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Outstanding</div>
            <div className={`text-lg font-black mt-0.5 ${overdueCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {overdueCount > 0 ? `${overdueCount} schools` : 'All clear'}
            </div>
          </div>
        </div>
      </button>

      {/* Overdue alert — only when something needs attention */}
      {overdueCount > 0 && (
        <button onClick={() => onNavigate('billing')}
          className="w-full flex items-center gap-3 bg-rose-50 border border-rose-200 rounded-2xl p-4 text-left active:scale-[0.99] transition-transform">
          <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center shrink-0">
            <AlertCircle size={20} className="text-rose-600" />
          </div>
          <div className="flex-1">
            <p className="text-xs lg:text-sm font-black text-rose-700 uppercase tracking-tight">
              {overdueCount} Overdue Payment{overdueCount > 1 ? 's' : ''}
            </p>
            <p className="text-[11px] font-bold text-rose-500 mt-0.5">Tap to review billing →</p>
          </div>
        </button>
      )}

      {/* KPI strip — 2 cols mobile, 4 cols desktop. Each card opens the
          relevant section via SidebarNav-style routing. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard onClick={() => onNavigate('schools')}
          icon={<Building2 size={16} className="text-emerald-600"/>}
          label="Schools"
          value={schools.length}
          accent="emerald" />
        <KpiCard onClick={() => onNavigate('schools')}
          icon={<ShieldCheck size={16} className="text-blue-600"/>}
          label="Active"
          value={activeSchools}
          accent="blue" />
        <KpiCard onClick={() => onNavigate('schools')}
          icon={<Sparkles size={16} className="text-violet-600"/>}
          label="On Trial"
          value={trialSchools}
          accent="violet" />
        <KpiCard onClick={() => onNavigate('billing')}
          icon={<Users size={16} className="text-amber-600"/>}
          label="Users"
          value={totalUsers > 999 ? `${(totalUsers / 1000).toFixed(1)}k` : totalUsers}
          accent="amber" />
      </div>

      {/* Mobile-only quick-action grid for sections not in BottomNav. */}
      <div className="lg:hidden">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3 px-1">Quick Actions</h3>
        <div className="grid grid-cols-3 gap-3">
          {mobileQuickActions.map(({ label, icon: Icon, view, tint }) => (
            <button key={view} onClick={() => onNavigate(view)}
              className="flex flex-col items-center gap-2 p-3.5 bg-white rounded-2xl border border-slate-100 shadow-sm active:scale-95 transition-transform">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tint}`}>
                <Icon size={20} />
              </div>
              <span className="text-[10px] font-black uppercase tracking-wide text-slate-700 leading-none">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Recent schools — full-width list. On desktop the wider card lets
          us show more rows per page without scrolling. */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h3 className="text-[10px] lg:text-xs font-black uppercase tracking-widest text-slate-500">Recent Schools</h3>
          {schools.length > 0 && (
            <button onClick={() => onNavigate('schools')}
              className="text-[10px] lg:text-xs font-black text-blue-600 hover:text-blue-700 uppercase tracking-widest">
              View All →
            </button>
          )}
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {schools.length === 0 ? (
            <div className="flex flex-col items-center py-12 px-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
                <Building2 size={26} />
              </div>
              <p className="font-black text-slate-700 text-sm">No schools onboarded yet</p>
              <p className="text-[11px] font-bold text-slate-400 mt-1 leading-relaxed max-w-xs">
                Tap <span className="text-slate-700">Schools</span> in the {window.innerWidth >= 1024 ? 'sidebar' : 'bottom nav'} to add your first school.
              </p>
              <button onClick={() => onNavigate('schools')}
                className="mt-4 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] uppercase tracking-widest rounded-xl active:scale-95 transition-transform shadow-sm">
                + Onboard School
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {schools.slice(0, 6).map(school => {
                const initials = school.name
                  .split(/\s+/).filter(Boolean)
                  .map(w => w[0])
                  .join('').slice(0, 2).toUpperCase() || '?';
                const status = school.status;
                const statusClass =
                  status === SchoolStatus.ACTIVE ? 'text-emerald-700 bg-emerald-50 border-emerald-100' :
                  status === SchoolStatus.TRIAL  ? 'text-violet-700 bg-violet-50 border-violet-100' :
                  'text-slate-500 bg-slate-100 border-slate-200';
                return (
                  <button key={school.id} onClick={() => onNavigate('schools')}
                    className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-700 flex items-center justify-center font-black text-xs shrink-0">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-extrabold text-slate-900 text-sm truncate">{school.name}</div>
                      <div className="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-widest">
                        {school.studentCount.toLocaleString('en-IN')} students · {school.location || '—'}
                      </div>
                    </div>
                    <span className={`text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest border shrink-0 ${statusClass}`}>
                      {status}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface KpiProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  accent: 'emerald' | 'blue' | 'violet' | 'amber';
  onClick?: () => void;
}

const KpiCard: React.FC<KpiProps> = ({ icon, label, value, onClick }) => (
  <button onClick={onClick}
    className="text-left bg-white rounded-2xl border border-slate-100 shadow-sm p-4 lg:p-5 active:scale-[0.98] hover:border-slate-200 hover:shadow transition-all">
    <div className="flex items-center gap-2 mb-2">
      {icon}
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</span>
    </div>
    <div className="text-2xl lg:text-3xl font-black text-slate-900 tabular-nums">{value}</div>
  </button>
);
