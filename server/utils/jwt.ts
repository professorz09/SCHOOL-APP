import jwt from 'jsonwebtoken';

let _secret: string | null = null;

function getSecret(): string {
  if (_secret) return _secret;
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET environment variable is required in production');
    }
    console.warn('⚠️  JWT_SECRET not set — using insecure default (development only)');
    _secret = 'school_app_dev_secret_do_not_use_in_production';
  } else {
    _secret = secret;
  }
  return _secret;
}

export interface JwtPayload {
  userId: number;
  role: string;
  schoolId: number | null;
  mobileNumber: string;
  name: string;
  mustChangePassword: boolean;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: '7d' });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, getSecret()) as JwtPayload;
}
