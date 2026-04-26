import React, { useState } from 'react';
import { AppRole, NavTab } from './types';
import { Header, BottomNav } from './components/Navigation';
import { StudentDashboard } from './views/StudentDashboard';
import { TeacherDashboard } from './views/TeacherDashboard';
import { PrincipalLayout } from './features/principal';
import { SuperAdminLayout } from './features/super-admin';
import { DriverDashboard } from './views/DriverDashboard';
import { PaymentsView } from './views/PaymentsView';
import { AcademicYearManager } from './views/AcademicYearManager';
import { Settings2 } from 'lucide-react';

export default function App() {
  const [role, setRole] = useState<AppRole>('STUDENT');
  const [tab, setTab] = useState<NavTab>('HOME');
  const [showRoleSelector, setShowRoleSelector] = useState(false);
  const [showAcademicYearManager, setShowAcademicYearManager] = useState(false);

  const renderDashboard = () => {
    switch (role) {
      case 'SUPER_ADMIN': return <SuperAdminLayout />;
      case 'PRINCIPAL': return <PrincipalLayout />;
      case 'TEACHER': return <TeacherDashboard />;
      case 'STUDENT': return <StudentDashboard />;
      case 'DRIVER': return <DriverDashboard />;
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
    // Placeholder for other tabs
    return (
      <div className="flex flex-col items-center justify-center h-64 opacity-50 mt-10">
        <div className="w-16 h-16 bg-slate-200 rounded-full mb-4 animate-pulse"></div>
        <p className="font-semibold text-slate-500">Coming Soon</p>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center sm:py-8 sm:px-4">
      {/* Mobile Shell Wrapper */}
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

        {/* Development Role Switcher Overlay */}
        {showRoleSelector && (
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-end justify-center animate-in fade-in">
            <div className="bg-white w-full rounded-t-3xl p-6 pb-10 animate-in slide-in-from-bottom-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-lg text-slate-800">Preview View As</h3>
                <button 
                  onClick={() => setShowRoleSelector(false)}
                  className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 font-bold"
                >
                  ✕
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                {(['SUPER_ADMIN', 'PRINCIPAL', 'TEACHER', 'STUDENT', 'DRIVER'] as AppRole[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      setRole(r);
                      setTab('HOME');
                      setShowRoleSelector(false);
                    }}
                    className={`p-3 rounded-xl border text-sm font-semibold transition-all ${
                      role === r 
                        ? 'bg-blue-50 border-blue-500 text-blue-700' 
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {r.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Floating Dev Button */}
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
