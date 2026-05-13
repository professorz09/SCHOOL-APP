import React, { useEffect, useState } from 'react';
import {
  Users, UserCheck, BookOpen, IndianRupee, Bus, CircleAlert,
  Wallet, MapPin, ChevronRight, Bell, ClipboardCheck, Clock,
  Settings, UserCog, CalendarCheck, Sparkles,
  Calendar, GraduationCap, ArrowRight, TrendingUp, AlertCircle, BarChart3,
  Library, Banknote,
} from 'lucide-react';
import { studentService } from '@/modules/students/student.service';
import { staffService } from '@/modules/staff/staff.service';
import { principalService } from '@/roles/principal/principal.service';
import { transportService } from '@/modules/transport/transport.service';
import { apiPrincipal } from '@/lib/apiClient';
import { supabase } from '@/lib/supabase';
import { PrincipalView } from '@/roles/principal/pages/PrincipalLayout';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { useAcademicYear } from '@/shared/context/AcademicYearContext';
import { SalaryReminderCard } from '@/roles/principal/components/SalaryReminderCard';

interface Props {
  onNavigate: (view: PrincipalView) => void;
}

type Action = {
  icon: React.ReactNode; label: string; view: PrincipalView; tint: string;
  /** Short 1-3 word subtitle shown below the label — describes what the
   *  tile does ("Generate pass", "Review stocks"). */
  hint?: string;
  /** When true, the tile renders greyed out, ignores taps, and shows
   *  `disabledReason` as a toast on click. Used by the Transport tile
   *  when super-admin has set max_vehicles=0 for this school. */
  disabled?: boolean;
  disabledReason?: string;
  /** Renders as a wider full-row banner above the normal grid. Used
   *  when a hub has an odd item count so the layout doesn't end with a
   *  lonely single-cell row. */
  hero?: boolean;
};
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
  // Stats are heavy to compute (8 parallel queries including a full
  // student + staff scan). To avoid the "₹0 / 0%" flash on cold loads:
  //   • Hydrate from sessionStorage so a refresh shows the last value
  //     instantly while the fresh fetch runs (stale-while-revalidate).
  //   • Track `statsLoading` so the hero card shows a skeleton on the
  //     very first ever load (no cache yet).
  const STATS_CACHE_KEY = 'principal:dashboard:stats';
  const initialStats = (() => {
    if (typeof sessionStorage === 'undefined') return null;
    try {
      const raw = sessionStorage.getItem(STATS_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  })();
  const [stats, setStats] = useState(initialStats ?? {
    totalStudents: 0, avgAttendance: 0, paidFees: 0, totalFees: 0,
    monthlyCollection: 0,
    totalStaff: 0, openComplaints: 0, pendingApprovals: 0,
    studentsWithDues: 0, pendingLeaves: 0, lowAttendanceStudents: 0, unsubmittedAttendanceDays: 0,
  });
  const [statsLoading, setStatsLoading] = useState(!initialStats);
  const [vehicles, setVehicles] = useState<{
    id: string; vehicleNo: string; routeName: string; driverName: string;
    isLive: boolean; lastPing: string | null; currentStop: string;
  }[]>([]);
  // Total live count, separate from `vehicles` (which is sliced at 2
  // for the dashboard tile grid). Earlier the "N on road" badge used
  // vehicles.length so a fleet of 5 live buses read "2 on road" —
  // misleading. This holds the real count for the badge.
  const [liveCount, setLiveCount] = useState(0);
  // Transport service kill-switch — set by super-admin via
  // schools.max_vehicles. 0 → tile + Live Buses widget hidden, every
  // vehicle-write blocked at the DB trigger anyway. NULL/undefined =
  // unlimited (legacy default for older schools).
  const [maxVehicles, setMaxVehicles] = useState<number | null>(null);
  useEffect(() => {
    if (!session?.schoolId) return;
    let cancelled = false;
    supabase.from('schools').select('max_vehicles').eq('id', session.schoolId).maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setMaxVehicles((data as { max_vehicles: number | null } | null)?.max_vehicles ?? null);
      });
    return () => { cancelled = true; };
  }, [session?.schoolId]);
  const transportEnabled = maxVehicles !== 0; // null + any positive number → on
  // "Needs your attention" — pending approvals + unresolved complaints,
  // newest first, capped to a small list. Replaces the birthday widget
  // which now lives only on the teacher's home (and only for students
  // they actually teach). Principals don't usually wish students happy
  // birthday personally, so the screen real estate is better spent on
  // items that block downstream work — leave/result approvals, parent
  // complaints, etc.
  const [attentionItems, setAttentionItems] = useState<Array<{
    id: string;
    kind: 'APPROVAL' | 'COMPLAINT' | 'FEE_UPLOAD';
    title: string;
    sub: string;
    createdAt: string;
  }>>([]);
  // liveClasses state was removed when the "Live Classes" panel was
  // dropped. The setter call below is preserved as a no-op (variable
  // intentionally unused) so the parallel Promise.all keeps its shape
  // and we don't accidentally drop the attendance-records query that
  // also informs the alert counter elsewhere.

  // Pull /api/transport/live + merge with static vehicle metadata.
  // Single source of truth used by both the initial load AND the
  // Realtime subscription handler so they don't drift in shape.
  type LiveRow = {
    vehicleId: string; lat: number | null; lng: number | null;
    speedKmh: number | null; lastSeen: string;
    isLive: boolean; isTracking: boolean;
    currentStopIdx: number | null; tripStartedAt: string | null;
  };
  const loadAndMergeLive = async (
    allVehicles: Awaited<ReturnType<typeof transportService.getVehicles>>,
  ): Promise<typeof vehicles> => {
    let liveRows: LiveRow[] = [];
    try {
      const sess = await supabase.auth.getSession();
      const token = sess.data.session?.access_token;
      const res = await fetch('/api/transport/live', {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const j = await res.json();
        if (j.ok && Array.isArray(j.data)) liveRows = j.data as LiveRow[];
      }
    } catch (e) {
      console.warn('[dashboard] /transport/live fetch failed', e);
    }
    const liveById = new Map<string, LiveRow>();
    for (const r of liveRows) liveById.set(r.vehicleId, r);

    const merged = allVehicles
      .filter(v => v.isActive)
      .map(v => {
        const live = liveById.get(v.id);
        return { v, live };
      })
      .filter(x => x.live?.isLive)
      .sort((a, b) =>
        new Date(b.live!.lastSeen).getTime() - new Date(a.live!.lastSeen).getTime(),
      );
    // Update the real count BEFORE slicing so the badge always
    // reflects the actual fleet-wide live total, not the displayed
    // (capped) tile count.
    setLiveCount(merged.length);
    return merged
      .slice(0, 2)
      .map(({ v, live }) => {
        const stops = v.stops ?? [];
        const idx = live!.currentStopIdx;
        const currentStop = idx !== null && idx >= 0 && idx < stops.length
          ? stops[idx].name
          : 'En Route';
        return {
          id:         v.id,
          vehicleNo:  v.vehicleNo,
          routeName:  v.routeName,
          driverName: v.driverName,
          isLive:     true,
          lastPing:   live!.lastSeen,
          currentStop,
        };
      });
  };

  // ── Realtime subscription — vehicle_live changes flow in here.
  // Postgres Changes streams INSERT/UPDATE events for this school's
  // vehicle_live rows. On each event we re-merge with cached vehicle
  // metadata and update the panel without a full /transport/live
  // round-trip. Falls back gracefully if Realtime is disabled in the
  // Supabase project (channel.subscribe rejects → we just skip).
  useEffect(() => {
    if (!session?.schoolId) return;
    const channel = supabase
      .channel(`vehicle-live-${session.schoolId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vehicle_live', filter: `school_id=eq.${session.schoolId}` },
        async () => {
          // Cheap full re-merge; vehicle list stays small (<30) so
          // recomputing the top-2 is faster than a partial update.
          try {
            const allVehicles = transportService.getVehicles();
            const merged = await loadAndMergeLive(allVehicles);
            setVehicles(merged);
          } catch { /* ignore */ }
        },
      )
      .subscribe();
    // removeChannel fully tears down the WebSocket binding —
    // unsubscribe alone leaves the channel handle dangling on
    // some Supabase JS versions and can leak listeners across
    // logout/login cycles.
    return () => { void supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.schoolId]);

  useEffect(() => {
    const load = async () => {
      try {
      const today = new Date().toISOString().slice(0, 10);
      // First / last day of the current calendar month — used by the
      // monthly-collection query for the green hero card.
      const now = new Date();
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const monthEnd   = today;
      await transportService.refreshAll();
      const [students, staff, complaints, approvals, feeUploads, allVehicles, attRes, dashStats, monthPayRes] = await Promise.all([
        studentService.getAll(),
        staffService.getAll(),
        principalService.getComplaints(),
        principalService.getApprovals(),
        // Pending parent-submitted fee uploads — these block fee allocation
        // until the principal approves/rejects. Pulled with status filter so
        // we never read more than the queue we actually need to surface.
        principalService.getFeePaymentUploads('PENDING').catch(() => []),
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
      ]);
      const monthlyCollection = ((monthPayRes.data ?? []) as Array<{ amount: number }>)
        .reduce((sum, r) => sum + Number(r.amount || 0), 0);
      // attRes still pulled to keep alert / stats parity, but the
      // "Live Classes" UI is gone so we no longer build the row list.
      void attRes;
      const next = {
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
      };
      setStats(next);
      setStatsLoading(false);
      // Stash so the next mount paints instantly with the last seen
      // numbers while the fresh fetch is still in flight.
      try { sessionStorage.setItem(STATS_CACHE_KEY, JSON.stringify(next)); } catch { /* quota / private mode */ }
      // Vehicles shown on dashboard come from vehicle_live (real GPS
      // pings from the driver client). Earlier logic read a stale
      // in-memory field that no driver actually wrote to.
      // Realtime subscription below keeps this live without polling.
      const liveVehicles = await loadAndMergeLive(allVehicles);
      setVehicles(liveVehicles);

      // "Needs your attention" feed — interleave pending approvals +
      // unresolved complaints, newest first. We surface the 6 most-recent
      // overall; a separate count-bubble in each row's header tells the
      // principal there's more to see in the dedicated tab.
      const attApprovals = approvals
        .filter(a => a.status === 'PENDING')
        .map(a => ({
          id: a.id,
          kind: 'APPROVAL' as const,
          title: a.subject || `${a.type.replace('_', ' ')} request`,
          sub: `${a.fromName}${a.fromClass ? ` · ${a.fromClass}` : ''} · ${a.type.replace('_', ' ')}`,
          createdAt: a.createdAt,
        }));
      const attComplaints = complaints
        .filter(c => c.status !== 'RESOLVED' && c.status !== 'REJECTED')
        .map(c => ({
          id: c.id,
          kind: 'COMPLAINT' as const,
          title: c.subject,
          sub: `${c.isAnonymous ? 'Anonymous' : c.fromName}${c.fromClass ? ` · ${c.fromClass}` : ''} · ${c.from}`,
          createdAt: c.createdAt,
        }));
      const attFeeUploads = feeUploads.map(f => ({
        id: f.id,
        kind: 'FEE_UPLOAD' as const,
        title: `Fee payment · ₹${Number(f.amount).toLocaleString('en-IN')}`,
        sub: `${f.studentName}${f.admissionNo ? ` · ${f.admissionNo}` : ''} · ${f.description || 'Fee Payment'} · ${f.transactionId}`,
        createdAt: f.submittedAt,
      }));
      const merged = [...attApprovals, ...attComplaints, ...attFeeUploads]
        .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
        .slice(0, 6);
      setAttentionItems(merged);
      } catch (e) {
        // Surface a single toast so the principal knows the dashboard is
        // showing stale data rather than silently rendering empty cards.
        // eslint-disable-next-line no-console
        console.error('[principal-dashboard] load failed:', e);
        // Ensure the skeleton clears even on failure — otherwise the
        // hero card stays in "loading…" forever and the principal
        // thinks the app is hung.
        setStatsLoading(false);
      }
    };
    load();
  }, [ayKey, session?.schoolId]);

  const feePercent = stats.totalFees > 0 ? Math.round((stats.paidFees / stats.totalFees) * 100) : 0;

  // ── Hub config — every action lives in one of four hubs ────────────────────
  const HUBS: Hub[] = [
    {
      key: 'STUDENTS',
      label: 'Students',
      icon: <Users size={26}/>,
      gradient: 'from-violet-500 to-fuchsia-500',
      ring: 'ring-violet-300',
      items: [
        { icon: <Users size={20}/>,         label: 'Classes',    view: 'STUDENTS',    tint: 'bg-violet-50 text-violet-600',   hint: 'View & manage' },
        { icon: <UserCog size={20}/>,       label: 'Admission',  view: 'ADMISSION',   tint: 'bg-indigo-50 text-indigo-600',   hint: 'New entries' },
        { icon: <IndianRupee size={20}/>,   label: 'Fees',       view: 'FEE_LEDGER',  tint: 'bg-emerald-50 text-emerald-600', hint: 'Collect & track' },
        // Attendance moved from Academics → Students. It's a per-student
        // action (mark roll, view a child's history) and lives more
        // naturally with the rest of the student-centric tiles.
        { icon: <CalendarCheck size={20}/>, label: 'Attendance', view: 'ATTENDANCE',  tint: 'bg-teal-50 text-teal-600',       hint: 'Mark & review' },
      ],
    },
    {
      key: 'STAFF',
      label: 'Staff',
      icon: <UserCheck size={26}/>,
      gradient: 'from-sky-500 to-blue-500',
      ring: 'ring-sky-300',
      items: [
        // Staff List sits at the front of the tile row — same shape as
        // Attendance / Salary Ledger / Expenses / Management. Earlier it
        // rendered as a full-width hero banner which clashed visually
        // with its peers; principal wanted a uniform grid.
        { icon: <Users size={20}/>,         label: 'Staff List',     view: 'STAFF',            tint: 'bg-blue-50 text-blue-600',     hint: 'Add & edit' },
        { icon: <CalendarCheck size={20}/>, label: 'Attendance',     view: 'STAFF_ATTENDANCE', tint: 'bg-teal-50 text-teal-600',     hint: 'Daily roll' },
        { icon: <Banknote size={20}/>,      label: 'Salary Ledger',  view: 'SALARY_LEDGER',    tint: 'bg-amber-50 text-amber-600',   hint: 'Pay & log' },
        { icon: <Wallet size={20}/>,        label: 'Expenses',       view: 'EXPENSES',         tint: 'bg-red-50 text-red-500',       hint: 'Track spends' },
        // Management (class roster admin — teacher allotment, section
        // edits) is fundamentally a staff-management task ("who teaches
        // what / which section"), so it sits with the Staff hub.
        { icon: <BookOpen size={20}/>,      label: 'Management',     view: 'CLASS_MGMT',       tint: 'bg-purple-50 text-purple-600', hint: 'Class allotment' },
      ],
    },
    {
      key: 'ACADEMICS',
      label: 'Academics',
      icon: <GraduationCap size={26}/>,
      gradient: 'from-rose-500 to-pink-500',
      ring: 'ring-rose-300',
      items: [
        { icon: <GraduationCap size={20}/>, label: 'Exams',     view: 'EXAMS',     tint: 'bg-rose-50 text-rose-600',       hint: 'Schedule & results' },
        { icon: <Clock size={20}/>,         label: 'Timetable', view: 'TIMETABLE', tint: 'bg-fuchsia-50 text-fuchsia-600', hint: 'Build & view' },
        // Assets (library books / lab equipment) — academic resources,
        // belongs with Academics. Custodial workflow stays the same.
        { icon: <Library size={20}/>,       label: 'Assets',    view: 'ASSETS',    tint: 'bg-amber-50 text-amber-600',     hint: 'Library & lab' },
        { icon: <ArrowRight size={20}/>,    label: 'Promotion', view: 'PROMOTION', tint: 'bg-emerald-50 text-emerald-600', hint: 'Year-end move' },
      ],
    },
    {
      key: 'OPERATIONS',
      label: 'Operations',
      icon: <Bus size={26}/>,
      gradient: 'from-amber-500 to-orange-500',
      ring: 'ring-amber-300',
      items: [
        // Transport tile stays visible always — but when super-admin
        // has set max_vehicles=0, it's disabled (no onClick, locked
        // appearance). Hiding it would confuse principals who think
        // the feature was removed; greyed-out tile makes the
        // "service not enabled" state obvious without losing the
        // affordance for when admin enables it later.
        { icon: <Bus size={20}/>,            label: 'Transport',  view: 'TRANSPORT_MGMT', tint: 'bg-orange-50 text-orange-500', hint: 'Buses & routes',     disabled: !transportEnabled, disabledReason: 'Transport service abhi enable nahi hai. Super-admin se kahein.' },
        { icon: <Bell size={20}/>,           label: 'Notices',    view: 'NOTICES',        tint: 'bg-sky-50 text-sky-600',       hint: 'Send updates' },
        { icon: <ClipboardCheck size={20}/>, label: 'Approvals',  view: 'APPROVALS',      tint: 'bg-indigo-50 text-indigo-600', hint: 'Pending requests' },
        { icon: <CircleAlert size={20}/>,    label: 'Complaints', view: 'COMPLAINTS',     tint: 'bg-rose-50 text-rose-600',     hint: 'Open helpdesk' },
        // Admin / system items previously lived in the bottom utility strip.
        // Folded into Operations on the user's request — Operations is now the
        // single home for everything that isn't People / Money / Academics.
        { icon: <BarChart3 size={20}/>,      label: 'Analytics',  view: 'ANALYTICS',      tint: 'bg-blue-50 text-blue-600',     hint: 'Reports & charts' },
        { icon: <Sparkles size={20}/>,       label: 'Tools',      view: 'TOOLS',          tint: 'bg-purple-50 text-purple-600', hint: 'Bulk actions' },
        { icon: <Calendar size={20}/>,       label: 'Year',       view: 'YEAR_CLOSING',   tint: 'bg-amber-50 text-amber-600',   hint: 'Open / close AY' },
        { icon: <Settings size={20}/>,       label: 'Settings',   view: 'SETTINGS',       tint: 'bg-slate-100 text-slate-600',  hint: 'School & users' },
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-4 lg:gap-6 pb-4 lg:pb-8 px-4 lg:px-8 xl:px-12 pt-3 lg:pt-6">


      {/* ── Hero · Total Collection card (green) ────────────────────────────
          Mirrors the reference: big monthly collection number, "Dues Collected"
          progress bar (year-to-date paid vs billed), and a faint ₹ watermark
          for visual texture. */}
      <button onClick={() => onNavigate('FEE_COLLECTIONS')}
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
            {/* Active-year chip removed from the hero (per request) — the
                same year, plus lock state and the new-year-creation toggle
                hint, now lives in Settings → Academic Year so the hero
                stays focused on the headline metric. */}
          </div>
          <div className="text-4xl lg:text-6xl font-black tabular-nums mt-1 mb-4 lg:mb-5 min-h-[2.5rem] lg:min-h-[3.75rem]">
            {statsLoading ? (
              // Pulsing placeholder so the user knows numbers are
              // loading — much clearer than the previous flash of
              // "₹0" which read as real data.
              <span className="inline-block bg-white/25 rounded-lg h-9 lg:h-12 w-48 lg:w-64 animate-pulse" />
            ) : (
              <>₹{stats.monthlyCollection.toLocaleString('en-IN')}</>
            )}
          </div>

          {/* Progress bar — Dues Collected (year-to-date paid / billed) */}
          <div className="bg-emerald-800/40 rounded-2xl p-3 lg:p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] lg:text-sm font-black text-white">Dues Collected</span>
              <span className="text-[11px] lg:text-sm font-black text-white tabular-nums">
                {statsLoading ? (
                  <span className="inline-block bg-white/25 rounded h-3 w-10 align-middle animate-pulse" />
                ) : `${feePercent}%`}
              </span>
            </div>
            <div className="h-2 lg:h-2.5 bg-emerald-900/40 rounded-full overflow-hidden">
              <div className={`h-full bg-white rounded-full transition-all ${statsLoading ? 'animate-pulse' : ''}`}
                style={{ width: statsLoading ? '30%' : `${feePercent}%` }} />
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
          const heroItems = hub.items.filter(i => i.hero);
          const gridItems = hub.items.filter(i => !i.hero);
          const renderTile = (item: Action) => {
            const { icon, label, view, tint } = item;
            const isDisabled = item.disabled === true;
            const reason = item.disabledReason;
            return (
              <button
                key={label}
                onClick={() => {
                  if (isDisabled) {
                    if (reason) useUIStore.getState().showToast(reason, 'info');
                    return;
                  }
                  onNavigate(view);
                  setOpenHub(null);
                }}
                className={`flex flex-col items-center gap-1.5 lg:gap-2 p-2 lg:p-3 rounded-xl transition-all ${
                  isDisabled
                    ? 'cursor-not-allowed opacity-50'
                    : 'active:scale-95 hover:bg-slate-50'
                }`}>
                <div className={`relative w-11 h-11 lg:w-14 lg:h-14 rounded-2xl flex items-center justify-center ${tint}`}>
                  {icon}
                  {isDisabled && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-slate-400 text-white text-[8px] font-black flex items-center justify-center" aria-hidden>
                      🔒
                    </span>
                  )}
                </div>
                <span className="text-[9px] lg:text-[11px] font-black text-slate-600 uppercase tracking-wide text-center leading-tight">{label}</span>
              </button>
            );
          };
          // Hero CTA — bold gradient card that picks up the parent
          // hub's accent gradient, decorative watermark icon on the
          // right, white pill arrow. Visually leagues apart from the
          // small utility tiles below; reads as the primary action.
          const renderHeroCta = (item: Action) => (
            <button key={item.label}
              onClick={() => { onNavigate(item.view); setOpenHub(null); }}
              className={`relative w-full overflow-hidden rounded-2xl active:scale-[0.99] transition-all shadow-lg shadow-slate-300/40 bg-gradient-to-br ${hub.gradient} text-white text-left group`}>
              {/* Decorative watermark — large faded icon on the right */}
              <span aria-hidden className="pointer-events-none absolute -right-4 -top-4 opacity-15">
                {React.cloneElement(item.icon as React.ReactElement, { size: 140 })}
              </span>
              {/* Subtle dot pattern overlay */}
              <span aria-hidden
                className="pointer-events-none absolute inset-0 opacity-10"
                style={{
                  backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 1px)',
                  backgroundSize: '14px 14px',
                }} />
              <div className="relative flex items-center gap-3 lg:gap-4 px-4 lg:px-5 py-4 lg:py-5">
                <div className="w-12 h-12 lg:w-14 lg:h-14 rounded-2xl bg-white/25 backdrop-blur flex items-center justify-center shrink-0 ring-2 ring-white/40 shadow-sm">
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] lg:text-xs font-black uppercase tracking-[0.2em] text-white/75 mb-0.5">
                    {hub.label} Hub
                  </div>
                  <div className="text-base lg:text-lg font-black uppercase tracking-wide leading-tight">
                    {item.label}
                  </div>
                  <div className="text-[10px] lg:text-xs font-bold text-white/85 mt-1">
                    View, edit & add staff →
                  </div>
                </div>
                <div className="shrink-0 w-9 h-9 lg:w-10 lg:h-10 rounded-full bg-white/25 backdrop-blur flex items-center justify-center ring-1 ring-white/30 group-active:translate-x-0.5 transition-transform">
                  <ChevronRight size={18} />
                </div>
              </div>
            </button>
          );
          return (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 lg:p-5 animate-in slide-in-from-top-2 duration-200">
              <div className="text-[10px] lg:text-xs font-black uppercase tracking-widest text-slate-400 mb-2 lg:mb-3 px-1">
                {hub.label} Actions
              </div>
              {heroItems.length > 0 && (
                <div className="space-y-2 mb-3">
                  {heroItems.map(renderHeroCta)}
                </div>
              )}
              <div className="grid grid-cols-4 lg:grid-cols-8 gap-2 lg:gap-3">
                {gridItems.map(renderTile)}
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

      {/* ── Needs your attention — pending approvals + open complaints,
            newest first. Tapping a row routes to the relevant tab. Hidden
            entirely when both queues are empty so the dashboard doesn't
            carry a perpetual "all clear" panel. */}
      {attentionItems.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 lg:p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 lg:w-11 lg:h-11 rounded-xl bg-gradient-to-br from-amber-400 to-rose-500 flex items-center justify-center text-white shadow-md">
                <CircleAlert size={18}/>
              </div>
              <div>
                <h2 className="text-sm lg:text-base font-black text-slate-900 uppercase tracking-tight">Needs Attention</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Approvals · complaints · fee uploads</p>
              </div>
            </div>
            <span className="text-[10px] font-black text-rose-700 bg-rose-50 px-2 py-1 rounded-full uppercase tracking-widest">
              {attentionItems.length} open
            </span>
          </div>
          <div className="space-y-1.5">
            {attentionItems.map(item => {
              const target =
                item.kind === 'APPROVAL'   ? 'APPROVALS' :
                item.kind === 'COMPLAINT'  ? 'COMPLAINTS' :
                'FEE_COLLECTIONS';
              const iconClass =
                item.kind === 'APPROVAL'   ? 'bg-indigo-50 text-indigo-600' :
                item.kind === 'COMPLAINT'  ? 'bg-rose-50 text-rose-500' :
                'bg-emerald-50 text-emerald-600';
              const pillClass =
                item.kind === 'APPROVAL'   ? 'bg-white text-indigo-600 border-indigo-200' :
                item.kind === 'COMPLAINT'  ? 'bg-white text-rose-600 border-rose-200' :
                'bg-white text-emerald-600 border-emerald-200';
              const pillText =
                item.kind === 'APPROVAL'   ? 'Approve' :
                item.kind === 'COMPLAINT'  ? 'Open' :
                'Review';
              const Icon =
                item.kind === 'APPROVAL'   ? ClipboardCheck :
                item.kind === 'COMPLAINT'  ? CircleAlert :
                IndianRupee;
              return (
                <button
                  key={`${item.kind}:${item.id}`}
                  onClick={() => onNavigate(target)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50 hover:bg-slate-100 text-left transition-colors">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconClass}`}>
                    <Icon size={14}/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-slate-900 truncate">{item.title}</p>
                    <p className="text-[10px] font-bold text-slate-500 truncate">{item.sub}</p>
                  </div>
                  <span className={`text-[9px] font-black px-2 py-1 rounded-full uppercase tracking-widest shrink-0 border ${pillClass}`}>
                    {pillText}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

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
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/> {liveCount} on road
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
