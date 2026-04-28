import React, { useState, useEffect } from 'react';
import { AppRole, NavTab } from './types';
import { Header, BottomNav, SidebarNav } from './components/Navigation';
import { PrincipalLayout } from './features/principal';
import { SuperAdminLayout } from './features/super-admin';
import { TeacherLayout } from './features/teacher';
import { StudentLayout } from './features/student';
import { DriverLayout } from './features/driver';
import { ProfileView } from './views/ProfileView';
import { useAuthStore } from './store/authStore';
import { useUIStore } from './store/uiStore';
import { studentService } from './services/student.service';
import { Student } from './types/principal.types';
import { AuthSession } from './services/auth.service';
import { Bell, ChevronDown, Users, GraduationCap, BookOpen, Car, ShieldCheck, X } from 'lucide-react';
import { FeesView }            from './features/student/components/FeesView';
import { StudentNoticesView }  from './features/student/components/StudentNoticesView';
import { StudentsManager }     from './features/principal/components/StudentsManager';
import { FeeLedger }           from './features/principal/components/FeeLedger';
import { SchoolsManager }      from './features/super-admin/components/SchoolsManager';
import { BillingManager }      from './features/super-admin/components/BillingManager';
import { AttendanceManager }   from './features/teacher/components/AttendanceManager';
import { TeacherNoticesView }  from './features/teacher/components/TeacherNoticesView';

// ── Demo sessions for each role ───────────────────────────────────────────────
const DEMO_SESSIONS: { label: string; role: AppRole; display: string; session: AuthSession; icon: React.ComponentType<{size?: number; className?: string}> }[] = [
  {
    label: 'Super Admin',
    role: 'SUPER_ADMIN',
    display: 'Super Admin',
    icon: ShieldCheck,
    session: {
      userId: 'sa1', mobileNumber: '9000000000', role: 'SUPER_ADMIN',
      name: 'Super Admin', email: 'admin@edugrow.in', mustChangePassword: false,
    },
  },
  {
    label: 'Principal',
    role: 'PRINCIPAL',
    display: 'Dr. Rajesh Kumar',
    icon: GraduationCap,
    session: {
      userId: 'principal1', mobileNumber: '9000000001', role: 'PRINCIPAL',
      schoolId: 's1', name: 'Dr. Rajesh Kumar', email: 'principal@school.edu', mustChangePassword: false,
    },
  },
  {
    label: 'Teacher',
    role: 'TEACHER',
    display: 'Aarti Desai',
    icon: BookOpen,
    session: {
      userId: 'staff1', mobileNumber: '9000000002', role: 'TEACHER',
      schoolId: 'sch1', name: 'Aarti Desai', email: 'aarti@school.edu', mustChangePassword: false,
    },
  },
  {
    label: 'Student / Parent',
    role: 'STUDENT',
    display: 'Rakesh Sharma',
    icon: Users,
    session: {
      userId: 'parent1', mobileNumber: '9876543210', role: 'PARENT',
      schoolId: 'sch1', linkedStudentIds: ['student1'], name: 'Rakesh Sharma', email: 'rakesh@example.com', mustChangePassword: false,
    },
  },
  {
    label: 'Driver',
    role: 'DRIVER',
    display: 'Rajan Kumar',
    icon: Car,
    session: {
      userId: 'staff6', mobileNumber: '9000000006', role: 'DRIVER',
      schoolId: 'sch1', name: 'Rajan Kumar', email: 'rajan@school.edu', mustChangePassword: false,
    },
  },
];

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
  const { session, setSession } = useAuthStore();
  const isSubView = useUIStore(s => s.isSubView);
  const setSubView = useUIStore(s => s.setSubView);
  const [tab, setTab] = useState<NavTab>('HOME');
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [linkedStudents, setLinkedStudents] = useState<Student[]>([]);
  const isDesktop = useIsDesktop();

  // Auto-login as Principal on first load
  useEffect(() => {
    const stored = localStorage.getItem('auth_session');
    if (stored) {
      try {
        setSession(JSON.parse(stored) as AuthSession);
        return;
      } catch { localStorage.removeItem('auth_session'); }
    }
    setSession(DEMO_SESSIONS[1].session); // default: Principal
  }, []);

  // Load linked students for parent with multiple children
  useEffect(() => {
    const ids = session?.linkedStudentIds ?? [];
    if (session?.role !== 'PARENT' || ids.length <= 1) { setLinkedStudents([]); return; }
    Promise.all(ids.map(id => studentService.getById(id))).then(results => {
      setLinkedStudents(results.filter((s): s is Student => !!s));
    });
  }, [session?.userId, session?.role, (session?.linkedStudentIds ?? []).join(',')]);

  const switchRole = (demo: typeof DEMO_SESSIONS[0]) => {
    setSession(demo.session);
    setTab('HOME');
    setSelectedStudentId(null);
    setShowSwitcher(false);
  };

  if (!session) return null;

  // Multi-student parent picker
  const parentLinkedStudents = session.linkedStudentIds || [];
  if (session.role === 'PARENT' && parentLinkedStudents.length > 1 && !selectedStudentId) {
    return (
      <div className="h-dvh bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-slate-50 rounded-2xl shadow-2xl flex flex-col overflow-hidden" style={{height: 'min(850px, calc(100dvh - 2rem))'}}>
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 pt-6 pb-8 text-white">
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

  const currentDemo = DEMO_SESSIONS.find(d => d.session.userId === session.userId) ?? DEMO_SESSIONS.find(d => d.role === role);

  const renderDashboard = () => {
    switch (role) {
      case 'SUPER_ADMIN': return <SuperAdminLayout />;
      case 'PRINCIPAL':   return <PrincipalLayout />;
      case 'TEACHER':     return <TeacherLayout />;
      case 'STUDENT':     return <StudentLayout />;
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
    if (tab === 'FEE_LEDGER'  && role === 'PRINCIPAL') return <FeeLedger       onBack={goHome} />;
    if (tab === 'SCHOOLS'  && role === 'SUPER_ADMIN') return <SchoolsManager onBack={goHome} />;
    if (tab === 'BILLING'  && role === 'SUPER_ADMIN') return <BillingManager  onBack={goHome} />;
    if (tab === 'ATTENDANCE' && role === 'TEACHER') return <AttendanceManager  onBack={goHome} />;
    if (tab === 'NOTICES'    && role === 'TEACHER') return <TeacherNoticesView onBack={goHome} />;
    if (role === 'DRIVER') return <DriverLayout />;
    return renderDashboard();
  };

  // ── Role Switcher Overlay ─────────────────────────────────────────────────
  const RoleSwitcherPanel = () => (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-end justify-center lg:items-center animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-sm rounded-t-3xl lg:rounded-2xl p-6 pb-8 lg:pb-6 shadow-2xl animate-in slide-in-from-bottom-6 lg:slide-in-from-bottom-0 duration-200">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-lg font-black text-slate-900">Switch Role</h3>
            <p className="text-xs font-bold text-slate-400 mt-0.5">Preview as any role instantly</p>
          </div>
          <button onClick={() => setShowSwitcher(false)}
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {DEMO_SESSIONS.map((demo) => {
            const Icon = demo.icon;
            const isActive = currentDemo?.role === demo.role;
            return (
              <button key={demo.role} onClick={() => switchRole(demo)}
                className={`flex items-center gap-3 w-full px-4 py-3 rounded-2xl border transition-all active:scale-[0.98] text-left ${
                  isActive
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                    : 'bg-white border-slate-150 hover:border-slate-200 hover:bg-slate-50 text-slate-800'
                }`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isActive ? 'bg-white/20' : 'bg-slate-100'}`}>
                  <Icon size={18} className={isActive ? 'text-white' : 'text-slate-600'} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-black ${isActive ? 'text-white' : 'text-slate-900'}`}>{demo.label}</div>
                  <div className={`text-[11px] font-bold truncate ${isActive ? 'text-indigo-200' : 'text-slate-400'}`}>{demo.display}</div>
                </div>
                {isActive && (
                  <div className="w-2 h-2 rounded-full bg-white shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ── Desktop layout ────────────────────────────────────────────────────────
  if (isDesktop) {
    const firstName = session.name?.split(' ')[0] ?? 'User';
    const Icon = currentDemo?.icon ?? GraduationCap;
    return (
      <div className="flex h-full bg-slate-100 overflow-hidden">
        <aside className="w-64 xl:w-72 bg-white border-r border-slate-100 shadow-sm shrink-0">
          <SidebarNav role={role} currentTab={tab} setTab={setTab} onLogout={() => {}} />
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
              {/* Role Switcher Button */}
              <button
                onClick={() => setShowSwitcher(true)}
                className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 transition-colors px-3 py-2 rounded-xl"
              >
                <div className="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center">
                  <Icon size={13} className="text-white" />
                </div>
                <span className="text-sm font-black text-slate-700">{currentDemo?.label ?? role}</span>
                <ChevronDown size={14} className="text-slate-400" />
              </button>
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

        {showSwitcher && <RoleSwitcherPanel />}
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

        {/* Floating Role Switcher Button */}
        <button
          onClick={() => setShowSwitcher(true)}
          className="fixed right-4 top-24 z-30 flex items-center gap-1.5 bg-slate-900 text-white text-[11px] font-black px-3 py-2 rounded-full shadow-lg active:scale-90 transition-transform"
        >
          {React.createElement(currentDemo?.icon ?? GraduationCap, { size: 13, className: 'text-indigo-300' })}
          {currentDemo?.label ?? role}
        </button>

        {showSwitcher && <RoleSwitcherPanel />}
      </div>
    </div>
  );
}
