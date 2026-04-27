import React from 'react';
import {
  Home, User, Bell, IndianRupee, Users,
  Building2, CreditCard, ClipboardList, MapPin,
  LayoutDashboard,
} from 'lucide-react';
import { AppRole, NavTab } from '../types';
import { useAuthStore } from '../store/authStore';

// ─── Role-specific tab definitions ───────────────────────────────────────────

type TabDef = { id: NavTab; icon: React.ElementType; label: string };

const ROLE_TABS: Record<AppRole, TabDef[]> = {
  STUDENT: [
    { id: 'HOME',      icon: Home,          label: 'Home'    },
    { id: 'FEES',      icon: IndianRupee,   label: 'Fees'    },
    { id: 'NOTICES',   icon: Bell,          label: 'Notices' },
    { id: 'PROFILE',   icon: User,          label: 'Profile' },
  ],
  PRINCIPAL: [
    { id: 'HOME',        icon: LayoutDashboard, label: 'Home'     },
    { id: 'STUDENTS',    icon: Users,           label: 'Students' },
    { id: 'FEE_LEDGER',  icon: IndianRupee,     label: 'Fees'     },
    { id: 'PROFILE',     icon: User,            label: 'Profile'  },
  ],
  SUPER_ADMIN: [
    { id: 'HOME',     icon: LayoutDashboard, label: 'Home'    },
    { id: 'SCHOOLS',  icon: Building2,       label: 'Schools' },
    { id: 'BILLING',  icon: CreditCard,      label: 'Billing' },
    { id: 'PROFILE',  icon: User,            label: 'Profile' },
  ],
  TEACHER: [
    { id: 'HOME',       icon: Home,          label: 'Home'       },
    { id: 'ATTENDANCE', icon: ClipboardList, label: 'Attendance' },
    { id: 'NOTICES',    icon: Bell,          label: 'Notices'    },
    { id: 'PROFILE',    icon: User,          label: 'Profile'    },
  ],
  DRIVER: [
    { id: 'HOME',     icon: Home,   label: 'Home'     },
    { id: 'ROUTE',    icon: MapPin, label: 'Route'    },
    { id: 'STUDENTS', icon: Users,  label: 'Students' },
    { id: 'PROFILE',  icon: User,   label: 'Profile'  },
  ],
};

// ─── BottomNav ────────────────────────────────────────────────────────────────

interface BottomNavProps {
  role: AppRole;
  currentTab: NavTab;
  setTab: (tab: NavTab) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ role, currentTab, setTab }) => {
  const tabs = ROLE_TABS[role] ?? ROLE_TABS.STUDENT;

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-100 flex justify-between items-center px-6 py-2 pb-6 z-20">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = currentTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setTab(tab.id)}
            className="flex flex-col items-center gap-1 p-2 active:scale-95 transition-transform"
          >
            <div className={`transition-colors duration-200 ${isActive ? 'text-blue-600' : 'text-slate-400'}`}>
              <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
            </div>
            <span className={`text-[10px] font-black uppercase tracking-tighter transition-colors duration-200 ${
              isActive ? 'text-blue-700' : 'text-slate-400'
            }`}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
};

// ─── Header ───────────────────────────────────────────────────────────────────

interface HeaderProps {
  role: AppRole;
}

export const Header: React.FC<HeaderProps> = ({ role }) => {
  const session = useAuthStore(state => state.session);
  const firstName = session?.name?.split(' ')[0] ?? 'User';
  const initials = session?.name
    ? session.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
    : 'U';

  return (
    <div className="flex items-center justify-between px-5 pt-8 pb-4 sticky top-0 bg-slate-50/90 backdrop-blur-md z-10">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-blue-100 border-2 border-blue-500 overflow-hidden flex items-center justify-center text-blue-700 font-bold">
          {initials}
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase leading-tight">
            Hi, {firstName}
          </h1>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
            Welcome to EduGrow
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button className="relative p-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors">
          <Bell size={20} />
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white">3</span>
        </button>
      </div>
    </div>
  );
};
