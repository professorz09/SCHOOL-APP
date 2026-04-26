import { create } from 'zustand';
import { AuthSession } from '../services/auth.service';

interface AuthState {
  session: AuthSession | null;
  isLoading: boolean;
  error: string | null;
  setSession: (session: AuthSession | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  isLoading: false,
  error: null,

  setSession: (session) => {
    set({ session, error: null });
    if (session) {
      localStorage.setItem('auth_session', JSON.stringify(session));
    } else {
      localStorage.removeItem('auth_session');
    }
  },

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),

  logout: () => {
    set({ session: null, error: null });
    localStorage.removeItem('auth_session');
  },
}));

// Restore session from localStorage on app load
export const restoreAuthSession = () => {
  const stored = localStorage.getItem('auth_session');
  if (stored) {
    try {
      const session = JSON.parse(stored) as AuthSession;
      useAuthStore.setState({ session });
    } catch (e) {
      localStorage.removeItem('auth_session');
    }
  }
};
