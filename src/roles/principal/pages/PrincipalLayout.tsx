import React, { useState, useEffect } from 'react';
import { Calendar, Sparkles, Lock } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { useAcademicYear } from '@/shared/context/AcademicYearContext';
import { PrincipalDashboard } from '@/roles/principal/components/PrincipalDashboard';
import { StudentsManager } from '@/modules/students/components/StudentsManager';
import { StaffManager } from '@/modules/staff/components/StaffManager';
import { AssetsManager } from '@/roles/principal/components/AssetsManager';
import { ComplaintsManager } from '@/roles/principal/components/ComplaintsManager';
import { ExpensesManager } from '@/roles/principal/components/ExpensesManager';
import { NoticesManager } from '@/modules/notices/components/NoticesManager';
import { ApprovalsManager } from '@/roles/principal/components/ApprovalsManager';
import { SettingsManager } from '@/roles/principal/components/SettingsManager';
import { ClassManagementManager } from '@/modules/academic-year/components/ClassManagementManager';
import { TimetableManager } from '@/modules/timetable/components/TimetableManager';
import { FeeLedger } from '@/modules/fees/components/FeeLedger';
import { FeeCollectionsHub } from '@/modules/fees/components/FeeCollectionsHub';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { SalaryLedger } from '@/roles/principal/components/SalaryLedger';
import { AcademicYearManager } from '@/modules/academic-year/components/AcademicYearManager';
import { StaffAttendanceManager } from '@/modules/attendance/components/StaffAttendanceManager';
import { TransportManager } from '@/modules/transport/components/TransportManager';
import { AttendanceHub } from '@/modules/attendance/components/AttendanceHub';
import { ToolsManager } from '@/roles/principal/components/ToolsManager';
import { PrincipalExamsManager } from '@/modules/exams/components/PrincipalExamsManager';
import { PromotionWizard } from '@/modules/academic-year/components/PromotionWizard';
import { AnalyticsManager } from '@/roles/principal/components/AnalyticsManager';

export type PrincipalView =
  | 'DASHBOARD'
  | 'STUDENTS'
  | 'ADMISSION'
  | 'STAFF'
  | 'ASSETS'
  | 'COMPLAINTS'
  | 'EXPENSES'
  | 'NOTICES'
  | 'APPROVALS'
  | 'SETTINGS'
  | 'CLASS_MGMT'
  | 'TIMETABLE'
  | 'FEE_LEDGER'
  | 'SALARY_LEDGER'
  | 'YEAR_CLOSING'
  | 'STAFF_ATTENDANCE'
  | 'ATTENDANCE'
  | 'TRANSPORT_MGMT'
  | 'TOOLS'
  | 'EXAMS'
  | 'SETTINGS_SCHOOL_INFO'
  | 'SETTINGS_FEE_STRUCT'
  | 'SETTINGS_CLASSES'
  | 'PROMOTION'
  | 'ANALYTICS';

export const PrincipalLayout: React.FC = () => {
  const [view, setView] = useState<PrincipalView>('DASHBOARD');
  const { isSubView, setSubView } = useUIStore();
  const { academicYears, isLoading } = useAcademicYear();

  const goTo = (v: PrincipalView) => { setView(v); setSubView(true); };
  const goBack = () => { setView('DASHBOARD'); setSubView(false); };

  useEffect(() => { setSubView(false); }, []);

  // When footer HOME pressed, isSubView becomes false → reset to dashboard
  useEffect(() => { if (!isSubView) setView('DASHBOARD'); }, [isSubView]);

  // Always allow the academic year manager so the principal can create the first year.
  if (view === 'YEAR_CLOSING') return <AcademicYearManager onBack={goBack} onNavigateToStaff={() => goTo('STAFF')} onNavigateToPromotion={() => goTo('PROMOTION')} />;

  // Lock every other feature until at least one academic year has been created.
  if (!isLoading && academicYears.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center gap-6">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg">
          <Lock size={32} className="text-white" />
        </div>
        <div className="space-y-2 max-w-xs">
          <h2 className="text-xl font-black text-slate-900">Academic Year Zaroori Hai</h2>
          <p className="text-[13px] font-bold text-slate-500 leading-relaxed">
            Sabhi features tab tak lock hain jab tak aap pehla academic year setup nahi karte.
            Students, staff, fees, attendance — sab ke liye ek active year hona zaroori hai.
          </p>
        </div>
        <button
          onClick={() => goTo('YEAR_CLOSING')}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm px-6 py-3.5 rounded-2xl shadow-md active:scale-95 transition-transform"
        >
          <Calendar size={18} />
          Pehla Academic Year Banayein
          <Sparkles size={16} className="opacity-80" />
        </button>
      </div>
    );
  }

  if (view === 'STUDENTS')      return <StudentsManager        onBack={goBack} />;
  if (view === 'ADMISSION')     return <StudentsManager        onBack={goBack} initialView="ADMISSION" />;
  if (view === 'STAFF')         return <StaffManager           onBack={goBack} />;
  if (view === 'ASSETS')        return <AssetsManager          onBack={goBack} />;
  if (view === 'COMPLAINTS')    return <ComplaintsManager      onBack={goBack} />;
  if (view === 'EXPENSES')      return <ExpensesManager        onBack={goBack} />;
  if (view === 'NOTICES')       return <NoticesManager         onBack={goBack} />;
  if (view === 'APPROVALS')     return <ApprovalsManager       onBack={goBack} />;
  // The `key` forces SettingsManager to remount when the principal switches
  // between SETTINGS variants. Without it React would reuse the same instance
  // and the new `initialView` prop would be ignored (it's only consumed by
  // useState at mount time inside SettingsManager).
  if (view === 'SETTINGS')             return <SettingsManager key="settings-menu"        onBack={goBack} />;
  if (view === 'SETTINGS_SCHOOL_INFO') return <SettingsManager key="settings-school-info" onBack={goBack} initialView="SCHOOL_INFO" />;
  if (view === 'SETTINGS_FEE_STRUCT')  return <SettingsManager key="settings-fee-struct"  onBack={goBack} initialView="FEE_STRUCT" />;
  if (view === 'SETTINGS_CLASSES')     return <SettingsManager key="settings-classes"     onBack={goBack} initialView="CLASSES" />;
  if (view === 'CLASS_MGMT')    return <ClassManagementManager onBack={goBack} />;
  if (view === 'TIMETABLE')     return <TimetableManager       onBack={goBack} />;
  if (view === 'FEE_LEDGER')    return <ErrorBoundary label="Fee Collections"><FeeCollectionsHub onBack={goBack} /></ErrorBoundary>;
  if (view === 'SALARY_LEDGER') return <SalaryLedger           onBack={goBack} />;
  if (view === 'STAFF_ATTENDANCE') return <StaffAttendanceManager onBack={goBack} />;
  if (view === 'ATTENDANCE')       return <AttendanceHub          onBack={goBack} />;
  if (view === 'TRANSPORT_MGMT')   return <TransportManager        onBack={goBack} />;
  if (view === 'TOOLS')            return <ToolsManager            onBack={goBack} />;
  if (view === 'EXAMS')            return <PrincipalExamsManager   onBack={goBack} />;
  if (view === 'PROMOTION')        return <PromotionWizard         onBack={goBack} />;
  if (view === 'ANALYTICS')        return <AnalyticsManager        onBack={goBack} />;

  return <PrincipalDashboard onNavigate={goTo} />;
};
