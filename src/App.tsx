import React, { useState, useEffect } from 'react';
import { AppRole, NavTab } from './types';
import { Header, BottomNav, SidebarNav } from './components/Navigation';
import { LoginPage } from './components/LoginPage';
import { FirstLoginPasswordChange } from './components/FirstLoginPasswordChange';
import { PrincipalLayout } from './features/principal';
import { SuperAdminLayout } from './features/super-admin';
import { TeacherLayout } from './features/teacher';
import { StudentLayout } from './features/student';
import { DriverLayout } from './features/driver';
import { ProfileView } from './views/ProfileView';
import { useAuthStore, restoreAuthSession } from './store/authStore';
import { studentService } from './services/student.service';
import { Student } from './types/principal.types';
import { Settings2, LogOut, Bell } from 'lucide-react';
// Tab-specific views (lazy imports keep the route definitions explicit)
import { FeesView }            from './features/student/components/FeesView';
import { StudentNoticesView }  from './features/student/components/StudentNoticesView';
import { StudentsManager }     from './features/principal/components/StudentsManager';
import { FeeLedger }           from './features/principal/components/FeeLedger';
import { SchoolsManager }      from './features/super-admin/components/SchoolsManager';
import { BillingManager }      from './features/super-admin/components/BillingManager';
import { AttendanceManager }   from './features/teacher/components/AttendanceManager';
import { TeacherNoticesView }  from './features/teacher/components/TeacherNoticesView';

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
  const { session, logout } = useAuthStore();
  const [tab, setTab] = useState<NavTab>('HOME');
  const [showRoleSelector, setShowRoleSelector] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [linkedStudents, setLinkedStudents] = useState<Student[]>([]);
  const isDesktop = useIsDesktop();

  // Restore auth session on app load
  useEffect(() => {
    restoreAuthSession();
  }, []);

  // Load linked student records when a parent with siblings logs in.
  useEffect(() => {
    const ids = session?.linkedStudentIds ?? [];
    if (session?.role !== 'PARENT' || ids.length <= 1) {
      setLinkedStudents([]);
      return;
    }
    Promise.all(ids.map(id => studentService.getById(id))).then(results => {
      setLinkedStudents(results.filter((s): s is Student => !!s));
    });
  }, [session?.userId, session?.role, (session?.linkedStudentIds ?? []).join(',')]);

  if (!session) {
    return <LoginPage onLoginSuccess={() => window.location.reload()} />;
  }

  if (session.mustChangePassword) {
    return <FirstLoginPasswordChange />;
  }

  // For parents with multiple students, handle student selection
  const parentLinkedStudents = session.linkedStudentIds || [];
  if (session.role === 'PARENT' && parentLinkedStudents.length > 1 && !selectedStudentId) {
    return (
      <div className="h-dvh bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center sm:py-8 sm:px-4">
        <div className="w-full h-full sm:h-[850px] sm:max-w-[400px] bg-slate-50 relative sm:rounded-[40px] sm:border-[8px] border-slate-800 shadow-2xl flex flex-col overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 pt-12 pb-8 text-white">
            <div className="text-2xl font-black">Select Student</div>
            <div className="text-xs font-bold text-blue-100 mt-1">Choose which child to view</div>
          </div>
          <div className="flex-1 overflow-y-auto flex flex-col justify-center p-6 gap-3">
            {parentLinkedStudents.map((sid) => {
              const student = linkedStudents.find(s => s.id === sid);
              const displayName = student?.name ?? 'Loading…';
              const subtitle = student
                ? `${student.className} · Section ${student.section} · Roll ${student.rollNo}`
                : 'Tap to view dashboard';
              return (
                <button
                  key={sid}
                  onClick={() => setSelectedStudentId(sid)}
                  className="w-full p-4 bg-white rounded-xl border border-slate-200 shadow-sm active:scale-95 transition-transform text-left"
                >
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
      case 'PRINCIPAL': return <PrincipalLayout />;
      case 'TEACHER': return <TeacherLayout />;
      case 'STUDENT': return <StudentLayout />;
      case 'DRIVER': return <DriverLayout />;
      default: return null;
    }
  };

  const goHome = () => setTab('HOME');

  const renderTabContent = () => {
    if (tab === 'HOME')    return renderDashboard();
    if (tab === 'PROFILE') return <ProfileView />;

    // ── Student tabs ──────────────────────────────────────────────────────
    if (tab === 'FEES'    && role === 'STUDENT')    return <FeesView           onBack={goHome} />;
    if (tab === 'NOTICES' && role === 'STUDENT')    return <StudentNoticesView onBack={goHome} />;

    // ── Principal tabs ────────────────────────────────────────────────────
    if (tab === 'STUDENTS'    && role === 'PRINCIPAL') return <StudentsManager onBack={goHome} />;
    if (tab === 'FEE_LEDGER'  && role === 'PRINCIPAL') return <FeeLedger       onBack={goHome} />;

    // ── Super Admin tabs ──────────────────────────────────────────────────
    if (tab === 'SCHOOLS'  && role === 'SUPER_ADMIN') return <SchoolsManager onBack={goHome} />;
    if (tab === 'BILLING'  && role === 'SUPER_ADMIN') return <BillingManager  onBack={goHome} />;

    // ── Teacher tabs ──────────────────────────────────────────────────────
    if (tab === 'ATTENDANCE' && role === 'TEACHER') return <AttendanceManager  onBack={goHome} />;
    if (tab === 'NOTICES'    && role === 'TEACHER') return <TeacherNoticesView onBack={goHome} />;

    // ── Driver tabs (handled inside DriverLayout itself) ──────────────────
    if (role === 'DRIVER') return <DriverLayout />;

    return renderDashboard();
  };

  const handleLogout = () => {
    logout();
    window.location.reload();
  };

  // ── Desktop layout ────────────────────────────────────────────────────────
  if (isDesktop) {
    const firstName = session.name?.split(' ')[0] ?? 'User';
    return (
      <div className="flex h-full bg-slate-100 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 xl:w-72 bg-white border-r border-slate-100 shadow-sm shrink-0">
          <SidebarNav
            role={role}
            currentTab={tab}
            setTab={setTab}
            onLogout={handleLogout}
          />
        </aside>

        {/* Main area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top bar */}
          <div className="bg-white border-b border-slate-100 px-8 py-4 flex items-center justify-between shrink-0">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">EduGrow School</p>
              <h1 className="text-xl font-black text-slate-900 leading-tight">Hi, {firstName}</h1>
            </div>
            <button className="relative p-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors">
              <Bell size={20} />
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white">3</span>
            </button>
          </div>

          {/* Scrollable content — relative+overflow-hidden so absolute inset-0 panels work */}
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
    <div className="h-dvh bg-slate-100 flex items-center justify-center sm:py-8 sm:px-4">
      <div className="w-full h-full sm:h-[850px] sm:max-w-[400px] bg-slate-50 relative sm:rounded-[40px] sm:border-[8px] border-slate-800 shadow-2xl flex flex-col overflow-hidden">

        {/* Dynamic Header */}
        <Header role={role} />

        {/* Scrollable Main Content */}
        <main className="flex-1 overflow-y-auto px-5 pb-28 hide-scrollbar">
          {renderTabContent()}
        </main>

        {/* Bottom Navigation */}
        <BottomNav role={role} currentTab={tab} setTab={setTab} />

        {/* Logout & Dev Role Switcher Overlay */}
        {showRoleSelector && (
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-end justify-center animate-in fade-in">
            <div className="bg-white w-full rounded-t-3xl p-6 pb-10 animate-in slide-in-from-bottom-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-lg text-slate-800">Options</h3>
                <button
                  onClick={() => setShowRoleSelector(false)}
                  className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 font-bold"
                >
                  ✕
                </button>
              </div>

              <button
                onClick={() => {
                  logout();
                  setShowRoleSelector(false);
                  window.location.reload();
                }}
                className="w-full mb-4 py-3 px-4 bg-rose-100 text-rose-700 rounded-xl font-bold border border-rose-200 flex items-center justify-center gap-2"
              >
                <LogOut size={18} />
                Logout ({session.mobileNumber})
              </button>

              {/* Dev: Role Switcher for testing */}
              <div className="border-t border-slate-200 pt-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Dev: Preview As</p>
                <div className="grid grid-cols-2 gap-3">
                  {(['SUPER_ADMIN', 'PRINCIPAL', 'TEACHER', 'STUDENT', 'DRIVER'] as AppRole[]).map((r) => (
                    <button
                      key={r}
                      onClick={() => {
                        setShowRoleSelector(false);
                        // Note: In real app, this would require re-login
                      }}
                      className={`p-3 rounded-xl border text-sm font-semibold transition-all opacity-50 ${
                        role === r
                          ? 'bg-blue-50 border-blue-500 text-blue-700'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      {r.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Floating Settings Button */}
        <button
          onClick={() => setShowRoleSelector(true)}
          className="absolute right-4 top-24 w-10 h-10 bg-slate-900 text-white rounded-full flex justify-center items-center shadow-lg z-30 transition-transform active:scale-90"
        >
          <Settings2 size={18} />
        </button>
      </div>
    </div>
  );
}
