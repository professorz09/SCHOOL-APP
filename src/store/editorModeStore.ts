import { create } from 'zustand';

// Editor Mode: when enabled the principal can re-assign classes, change roll
// numbers, and edit other sensitive student fields. Auto-expires after 30 min.

const DURATION_MS = 30 * 60 * 1000; // 30 minutes

interface EditorModeStore {
  enabled: boolean;
  enabledAt: number | null;
  /** Enable editor mode. Auto-disables after DURATION_MS. */
  enable: () => void;
  /** Manually disable editor mode. */
  disable: () => void;
  /** True only when enabled AND within the 30-minute window. */
  isActive: () => boolean;
  /** Remaining milliseconds (0 when inactive). */
  remainingMs: () => number;
}

let _timer: ReturnType<typeof setTimeout> | null = null;

export const useEditorModeStore = create<EditorModeStore>((set, get) => ({
  enabled: false,
  enabledAt: null,

  enable() {
    if (_timer) clearTimeout(_timer);
    _timer = setTimeout(() => {
      set({ enabled: false, enabledAt: null });
    }, DURATION_MS);
    set({ enabled: true, enabledAt: Date.now() });
  },

  disable() {
    if (_timer) { clearTimeout(_timer); _timer = null; }
    set({ enabled: false, enabledAt: null });
  },

  isActive() {
    const { enabled, enabledAt } = get();
    if (!enabled || enabledAt === null) return false;
    return Date.now() - enabledAt < DURATION_MS;
  },

  remainingMs() {
    const { enabled, enabledAt } = get();
    if (!enabled || enabledAt === null) return 0;
    return Math.max(0, DURATION_MS - (Date.now() - enabledAt));
  },
}));
