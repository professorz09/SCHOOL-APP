import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { AppRole, NavTab } from '@/shared/types/index';
import { Header, BottomNav, SidebarNav } from '@/shared/components/Navigation';
import { ProfileView } from '@/shared/components/ProfileView';
import { LoginPage } from '@/shared/components/LoginPage';
import { FirstLoginPasswordChange } from '@/shared/components/FirstLoginPasswordChange';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { studentService } from '@/modules/students/student.service';
import { Student } from '@/modules/students/student.types';
import { Bell, Loader, LogOut, ChevronRight } from 'lucide-react';
import { ErrorBoundary }       from '@/shared/components/ErrorBoundary';
import { ToastContainer }      from '@/shared/components/ui/Toast';
import { ReasonPromptModal }   from '@/shared/components/ui/ReasonPrompt';
import { ConfirmModal }        from '@/shared/components/ui/ConfirmModal';
import { MobileConfirmModal }  from '@/shared/components/ui/MobileConfirmModal';

// Code-split each role's dashboard + the heavy per-role tab views. Only the
// chunk for the currently-logged-in role is downloaded — a parent never
// pays for the principal's StudentsManager bundle, and vice-versa. Cuts
// the initial JS payload by ~60-70% for non-principal users.
const PrincipalLayout    = lazy(() => import('@/roles/principal/pages/PrincipalLayout').then(m => ({ default: m.PrincipalLayout })));
const SuperAdminLayout   = lazy(() => import('@/roles/super-admin/pages/SuperAdminLayout').then(m => ({ default: m.SuperAdminLayout })));
const TeacherLayout      = lazy(() => import('@/roles/teacher/pages/TeacherLayout').then(m => ({ default: m.TeacherLayout })));
const StudentLayout      = lazy(() => import('@/roles/student/pages/StudentLayout').then(m => ({ default: m.StudentLayout })));
const DriverLayout       = lazy(() => import('@/roles/driver/DriverLayout').then(m => ({ default: m.DriverLayout })));
const DriverRouteView    = lazy(() => import('@/roles/driver/DriverRouteView').then(m => ({ default: m.DriverRouteView })));
const DriverStudentsView = lazy(() => import('@/roles/driver/DriverStudentsView').then(m => ({ default: m.DriverStudentsView })));
const FeesView           = lazy(() => import('@/roles/student/components/FeesView').then(m => ({ default: m.FeesView })));
const StudentNoticesView = lazy(() => import('@/modules/notices/components/StudentNoticesView').then(m => ({ default: m.StudentNoticesView })));
const StudentsManager    = lazy(() => import('@/modules/students/components/StudentsManager').then(m => ({ default: m.StudentsManager })));
const FeeLedger          = lazy(() => import('@/modules/fees/components/FeeLedger').then(m => ({ default: m.FeeLedger })));
const SchoolsManager     = lazy(() => import('@/roles/super-admin/components/SchoolsManager').then(m => ({ default: m.SchoolsManager })));
const BillingManager     = lazy(() => import('@/roles/super-admin/components/BillingManager').then(m => ({ default: m.BillingManager })));
const AttendanceManager  = lazy(() => import('@/modules/attendance/components/TeacherAttendanceManager').then(m => ({ default: m.AttendanceManager })));
const TeacherNoticesView = lazy(() => import('@/modules/notices/components/TeacherNoticesView').then(m => ({ default: m.TeacherNoticesView })));

// Route-chunk fallback uses the shared AppLoader so every loading
// surface across the app (auth splash, route transitions, individual
// tabs) shares one visual language. Earlier we had three different
// "loading" looks fighting each other on the same fees screen.
import { AppLoader } from '@/shared/components/AppLoader';
const ChunkLoading: React.FC = () => <AppLoader variant="centered" />;

// Placeholder shown when a logged-in user has a role that doesn't
// have a dashboard built yet (e.g. a future non-teaching STAFF /
// PEON / ACCOUNTANT account). Without this the app rendered nothing
// and the screen looked broken.
const ComingSoonView: React.FC<{ role: string; onLogout: () => void }> = ({ role, onLogout }) => (
  <div className="min-h-dvh w-full flex flex-col items-center justify-center p-6 bg-gradient-to-b from-slate-50 to-white">
    <div className="w-20 h-20 rounded-3xl bg-indigo-100 flex items-center justify-center mb-5">
      <Loader className="text-indigo-500 animate-pulse" size={36} />
    </div>
    <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Coming Soon</h2>
    <p className="text-sm font-bold text-slate-500 mt-2 text-center max-w-xs">
      Your <span className="text-indigo-600">{role}</span> dashboard is not built yet.<br/>
      We'll let your school know once it's ready.
    </p>
    <button
      onClick={onLogout}
      className="mt-8 flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white text-xs font-black uppercase tracking-widest rounded-xl active:scale-95 transition-transform">
      <LogOut size={14} /> Log out
    </button>
  </div>
);

const useIsDesktop = () => {
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 1024);
  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isDesktop;
};

export default function App() {
  const session = useAuthStore((s) => s.session);
  const isInitializing = useAuthStore((s) => s.isInitializing);
  const initialize = useAuthStore((s) => s.initialize);
  const logout = useAuthStore((s) => s.logout);
  const selectedStudentId = useAuthStore((s) => s.selectedStudentId);
  const setSelectedStudentId = useAuthStore((s) => s.setSelectedStudentId);

  const isSubView = useUIStore((s) => s.isSubView);
  const setSubView = useUIStore((s) => s.setSubView);

  const [tab, setTab] = useState<NavTab>('HOME');
  const [linkedStudents, setLinkedStudents] = useState<Student[]>([]);
  // Tracks whether the first lazy-imported route chunk has actually
  // mounted (i.e. Suspense has stopped suspending at least once).
  // While this is false, we show a full-screen splash overlay so the
  // bottom nav / sidebar / page chrome don't appear AROUND a
  // half-loaded tab body — that's what made the boot feel like 2-3
  // separate loading screens stacked.
  // Replaced an earlier mount-on-commit signal that flipped this flag
  // as soon as the role chunk's first DOM commit happened — but the
  // dashboard then sat on "—" placeholders until ctx / classes / years
  // resolved, which read as a second "loading" pass to the user.
  // appReady (from uiStore) is now flipped by each role's Layout once
  // its essential data has actually loaded, so the splash holds until
  // the populated dashboard is ready to paint.
  const appReady = useUIStore(s => s.appReady);
  const setAppReady = useUIStore(s => s.setAppReady);
  // Reset on session change so a logout → re-login replay shows the
  // splash again instead of unmasking the previous user's data.
  useEffect(() => {
    if (!session) setAppReady(false);
  }, [session?.userId, setAppReady]); // eslint-disable-line react-hooks/exhaustive-deps
  const isDesktop = useIsDesktop();
  const mainScrollRef = useRef<HTMLElement | null>(null);

  // Desktop keyboard scrolling: browser only auto-scrolls a non-window
  // container with arrow/PageUp/PageDown/Home/End/Space if it has focus.
  // We focus the scroll region on view changes and also forward those keys
  // to it from a global listener (skipping when the user is typing in an
  // input/textarea/contenteditable so we don't hijack form keys).
  useEffect(() => {
    if (!isDesktop) return;
    const el = mainScrollRef.current;
    if (!el) return;

    // Focus shortly after mount/tab switch so arrow keys scroll immediately.
    const t = window.setTimeout(() => {
      const active = document.activeElement as HTMLElement | null;
      const isEditing = !!active && (
        active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.tagName === 'SELECT' ||
        active.isContentEditable
      );
      if (!isEditing) el.focus({ preventScroll: true });
    }, 50);

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return;
      }
      const main = mainScrollRef.current;
      if (!main) return;
      // Many sub-views ship their own `flex-1 overflow-y-auto` container, so
      // <main> itself isn't the actual scroll surface. Pick the deepest
      // visible vertically-scrollable element that still has room to move; if
      // none, fall back to <main>.
      const pickScrollEl = (): HTMLElement => {
        const candidates = main.querySelectorAll<HTMLElement>('*');
        let best: HTMLElement | null = null;
        let bestArea = 0;
        candidates.forEach((el) => {
          if (el.scrollHeight - el.clientHeight <= 1) return;
          const style = getComputedStyle(el);
          const oy = style.overflowY;
          if (oy !== 'auto' && oy !== 'scroll') return;
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) return;
          const area = r.width * r.height;
          if (area > bestArea) { bestArea = area; best = el; }
        });
        return best ?? main;
      };
      const scrollEl = pickScrollEl();
      const page = scrollEl.clientHeight * 0.9;
      const step = 60;
      switch (e.key) {
        case 'ArrowDown':       scrollEl.scrollBy({ top:  step, behavior: 'auto' }); e.preventDefault(); break;
        case 'ArrowUp':         scrollEl.scrollBy({ top: -step, behavior: 'auto' }); e.preventDefault(); break;
        case 'PageDown':        scrollEl.scrollBy({ top:  page, behavior: 'smooth' }); e.preventDefault(); break;
        case 'PageUp':          scrollEl.scrollBy({ top: -page, behavior: 'smooth' }); e.preventDefault(); break;
        case ' ':               scrollEl.scrollBy({ top: e.shiftKey ? -page : page, behavior: 'smooth' }); e.preventDefault(); break;
        case 'Home':            scrollEl.scrollTo({ top: 0, behavior: 'smooth' }); e.preventDefault(); break;
        case 'End':             scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: 'smooth' }); e.preventDefault(); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [isDesktop, tab, isSubView]);

  // Restore session from Supabase on mount.
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Load linked students for parent with multiple children.
  useEffect(() => {
    const ids = session?.linkedStudentIds ?? [];
    if (session?.role !== 'PARENT' || ids.length <= 1) { setLinkedStudents([]); return; }
    Promise.all(ids.map((id) => studentService.getById(id))).then((results) => {
      setLinkedStudents(results.filter((s): s is Student => !!s));
    });
  }, [session?.userId, session?.role, (session?.linkedStudentIds ?? []).join(',')]);

  // ── Loading splash while restoring Supabase session ──────────────────────
  // White (not blue) so the user doesn't see a blue→white strobe when
  // the app shell paints. Matches the Suspense fallback below.
  if (isInitializing) return <AppLoader variant="full" />;

  // ── Not signed in ────────────────────────────────────────────────────────
  if (!session) return <LoginPage />;

  // ── First-login password change gate ─────────────────────────────────────
  if (session.mustChangePassword) return <FirstLoginPasswordChange />;

  // ── Multi-student parent picker ──────────────────────────────────────────
  const parentLinkedStudents = session.linkedStudentIds || [];
  if (session.role === 'PARENT' && parentLinkedStudents.length > 1 && !selectedStudentId) {
    // Clean white screen — earlier this was a tall blue card with a
    // gradient header and a flex-justify-center body that left a
    // big empty band between the header and the (often only 2-3)
    // student cards. Now it's a simple top-anchored layout: small
    // brand strip, instruction line, then the student cards stacked
    // immediately below. Fits 1 / 2 / 5 children equally well.
    return (
      <div className="min-h-dvh bg-slate-50 flex flex-col">
        {/* Compact top strip — brand left, sign-out right. No
            gradient hero, no empty space. */}
        <div className="bg-white border-b border-slate-100 px-5 pt-5 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-sm shadow-blue-200">
              <span className="text-white font-black text-sm">E</span>
            </div>
            <div>
              <div className="text-base font-black text-slate-900 leading-tight">EduGrow</div>
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Parent Portal</div>
            </div>
          </div>
          <button
            onClick={() => logout()}
            className="flex items-center gap-1 text-[10px] font-black text-rose-600 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-full uppercase tracking-wide transition-colors"
            title="Sign out"
          >
            <LogOut size={12} /> Sign out
          </button>
        </div>

        {/* Title + instruction */}
        <div className="px-5 pt-6 pb-3">
          <h1 className="text-2xl font-black text-slate-900 leading-tight">Choose your child</h1>
          <p className="text-xs font-bold text-slate-500 mt-1">
            {parentLinkedStudents.length} student{parentLinkedStudents.length === 1 ? '' : 's'} linked to your number
          </p>
        </div>

        {/* Student cards — top-anchored stack with avatars. Tap a
            card to open that child's dashboard. */}
        <div className="px-5 pb-6 space-y-2.5">
          {parentLinkedStudents.map((sid) => {
            const student = linkedStudents.find((s) => s.id === sid);
            const displayName = student?.name ?? 'Loading…';
            const initials = student
              ? student.name.split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
              : '··';
            const className = student?.className?.trim() || '';
            const section = student?.section?.trim() || '';
            const rollNo = student?.rollNo?.trim() || '';
            // Build subtitle from only the parts we have so we don't
            // print "· Section · Roll" with empty values.
            const parts = [
              className && (section ? `${className}-${section}` : className),
              rollNo ? `Roll #${rollNo}` : '',
            ].filter(Boolean);
            const subtitle = student
              ? (parts.join(' · ') || 'Unassigned')
              : 'Loading details…';
            return (
              <button
                key={sid}
                onClick={() => setSelectedStudentId(sid)}
                className="w-full bg-white rounded-2xl border border-slate-100 shadow-sm hover:border-blue-200 hover:shadow-md active:scale-[0.99] transition-all text-left p-4 flex items-center gap-3.5"
              >
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-700 flex items-center justify-center font-black text-base shrink-0">
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-black text-slate-900 text-base truncate">{displayName}</div>
                  <div className="text-[11px] font-bold text-slate-500 mt-0.5">{subtitle}</div>
                </div>
                <ChevronRight size={18} className="text-slate-300 shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const role: AppRole = session.role === 'PARENT' || session.role === 'STUDENT'
    ? 'STUDENT'
    : (session.role as AppRole);

  const renderDashboard = () => {
    switch (role) {
      case 'SUPER_ADMIN': return <SuperAdminLayout />;
      case 'PRINCIPAL':   return <PrincipalLayout />;
      case 'TEACHER':     return <TeacherLayout />;
      // For STUDENT, selectedStudentId is fixed (own row); for PARENT it
      // changes when they pick a different child. Keying on it forces a
      // clean remount of every nested view so locally-cached student data
      // (FeesView, NoticesView, etc.) reloads for the newly selected child.
      case 'STUDENT':     return <StudentLayout key={selectedStudentId ?? 'none'} />;
      case 'DRIVER':      return <DriverLayout />;
      // Any role outside the 5 supported logins (e.g., a future
      // non-teaching STAFF / PEON / ACCOUNTANT account) lands on a
      // Coming Soon placeholder instead of a blank screen so the user
      // knows the login worked but their dashboard isn't built yet.
      default:            return <ComingSoonView role={session.role} onLogout={() => logout()} />;
    }
  };

  const goHome = () => { setTab('HOME'); setSubView(false); };

  const renderTabContent = () => {
    if (tab === 'HOME')    return renderDashboard();
    if (tab === 'PROFILE') return <ProfileView />;
    if (tab === 'FEES'    && role === 'STUDENT')    return <FeesView           onBack={goHome} />;
    if (tab === 'NOTICES' && role === 'STUDENT')    return <StudentNoticesView onBack={goHome} />;
    if (tab === 'STUDENTS'    && role === 'PRINCIPAL') return <StudentsManager onBack={goHome} />;
    if (tab === 'FEE_LEDGER'  && role === 'PRINCIPAL') return <ErrorBoundary label="Fee Ledger"><FeeLedger onBack={goHome} /></ErrorBoundary>;
    if (tab === 'SCHOOLS'  && role === 'SUPER_ADMIN') return <SchoolsManager onBack={goHome} />;
    if (tab === 'BILLING'  && role === 'SUPER_ADMIN') return <BillingManager  onBack={goHome} />;
    if (tab === 'ATTENDANCE' && role === 'TEACHER') return <AttendanceManager  onBack={goHome} />;
    if (tab === 'NOTICES'    && role === 'TEACHER') return <TeacherNoticesView onBack={goHome} />;
    if (role === 'DRIVER' && tab === 'ROUTE')    return <DriverRouteView />;
    if (role === 'DRIVER' && tab === 'STUDENTS') return <DriverStudentsView />;
    if (role === 'DRIVER') return <DriverLayout />;
    return renderDashboard();
  };

  // ── Desktop layout ────────────────────────────────────────────────────────
  // Sidebar shows brand + notification + user. Content fills the rest.
  // No duplicate top bar; sub-views own their internal header so we don't
  // pad the main twice.
  // ToastContainer is mounted once at the app root so toasts always render —
  // every nested view (Transport, Timetable, Settings, …) shares this single
  // instance instead of needing its own.
  // Full-screen splash overlay — keeps the page chrome (sidebar /
  // bottom nav) hidden until the very first lazy chunk has resolved.
  // Without this, the user sees the bottom nav + a centred mini
  // loader floating in an empty page body for ~1s after auth-init
  // ends, which reads as multiple stacked loading states.
  const splashOverlay = !appReady
    ? <div className="fixed inset-0 z-[60] bg-white"><AppLoader variant="full" /></div>
    : null;

  if (isDesktop) {
    return (
      <>
        {splashOverlay}
        <div className="flex h-full bg-slate-50 overflow-hidden">
          <aside className="w-64 xl:w-72 bg-white border-r border-slate-100 shadow-sm shrink-0">
            <SidebarNav role={role} currentTab={tab} setTab={setTab} onLogout={() => logout()} />
          </aside>

          <main
            ref={mainScrollRef}
            tabIndex={0}
            className="flex-1 overflow-y-auto hide-scrollbar focus:outline-none"
          >
            <Suspense fallback={<ChunkLoading />}>
              {renderTabContent()}
            </Suspense>
          </main>
        </div>
        <ToastContainer />
        <ReasonPromptModal />
        <ConfirmModal />
        <MobileConfirmModal />
      </>
    );
  }

  // ── Mobile layout ─────────────────────────────────────────────────────────
  return (
    <>
      {splashOverlay}
      <div className="h-dvh bg-slate-100 flex flex-col overflow-hidden">
        <div className="w-full h-full bg-slate-50 flex flex-col overflow-hidden">
          {/* Roles whose dashboard renders its own greeting block (with extra
              context like school name or active-year chip) should suppress the
              generic Header so the two don't stack. */}
          {tab === 'HOME' && !isSubView && role !== 'STUDENT' && role !== 'PRINCIPAL' && role !== 'TEACHER' && <Header role={role} />}

          <main className="flex-1 overflow-y-auto hide-scrollbar">
            <Suspense fallback={<ChunkLoading />}>
              {renderTabContent()}
            </Suspense>
          </main>

          {/* In the flex flow (not `fixed`) so <main> doesn't extend
              behind the nav. Sticky footers inside views (e.g. the
              admission form Cancel/Next bar) can now pin at bottom-0
              and naturally sit just above this row, with no manual
              bottom-nav-height offset and no empty band below. */}
          <BottomNav role={role} currentTab={tab} setTab={(t) => { setTab(t); setSubView(t !== 'HOME' && t !== 'PROFILE'); }} />
        </div>
      </div>
      <ToastContainer />
    </>
  );
}
