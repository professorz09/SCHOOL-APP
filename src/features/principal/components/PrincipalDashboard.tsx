import React, { useEffect, useState } from 'react';
import {
  Users, UserCheck, BookOpen, Receipt, Library, Bus, CircleAlert,
  Wallet, Bell, CheckSquare, Settings, TrendingUp, IndianRupee,
} from 'lucide-react';
import { studentService } from '../../../services/student.service';
import { staffService } from '../../../services/staff.service';
import { principalService } from '../../../services/principal.service';
import { PaymentStatus } from '../../../config/constants';

type PrincipalView = 'DASHBOARD' | 'STUDENTS' | 'STAFF' | 'ASSETS' | 'COMPLAINTS' | 'EXPENSES' | 'NOTICES' | 'APPROVALS' | 'SETTINGS';

interface Props {
  onNavigate: (view: PrincipalView) => void;
}

export const PrincipalDashboard: React.FC<Props> = ({ onNavigate }) => {
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
        presentToday: Math.round(students.reduce((a, s) => a + s.attendancePercent, 0) / students.length),
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

  const modules = [
    { icon: Users, label: 'Students', view: 'STUDENTS' as PrincipalView, color: 'bg-indigo-50 text-indigo-600', badge: stats.totalStudents },
    { icon: UserCheck, label: 'Staff', view: 'STAFF' as PrincipalView, color: 'bg-blue-50 text-blue-600', badge: stats.totalStaff },
    { icon: Library, label: 'Assets', view: 'ASSETS' as PrincipalView, color: 'bg-amber-50 text-amber-600', badge: null },
    { icon: Receipt, label: 'Expenses', view: 'EXPENSES' as PrincipalView, color: 'bg-rose-50 text-rose-600', badge: null },
    { icon: Bell, label: 'Notices', view: 'NOTICES' as PrincipalView, color: 'bg-violet-50 text-violet-600', badge: null },
    { icon: CircleAlert, label: 'Complaints', view: 'COMPLAINTS' as PrincipalView, color: 'bg-orange-50 text-orange-600', badge: stats.openComplaints || null },
    { icon: CheckSquare, label: 'Approvals', view: 'APPROVALS' as PrincipalView, color: 'bg-emerald-50 text-emerald-600', badge: stats.pendingApprovals || null },
    { icon: Settings, label: 'Settings', view: 'SETTINGS' as PrincipalView, color: 'bg-slate-100 text-slate-600', badge: null },
  ];

  return (
    <div className="flex flex-col gap-4 animate-in slide-in-from-bottom-4 duration-300 fade-in pt-2">
      {/* Greeting */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">PRINCIPAL DASHBOARD</p>
        <h2 className="text-2xl font-black text-slate-900 mt-0.5">Good Morning, Dr. Kumar</h2>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-900 rounded-2xl p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Today's Attendance</p>
          <div className="text-3xl font-black text-white">{stats.presentToday}%</div>
          <div className="mt-2 text-[10px] font-black text-emerald-400">{stats.totalStudents} total students</div>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Fee Collection</p>
          <div className="text-2xl font-black text-emerald-600">{feePercent}%</div>
          <div className="mt-1 w-full bg-slate-100 rounded-full h-1.5">
            <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${feePercent}%` }} />
          </div>
          <div className="mt-1.5 text-[10px] font-bold text-slate-400">
            ₹{(stats.paidFees / 100000).toFixed(1)}L / ₹{(stats.totalFees / 100000).toFixed(1)}L
          </div>
        </div>
      </div>

      {/* Alert badges */}
      {(stats.openComplaints > 0 || stats.pendingApprovals > 0) && (
        <div className="flex gap-2">
          {stats.openComplaints > 0 && (
            <button onClick={() => onNavigate('COMPLAINTS')}
              className="flex-1 flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-2xl px-3 py-2.5 text-left active:scale-95 transition-transform">
              <CircleAlert size={14} className="text-orange-500 shrink-0" />
              <span className="text-[11px] font-black text-orange-700">{stats.openComplaints} open complaint{stats.openComplaints > 1 ? 's' : ''}</span>
            </button>
          )}
          {stats.pendingApprovals > 0 && (
            <button onClick={() => onNavigate('APPROVALS')}
              className="flex-1 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-2xl px-3 py-2.5 text-left active:scale-95 transition-transform">
              <CheckSquare size={14} className="text-emerald-500 shrink-0" />
              <span className="text-[11px] font-black text-emerald-700">{stats.pendingApprovals} pending approval{stats.pendingApprovals > 1 ? 's' : ''}</span>
            </button>
          )}
        </div>
      )}

      {/* Module grid */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Modules</p>
        <div className="grid grid-cols-4 gap-2">
          {modules.map(({ icon: Icon, label, view, color, badge }) => (
            <button key={label} onClick={() => onNavigate(view)}
              className="relative flex flex-col items-center gap-2 bg-white rounded-2xl border border-slate-100 shadow-sm py-4 px-1 active:scale-95 transition-transform">
              {badge !== null && badge !== undefined && (
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[8px] font-black rounded-full flex items-center justify-center">
                  {badge}
                </div>
              )}
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
                <Icon size={20} />
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-600 text-center leading-tight">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Quick stats */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Quick Stats — Oct 2024</p>
        <div className="space-y-3">
          {[
            { label: 'Active Staff', val: `${stats.totalStaff} members`, icon: UserCheck, color: 'text-blue-500' },
            { label: 'Fee Pending', val: `₹${((stats.totalFees - stats.paidFees) / 1000).toFixed(0)}K`, icon: IndianRupee, color: 'text-rose-500' },
            { label: 'Avg Attendance', val: `${stats.presentToday}%`, icon: TrendingUp, color: 'text-emerald-500' },
          ].map(({ label, val, icon: Icon, color }) => (
            <div key={label} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon size={14} className={color} />
                <span className="text-xs font-bold text-slate-600">{label}</span>
              </div>
              <span className="text-xs font-black text-slate-900">{val}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
