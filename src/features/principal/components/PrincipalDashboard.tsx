import React, { useEffect, useState } from 'react';
import {
  Users, UserCheck, Receipt, Library, Bus, CircleAlert,
  Bell, CheckSquare, Settings, TrendingUp, IndianRupee, Calendar,
  CalendarDays, CreditCard, Banknote, Lock, ClipboardCheck, ArrowUpRight,
  UserPlus, ChevronRight,
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
  color: string;
  badge?: number | null;
}

const todayLabel = new Date().toLocaleDateString('en-IN', {
  weekday: 'long', day: 'numeric', month: 'long',
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

  const formatCrore = (n: number) => {
    if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`;
    if (n >= 100_000) return `₹${(n / 100_000).toFixed(1)}L`;
    if (n >= 1000) return `₹${(n / 1000).toFixed(0)}K`;
    return `₹${n}`;
  };

  const modules: Module[] = [
    { icon: UserCheck,      label: 'Staff',        view: 'STAFF',            color: 'bg-blue-500',    badge: stats.totalStaff },
    { icon: ClipboardCheck, label: 'Attendance',   view: 'ATTENDANCE',       color: 'bg-cyan-500' },
    { icon: CalendarDays,   label: 'Timetable',    view: 'TIMETABLE',        color: 'bg-sky-500' },
    { icon: Calendar,       label: 'Classes',      view: 'CLASS_MGMT',       color: 'bg-violet-500' },
    { icon: Banknote,       label: 'Salary',       view: 'SALARY_LEDGER',    color: 'bg-teal-500' },
    { icon: Receipt,        label: 'Expenses',     view: 'EXPENSES',         color: 'bg-rose-500' },
    { icon: Library,        label: 'Assets',       view: 'ASSETS',           color: 'bg-amber-500' },
    { icon: Bus,            label: 'Transport',    view: 'TRANSPORT_MGMT',   color: 'bg-orange-500' },
    { icon: Bell,           label: 'Notices',      view: 'NOTICES',          color: 'bg-fuchsia-500' },
    { icon: CircleAlert,    label: 'Complaints',   view: 'COMPLAINTS',       color: 'bg-red-500',     badge: stats.openComplaints || null },
    { icon: CheckSquare,    label: 'Approvals',    view: 'APPROVALS',        color: 'bg-emerald-500', badge: stats.pendingApprovals || null },
    { icon: Lock,           label: 'Year Close',   view: 'YEAR_CLOSING',     color: 'bg-slate-500' },
    { icon: Settings,       label: 'Settings',     view: 'SETTINGS',         color: 'bg-slate-400' },
  ];

  return (
    <div className="flex flex-col gap-4 animate-in slide-in-from-bottom-4 duration-300 fade-in">

      {/* ── Greeting ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{todayLabel}</p>
          <h2 className="text-2xl font-black text-slate-900 mt-0.5">Namaskar, {firstName} 👋</h2>
        </div>
        <button
          onClick={() => onNavigate('ADMISSION')}
          className="flex items-center gap-1.5 bg-indigo-600 text-white text-xs font-black px-3 py-2 rounded-xl shadow-sm active:scale-95 transition-transform"
        >
          <UserPlus size={14} />
          Admit
        </button>
      </div>

      {/* ── Primary Hero Cards: Students + Fees ──────────────────── */}
      <div className="grid grid-cols-2 gap-3">

        {/* Students Card */}
        <button
          onClick={() => onNavigate('STUDENTS')}
          className="group relative bg-indigo-600 rounded-2xl p-5 text-white shadow-lg active:scale-[0.97] transition-all overflow-hidden text-left"
        >
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/10" />
          <div className="absolute -bottom-4 -left-4 w-16 h-16 rounded-full bg-white/5" />
          <div className="relative">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center mb-4">
              <Users size={18} />
            </div>
            <div className="text-4xl font-black leading-none tabular-nums">{stats.totalStudents}</div>
            <div className="text-[11px] font-black uppercase tracking-widest mt-1.5 text-indigo-200">Students</div>
            <div className="flex items-center gap-1 mt-3 text-[10px] font-bold text-indigo-200">
              <TrendingUp size={11} />
              <span>{stats.presentToday}% avg attendance</span>
            </div>
          </div>
          <div className="absolute bottom-3 right-3 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors">
            <ChevronRight size={13} />
          </div>
        </button>

        {/* Fees Card */}
        <button
          onClick={() => onNavigate('FEE_LEDGER')}
          className="group relative bg-emerald-600 rounded-2xl p-5 text-white shadow-lg active:scale-[0.97] transition-all overflow-hidden text-left"
        >
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/10" />
          <div className="absolute -bottom-4 -left-4 w-16 h-16 rounded-full bg-white/5" />
          <div className="relative">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center mb-4">
              <IndianRupee size={18} />
            </div>
            <div className="text-4xl font-black leading-none tabular-nums">{feePercent}<span className="text-xl font-black text-emerald-200">%</span></div>
            <div className="text-[11px] font-black uppercase tracking-widest mt-1.5 text-emerald-200">Fees Collected</div>
            <div className="mt-3 w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all duration-700" style={{ width: `${feePercent}%` }} />
            </div>
          </div>
          <div className="absolute bottom-3 right-3 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors">
            <ChevronRight size={13} />
          </div>
        </button>
      </div>

      {/* ── Fee Details Row ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
              <IndianRupee size={14} className="text-emerald-600" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Collected</span>
          </div>
          <div className="text-xl font-black text-emerald-700 mt-1">{formatCrore(stats.paidFees)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-rose-50 flex items-center justify-center">
              <IndianRupee size={14} className="text-rose-600" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pending</span>
          </div>
          <div className="text-xl font-black text-rose-600 mt-1">{formatCrore(feePending)}</div>
        </div>
      </div>

      {/* ── Alert Banner ─────────────────────────────────────────── */}
      {(stats.openComplaints > 0 || stats.pendingApprovals > 0) && (
        <div className="flex flex-col gap-2">
          {stats.openComplaints > 0 && (
            <button
              onClick={() => onNavigate('COMPLAINTS')}
              className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 text-left active:scale-[0.98] transition-transform"
            >
              <div className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center shrink-0">
                <CircleAlert size={15} />
              </div>
              <div className="flex-1">
                <div className="text-xs font-black text-orange-800">{stats.openComplaints} open complaint{stats.openComplaints > 1 ? 's' : ''}</div>
                <div className="text-[10px] font-bold text-orange-500 mt-0.5">Tap to review</div>
              </div>
              <ArrowUpRight size={15} className="text-orange-400" />
            </button>
          )}
          {stats.pendingApprovals > 0 && (
            <button
              onClick={() => onNavigate('APPROVALS')}
              className="flex items-center gap-3 bg-violet-50 border border-violet-200 rounded-2xl px-4 py-3 text-left active:scale-[0.98] transition-transform"
            >
              <div className="w-8 h-8 rounded-full bg-violet-500 text-white flex items-center justify-center shrink-0">
                <CheckSquare size={15} />
              </div>
              <div className="flex-1">
                <div className="text-xs font-black text-violet-800">{stats.pendingApprovals} pending approval{stats.pendingApprovals > 1 ? 's' : ''}</div>
                <div className="text-[10px] font-bold text-violet-500 mt-0.5">Tap to review</div>
              </div>
              <ArrowUpRight size={15} className="text-violet-400" />
            </button>
          )}
        </div>
      )}

      {/* ── Quick Stats Row ───────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">At a Glance</p>
        </div>
        <div className="divide-y divide-slate-50">
          {[
            { label: 'Active Staff',     val: `${stats.totalStaff} members`,   icon: UserCheck,  color: 'text-blue-500',    bg: 'bg-blue-50',    view: 'STAFF' as PrincipalView },
            { label: 'Avg Attendance',   val: `${stats.presentToday}%`,         icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-50', view: 'ATTENDANCE' as PrincipalView },
          ].map(({ label, val, icon: Icon, color, bg, view }) => (
            <button
              key={label}
              onClick={() => onNavigate(view)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-xl ${bg} ${color} flex items-center justify-center`}>
                  <Icon size={15} />
                </div>
                <span className="text-sm font-bold text-slate-700">{label}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-black text-slate-900">{val}</span>
                <ChevronRight size={14} className="text-slate-300" />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── All Modules ───────────────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-3 px-1">All Modules</p>
        <div className="grid grid-cols-4 gap-2.5">
          {modules.map(({ icon: Icon, label, view, color, badge }) => (
            <button
              key={label}
              onClick={() => onNavigate(view)}
              className="relative flex flex-col items-center gap-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-3 active:scale-[0.95] transition-transform hover:shadow-md hover:border-slate-200"
            >
              {badge !== null && badge !== undefined && badge !== 0 && (
                <div className="absolute top-1.5 right-1.5 min-w-[16px] h-[16px] px-1 bg-rose-500 text-white text-[8px] font-black rounded-full flex items-center justify-center">
                  {badge > 99 ? '99+' : badge}
                </div>
              )}
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
                <Icon size={19} className="text-white" />
              </div>
              <span className="text-[10px] font-black text-slate-700 text-center leading-tight">{label}</span>
            </button>
          ))}
        </div>
      </div>

    </div>
  );
};
