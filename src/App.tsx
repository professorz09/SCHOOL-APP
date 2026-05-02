import React, { useState, useEffect } from 'react';
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
import { useAuthStore } from '@/shared/store/authStore';
import { useUIStore } from '@/shared/store/uiStore';
import { studentService } from '@/modules/students/student.service';
import { Student } from '@/shared/types/principal.types';
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
      // (FeesView, HomeworkView, etc.) reloads for the newly selected child.
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
  if (isDesktop) {
    const firstName = session.name?.split(' ')[0] ?? 'User';
    return (
      <div className="flex h-full bg-slate-100 overflow-hidden">
        <aside className="w-64 xl:w-72 bg-white border-r border-slate-100 shadow-sm shrink-0">
          <SidebarNav role={role} currentTab={tab} setTab={setTab} onLogout={() => logout()} />
        </aside>

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="bg-white border-b border-slate-100 px-8 py-4 flex items-center justify-between shrink-0">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">EduGrow School</p>
              <h1 className="text-xl font-black text-slate-900 leading-tight">Hi, {firstName}</h1>
            </div>
            <div className="flex items-center gap-3">
              <button className="relative p-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors">
                <Bell size={20} />
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white">3</span>
              </button>
              <div className="flex items-center gap-2 bg-slate-100 px-3 py-2 rounded-xl">
                <div className="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-[10px] font-black">
                  {firstName.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-black text-slate-700">{session.name}</span>
              </div>
            </div>
          </div>

          <div className="flex-1 relative overflow-hidden">
            <main className="absolute inset-0 overflow-y-auto px-8 py-6 hide-scrollbar">
              <div className="max-w-5xl mx-auto">
                {renderTabContent()}
              </div>
            </main>
          </div>
        </div>
      </div>
    );
  }

  // ── Mobile layout ─────────────────────────────────────────────────────────
  return (
    <div className="h-dvh bg-slate-100 flex flex-col overflow-hidden">
      <div className="w-full h-full bg-slate-50 flex flex-col overflow-hidden">
        {tab === 'HOME' && !isSubView && <Header role={role} />}

        <main className="flex-1 overflow-y-auto pb-32 hide-scrollbar">
          {renderTabContent()}
        </main>

        <div className="fixed bottom-0 left-0 right-0 z-20">
          <BottomNav role={role} currentTab={tab} setTab={(t) => { setTab(t); setSubView(t !== 'HOME' && t !== 'PROFILE'); }} />
        </div>
      </div>
    </div>
  );
}
