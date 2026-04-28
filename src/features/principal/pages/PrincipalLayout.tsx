import React, { useState, useEffect } from 'react';
import { ToastContainer } from '../../../components/ui/Toast';
import { useUIStore } from '../../../store/uiStore';
import { PrincipalDashboard } from '../components/PrincipalDashboard';
import { StudentsManager } from '../components/StudentsManager';
import { StaffManager } from '../components/StaffManager';
import { AssetsManager } from '../components/AssetsManager';
import { ComplaintsManager } from '../components/ComplaintsManager';
import { ExpensesManager } from '../components/ExpensesManager';
import { NoticesManager } from '../components/NoticesManager';
import { ApprovalsManager } from '../components/ApprovalsManager';
import { SettingsManager } from '../components/SettingsManager';
import { ClassManagementManager } from '../components/ClassManagementManager';
import { TimetableManager } from '../components/TimetableManager';
import { FeeLedger } from '../components/FeeLedger';
import { SalaryLedger } from '../components/SalaryLedger';
import { YearClosingWizard } from '../components/YearClosingWizard';
import { StaffAttendanceManager } from '../components/StaffAttendanceManager';
import { TransportManager } from '../components/TransportManager';
import { AttendanceHub } from '../components/AttendanceHub';
import { ToolsManager } from '../components/ToolsManager';

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
  | 'TOOLS';

export const PrincipalLayout: React.FC = () => {
  const [view, setView] = useState<PrincipalView>('DASHBOARD');
  const { isSubView, setSubView } = useUIStore();

  const goTo = (v: PrincipalView) => { setView(v); setSubView(true); };
  const goBack = () => { setView('DASHBOARD'); setSubView(false); };

  useEffect(() => { setSubView(false); }, []);

  // When footer HOME pressed, isSubView becomes false → reset to dashboard
  useEffect(() => { if (!isSubView) setView('DASHBOARD'); }, [isSubView]);

  if (view === 'STUDENTS')      return <StudentsManager        onBack={goBack} />;
  if (view === 'ADMISSION')     return <StudentsManager        onBack={goBack} initialView="ADMISSION" />;
  if (view === 'STAFF')         return <StaffManager           onBack={goBack} />;
  if (view === 'ASSETS')        return <AssetsManager          onBack={goBack} />;
  if (view === 'COMPLAINTS')    return <ComplaintsManager      onBack={goBack} />;
  if (view === 'EXPENSES')      return <ExpensesManager        onBack={goBack} />;
  if (view === 'NOTICES')       return <NoticesManager         onBack={goBack} />;
  if (view === 'APPROVALS')     return <ApprovalsManager       onBack={goBack} />;
  if (view === 'SETTINGS')      return <SettingsManager        onBack={goBack} />;
  if (view === 'CLASS_MGMT')    return <ClassManagementManager onBack={goBack} />;
  if (view === 'TIMETABLE')     return <TimetableManager       onBack={goBack} />;
  if (view === 'FEE_LEDGER')    return <FeeLedger              onBack={goBack} />;
  if (view === 'SALARY_LEDGER') return <SalaryLedger           onBack={goBack} />;
  if (view === 'YEAR_CLOSING')     return <YearClosingWizard      onBack={goBack} />;
  if (view === 'STAFF_ATTENDANCE') return <StaffAttendanceManager onBack={goBack} />;
  if (view === 'ATTENDANCE')       return <AttendanceHub          onBack={goBack} />;
  if (view === 'TRANSPORT_MGMT')   return <TransportManager       onBack={goBack} />;
  if (view === 'TOOLS')            return <ToolsManager           onBack={goBack} />;

  return (
    <>
      <PrincipalDashboard onNavigate={goTo} />
      <ToastContainer />
    </>
  );
};
