import type { Request, Response, NextFunction } from 'express';
import { adminDb } from '../lib/db';
import { ApiError, fail } from '../lib/helpers';

export interface AuthUser {
  id: string;
  role: string;
  school_id: string | null;
  name: string;
  editor_mode_until: string | null;
  first_login_changed: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user: AuthUser;
      jwt: string;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw new ApiError(401, 'Authorization token required');

    const { data: { user }, error } = await adminDb.auth.getUser(token);
    if (error || !user) throw new ApiError(401, 'Invalid or expired token');

    const { data: profile, error: pe } = await adminDb
      .from('users')
      .select('id, role, school_id, name, editor_mode_until, first_login_changed')
      .eq('id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (pe || !profile) throw new ApiError(401, 'User profile not found or inactive');

    req.user = profile as AuthUser;
    req.jwt  = token;

    // First-login password gate. Until the user has changed the default
    // (mobile-as-password for parents, similar for staff), every API write
    // is refused except the change-password / me / logout endpoints. The
    // client already routes through FirstLoginPasswordChange via
    // App.tsx:246, but a JWT obtained outside the UI could still hit
    // /api/* directly — this closes the gap server-side without touching
    // any individual route. originalUrl is the full path including the
    // /api/auth prefix; safer than req.path which is router-relative.
    const allowedBeforeChange = new Set([
      '/api/auth/change-password',
      '/api/auth/me',
      '/api/auth/logout',
    ]);
    if (!profile.first_login_changed && !allowedBeforeChange.has(req.originalUrl.split('?')[0])) {
      throw new ApiError(403, 'Password change required before continuing');
    }

    next();
  } catch (err) {
    fail(res, err);
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!roles.includes(req.user?.role)) {
      return fail(res, new ApiError(403, `Role '${req.user?.role}' not allowed. Required: ${roles.join(' | ')}`));
    }
    next();
  };
}

/**
 * Server-side Editor Mode gate. Reads `users.editor_mode_until` (set by the
 * RPC `enable_editor_mode`) and rejects unless the window is active. Routes
 * that previously trusted `body.editorMode` should be wrapped in this so a
 * direct API caller can't bypass the UI gating.
 */
export function requireEditorMode(req: Request, res: Response, next: NextFunction) {
  const until = req.user?.editor_mode_until;
  if (!until || new Date(until).getTime() < Date.now()) {
    return fail(res, new ApiError(403, 'Editor Mode not active — enable it from the principal dashboard first'));
  }
  next();
}

/** Boolean helper for routes that need to log "was editor mode active?" without 403'ing. */
export function isEditorModeActive(req: Request): boolean {
  const until = req.user?.editor_mode_until;
  return !!until && new Date(until).getTime() >= Date.now();
}
