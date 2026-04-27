import React, { useEffect, useState } from 'react';
import {
  Users, UserCheck, Receipt, Library, Bus, CircleAlert,
  Bell, CheckSquare, Settings, TrendingUp, IndianRupee, Calendar,
  CalendarDays, CreditCard, Banknote, Lock, ClipboardCheck, ArrowUpRight,
  UserPlus,
} from 'lucide-react';
import { studentService } from '../../../services/student.service';
import { staffService } from '../../../services/staff.service';
import { principalService } from '../../../services/principal.service';
import { PrincipalView } from '../pages/PrincipalLayout';
import { useAuthStore } from '../../../store/authStore';

interface Props {
  onNavigate: (view: PrincipalView) => void;
}

interface Module {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  view: PrincipalView;
  iconBg: string;
  iconFg: string;
  badge?: number | null;
}

const todayLabel = new Date().toLocaleDateString('en-IN', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});

export const PrincipalDashboard: React.FC<Props> = ({ onNavigate }) => {
  const session = useAuthStore(state => state.session);
  const [stats, setStats] = useState({
    totalStudents: 0, presentToday: 0, paidFees: 0, totalFees: 0,
    totalStaff: 0, openComplaints: 0, pendingApprovals: 0,
  });

  useEffect(() => {
    const load = async () => {
      const [students, staff, complaints, approvals] = await Promise.all([
        studentService.getAll(),
        staffService.getAll(),
        principalService.getComplaints(),
        principalService.getApprovals(),
      ]);
      setStats({
        totalStudents: students.length,
        presentToday: students.length > 0
          ? Math.round(students.reduce((a, s) => a + s.attendancePercent, 0) / students.length)
          : 0,
        paidFees: students.reduce((a, s) => a + s.paidFee, 0),
        totalFees: students.reduce((a, s) => a + s.totalFee, 0),
        totalStaff: staff.length,
        openComplaints: complaints.filter(c => c.status !== 'RESOLVED').length,
        pendingApprovals: approvals.filter(a => a.status === 'PENDING').length,
      });
    };
    load();
  }, []);

  const feePercent = stats.totalFees > 0 ? Math.round((stats.paidFees / stats.totalFees) * 100) : 0;
  const feePending = Math.max(0, stats.totalFees - stats.paidFees);
  const firstName = session?.name?.split(' ')[0] ?? 'Principal';

  const sections: { title: string; items: Module[] }[] = [
    {
      title: 'People',
      items: [
        { icon: Users,          label: 'Students',     view: 'STUDENTS',         iconBg: 'bg-indigo-50',   iconFg: 'text-indigo-600',   badge: stats.totalStudents },
        { icon: UserPlus,       label: 'Admission',    view: 'ADMISSION',        iconBg: 'bg-emerald-50',  iconFg: 'text-emerald-600' },
        { icon: UserCheck,      label: 'Staff',        view: 'STAFF',            iconBg: 'bg-blue-50',     iconFg: 'text-blue-600',     badge: stats.totalStaff },
        { icon: ClipboardCheck, label: 'Attendance',   view: 'ATTENDANCE',       iconBg: 'bg-cyan-50',     iconFg: 'text-cyan-600' },
      ],
    },
    {
      title: 'Academics',
      items: [
        { icon: CalendarDays, label: 'Timetable',  view: 'TIMETABLE',  iconBg: 'bg-sky-50',     iconFg: 'text-sky-600' },
        { icon: Calendar,     label: 'Classes',    view: 'CLASS_MGMT', iconBg: 'bg-violet-50',  iconFg: 'text-violet-600' },
        { icon: Lock,         label: 'Year Close', view: 'YEAR_CLOSING', iconBg: 'bg-slate-100',iconFg: 'text-slate-700' },
      ],
    },
    {
      title: 'Finance',
      items: [
        { icon: CreditCard, label: 'Fee Ledger', view: 'FEE_LEDGER',    iconBg: 'bg-emerald-50', iconFg: 'text-emerald-600' },
        { icon: Banknote,   label: 'Salary',     view: 'SALARY_LEDGER', iconBg: 'bg-teal-50',    iconFg: 'text-teal-600' },
        { icon: Receipt,    label: 'Expenses',   view: 'EXPENSES',      iconBg: 'bg-rose-50',    iconFg: 'text-rose-600' },
      ],
    },
    {
      title: 'Operations',
      items: [
        { icon: Library,     label: 'Assets',     view: 'ASSETS',         iconBg: 'bg-amber-50',  iconFg: 'text-amber-600' },
        { icon: Bus,         label: 'Transport',  view: 'TRANSPORT_MGMT', iconBg: 'bg-orange-50', iconFg: 'text-orange-600' },
        { icon: Bell,        label: 'Notices',    view: 'NOTICES',        iconBg: 'bg-fuchsia-50', iconFg: 'text-fuchsia-600' },
        { icon: CircleAlert, label: 'Complaints', view: 'COMPLAINTS',     iconBg: 'bg-orange-50', iconFg: 'text-orange-600',   badge: stats.openComplaints || null },
        { icon: CheckSquare, label: 'Approvals',  view: 'APPROVALS',      iconBg: 'bg-emerald-50',iconFg: 'text-emerald-600',  badge: stats.pendingApprovals || null },
        { icon: Settings,    label: 'Settings',   view: 'SETTINGS',       iconBg: 'bg-slate-100', iconFg: 'text-slate-700' },
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-5 animate-in slide-in-from-bottom-4 duration-300 fade-in pt-2 pb-4">
      {/* Hero card — greeting + headline KPI */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-5 text-white shadow-lg">
        <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute -bottom-12 -left-12 w-40 h-40 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="relative">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-200/80">{todayLabel}</p>
          <h2 className="text-2xl font-black mt-1 leading-tight">Good morning, {firstName}</h2>
          <p className="text-xs font-bold text-slate-300/80 mt-1">Here's what's happening at school today.</p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/10 backdrop-blur border border-white/10 p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-300/80">Attendance</p>
              <div className="text-3xl font-black mt-0.5">{stats.presentToday}<span className="text-lg text-slate-300/80">%</span></div>
              <p className="text-[10px] font-bold text-slate-300/70 mt-0.5">{stats.totalStudents.toLocaleString('en-IN')} students</p>
            </div>
            <div className="rounded-2xl bg-white/10 backdrop-blur border border-white/10 p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-300/80">Fee Collection</p>
              <div className="text-3xl font-black mt-0.5 text-emerald-300">{feePercent}<span className="text-lg text-slate-300/80">%</span></div>
              <div className="mt-1.5 w-full h-1 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${feePercent}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action chips: alerts + finance summary */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => onNavigate('FEE_LEDGER')}
          className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm text-left active:scale-[0.98] transition-transform">
          <div className="flex items-center justify-between mb-2">
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <IndianRupee size={18} />
            </div>
            <ArrowUpRight size={16} className="text-slate-300" />
          </div>
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pending Fees</div>
          <div className="text-xl font-black text-slate-900 mt-0.5">
            ₹{(feePending / 100000).toFixed(1)}<span className="text-sm text-slate-500">L</span>
          </div>
        </button>

        <button
          onClick={() => onNavigate('APPROVALS')}
          className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm text-left active:scale-[0.98] transition-transform">
          <div className="flex items-center justify-between mb-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckSquare size={18} />
            </div>
            <ArrowUpRight size={16} className="text-slate-300" />
          </div>
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Approvals</div>
          <div className="text-xl font-black text-slate-900 mt-0.5">
            {stats.pendingApprovals}<span className="text-sm text-slate-500"> pending</span>
          </div>
        </button>
      </div>

      {/* Inline alert if there are open complaints */}
      {stats.openComplaints > 0 && (
        <button
          onClick={() => onNavigate('COMPLAINTS')}
          className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 text-left active:scale-[0.98] transition-transform">
          <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
            <CircleAlert size={16} />
          </div>
          <div className="flex-1">
            <div className="text-xs font-black text-orange-800">
              {stats.openComplaints} open complaint{stats.openComplaints > 1 ? 's' : ''}
            </div>
            <div className="text-[10px] font-bold text-orange-600/80 mt-0.5">Tap to review and resolve</div>
          </div>
          <ArrowUpRight size={16} className="text-orange-500" />
        </button>
      )}

      {/* Module sections */}
      {sections.map(({ title, items }) => (
        <div key={title}>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-3 px-1">{title}</p>
          <div className="grid grid-cols-3 gap-3">
            {items.map(({ icon: Icon, label, view, iconBg, iconFg, badge }) => (
              <button
                key={label}
                onClick={() => onNavigate(view)}
                className="relative flex flex-col items-start gap-3 bg-white rounded-2xl border border-slate-100 shadow-sm p-3.5 active:scale-[0.97] transition-transform hover:border-slate-200 hover:shadow-md">
                {badge !== null && badge !== undefined && badge !== 0 && (
                  <div className="absolute top-2 right-2 min-w-[18px] h-[18px] px-1.5 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center shadow-sm">
                    {badge > 99 ? '99+' : badge}
                  </div>
                )}
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${iconBg} ${iconFg}`}>
                  <Icon size={22} />
                </div>
                <span className="text-[11px] font-black text-slate-800 text-left leading-tight">{label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Quick stats */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">At a glance</p>
          <span className="text-[10px] font-bold text-slate-400">Today</span>
        </div>
        <div className="divide-y divide-slate-100">
          {[
            { label: 'Active Staff',   val: `${stats.totalStaff} members`,                                      icon: UserCheck,  color: 'text-blue-500',    bg: 'bg-blue-50' },
            { label: 'Fee Pending',    val: `₹${(feePending / 1000).toFixed(0)}K`,                              icon: IndianRupee,color: 'text-rose-500',    bg: 'bg-rose-50' },
            { label: 'Avg Attendance', val: `${stats.presentToday}%`,                                           icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-50' },
          ].map(({ label, val, icon: Icon, color, bg }) => (
            <div key={label} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-xl ${bg} ${color} flex items-center justify-center`}>
                  <Icon size={16} />
                </div>
                <span className="text-sm font-bold text-slate-700">{label}</span>
              </div>
              <span className="text-sm font-black text-slate-900">{val}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
