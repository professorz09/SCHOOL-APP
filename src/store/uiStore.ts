import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

/** Pending reason-picker request — set by `askReason()`, consumed by the
 *  root-level <ReasonPromptModal />, resolved when the user confirms /
 *  cancels. Replaces window.prompt() across the app so we no longer get
 *  the codespaces dev hostname showing as the dialog title on mobile. */
export interface ReasonRequest {
  message: string;
  placeholder?: string;
  required?: boolean;
  resolve: (reason: string | null) => void;
}

/** Pending yes/no confirmation — set by `askConfirm()`, consumed by the
 *  root-level <ConfirmModal />. Replaces window.confirm() across the app
 *  for sensitive irreversible actions (mark-failed, delete document,
 *  re-admit, remove section, etc.). */
export interface ConfirmRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  resolve: (confirmed: boolean) => void;
}

/** Type-to-confirm gate. Used for actions that need a deliberate
 *  authentication-style step but don't justify a full password
 *  re-entry (which has its own flakiness — see first-login race).
 *  User types the last-4 digits of their mobile number to proceed.
 *  Cheap, doesn't require Supabase round-trip, blocks accidental clicks
 *  + bystanders without locking the principal out of fast actions.
 *  Used for: Editor Mode enable, Correction Mode enable, Year Lock. */
export interface MobileConfirmRequest {
  title: string;
  message?: string;
  expectedLast4: string;
  resolve: (confirmed: boolean) => void;
}

interface UIStore {
  toasts: Toast[];
  showToast: (message: string, type?: ToastType) => void;
  dismissToast: (id: string) => void;
  isSubView: boolean;
  setSubView: (v: boolean) => void;

  /** Whether the role-specific dashboard has its essential data
   *  loaded (ctx for student, classes for teacher, academicYears for
   *  principal). The full-screen splash at app root stays mounted
   *  until this flips true so the user never sees a "—" / empty
   *  shell between the auth-init loader and the populated
   *  dashboard. Reset on logout / role change. */
  appReady: boolean;
  setAppReady: (v: boolean) => void;

  /** Currently-shown reason prompt, or null. */
  reasonRequest: ReasonRequest | null;
  /** Open the global reason picker. Returns a promise that resolves to
   *  the trimmed reason or null on cancel. Drop-in replacement for
   *  `window.prompt(message)?.trim() || null`. */
  askReason: (opts: { message: string; placeholder?: string; required?: boolean }) => Promise<string | null>;
  /** Internal — used by the modal to settle the pending promise. */
  resolveReason: (reason: string | null) => void;

  /** Currently-shown confirm dialog, or null. */
  confirmRequest: ConfirmRequest | null;
  /** Open the global yes/no confirm. Returns a promise that resolves
   *  to true if user confirmed, false on cancel / backdrop tap. Drop-in
   *  replacement for `if (!window.confirm(msg)) return;`. */
  askConfirm: (opts: {
    title: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
  }) => Promise<boolean>;
  /** Internal — used by the modal to settle the pending promise. */
  resolveConfirm: (confirmed: boolean) => void;

  /** Mobile-last-4 confirmation gate. */
  mobileConfirmRequest: MobileConfirmRequest | null;
  /** Ask the user to type the last 4 digits of their mobile number.
   *  Caller passes the expected digits (typically `session.mobileNumber.slice(-4)`).
   *  Returns true on match, false on cancel / wrong code. */
  askMobileConfirm: (opts: { title: string; message?: string; expectedLast4: string }) => Promise<boolean>;
  /** Internal — settle the pending promise. */
  resolveMobileConfirm: (confirmed: boolean) => void;
}

export const useUIStore = create<UIStore>((set, get) => ({
  toasts: [],
  isSubView: false,
  reasonRequest: null,
  confirmRequest: null,
  mobileConfirmRequest: null,
  appReady: false,

  showToast: (message, type = 'success') => {
    const id = `toast-${Date.now()}`;
    set(s => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => {
      set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }));
    }, 3000);
  },

  dismissToast: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
  setSubView: (v) => set({ isSubView: v }),
  setAppReady: (v) => set({ appReady: v }),

  askReason: ({ message, placeholder, required = true }) => {
    return new Promise<string | null>(resolve => {
      // If a previous prompt is still open, cancel it before showing the
      // new one — otherwise its resolver is orphaned and the caller hangs.
      const existing = get().reasonRequest;
      if (existing) existing.resolve(null);
      set({ reasonRequest: { message, placeholder, required, resolve } });
    });
  },

  resolveReason: (reason) => {
    const req = get().reasonRequest;
    if (req) {
      req.resolve(reason);
      set({ reasonRequest: null });
    }
  },

  askConfirm: ({ title, message, confirmLabel, cancelLabel, destructive }) => {
    return new Promise<boolean>(resolve => {
      const existing = get().confirmRequest;
      if (existing) existing.resolve(false);
      set({ confirmRequest: { title, message, confirmLabel, cancelLabel, destructive, resolve } });
    });
  },

  resolveConfirm: (confirmed) => {
    const req = get().confirmRequest;
    if (req) {
      req.resolve(confirmed);
      set({ confirmRequest: null });
    }
  },

  askMobileConfirm: ({ title, message, expectedLast4 }) => {
    return new Promise<boolean>(resolve => {
      const existing = get().mobileConfirmRequest;
      if (existing) existing.resolve(false);
      set({ mobileConfirmRequest: { title, message, expectedLast4, resolve } });
    });
  },

  resolveMobileConfirm: (confirmed) => {
    const req = get().mobileConfirmRequest;
    if (req) {
      req.resolve(confirmed);
      set({ mobileConfirmRequest: null });
    }
  },
}));
