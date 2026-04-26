import React, { useState } from 'react';
import { PrincipalDashboard } from '../components/PrincipalDashboard';
import { StudentsManager } from '../components/StudentsManager';
import { StaffManager } from '../components/StaffManager';
import { AssetsManager } from '../components/AssetsManager';
import { ComplaintsManager } from '../components/ComplaintsManager';
import { ExpensesManager } from '../components/ExpensesManager';
import { NoticesManager } from '../components/NoticesManager';
import { ApprovalsManager } from '../components/ApprovalsManager';
import { SettingsManager } from '../components/SettingsManager';

type PrincipalView =
  | 'DASHBOARD'
  | 'STUDENTS'
  | 'STAFF'
  | 'ASSETS'
  | 'COMPLAINTS'
  | 'EXPENSES'
  | 'NOTICES'
  | 'APPROVALS'
  | 'SETTINGS';

export const PrincipalLayout: React.FC = () => {
  const [view, setView] = useState<PrincipalView>('DASHBOARD');

  const goTo = (v: PrincipalView) => setView(v);
  const goBack = () => setView('DASHBOARD');

  if (view === 'STUDENTS')    return <StudentsManager    onBack={goBack} />;
  if (view === 'STAFF')       return <StaffManager       onBack={goBack} />;
  if (view === 'ASSETS')      return <AssetsManager      onBack={goBack} />;
  if (view === 'COMPLAINTS')  return <ComplaintsManager  onBack={goBack} />;
  if (view === 'EXPENSES')    return <ExpensesManager    onBack={goBack} />;
  if (view === 'NOTICES')     return <NoticesManager     onBack={goBack} />;
  if (view === 'APPROVALS')   return <ApprovalsManager   onBack={goBack} />;
  if (view === 'SETTINGS')    return <SettingsManager    onBack={goBack} />;

  return <PrincipalDashboard onNavigate={goTo} />;
};
