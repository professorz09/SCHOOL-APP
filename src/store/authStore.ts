import { create } from 'zustand';
import { AuthSession, authService } from '@/modules/auth/auth.service';
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
    // Clear local state BEFORE the async signOut so the UI flips to
    // the login screen on the next render — earlier this happened
    // after the await, which left the user staring at the previous
    // role's layout for a beat (and they could still tap reads while
    // writes 401'd with "invalid or expired token" because the
    // Supabase session was already gone server-side).
    set({ session: null, error: null, selectedStudentId: null });
    try {
      await authService.logout();
    } catch {
      // Swallow — local state is already cleared, server-side may
      // have been gone already (token expiry, network blip). The
      // user is logged out either way from the app's perspective.
    }
    // Hard-replace the URL so any React state that survived the
    // store flip (component-level useState, in-flight queries, the
    // service worker's runtime cache) is wiped. No half-state where
    // the previous user's data is visible after logout.
    if (typeof window !== 'undefined') {
      window.location.replace('/');
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
supabase.auth.onAuthStateChange(async (event) => {
  switch (event) {
    case 'SIGNED_OUT':
      useAuthStore.setState({ session: null, selectedStudentId: null });
      // Wipe every session-scoped store so a different user logging
      // in on the same device doesn't inherit the previous user's
      // privileged state. Earlier these lived on:
      //   • correctionStore — which closed years had write access
      //   • editorModeStore — 30-min Editor Mode window
      //   • editingYearStore — which closed year is currently being
      //     edited
      //   • uiStore.appReady — kept true → no splash on next login
      try {
        const [{ useCorrectionStore }, { useEditorModeStore }, { useEditingYearStore }, { useUIStore }] = await Promise.all([
          import('@/store/correctionStore'),
          import('@/store/editorModeStore'),
          import('@/store/editingYearStore'),
          import('@/store/uiStore'),
        ]);
        useCorrectionStore.getState().resetAll?.();
        useEditorModeStore.getState().hydrate(null);
        useEditingYearStore.getState().reset?.();
        useUIStore.getState().setAppReady(false);
      } catch (e) {
        // Non-fatal — main session reset above already protects auth.
        // eslint-disable-next-line no-console
        console.warn('[auth] post-signout store reset failed', e);
      }
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
