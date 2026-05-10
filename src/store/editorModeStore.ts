import { create } from 'zustand';
import { apiAuth } from '@/lib/apiClient';

// Editor Mode: a 30-min privileged-edit window the principal flips on for
// destructive operations (payment reversal, document delete, locked-record
// edits). The server is the source of truth — it persists `editor_mode_until`
// on the user row and gates the relevant routes via requireEditorMode. The
// store mirrors that timestamp so the UI can show countdowns / disable
// buttons without an extra round trip.

const DURATION_MS = 30 * 60 * 1000;

interface EditorModeStore {
  /** When the server-side window expires (epoch ms). 0 = inactive. */
  expiresAt: number;
  /** True when an enable/disable request is in flight. */
  pending: boolean;
  /** Flip on for the next 30 min. Resolves once the server confirms. */
  enable: () => Promise<void>;
  /** Flip off immediately. Resolves once the server confirms. */
  disable: () => Promise<void>;
  /** Refresh from `users.editor_mode_until` (called after login / page load). */
  hydrate: (until: string | null) => void;
  /** True only while the window is open. */
  isActive: () => boolean;
  /** Remaining ms (0 when inactive). */
  remainingMs: () => number;
}

let _timer: ReturnType<typeof setTimeout> | null = null;

const scheduleExpire = (set: (s: Partial<EditorModeStore>) => void, expiresAt: number) => {
  if (_timer) { clearTimeout(_timer); _timer = null; }
  const remaining = expiresAt - Date.now();
  if (remaining > 0) {
    _timer = setTimeout(async () => {
      set({ expiresAt: 0 });
      // Toast the principal so they know future saves will fail
      // until they re-enable. Earlier the auto-off was silent → user
      // discovered it only via a 403 mid-save. Lazy-import the UI
      // store to avoid a static circular dep at module init.
      try {
        const { useUIStore } = await import('@/store/uiStore');
        useUIStore.getState().showToast(
          'Editor Mode auto-disabled (30 min over). Re-enable from Settings if you still need it.',
          'info',
        );
      } catch { /* import shouldn't fail; never block expiry */ }
    }, remaining);
  }
};

export const useEditorModeStore = create<EditorModeStore>((set, get) => ({
  expiresAt: 0,
  pending: false,

  async enable() {
    set({ pending: true });
    try {
      const { until } = await apiAuth.enableEditorMode();
      const ts = new Date(until).getTime();
      scheduleExpire(set, ts);
      set({ expiresAt: ts, pending: false });
    } catch (e) {
      set({ pending: false });
      throw e;
    }
  },

  async disable() {
    set({ pending: true });
    try {
      await apiAuth.disableEditorMode();
      if (_timer) { clearTimeout(_timer); _timer = null; }
      set({ expiresAt: 0, pending: false });
    } catch (e) {
      set({ pending: false });
      throw e;
    }
  },

  hydrate(until) {
    if (!until) { set({ expiresAt: 0 }); return; }
    const ts = new Date(until).getTime();
    if (ts <= Date.now()) { set({ expiresAt: 0 }); return; }
    scheduleExpire(set, ts);
    set({ expiresAt: ts });
  },

  isActive() {
    return get().expiresAt > Date.now();
  },

  remainingMs() {
    return Math.max(0, get().expiresAt - Date.now());
  },
}));

// Re-export the duration so UI components (countdown labels, etc.) don't need
// to redeclare it.
export const EDITOR_MODE_DURATION_MS = DURATION_MS;
