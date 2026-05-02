import type { Request, Response, NextFunction } from 'express';
import { adminDb } from '../lib/db';
import { ApiError, fail } from '../lib/helpers';

export interface AuthUser {
  id: string;
  role: string;
  school_id: string | null;
  name: string;
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
      .select('id, role, school_id, name')
      .eq('id', user.id)
      .eq('is_active', true)
      .single();

    if (pe || !profile) throw new ApiError(401, 'User profile not found or inactive');

    req.user = profile as AuthUser;
    req.jwt  = token;
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
