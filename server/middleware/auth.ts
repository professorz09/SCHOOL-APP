import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload } from '../utils/jwt';

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = auth.slice(7);
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function requirePasswordChanged(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.mustChangePassword) {
    return res.status(403).json({ error: 'Password change required before accessing this resource', mustChangePassword: true });
  }
  next();
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

export function requireSchoolAccess(req: AuthRequest, res: Response, next: NextFunction) {
  const schoolId = parseInt(req.params.schoolId || req.body.schoolId);
  if (req.user?.role === 'SUPER_ADMIN') return next();
  if (req.user?.schoolId !== schoolId) {
    return res.status(403).json({ error: 'Access denied to this school' });
  }
  next();
}

// Middleware that restricts access to school staff roles (SUPER_ADMIN, PRINCIPAL, TEACHER)
export function requireSchoolStaff(req: AuthRequest, res: Response, next: NextFunction) {
  const staffRoles = ['SUPER_ADMIN', 'PRINCIPAL', 'TEACHER'];
  if (!req.user || !staffRoles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}
