import { create } from 'zustand';
import { AuthSession, authService } from '@/shared/services/auth.service';
import { supabase } from '@/lib/supabase';

interface AuthState {
  session: AuthSession | null;
  isInitializing: boolean;
  isLoading: boolean;
  error: string | null;
  /**
   * For PARENT users with multiple children: which child the dashboard is
   * currently viewing. Auto-set to the only linked student for STUDENT users
   * and for parents with a single linked student. The student-side services
   * (studentDashboard.service, fee.service, etc.) read this to scope queries
   * to the correct student.
   */
  selectedStudentId: string | null;
  setSession: (session: AuthSession | null) => void;
  setSelectedStudentId: (studentId: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  initialize: () => Promise<void>;
  logout: () => Promise<void>;
}

function autoSelectedFor(session: AuthSession | null): string | null {
  if (!session) return null;
  const ids = session.linkedStudentIds ?? [];
  if (session.role === 'PARENT' && ids.length === 1) return ids[0];
  if (session.role === 'STUDENT' && ids.length >= 1) return ids[0];
  return null;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  isInitializing: true,
  isLoading: false,
  error: null,
  selectedStudentId: null,

  setSession: (session) =>
    set({ session, error: null, selectedStudentId: autoSelectedFor(session) }),
  setSelectedStudentId: (studentId) => set({ selectedStudentId: studentId }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),

  initialize: async () => {
    try {
      const session = await authService.getCurrentSession();
      set({
        session,
        isInitializing: false,
        selectedStudentId: autoSelectedFor(session),
      });
    } catch (err) {
      console.error('[auth] initialize failed:', err);
      set({ session: null, isInitializing: false, selectedStudentId: null });
    }
  },

  logout: async () => {
    try {
      await authService.logout();
    } finally {
      set({ session: null, error: null, selectedStudentId: null });
    }
  },
}));

let refreshing = false;
async function refreshSessionFromSupabase() {
  if (refreshing) return;
  refreshing = true;
  try {
    const session = await authService.getCurrentSession();
    useAuthStore.setState((prev) => ({
      session,
      // Preserve manual selection if still valid; otherwise auto-select.
      selectedStudentId:
        session && prev.selectedStudentId &&
        (session.linkedStudentIds ?? []).includes(prev.selectedStudentId)
          ? prev.selectedStudentId
          : autoSelectedFor(session),
    }));
  } catch (err) {
    console.error('[auth] refresh failed:', err);
  } finally {
    refreshing = false;
  }
}

// Wire Supabase auth events so token refresh, sign-out from another tab, or
// password / metadata updates keep our local store in sync with Supabase.
supabase.auth.onAuthStateChange((event) => {
  switch (event) {
    case 'SIGNED_OUT':
      useAuthStore.setState({ session: null, selectedStudentId: null });
      break;
    case 'SIGNED_IN':
    case 'TOKEN_REFRESHED':
    case 'USER_UPDATED':
      void refreshSessionFromSupabase();
      break;
    default:
      break;
  }
});
