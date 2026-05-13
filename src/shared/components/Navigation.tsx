import React from 'react';
import {
  Home, User, Bell, IndianRupee, Users,
  Building2, CreditCard, ClipboardList, MapPin,
  LayoutDashboard, LogOut, UserCheck, CheckSquare, CalendarCheck,
  ShieldCheck, MailPlus, BarChart3, History, Settings as SettingsIcon,
  Clock, GraduationCap, Award,
} from 'lucide-react';
import { AppRole, NavTab } from '@/shared/types/index';
import { useAuthStore } from '@/store/authStore';

// ─── Role-specific tab definitions ───────────────────────────────────────────

// `desktopOnly` tabs appear in the desktop sidebar but not in the mobile
// bottom nav (which only has room for ~4 buttons). Mobile users still reach
// these sections via the dashboard's quick-action grid.
type TabDef = { id: NavTab; icon: React.ElementType; label: string; desktopOnly?: boolean };

const ROLE_TABS: Record<AppRole, TabDef[]> = {
  STUDENT: [
    { id: 'HOME',      icon: Home,          label: 'Home'    },
    { id: 'FEES',      icon: IndianRupee,   label: 'Fees'    },
    { id: 'NOTICES',   icon: Bell,          label: 'Notices' },
    // Desktop-only shortcuts — daily-reference items that don't fit
    // in the 4-button mobile bottom nav but a desktop user wants
    // one tap away.
    { id: 'TIMETABLE',  icon: Clock,         label: 'Timetable',  desktopOnly: true },
    { id: 'RESULTS',    icon: Award,         label: 'Results',    desktopOnly: true },
    { id: 'ATTENDANCE', icon: CalendarCheck, label: 'Attendance', desktopOnly: true },
    { id: 'PROFILE',   icon: User,          label: 'Profile' },
  ],
  PRINCIPAL: [
    { id: 'HOME',        icon: LayoutDashboard, label: 'Home'     },
    { id: 'STUDENTS',    icon: Users,           label: 'Students' },
    { id: 'FEE_LEDGER',  icon: IndianRupee,     label: 'Fees'     },
    // Desktop-only quick-access shortcuts — the hubs on the dashboard
    // still hold every action, but these are the ones a principal opens
    // multiple times a day so they get a top-level sidebar slot too.
    { id: 'STAFF',       icon: UserCheck,       label: 'Staff',       desktopOnly: true },
    { id: 'ATTENDANCE',  icon: CalendarCheck,   label: 'Attendance',  desktopOnly: true },
    { id: 'NOTICES',     icon: Bell,            label: 'Notices',     desktopOnly: true },
    { id: 'APPROVALS',   icon: CheckSquare,     label: 'Approvals',   desktopOnly: true },
    { id: 'SETTINGS',    icon: SettingsIcon,    label: 'Settings',    desktopOnly: true },
    { id: 'PROFILE',     icon: User,            label: 'Profile'  },
  ],
  SUPER_ADMIN: [
    { id: 'HOME',     icon: LayoutDashboard, label: 'Home'    },
    { id: 'SCHOOLS',  icon: Building2,       label: 'Schools' },
    { id: 'BILLING',  icon: CreditCard,      label: 'Billing' },
    { id: 'ADMINS',            icon: ShieldCheck,  label: 'Admins',    desktopOnly: true },
    { id: 'BROADCAST',         icon: MailPlus,     label: 'Broadcast', desktopOnly: true },
    { id: 'REPORTS',           icon: BarChart3,    label: 'Reports',   desktopOnly: true },
    { id: 'LOGS',              icon: History,      label: 'Logs',      desktopOnly: true },
    { id: 'PLATFORM_SETTINGS', icon: SettingsIcon, label: 'Settings',  desktopOnly: true },
    { id: 'PROFILE',  icon: User,            label: 'Profile' },
  ],
  TEACHER: [
    { id: 'HOME',       icon: Home,          label: 'Home'       },
    { id: 'ATTENDANCE', icon: ClipboardList, label: 'Attendance' },
    { id: 'NOTICES',    icon: Bell,          label: 'Notices'    },
    // Desktop-only shortcuts — class roster, the day's timetable and
    // the test/exam queue are what a teacher opens repeatedly through
    // the day. Stay out of the 4-button mobile bottom nav.
    { id: 'STUDENTS',  icon: Users,          label: 'Students',  desktopOnly: true },
    { id: 'TIMETABLE', icon: Clock,          label: 'Timetable', desktopOnly: true },
    { id: 'TESTS',     icon: GraduationCap,  label: 'Tests',     desktopOnly: true },
    { id: 'PROFILE',    icon: User,          label: 'Profile'    },
  ],
  DRIVER: [
    { id: 'HOME',     icon: Home,   label: 'Home'     },
    { id: 'ROUTE',    icon: MapPin, label: 'Route'    },
    { id: 'STUDENTS', icon: Users,  label: 'Students' },
    { id: 'PROFILE',  icon: User,   label: 'Profile'  },
  ],
};

// ─── BottomNav (mobile) ───────────────────────────────────────────────────────

interface BottomNavProps {
  role: AppRole;
  currentTab: NavTab;
  setTab: (tab: NavTab) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ role, currentTab, setTab }) => {
  const tabs = (ROLE_TABS[role] ?? ROLE_TABS.STUDENT).filter(t => !t.desktopOnly);

  return (
    <div className="w-full bg-white border-t border-slate-100 flex justify-between items-center px-6 pt-2 pb-[max(env(safe-area-inset-bottom),16px)]">
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

// ─── SidebarNav (desktop) ─────────────────────────────────────────────────────

interface SidebarNavProps {
  role: AppRole;
  currentTab: NavTab;
  setTab: (tab: NavTab) => void;
  onLogout: () => void;
}

const ROLE_LABEL: Record<AppRole, string> = {
  STUDENT:    'Student',
  PRINCIPAL:  'Principal',
  SUPER_ADMIN:'Super Admin',
  TEACHER:    'Teacher',
  DRIVER:     'Driver',
};

export const SidebarNav: React.FC<SidebarNavProps> = ({ role, currentTab, setTab, onLogout }) => {
  const session = useAuthStore(state => state.session);
  const tabs = ROLE_TABS[role] ?? ROLE_TABS.STUDENT;
  const initials = session?.name
    ? session.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
    : 'U';

  return (
    <div className="flex flex-col h-full select-none overflow-hidden">

      {/* ── Brand ── */}
      <div className="px-6 pt-8 pb-6 border-b border-slate-100 shrink-0 flex items-start justify-between gap-2">
        <div>
          <div className="text-2xl font-black text-blue-600 tracking-tight leading-none">EduGrow</div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mt-2">
            {ROLE_LABEL[role]}
          </div>
        </div>
        {/* Notification bell hidden for super-admin — they don't have
            a notification stream that's user-relevant (they manage
            schools at platform level, not per-school activity). For
            other roles it stays as a placeholder until a real feed
            wires in. */}
        {role !== 'SUPER_ADMIN' && role !== 'DRIVER' && (
          <button className="relative p-2 -mr-1 rounded-full text-slate-500 hover:bg-slate-100 transition-colors shrink-0" title="Notifications">
            <Bell size={18} />
            <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"/>
          </button>
        )}
      </div>

      {/* ── Nav items ── */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setTab(tab.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm transition-all active:scale-[0.98] ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm font-black'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-bold'
              }`}
            >
              <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              <span className="tracking-tight">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* ── User footer ── */}
      <div className="p-4 border-t border-slate-100 space-y-2 shrink-0">
        <div className="flex items-center gap-3 px-2 py-1">
          <div className="w-9 h-9 rounded-full bg-blue-100 border-2 border-blue-400 flex items-center justify-center text-blue-700 font-black text-sm shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-extrabold text-slate-900 text-sm truncate">{session?.name ?? 'User'}</div>
            <div className="text-[10px] font-bold text-slate-400 truncate">{session?.mobileNumber}</div>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-rose-50 text-rose-600 rounded-xl text-xs font-black border border-rose-100 hover:bg-rose-100 transition-colors active:scale-[0.98]"
        >
          <LogOut size={14} /> Logout
        </button>
      </div>
    </div>
  );
};

// ─── Header (mobile) ──────────────────────────────────────────────────────────

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
    <div className="flex items-center gap-3 px-5 pt-[max(env(safe-area-inset-top),24px)] pb-4 sticky top-0 bg-slate-50/90 backdrop-blur-md z-10">
      <div className="flex items-center gap-3 flex-1">
        <div className="w-10 h-10 rounded-full bg-blue-100 border-2 border-blue-500 overflow-hidden flex items-center justify-center text-blue-700 font-bold shrink-0">
          {initials}
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase leading-tight">
            Hi, {firstName}
          </h1>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
            Welcome to EduGrow
          </p>
        </div>
      </div>
      {/* Mobile header bell — hidden for super-admin (no per-school
          notification stream relevant to them). */}
      {role !== 'SUPER_ADMIN' && role !== 'DRIVER' && (
        <button className="relative p-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors shrink-0">
          <Bell size={20} />
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white">3</span>
        </button>
      )}
    </div>
  );
};
