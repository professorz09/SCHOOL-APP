import React, { useState, useEffect } from 'react';
import { AppRole, NavTab } from './types';
import { Header, BottomNav } from './components/Navigation';
import { LoginPage } from './components/LoginPage';
import { PrincipalLayout } from './features/principal';
import { SuperAdminLayout } from './features/super-admin';
import { TeacherLayout } from './features/teacher';
import { StudentLayout } from './features/student';
import { DriverLayout } from './features/driver/DriverLayout';
import { PaymentsView } from './views/PaymentsView';
import { AcademicYearManager } from './views/AcademicYearManager';
import { useAuthStore, restoreAuthSession } from './store/authStore';
import { Settings2, LogOut } from 'lucide-react';

export default function App() {
  const { session, logout } = useAuthStore();
  const [tab, setTab] = useState<NavTab>('HOME');
  const [showRoleSelector, setShowRoleSelector] = useState(false);
  const [showAcademicYearManager, setShowAcademicYearManager] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  // Restore auth session on app load
  useEffect(() => {
    restoreAuthSession();
  }, []);

  if (!session) {
    return <LoginPage onLoginSuccess={() => window.location.reload()} />;
  }

  // For parents with multiple students, handle student selection
  const parentLinkedStudents = session.linkedStudentIds || [];
  if (session.role === 'PARENT' && parentLinkedStudents.length > 1 && !selectedStudentId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center sm:py-8 sm:px-4">
        <div className="w-full h-screen sm:h-[850px] sm:max-w-[400px] bg-slate-50 relative sm:rounded-[40px] sm:border-[8px] border-slate-800 shadow-2xl flex flex-col overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 pt-12 pb-8 text-white">
            <div className="text-2xl font-black">Select Student</div>
            <div className="text-xs font-bold text-blue-100 mt-1">Choose which child to view</div>
          </div>
          <div className="flex-1 overflow-y-auto flex flex-col justify-center p-6 gap-3">
            {parentLinkedStudents.map((sid) => (
              <button
                key={sid}
                onClick={() => setSelectedStudentId(sid)}
                className="w-full p-4 bg-white rounded-xl border border-slate-200 shadow-sm active:scale-95 transition-transform text-left"
              >
                <div className="font-black text-slate-900">Student {sid}</div>
                <div className="text-[10px] font-bold text-slate-400 mt-1">Tap to view dashboard</div>
              </button>
            ))}
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

  const renderTabContent = () => {
    if (tab === 'HOME') {
      return renderDashboard();
    }
    if (tab === 'PAYMENTS') {
      return <PaymentsView role={role} />;
    }
    return (
      <div className="flex flex-col items-center justify-center h-64 opacity-50 mt-10">
        <div className="w-16 h-16 bg-slate-200 rounded-full mb-4 animate-pulse"></div>
        <p className="font-semibold text-slate-500">Coming Soon</p>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center sm:py-8 sm:px-4">
      <div className="w-full h-screen sm:h-[850px] sm:max-w-[400px] bg-slate-50 relative sm:rounded-[40px] sm:border-[8px] border-slate-800 shadow-2xl flex flex-col overflow-hidden">

        {/* Dynamic Header */}
        <Header role={role} onOpenAcademicYearSettings={() => setShowAcademicYearManager(true)} />

        {/* Scrollable Main Content */}
        <main className="flex-1 overflow-y-auto px-5 pb-24 hide-scrollbar">
          {renderTabContent()}
        </main>

        {/* Bottom Navigation */}
        <BottomNav currentTab={tab} setTab={setTab} />

        {showAcademicYearManager && (
          <AcademicYearManager onClose={() => setShowAcademicYearManager(false)} />
        )}

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
