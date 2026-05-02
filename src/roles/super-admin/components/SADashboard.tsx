import React, { useEffect } from 'react';
import { Building2, ShieldCheck, IndianRupee, BarChart3, MailPlus, History, AlertCircle, TrendingUp, Users } from 'lucide-react';
import { useSchoolStore } from '@/store/schoolStore';
import { useBillingStore } from '@/store/billingStore';
import { SchoolStatus } from '@/shared/config/constants';

interface SADashboardProps {
  onNavigate: (view: string) => void;
}

export const SADashboard: React.FC<SADashboardProps> = ({ onNavigate }) => {
  const { schools, fetchSchools } = useSchoolStore();
  const { billingYears, fetchAll } = useBillingStore();

  useEffect(() => {
    fetchSchools();
    fetchAll();
  }, []);

  const activeSchools = schools.filter(s => s.status === SchoolStatus.ACTIVE).length;
  const trialSchools = schools.filter(s => s.status === SchoolStatus.TRIAL).length;
  const totalUsers = schools.reduce((acc, s) => acc + s.studentCount + s.teacherCount, 0);

  // Latest billing year per school
  const latestYears = Object.values(
    billingYears.reduce<Record<string, typeof billingYears[0]>>((acc, y) => {
      const prev = acc[y.schoolId];
      if (!prev || y.startDate > prev.startDate) acc[y.schoolId] = y;
      return acc;
    }, {})
  );
  const overdueCount   = latestYears.filter(y => y.outstanding > 0).length;
  const settledCount   = latestYears.filter(y => y.outstanding === 0).length;
  const totalCollected = billingYears.reduce((s, y) => s + y.totalPaid, 0);

  const actions = [
    { label: 'Schools', icon: Building2, color: 'bg-emerald-50 text-emerald-600', view: 'schools' },
    { label: 'Billing', icon: IndianRupee, color: 'bg-blue-50 text-blue-600', view: 'billing' },
    { label: 'Admins', icon: ShieldCheck, color: 'bg-rose-50 text-rose-600', view: 'admins' },
    { label: 'Reports', icon: BarChart3, color: 'bg-indigo-50 text-indigo-600', view: 'reports' },
    { label: 'Broadcast', icon: MailPlus, color: 'bg-amber-50 text-amber-600', view: 'broadcast' },
    { label: 'Logs', icon: History, color: 'bg-slate-100 text-slate-600', view: 'logs' },
  ];

  return (
    <div className="flex flex-col gap-5 px-5 animate-in slide-in-from-bottom-4 duration-500 fade-in">

      {/* Quick actions grid */}
      <div className="grid grid-cols-3 gap-3">
        {actions.map(({ label, icon: Icon, color, view }) => (
          <button
            key={view}
            onClick={() => onNavigate(view)}
            className="flex flex-col items-center gap-2 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm active:scale-95 transition-transform"
          >
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
              <Icon size={22} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">{label}</span>
          </button>
        ))}
      </div>

      {/* Overdue alert */}
      {overdueCount > 0 && (
        <button
          onClick={() => onNavigate('billing')}
          className="w-full flex items-center gap-3 bg-rose-50 border border-rose-200 rounded-2xl p-4 text-left active:scale-95 transition-transform"
        >
          <div className="w-9 h-9 bg-rose-100 rounded-xl flex items-center justify-center shrink-0">
            <AlertCircle size={18} className="text-rose-600" />
          </div>
          <div>
            <p className="text-xs font-black text-rose-700 uppercase tracking-widest">
              {overdueCount} Overdue Payment{overdueCount > 1 ? 's' : ''}
            </p>
            <p className="text-[10px] font-bold text-rose-500 mt-0.5">Tap to manage billing →</p>
          </div>
        </button>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <Building2 size={16} className="text-emerald-600" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Schools</span>
          </div>
          <div className="text-3xl font-black text-slate-900">{schools.length}</div>
          <div className="flex gap-2 mt-3">
            <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
              {activeSchools} Active
            </span>
            {trialSchools > 0 && (
              <span className="text-[10px] font-black text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full">
                {trialSchools} Trial
              </span>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <Users size={16} className="text-blue-600" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Users</span>
          </div>
          <div className="text-3xl font-black text-slate-900">
            {totalUsers > 999 ? `${(totalUsers / 1000).toFixed(1)}k` : totalUsers}
          </div>
          <span className="text-[10px] font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full mt-3 inline-block">
            Students & Staff
          </span>
        </div>
      </div>

      {/* Revenue card */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-5 text-white shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <IndianRupee size={16} className="text-emerald-400" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Collected</span>
          </div>
          <div className="flex items-center gap-1 bg-emerald-500/20 text-emerald-400 text-[10px] font-black px-2 py-0.5 rounded-full">
            <TrendingUp size={10} /> All Time
          </div>
        </div>
        <div className="text-3xl font-black">
          ₹{totalCollected.toLocaleString('en-IN')}
        </div>
        <div className="flex gap-3 mt-4">
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Settled</div>
            <div className="text-sm font-black text-emerald-400">{settledCount} schools</div>
          </div>
          <div className="w-px bg-slate-700"></div>
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Outstanding</div>
            <div className="text-sm font-black text-rose-400">
              {overdueCount > 0 ? `${overdueCount} schools` : 'All clear'}
            </div>
          </div>
        </div>
      </div>

      {/* Recent onboardings */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-500">Recent Schools</h3>
          <button onClick={() => onNavigate('schools')} className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
            View All →
          </button>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {schools.slice(0, 4).map((school, i) => (
            <button
              key={school.id}
              onClick={() => onNavigate('schools')}
              className={`w-full flex items-center justify-between p-4 text-left active:bg-slate-50 transition-colors ${i < 3 ? 'border-b border-slate-50' : ''}`}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-700 flex items-center justify-center font-black text-xs">
                  {school.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                </div>
                <div>
                  <div className="font-extrabold text-slate-900 text-sm">{school.name}</div>
                  <div className="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-widest">
                    {school.plan} · {school.studentCount.toLocaleString('en-IN')} students
                  </div>
                </div>
              </div>
              <span className={`text-[9px] font-black px-2 py-1 rounded-full uppercase tracking-widest ${
                school.status === SchoolStatus.ACTIVE ? 'text-emerald-700 bg-emerald-50' :
                school.status === SchoolStatus.TRIAL ? 'text-violet-700 bg-violet-50' :
                'text-slate-500 bg-slate-100'
              }`}>
                {school.status}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="h-6" />
    </div>
  );
};
