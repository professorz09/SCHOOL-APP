// Scheduled-task endpoints. Hit by Vercel Cron (vercel.json crons block)
// with a CRON_SECRET header so random callers can't grind these routes.
//
// All handlers here assume server-only execution — no user JWT involved.
// They use adminDb (service-role) which bypasses RLS.

import { Router, type Request, type Response } from 'express';
import { adminDb } from '../lib/db';

export const cronRouter = Router();

function authorised(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false; // misconfigured deploy — refuse.
  const got =
    req.headers['x-cron-secret']
    ?? (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  return typeof got === 'string' && got === expected;
}

// GET /api/cron/cleanup-audit-logs
// Vercel Cron only issues GET requests against the configured path, so
// this handler is GET. Calls public.cleanup_old_audit_logs(90) and
// returns the deleted row count for the cron run log.
cronRouter.get('/cleanup-audit-logs', async (req: Request, res: Response) => {
  if (!authorised(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorised' });
  }
  try {
    const { data, error } = await adminDb.rpc('cleanup_old_audit_logs', { p_days: 90 });
    if (error) throw new Error(error.message);
    const deleted = typeof data === 'number' ? data : Number(data ?? 0);
    // eslint-disable-next-line no-console
    console.log(`[cron] cleanup-audit-logs deleted=${deleted}`);
    return res.status(200).json({ ok: true, deleted });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'cleanup failed';
    return res.status(500).json({ ok: false, error: msg });
  }
});

// GET /api/cron/post-birthday-notices
// Inserts a personal "Happy Birthday" notice for every active student
// whose DOB month-day matches today (IST). Idempotent — re-running on
// the same day skips students already greeted. Zero per-school cost
// when no students have a birthday today.
cronRouter.get('/post-birthday-notices', async (req: Request, res: Response) => {
  if (!authorised(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorised' });
  }
  try {
    const { data, error } = await adminDb.rpc('post_birthday_notices');
    if (error) throw new Error(error.message);
    const inserted = typeof data === 'number' ? data : Number(data ?? 0);
    // eslint-disable-next-line no-console
    console.log(`[cron] post-birthday-notices inserted=${inserted}`);
    return res.status(200).json({ ok: true, inserted });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'birthday cron failed';
    return res.status(500).json({ ok: false, error: msg });
  }
});
