import React, { useEffect, useState } from 'react';
import {
  Users, UserCheck, BookOpen, IndianRupee, Bus, CircleAlert,
  Wallet, MoreHorizontal, CircleCheckBig, MapPin, ChevronRight,
  Bell, ClipboardCheck, Clock, BanknoteIcon, Settings, ChevronUp,
  UserCog,
} from 'lucide-react';
import { studentService } from '../../../services/student.service';
import { staffService } from '../../../services/staff.service';
import { principalService } from '../../../services/principal.service';
import { transportService } from '../../../services/transport.service';
import { PrincipalView } from '../pages/PrincipalLayout';
import { useAuthStore } from '../../../store/authStore';

interface Props {
  onNavigate: (view: PrincipalView) => void;
}

const LIVE_CLASSES = [
  { classId: '10-A', subject: 'Mathematics', teacher: 'Mr. Sharma', present: 42, total: 45, color: 'bg-purple-100 text-purple-700' },
  { classId: '9-B',  subject: 'Physics',     teacher: 'Mrs. Gupta',  present: 38, total: 40, color: 'bg-emerald-100 text-emerald-700' },
  { classId: '8-A',  subject: 'English',     teacher: 'Ms. Priya',   present: 35, total: 38, color: 'bg-sky-100 text-sky-700' },
];

export const PrincipalDashboard: React.FC<Props> = ({ onNavigate }) => {
  const session = useAuthStore(s => s.session);
  const [showMore, setShowMore] = useState(false);
  const [stats, setStats] = useState({
    totalStudents: 0, avgAttendance: 0, paidFees: 0, totalFees: 0,
    totalStaff: 0, openComplaints: 0, pendingApprovals: 0,
  });
  const [vehicles, setVehicles] = useState<{ id: string; vehicleNo: string; routeName: string; driverName: string; isActive: boolean; currentStop: string }[]>([]);

  useEffect(() => {
    const load = async () => {
      const [students, staff, complaints, approvals, allVehicles] = await Promise.all([
        studentService.getAll(),
        staffService.getAll(),
        principalService.getComplaints(),
        principalService.getApprovals(),
        transportService.getVehicles(),
      ]);
      setStats({
        totalStudents: students.length,
        avgAttendance: students.length > 0
          ? parseFloat((students.reduce((a, s) => a + s.attendancePercent, 0) / students.length).toFixed(1))
          : 0,
        paidFees: students.reduce((a, s) => a + s.paidFee, 0),
        totalFees: students.reduce((a, s) => a + s.totalFee, 0),
        totalStaff: staff.length,
        openComplaints: complaints.filter(c => c.status !== 'RESOLVED').length,
        pendingApprovals: approvals.filter(a => a.status === 'PENDING').length,
      });
      setVehicles(allVehicles.filter(v => v.isActive).map(v => ({
        id: v.id,
        vehicleNo: v.vehicleNo,
        routeName: v.routeName,
        driverName: v.driverName,
        isActive: v.isActive,
        currentStop: v.stops[Math.floor(v.stops.length / 2)]?.name ?? 'En Route',
      })));
    };
    load();
  }, []);

  const feePercent = stats.totalFees > 0 ? Math.round((stats.paidFees / stats.totalFees) * 100) : 0;

  const MAIN_ACTIONS: { icon: React.ReactNode; label: string; view: PrincipalView; color: string }[] = [
    { icon: <Users size={22} />,       label: 'Students',   view: 'STUDENTS',       color: 'text-violet-600 bg-violet-50' },
    { icon: <UserCheck size={22} />,   label: 'Staff',      view: 'STAFF',          color: 'text-blue-600 bg-blue-50' },
    { icon: <BookOpen size={22} />,    label: 'Classes',    view: 'CLASS_MGMT',     color: 'text-purple-600 bg-purple-50' },
    { icon: <IndianRupee size={22} />, label: 'Fees Col.',  view: 'FEE_LEDGER',     color: 'text-emerald-600 bg-emerald-50' },
    { icon: <Bus size={22} />,         label: 'Transport',  view: 'TRANSPORT_MGMT', color: 'text-orange-500 bg-orange-50' },
    { icon: <CircleAlert size={22} />, label: 'Complaints', view: 'COMPLAINTS',     color: 'text-rose-600 bg-rose-50' },
    { icon: <Wallet size={22} />,      label: 'Expenses',   view: 'EXPENSES',       color: 'text-red-500 bg-red-50' },
  ];

  const MORE_ACTIONS: { icon: React.ReactNode; label: string; view: PrincipalView; color: string }[] = [
    { icon: <Bell size={22} />,           label: 'Notices',    view: 'NOTICES',          color: 'text-sky-600 bg-sky-50' },
    { icon: <ClipboardCheck size={22} />, label: 'Approvals',  view: 'APPROVALS',        color: 'text-indigo-600 bg-indigo-50' },
    { icon: <Clock size={22} />,          label: 'Timetable',  view: 'TIMETABLE',        color: 'text-fuchsia-600 bg-fuchsia-50' },
    { icon: <BanknoteIcon size={22} />,   label: 'Salary',     view: 'SALARY_LEDGER',    color: 'text-lime-600 bg-lime-50' },
    { icon: <UserCog size={22} />,        label: 'Attendance', view: 'ATTENDANCE',       color: 'text-teal-600 bg-teal-50' },
    { icon: <Settings size={22} />,       label: 'Settings',   view: 'SETTINGS',         color: 'text-slate-600 bg-slate-100' },
  ];

  return (
    <div className="flex flex-col gap-5 pb-4">

      {/* ── Header: Attendance ──────────────────────────────────────────── */}
      <div className="pt-1">
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Today's Attendance</p>
        <h1 className="text-5xl font-black text-blue-600 mt-1 leading-none tabular-nums">
          {stats.avgAttendance}<span className="text-3xl">%</span>
        </h1>
      </div>

      {/* ── Quick Actions Grid ──────────────────────────────────────────── */}
      <div className="space-y-3">
        {/* Main row — always visible */}
        <div className="grid grid-cols-4 gap-3">
          {MAIN_ACTIONS.map(({ icon, label, view, color }) => (
            <button key={label} onClick={() => onNavigate(view)}
              className="flex flex-col items-center gap-2 active:scale-95 transition-transform">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${color} shadow-sm`}>{icon}</div>
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wide text-center leading-tight">{label}</span>
            </button>
          ))}
          {/* More chip */}
          <button onClick={() => setShowMore(p => !p)}
            className="flex flex-col items-center gap-2 active:scale-95 transition-transform">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm transition-colors ${showMore ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}>
              {showMore ? <ChevronUp size={22} /> : <MoreHorizontal size={22} />}
            </div>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wide text-center leading-tight">
              {showMore ? 'Less' : 'More'}
            </span>
          </button>
        </div>

        {/* Expanded More row */}
        {showMore && (
          <div className="grid grid-cols-4 gap-3 animate-in slide-in-from-top-2 duration-200">
            {MORE_ACTIONS.map(({ icon, label, view, color }) => (
              <button key={label} onClick={() => { onNavigate(view); setShowMore(false); }}
                className="flex flex-col items-center gap-2 active:scale-95 transition-transform">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${color} shadow-sm`}>{icon}</div>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wide text-center leading-tight">{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Stat Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        {/* Total Students */}
        <button
          onClick={() => onNavigate('STUDENTS')}
          className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-left active:scale-[0.97] transition-transform"
        >
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Students</p>
          <p className="text-4xl font-black text-slate-900 mt-2 tabular-nums leading-none">{stats.totalStudents.toLocaleString('en-IN')}</p>
          <div className="flex items-center gap-1.5 mt-2">
            <CircleCheckBig size={13} className="text-emerald-500" />
            <span className="text-[10px] font-black text-emerald-600">Active this year</span>
          </div>
        </button>

        {/* Fee Collected */}
        <button
          onClick={() => onNavigate('FEE_LEDGER')}
          className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-left active:scale-[0.97] transition-transform"
        >
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fee Collected</p>
          <p className="text-4xl font-black text-slate-900 mt-2 tabular-nums leading-none">{feePercent}<span className="text-2xl text-slate-400">%</span></p>
          <div className="mt-2">
            <span className={`inline-block text-[10px] font-black px-2 py-0.5 rounded-full ${feePercent >= 80 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {feePercent >= 80 ? '✓ ON TARGET' : 'BELOW TARGET'}
            </span>
          </div>
        </button>
      </div>

      {/* ── Alert Strip ────────────────────────────────────────────────── */}
      {(stats.openComplaints > 0 || stats.pendingApprovals > 0) && (
        <div className="flex gap-2">
          {stats.openComplaints > 0 && (
            <button
              onClick={() => onNavigate('COMPLAINTS')}
              className="flex-1 flex items-center gap-2 bg-orange-50 border border-orange-100 rounded-2xl px-3 py-2.5 active:scale-[0.97] transition-transform"
            >
              <CircleAlert size={15} className="text-orange-500 shrink-0" />
              <span className="text-xs font-black text-orange-700 truncate">{stats.openComplaints} Complaints</span>
              <ChevronRight size={13} className="text-orange-400 ml-auto shrink-0" />
            </button>
          )}
          {stats.pendingApprovals > 0 && (
            <button
              onClick={() => onNavigate('APPROVALS')}
              className="flex-1 flex items-center gap-2 bg-violet-50 border border-violet-100 rounded-2xl px-3 py-2.5 active:scale-[0.97] transition-transform"
            >
              <CircleCheckBig size={15} className="text-violet-500 shrink-0" />
              <span className="text-xs font-black text-violet-700 truncate">{stats.pendingApprovals} Approvals</span>
              <ChevronRight size={13} className="text-violet-400 ml-auto shrink-0" />
            </button>
          )}
        </div>
      )}

      {/* ── Live Classes ────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-black text-slate-900 uppercase tracking-tight">Live Classes</h2>
          <button
            onClick={() => onNavigate('TIMETABLE')}
            className="text-xs font-black text-blue-600 uppercase tracking-wide"
          >
            Monitor All
          </button>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-50">
          {LIVE_CLASSES.map((cls) => (
            <div key={cls.classId} className="flex items-center gap-3 px-4 py-3.5">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 font-black text-sm ${cls.color}`}>
                {cls.classId}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-slate-900">{cls.subject}</p>
                <p className="text-[11px] font-bold text-slate-400 mt-0.5">{cls.teacher} · {cls.present}/{cls.total} Present</p>
              </div>
              <div className="w-2.5 h-2.5 rounded-full bg-red-400 shrink-0 animate-pulse" />
            </div>
          ))}
        </div>
      </div>

      {/* ── Transport Fleet ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-black text-slate-900 uppercase tracking-tight">Transport Fleet</h2>
          <button
            onClick={() => onNavigate('TRANSPORT_MGMT')}
            className="text-xs font-black text-blue-600 uppercase tracking-wide"
          >
            View Map
          </button>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-50">
          {vehicles.map((v) => (
            <div key={v.id} className="flex items-center gap-3 px-4 py-3.5">
              <div className="w-11 h-11 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <Bus size={20} className="text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-slate-900">{v.routeName.toUpperCase()} · {v.vehicleNo}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <MapPin size={10} className="text-blue-500 shrink-0" />
                  <p className="text-[11px] font-bold text-blue-600 truncate">{v.currentStop}</p>
                </div>
                <p className="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-wide">Driver: {v.driverName} · Ongoing</p>
              </div>
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
            </div>
          ))}
          {vehicles.length === 0 && (
            <div className="px-4 py-6 text-center text-sm font-bold text-slate-400">No active vehicles</div>
          )}
        </div>
      </div>

    </div>
  );
};
