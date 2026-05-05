import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { authRouter }         from './routes/auth';
import { academicYearRouter } from './routes/academic-year';
import { studentsRouter }     from './routes/students';
import { feesRouter }         from './routes/fees';
import { transportRouter }    from './routes/transport';
import { attendanceRouter }   from './routes/attendance';
import { examsRouter }        from './routes/exams';
import { promotionRouter }    from './routes/promotion';
import { teacherRouter }      from './routes/teacher';
import { settingsRouter }     from './routes/settings';
import { staffRouter }        from './routes/staff';
import { timetableRouter }    from './routes/timetable';
import { principalRouter }    from './routes/principal';
import { adminSchoolsRouter } from './routes/admin-schools';
import { aiRouter }           from './routes/ai';

export const app = express();

// Trust the first proxy hop so rate-limit & req.ip use forwarded headers
// without making spoofing trivial. Tighten if running behind a different
// number of proxies.
app.set('trust proxy', 1);

// Build a strict-but-workable CSP. Tailwind ships utility classes in the
// bundle, so style-src needs 'unsafe-inline' for runtime <style> tags from
// frameworks; script-src does NOT include 'unsafe-inline' so a stored XSS
// payload cannot execute via injected <script>. connect-src includes the
// Supabase host (env-driven) so the SDK can reach the REST/realtime endpoints.
const supabaseHost = (() => {
  try { return new URL(process.env.SUPABASE_URL ?? '').origin; }
  catch { return ''; }
})();
const cspConnectSrc = ["'self'", supabaseHost, 'https://*.supabase.co', 'wss://*.supabase.co']
  .filter(Boolean);

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src':  ["'self'"],
      'style-src':   ["'self'", "'unsafe-inline'"],
      'img-src':     ["'self'", 'data:', 'blob:', 'https:'],
      'font-src':    ["'self'", 'data:'],
      'connect-src': cspConnectSrc,
      'frame-ancestors': ["'none'"],
      'object-src':  ["'none'"],
      'base-uri':    ["'self'"],
    },
  },
}));

// CORS allowlist. Pulls from env so prod can lock to known origins. Empty
// list (default) = same-origin only — denies cross-origin browser calls.
const allowedOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    // Same-origin / curl / server-to-server (no Origin header) → always allow.
    if (!origin) return cb(null, true);
    if (allowedOrigins.length === 0) return cb(null, false);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('CORS: origin not allowed'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Global rate limit — generous, just stops accidental flooding.
app.use('/api/', rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests — slow down' },
}));

// Auth-specific rate limit — much tighter to block credential stuffing
// and password-reset abuse.
const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'Too many auth attempts — try again later' },
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, version: '1.0', ts: new Date().toISOString() });
});

app.use('/api/auth',          authLimiter, authRouter);
app.use('/api/academic-year', academicYearRouter);
app.use('/api/students',      studentsRouter);
app.use('/api/fees',          feesRouter);
app.use('/api/transport',     transportRouter);
app.use('/api/attendance',    attendanceRouter);
app.use('/api/exam',          examsRouter);
app.use('/api/promotion',     promotionRouter);
app.use('/api/teacher',       teacherRouter);
app.use('/api/settings',      settingsRouter);
app.use('/api/staff',         staffRouter);
app.use('/api/timetable',     timetableRouter);
app.use('/api/principal',     principalRouter);
app.use('/api/admin/schools', adminSchoolsRouter);
app.use('/api/ai',            aiRouter);

app.use((_req, res) => {
  res.status(404).json({ ok: false, error: 'API route not found' });
});
