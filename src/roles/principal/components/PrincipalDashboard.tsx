import React, { useEffect, useState } from 'react';
import {
  Users, UserCheck, BookOpen, IndianRupee, Bus, CircleAlert,
  Wallet, MapPin, ChevronRight, Bell, ClipboardCheck, Clock,
  BanknoteIcon, Settings, UserCog, CalendarCheck, Sparkles,
  Calendar, GraduationCap, ArrowRight, TrendingUp, AlertCircle, BarChart3,
  Library,
} from 'lucide-react';
import { studentService } from '@/modules/students/student.service';
import { staffService } from '@/modules/staff/staff.service';
import { principalService } from '@/roles/principal/principal.service';
import { transportService } from '@/modules/transport/transport.service';
import { apiPrincipal } from '@/lib/apiClient';
import { supabase } from '@/lib/supabase';
import { PrincipalView } from '@/roles/principal/pages/PrincipalLayout';
import { useAuthStore } from '@/store/authStore';
import { useAcademicYear } from '@/shared/context/AcademicYearContext';
import { SalaryReminderCard } from '@/roles/principal/components/SalaryReminderCard';

interface Props {
  onNavigate: (view: PrincipalView) => void;
}

type Action = { icon: React.ReactNode; label: string; view: PrincipalView; tint: string };
type Hub = {
  key: 'STUDENTS' | 'STAFF' | 'ACADEMICS' | 'OPERATIONS';
  label: string;
  icon: React.ReactNode;
  gradient: string;
  ring: string;
  items: Action[];
};

export const PrincipalDashboard: React.FC<Props> = ({ onNavigate }) => {
  const session = useAuthStore(s => s.session);
  const { activeYear, academicYears } = useAcademicYear();
  const ayKey = `${activeYear?.id ?? 'none'}|${academicYears.length}`;

  const [openHub, setOpenHub] = useState<Hub['key'] | null>(null);
  const [stats, setStats] = useState({
    totalStudents: 0, avgAttendance: 0, paidFees: 0, totalFees: 0,
    monthlyCollection: 0,
    totalStaff: 0, openComplaints: 0, pendingApprovals: 0,
    studentsWithDues: 0, pendingLeaves: 0, lowAttendanceStudents: 0, unsubmittedAttendanceDays: 0,
  });
  const [vehicles, setVehicles] = useState<{
    id: string; vehicleNo: string; routeName: string; driverName: string;
    isLive: boolean; lastPing: string | null; currentStop: string;
  }[]>([]);
  // Inventory snapshot for the Assets widget (library + lab). Kept on the
  // dashboard so principals see "30 books out, 3 faulty pieces" without
  // navigating into the Assets page.
  const [assetsSummary, setAssetsSummary] = useState({
    totalBooks: 0, issuedBooks: 0, availableBooks: 0,
    totalEquipment: 0, faultyEquipment: 0,
  });
  // liveClasses state was removed when the "Live Classes" panel was
  // dropped. The setter call below is preserved as a no-op (variable
  // intentionally unused) so the parallel Promise.all keeps its shape
  // and we don't accidentally drop the attendance-records query that
  // also informs the alert counter elsewhere.

  useEffect(() => {
    const load = async () => {
      const today = new Date().toISOString().slice(0, 10);
      // First / last day of the current calendar month — used by the
      // monthly-collection query for the green hero card.
      const now = new Date();
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const monthEnd   = today;
      await transportService.refreshAll();
      const [students, staff, complaints, approvals, allVehicles, attRes, dashStats, monthPayRes, books, equipment] = await Promise.all([
        studentService.getAll(),
        staffService.getAll(),
        principalService.getComplaints(),
        principalService.getApprovals(),
        transportService.getVehicles(),
        supabase
          .from('attendance_records')
          .select('id, class_name, section, total_present, total_students, marked_by, users:marked_by(name)')
          .eq('school_id', session?.schoolId ?? '00000000-0000-0000-0000-000000000000')
          .eq('date', today)
          .order('created_at', { ascending: false })
          .limit(5),
        activeYear ? apiPrincipal.getDashboardStats(activeYear.id) : Promise.resolve(null),
        // Sum positive payments in the current month. Reversal rows have
        // negative amounts so they self-deduct without extra logic.
        supabase
          .from('payment_records')
          .select('amount')
          .eq('school_id', session?.schoolId ?? '00000000-0000-0000-0000-000000000000')
          .gte('date', monthStart).lte('date', monthEnd),
        principalService.getBooks(),
        principalService.getEquipment(),
      ]);
      const monthlyCollection = ((monthPayRes.data ?? []) as Array<{ amount: number }>)
        .reduce((sum, r) => sum + Number(r.amount || 0), 0);
      // attRes still pulled to keep alert / stats parity, but the
      // "Live Classes" UI is gone so we no longer build the row list.
      void attRes;
      setStats({
        totalStudents: students.length,
        // Guard each numeric field against undefined / NaN — students newly
        // admitted with no attendance/fee data otherwise propagated NaN to
        // the displayed "NaN%" / "₹NaN" labels.
        avgAttendance: students.length > 0
          ? parseFloat((students.reduce((a, s) => a + (Number(s.attendancePercent) || 0), 0) / students.length).toFixed(1))
          : 0,
        paidFees: students.reduce((a, s) => a + (Number(s.paidFee) || 0), 0),
        totalFees: students.reduce((a, s) => a + (Number(s.totalFee) || 0), 0),
        monthlyCollection,
        totalStaff: staff.length,
        openComplaints: complaints.filter(c => c.status !== 'RESOLVED').length,
        pendingApprovals: approvals.filter(a => a.status === 'PENDING').length,
        studentsWithDues: dashStats?.studentsWithDues ?? 0,
        pendingLeaves: dashStats?.pendingLeaves ?? 0,
        lowAttendanceStudents: dashStats?.lowAttendanceStudents ?? 0,
        unsubmittedAttendanceDays: dashStats?.unsubmittedAttendanceDays ?? 0,
      });
      // Vehicles shown on dashboard = currently LIVE only (driver has the
      // tracking app open and pinged GPS in the last 5 min). The earlier
      // logic showed every is_active vehicle which clutters the screen
      // off-hours when none are actually moving. Cap to 2 cards so the
      // section stays compact even on a 30-bus fleet.
      const LIVE_WINDOW_MS = 5 * 60 * 1000;
      const liveNow = Date.now();
      const liveVehicles = allVehicles
        .filter(v => v.isActive)
        .map(v => {
          const rawTs = v.currentLocation?.timestamp;
          // Number.isFinite guards against malformed timestamps (e.g. driver
          // app pushed "yesterday") which produce NaN — old code treated NaN
          // as "not live" silently; explicit guard documents intent.
          const pingTs = rawTs ? new Date(rawTs).getTime() : null;
          const validPing = pingTs !== null && Number.isFinite(pingTs);
          const isLive = validPing && (liveNow - (pingTs as number)) <= LIVE_WINDOW_MS;
          return { v, isLive, pingTs: validPing ? pingTs : null };
        })
        .filter(x => x.isLive)
        .sort((a, b) => (b.pingTs ?? 0) - (a.pingTs ?? 0))
        .slice(0, 2)
        .map(({ v, isLive, pingTs }) => {
          const stops = v.stops ?? [];
          return {
            id: v.id,
            vehicleNo: v.vehicleNo,
            routeName: v.routeName,
            driverName: v.driverName,
            isLive,
            lastPing: pingTs ? new Date(pingTs).toISOString() : null,
            // Crash-safe: stops can be null/undefined for older records.
            currentStop: stops[Math.floor(stops.length / 2)]?.name ?? 'En Route',
          };
        });
      setVehicles(liveVehicles);

      // Aggregate library + lab inventory for the home Assets widget.
      const totalBooks = books.reduce((a, b) => a + b.totalCopies, 0);
      const availableBooks = books.reduce((a, b) => a + b.availableCopies, 0);
      const totalEquipment = equipment.reduce((a, e) => a + e.quantity, 0);
      const faultyEquipment = equipment.reduce((a, e) => a + (e.quantity - e.workingCount), 0);
      setAssetsSummary({
        totalBooks,
        issuedBooks: totalBooks - availableBooks,
        availableBooks,
        totalEquipment,
        faultyEquipment,
      });
    };
    load();
  }, [ayKey, session?.schoolId]);

  const feePercent = stats.totalFees > 0 ? Math.round((stats.paidFees / stats.totalFees) * 100) : 0;
  const totalAlerts = stats.openComplaints + stats.pendingApprovals + stats.pendingLeaves;

  // ── Hub config — every action lives in one of four hubs ────────────────────
  const HUBS: Hub[] = [
    {
      key: 'STUDENTS',
      label: 'Students',
      icon: <Users size={26}/>,
      gradient: 'from-violet-500 to-fuchsia-500',
      ring: 'ring-violet-300',
      items: [
        { icon: <Users size={20}/>,       label: 'Classes',   view: 'STUDENTS',    tint: 'bg-violet-50 text-violet-600' },
        { icon: <UserCog size={20}/>,     label: 'Admission', view: 'ADMISSION',   tint: 'bg-indigo-50 text-indigo-600' },
        { icon: <IndianRupee size={20}/>, label: 'Fees',      view: 'FEE_LEDGER',  tint: 'bg-emerald-50 text-emerald-600' },
        { icon: <BookOpen size={20}/>,    label: 'Management',view: 'CLASS_MGMT',  tint: 'bg-purple-50 text-purple-600' },
      ],
    },
    {
      key: 'STAFF',
      label: 'Staff',
      icon: <UserCheck size={26}/>,
      gradient: 'from-sky-500 to-blue-500',
      ring: 'ring-sky-300',
      items: [
        { icon: <Users size={20}/>,         label: 'Staff List',  view: 'STAFF',            tint: 'bg-blue-50 text-blue-600' },
        { icon: <CalendarCheck size={20}/>, label: 'Attendance',  view: 'STAFF_ATTENDANCE', tint: 'bg-teal-50 text-teal-600' },
        { icon: <BanknoteIcon size={20}/>,  label: 'Salary',      view: 'SALARY_LEDGER',    tint: 'bg-lime-50 text-lime-600' },
        { icon: <Wallet size={20}/>,        label: 'Expenses',    view: 'EXPENSES',         tint: 'bg-red-50 text-red-500' },
      ],
    },
    {
      key: 'ACADEMICS',
      label: 'Academics',
      icon: <GraduationCap size={26}/>,
      gradient: 'from-rose-500 to-pink-500',
      ring: 'ring-rose-300',
      items: [
        { icon: <GraduationCap size={20}/>, label: 'Exams',     view: 'EXAMS',        tint: 'bg-rose-50 text-rose-600' },
        { icon: <Clock size={20}/>,         label: 'Timetable', view: 'TIMETABLE',    tint: 'bg-fuchsia-50 text-fuchsia-600' },
        { icon: <CalendarCheck size={20}/>, label: 'Attendance',view: 'ATTENDANCE',   tint: 'bg-teal-50 text-teal-600' },
        { icon: <Library size={20}/>,       label: 'Assets',    view: 'ASSETS',       tint: 'bg-amber-50 text-amber-600' },
        { icon: <ArrowRight size={20}/>,    label: 'Promotion', view: 'PROMOTION',    tint: 'bg-emerald-50 text-emerald-600' },
      ],
    },
    {
      key: 'OPERATIONS',
      label: 'Operations',
      icon: <Bus size={26}/>,
      gradient: 'from-amber-500 to-orange-500',
      ring: 'ring-amber-300',
      items: [
        { icon: <Bus size={20}/>,            label: 'Transport',  view: 'TRANSPORT_MGMT', tint: 'bg-orange-50 text-orange-500' },
        { icon: <Bell size={20}/>,           label: 'Notices',    view: 'NOTICES',        tint: 'bg-sky-50 text-sky-600' },
        { icon: <ClipboardCheck size={20}/>, label: 'Approvals',  view: 'APPROVALS',      tint: 'bg-indigo-50 text-indigo-600' },
        { icon: <CircleAlert size={20}/>,    label: 'Complaints', view: 'COMPLAINTS',     tint: 'bg-rose-50 text-rose-600' },
        // Admin / system items previously lived in the bottom utility strip.
        // Folded into Operations on the user's request — Operations is now the
        // single home for everything that isn't People / Money / Academics.
        { icon: <BarChart3 size={20}/>,      label: 'Analytics',  view: 'ANALYTICS',      tint: 'bg-blue-50 text-blue-600' },
        { icon: <Sparkles size={20}/>,       label: 'Tools',      view: 'TOOLS',          tint: 'bg-purple-50 text-purple-600' },
        { icon: <Calendar size={20}/>,       label: 'Year',       view: 'YEAR_CLOSING',   tint: 'bg-amber-50 text-amber-600' },
        { icon: <Settings size={20}/>,       label: 'Settings',   view: 'SETTINGS',       tint: 'bg-slate-100 text-slate-600' },
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-4 lg:gap-6 pb-4 lg:pb-8 px-4 lg:px-8 xl:px-12 pt-3 lg:pt-6">


      {/* ── Hero · Total Collection card (green) ────────────────────────────
          Mirrors the reference: big monthly collection number, "Dues Collected"
          progress bar (year-to-date paid vs billed), and a faint ₹ watermark
          for visual texture. */}
      <button onClick={() => onNavigate('FEE_LEDGER')}
        className="relative bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-700 rounded-3xl p-5 lg:p-7 shadow-xl shadow-emerald-200/40 text-white overflow-hidden text-left active:scale-[0.99] transition-transform">
        {/* Decorative ₹ watermark + soft wave */}
        <span aria-hidden className="pointer-events-none absolute -top-6 -right-2 text-[160px] lg:text-[220px] font-black text-white/10 leading-none select-none tracking-tighter">₹</span>
        <span aria-hidden className="pointer-events-none absolute bottom-0 right-0 w-3/4 h-1/3 opacity-15"
          style={{ backgroundImage: 'radial-gradient(circle at 30% 60%, rgba(255,255,255,.4) 0 1px, transparent 2px)', backgroundSize: '14px 14px' }} />

        <div className="relative">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[10px] lg:text-xs font-black uppercase tracking-widest text-white/85">
              Total Collection · This Month
            </p>
            {activeYear && (
              <span className="flex items-center gap-1 bg-white/20 backdrop-blur-sm border border-white/30 px-2 py-0.5 rounded-full text-[10px] font-black text-white tabular-nums shrink-0">
                <Calendar size={10}/> {activeYear.name}
              </span>
            )}
          </div>
          <div className="text-4xl lg:text-6xl font-black tabular-nums mt-1 mb-4 lg:mb-5">
            ₹{stats.monthlyCollection.toLocaleString('en-IN')}
          </div>

          {/* Progress bar — Dues Collected (year-to-date paid / billed) */}
          <div className="bg-emerald-800/40 rounded-2xl p-3 lg:p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] lg:text-sm font-black text-white">Dues Collected</span>
              <span className="text-[11px] lg:text-sm font-black text-white tabular-nums">{feePercent}%</span>
            </div>
            <div className="h-2 lg:h-2.5 bg-emerald-900/40 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all" style={{ width: `${feePercent}%` }} />
            </div>
          </div>
        </div>
      </button>


      {/* ── 4 Hub Cards — 2x2 mobile, 4-col desktop ─────────────────────────
          On mobile the actions panel slots in BETWEEN the two rows so it
          opens directly under the tapped hub instead of all the way at the
          bottom. On desktop (single 4-col row) it always renders below. */}
      {(() => {
        const renderHubButton = (hub: Hub) => {
          const isOpen = openHub === hub.key;
          return (
            <button key={hub.key} onClick={() => setOpenHub(prev => prev === hub.key ? null : hub.key)}
              className={`relative flex flex-col items-start gap-2 lg:gap-3 p-4 lg:p-5 rounded-2xl shadow-sm active:scale-[0.97] hover:scale-[1.02] transition-all overflow-hidden ${isOpen ? `bg-gradient-to-br ${hub.gradient} text-white shadow-lg ring-2 ${hub.ring}` : 'bg-white border border-slate-100 hover:shadow-md hover:border-slate-200'}`}>
              <div className={`w-12 h-12 lg:w-14 lg:h-14 rounded-2xl flex items-center justify-center ${isOpen ? 'bg-white/20 text-white' : `bg-gradient-to-br ${hub.gradient} text-white shadow-md`}`}>
                {hub.icon}
              </div>
              <div className="flex items-center justify-between w-full">
                <span className={`text-sm lg:text-base font-black uppercase tracking-tight ${isOpen ? 'text-white' : 'text-slate-800'}`}>
                  {hub.label}
                </span>
                <span className={`text-[9px] lg:text-[10px] font-black px-1.5 lg:px-2 py-0.5 rounded-full ${isOpen ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {hub.items.length}
                </span>
              </div>
            </button>
          );
        };

        const actionsPanel = openHub ? (() => {
          const hub = HUBS.find(h => h.key === openHub)!;
          return (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 lg:p-5 animate-in slide-in-from-top-2 duration-200">
              <div className="text-[10px] lg:text-xs font-black uppercase tracking-widest text-slate-400 mb-2 lg:mb-3 px-1">
                {hub.label} Actions
              </div>
              <div className="grid grid-cols-4 lg:grid-cols-8 gap-2 lg:gap-3">
                {hub.items.map(({ icon, label, view, tint }) => (
                  <button key={label} onClick={() => { onNavigate(view); setOpenHub(null); }}
                    className="flex flex-col items-center gap-1.5 lg:gap-2 p-2 lg:p-3 rounded-xl active:scale-95 hover:bg-slate-50 transition-all">
                    <div className={`w-11 h-11 lg:w-14 lg:h-14 rounded-2xl flex items-center justify-center ${tint}`}>{icon}</div>
                    <span className="text-[9px] lg:text-[11px] font-black text-slate-600 uppercase tracking-wide text-center leading-tight">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })() : null;

        // Which mobile row contains the open hub? 0 = row1 (Students/Staff), 1 = row2 (Academics/Operations)
        const openIndex = openHub ? HUBS.findIndex(h => h.key === openHub) : -1;
        const openRow = openIndex >= 0 ? Math.floor(openIndex / 2) : -1;

        return (
          <>
            {/* Mobile: 2-row grid with actions slotted in between */}
            <div className="space-y-3 lg:hidden">
              <div className="grid grid-cols-2 gap-3">
                {HUBS.slice(0, 2).map(renderHubButton)}
              </div>
              {openRow === 0 && actionsPanel}
              <div className="grid grid-cols-2 gap-3">
                {HUBS.slice(2, 4).map(renderHubButton)}
              </div>
              {openRow === 1 && actionsPanel}
            </div>

            {/* Desktop: single 4-col row with actions below (always full-width) */}
            <div className="hidden lg:block space-y-4">
              <div className="grid grid-cols-4 gap-4">
                {HUBS.map(renderHubButton)}
              </div>
              {actionsPanel}
            </div>
          </>
        );
      })()}

      {/* ── Salary Reminder Widget ─────────────────────────────────────── */}
      <SalaryReminderCard onNavigate={onNavigate} />

      {/* ── Assets snapshot — library + lab inventory at a glance.
            Surfacing this on home so the principal sees inventory pressure
            (issued books, faulty kit) without diving into the Academics
            hub. Whole card taps through to ASSETS. */}
      <button onClick={() => onNavigate('ASSETS')}
        className="w-full text-left bg-white rounded-2xl border border-slate-100 shadow-sm p-4 lg:p-5 hover:shadow-md hover:border-amber-200 active:scale-[0.99] transition-all">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 lg:w-11 lg:h-11 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white shadow-md">
              <Library size={18} />
            </div>
            <div>
              <h2 className="text-sm lg:text-base font-black text-slate-900 uppercase tracking-tight">Assets</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Library & Lab Inventory</p>
            </div>
          </div>
          <ChevronRight size={16} className="text-slate-300"/>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-slate-50 rounded-xl p-2.5 text-center">
            <div className="text-base lg:text-lg font-black text-slate-900 tabular-nums">{assetsSummary.totalBooks}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">Books</div>
          </div>
          <div className="bg-amber-50 rounded-xl p-2.5 text-center">
            <div className="text-base lg:text-lg font-black text-amber-700 tabular-nums">{assetsSummary.issuedBooks}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-amber-600 mt-0.5">Issued</div>
          </div>
          <div className="bg-emerald-50 rounded-xl p-2.5 text-center">
            <div className="text-base lg:text-lg font-black text-emerald-700 tabular-nums">{assetsSummary.totalEquipment}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-emerald-600 mt-0.5">Lab Kit</div>
          </div>
          <div className={`rounded-xl p-2.5 text-center ${assetsSummary.faultyEquipment > 0 ? 'bg-rose-50' : 'bg-slate-50'}`}>
            <div className={`text-base lg:text-lg font-black tabular-nums ${assetsSummary.faultyEquipment > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{assetsSummary.faultyEquipment}</div>
            <div className={`text-[9px] font-black uppercase tracking-widest mt-0.5 ${assetsSummary.faultyEquipment > 0 ? 'text-rose-500' : 'text-slate-400'}`}>Faulty</div>
          </div>
        </div>
      </button>

      {/* ── Live Buses — only when a driver is actually pinging GPS now.
            "Live Classes" was removed entirely; it duplicated info already
            visible inside the attendance flow and was always empty for
            schools that hadn't enabled real-time check-ins. The buses
            section only renders when at least one vehicle is live, so it
            doesn't take screen space on a parked-fleet morning. */}
      {vehicles.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2.5 lg:mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm lg:text-base font-black text-slate-900 uppercase tracking-tight">Live Buses</h2>
              <span className="flex items-center gap-1 text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/> {vehicles.length} on road
              </span>
            </div>
            <button onClick={() => onNavigate('TRANSPORT_MGMT')} className="flex items-center gap-0.5 text-[10px] lg:text-xs font-black text-blue-600 uppercase tracking-wide hover:text-blue-700">
              All vehicles <ChevronRight size={12}/>
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {vehicles.map((v) => (
              <button
                key={v.id}
                onClick={() => onNavigate('TRANSPORT_MGMT')}
                className="flex items-center gap-3 px-4 py-3 lg:py-3.5 bg-white rounded-2xl border border-slate-100 shadow-sm hover:border-emerald-200 hover:shadow-md transition-all text-left">
                <div className="w-10 h-10 lg:w-11 lg:h-11 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 relative">
                  <Bus size={18} className="text-amber-600" />
                  <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white animate-pulse"/>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs lg:text-sm font-black text-slate-900 truncate">
                    {v.routeName ? v.routeName.toUpperCase() : 'Route'} · {v.vehicleNo}
                  </p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <MapPin size={9} className="text-blue-500 shrink-0" />
                    <p className="text-[10px] lg:text-[11px] font-bold text-blue-600 truncate">{v.currentStop}</p>
                  </div>
                </div>
                <ChevronRight size={14} className="text-slate-300 shrink-0"/>
              </button>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};
