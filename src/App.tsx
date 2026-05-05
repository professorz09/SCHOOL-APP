import React, { useState, useEffect, useRef } from 'react';
import { AppRole, NavTab } from '@/shared/types/index';
import { Header, BottomNav, SidebarNav } from '@/shared/components/Navigation';
import { PrincipalLayout } from '@/roles/principal/pages/PrincipalLayout';
import { SuperAdminLayout } from '@/roles/super-admin/pages/SuperAdminLayout';
import { TeacherLayout }    from '@/roles/teacher/pages/TeacherLayout';
import { StudentLayout }    from '@/roles/student/pages/StudentLayout';
import { DriverLayout }     from '@/roles/driver/DriverLayout';
import { DriverRouteView }  from '@/roles/driver/DriverRouteView';
import { DriverStudentsView } from '@/roles/driver/DriverStudentsView';
import { ProfileView } from '@/shared/components/ProfileView';
import { LoginPage } from '@/shared/components/LoginPage';
import { FirstLoginPasswordChange } from '@/shared/components/FirstLoginPasswordChange';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { studentService } from '@/modules/students/student.service';
import { Student } from '@/modules/students/student.types';
import { Bell, Loader, LogOut } from 'lucide-react';
import { FeesView }            from '@/roles/student/components/FeesView';
import { StudentNoticesView }  from '@/modules/notices/components/StudentNoticesView';
import { StudentsManager }     from '@/modules/students/components/StudentsManager';
import { FeeLedger }           from '@/modules/fees/components/FeeLedger';
import { ErrorBoundary }       from '@/shared/components/ErrorBoundary';
import { SchoolsManager }      from '@/roles/super-admin/components/SchoolsManager';
import { BillingManager }      from '@/roles/super-admin/components/BillingManager';
import { AttendanceManager }   from '@/modules/attendance/components/TeacherAttendanceManager';
import { TeacherNoticesView }  from '@/modules/notices/components/TeacherNoticesView';
import { ToastContainer }      from '@/shared/components/ui/Toast';

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
  if (isInitializing) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center">
        <Loader size={32} className="text-white animate-spin" />
      </div>
    );
  }

  // ── Not signed in ────────────────────────────────────────────────────────
  if (!session) return <LoginPage />;

  // ── First-login password change gate ─────────────────────────────────────
  if (session.mustChangePassword) return <FirstLoginPasswordChange />;

  // ── Multi-student parent picker ──────────────────────────────────────────
  const parentLinkedStudents = session.linkedStudentIds || [];
  if (session.role === 'PARENT' && parentLinkedStudents.length > 1 && !selectedStudentId) {
    return (
      <div className="h-dvh bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-slate-50 rounded-2xl shadow-2xl flex flex-col overflow-hidden" style={{height: 'min(850px, calc(100dvh - 2rem))'}}>
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 pt-6 pb-8 text-white flex items-center justify-between">
            <div>
              <div className="text-2xl font-black">Select Student</div>
              <div className="text-xs font-bold text-blue-100 mt-1">Choose which child to view</div>
            </div>
            <button
              onClick={() => logout()}
              className="text-blue-100 hover:text-white p-2"
              title="Sign out"
            >
              <LogOut size={18} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto flex flex-col justify-center p-6 gap-3">
            {parentLinkedStudents.map((sid) => {
              const student = linkedStudents.find((s) => s.id === sid);
              const displayName = student?.name ?? 'Loading…';
              const subtitle = student
                ? `${student.className} · Section ${student.section} · Roll ${student.rollNo}`
                : 'Tap to view dashboard';
              return (
                <button key={sid} onClick={() => setSelectedStudentId(sid)}
                  className="w-full p-4 bg-white rounded-xl border border-slate-200 shadow-sm active:scale-95 transition-transform text-left">
                  <div className="font-black text-slate-900">{displayName}</div>
                  <div className="text-[10px] font-bold text-slate-400 mt-1">{subtitle}</div>
                </button>
              );
            })}
          </div>
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
      default:            return null;
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
  if (isDesktop) {
    return (
      <>
        <div className="flex h-full bg-slate-50 overflow-hidden">
          <aside className="w-64 xl:w-72 bg-white border-r border-slate-100 shadow-sm shrink-0">
            <SidebarNav role={role} currentTab={tab} setTab={setTab} onLogout={() => logout()} />
          </aside>

          <main
            ref={mainScrollRef}
            tabIndex={0}
            className="flex-1 overflow-y-auto hide-scrollbar focus:outline-none"
          >
            {renderTabContent()}
          </main>
        </div>
        <ToastContainer />
      </>
    );
  }

  // ── Mobile layout ─────────────────────────────────────────────────────────
  return (
    <>
      <div className="h-dvh bg-slate-100 flex flex-col overflow-hidden">
        <div className="w-full h-full bg-slate-50 flex flex-col overflow-hidden">
          {/* Roles whose dashboard renders its own greeting block (with extra
              context like school name or active-year chip) should suppress the
              generic Header so the two don't stack. */}
          {tab === 'HOME' && !isSubView && role !== 'STUDENT' && role !== 'PRINCIPAL' && role !== 'TEACHER' && <Header role={role} />}

          <main className="flex-1 overflow-y-auto pb-32 hide-scrollbar">
            {renderTabContent()}
          </main>

          <div className="fixed bottom-0 left-0 right-0 z-20">
            <BottomNav role={role} currentTab={tab} setTab={(t) => { setTab(t); setSubView(t !== 'HOME' && t !== 'PROFILE'); }} />
          </div>
        </div>
      </div>
      <ToastContainer />
    </>
  );
}
