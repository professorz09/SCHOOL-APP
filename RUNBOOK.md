# RUNBOOK — Incident Response & Recovery

When something goes wrong in production, start here. Each section is a self-contained playbook.

> **Before anything:** the source of truth is the code. If this doc disagrees with what you see in [`server/routes/`](server/routes/) or [`supabase/migrations/`](supabase/migrations/), trust the code and update the doc.

---

## Contents

1. [Backups — what exists and how to restore](#1-backups)
2. [Migration applied wrong / broke production](#2-migration-rollback)
3. [Service-role key compromised](#3-service-role-key-rotation)
4. [Principal locked out / lost device](#4-principal-account-recovery)
5. [Wrong fee payment recorded](#5-wrong-fee-payment-recorded)
6. [Wrong attendance submitted](#6-wrong-attendance-submitted)
7. [Realtime stopped firing](#7-realtime-stopped-firing)
8. [Vercel deploy failed](#8-vercel-deploy-failed)
9. [Supabase Auth quota / rate limit](#9-supabase-auth-quota)

---

## 1. Backups

### What exists today

| Layer | Mechanism | Retention | Restore path |
|---|---|---|---|
| **Supabase Postgres** | Automatic daily snapshots (Supabase Pro plan) | 7 days (Pro), 30 days (Team) | Supabase Dashboard → Project Settings → Database → Backups → Restore. **Restores the WHOLE project to a point in time** — no per-table restore |
| **Per-school export** | [`/api/admin/schools/:id/backup`](server/routes/admin-schools.ts) endpoint | On-demand, super-admin triggers | Returns a JSON blob with all tenant tables. Save somewhere safe (S3, Google Drive). Not automated yet |
| **Migrations** | Git history in this repo | Forever | Re-apply via `npm run db:migrate` or paste into Supabase SQL Editor |
| **Audit trail** | `audit_logs` table (rotated weekly by cron) | ~6 months by default | Read-only — used for forensics, not restore |

### What's missing
- ❌ No automated off-Supabase backup. If Supabase goes down or your account is locked, you have no copy
- ❌ No documented restore drill. **Do a restore rehearsal at least once a quarter**
- ❌ Per-school backup endpoint is on-demand only. Should be cron'd

### Manual off-Supabase backup (recommended weekly)

```bash
# Set in your local shell, never commit
export SUPABASE_URL='https://<project>.supabase.co'
export SUPABASE_SERVICE_ROLE_KEY='<service-role-key>'

# Export each tenant table to JSON. Heavy tables get paginated.
curl -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
     "$SUPABASE_URL/rest/v1/students?select=*" \
     -o "backup-$(date +%F)-students.json"
# Repeat for: staff, fee_installments, payment_records, attendance_records,
# attendance_student_details, exam_results, audit_logs, schools, academic_years
```

Store in a separate cloud bucket (NOT the Supabase storage). Rotate weekly.

### Restore from Supabase snapshot

1. Supabase Dashboard → Project → Database → Backups
2. Pick the closest snapshot before the bad change
3. Click **Restore** — this **wipes the current DB** and replaces it with the snapshot
4. Wait ~5-15 min for restore to complete
5. **Re-apply any migrations** that ran AFTER the snapshot was taken (check git log)
6. Verify: log in as super-admin, spot-check one school's fee ledger + attendance + audit trail

> **Restore is destructive.** Take an export of the current (broken) state first, in case you need to cherry-pick recent legit data after the restore.

---

## 2. Migration rollback

Migrations in this repo are **idempotent** but not always reversible. Most schema additions can be reversed; status / data changes are harder.

### If a migration is broken (e.g. RLS too tight, RPC raises wrong error)

**Fix-forward, don't roll back.** Write a new migration that overrides the bad behaviour.

Example: migration `0136` broke status logic.
- Wrong path: edit `0136` and re-run. The `supabase_migrations` table thinks it's applied, so it won't re-run anyway
- Right path: write `0136a` (or next number) with a corrected `CREATE OR REPLACE FUNCTION` that supersedes the bad one

Every RPC redefinition is `CREATE OR REPLACE FUNCTION` — re-applying is safe.

### If a migration corrupted data

1. Identify the affected rows (`SELECT … WHERE updated_at > '<migration-apply-time>'`)
2. **Take a backup snapshot of the affected table** before fixing
3. Restore the affected rows from the latest Supabase backup using `pg_dump` of the snapshot — Supabase support can help here for partial restores
4. Write a corrective migration that fixes any in-flight transitions

### If migrations are stuck (won't apply)

```sql
-- Check what Supabase thinks is applied
SELECT * FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 20;

-- If a migration is missing from the table but was actually applied,
-- insert the row manually (key is the filename stem):
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('0140', 'reverse_payment_daily_cap_lock');
```

---

## 3. Service-role key rotation

### Signs the key may be compromised
- Pasted into chat / Slack / a screenshot
- Committed to git (even briefly)
- Leaked in logs (audit recently flagged this — fixed in commit `fe1f857`)
- Devops handover; old admin had it

### Rotate procedure (do NOT skip any step)

1. **Generate the new key** in Supabase Dashboard → Project Settings → API → Service Role
2. **Update Vercel env vars** for production AND any preview environments
3. **Redeploy** — Vercel does NOT auto-restart on env var change for in-flight functions. Trigger a fresh deploy
4. **Revoke the old key** in Supabase Dashboard → API → "Rotate"
5. **Verify**: tail Vercel function logs for ~10 min, watch for 401s from anything still using the old key
6. **Document the rotation** in `audit_logs` manually:
   ```sql
   INSERT INTO public.audit_logs (action, entity_type, details, created_at)
   VALUES ('service_role_rotated', 'system',
           jsonb_build_object('reason', '<why>'), NOW());
   ```

### Where the key lives
- ✅ Vercel env: `SUPABASE_SERVICE_ROLE_KEY`
- ✅ Local dev: `.env` (gitignored)
- ❌ **Never** in client bundle (would expose every tenant). [server/lib/db.ts](server/lib/db.ts) verifies the key is a service-role JWT and refuses anon

---

## 4. Principal account recovery

### Lost password (principal can log in via mobile)
Super-admin can reset via UI: super-admin → Schools → pick → Reset Principal Password. Calls [`/api/admin/schools/:id/reset-principal-password`](server/routes/admin-schools.ts).

### Principal lost the mobile number itself
1. Super-admin → Schools → pick → Update Principal Mobile. Calls [`/api/admin/schools/:id/update-principal-mobile`](server/routes/admin-schools.ts)
2. Auth row's email is updated (mobile-as-email pattern)
3. New mobile must be unused across the platform — `users.mobile_number` is `UNIQUE`

### Principal account locked (8 fails / 15 min)
- Wait 15 min — lockout auto-clears
- Or have super-admin reset the password (clears the lockout counter as a side effect)

### Principal cannot enable Editor Mode
- Check `users.editor_mode_until` directly:
  ```sql
  SELECT id, name, role, editor_mode_until FROM users WHERE role='PRINCIPAL';
  ```
- If a stale value blocks the new enable call, manually clear:
  ```sql
  UPDATE users SET editor_mode_until = NULL WHERE id = '<principal-uuid>';
  ```
- Then have them tap Enable again in the UI

---

## 5. Wrong fee payment recorded

### Same day (≤ 24 h, IST same calendar day)
Principal: FeeLedger → tap the payment → **Reverse**. Requires:
- Editor Mode active
- Reason ≥ 3 chars
- Same IST calendar day
- ≤ 3 reversals/day per principal (enforced inside [migration 0140](supabase/migrations/0140_reverse_payment_daily_cap_lock.sql))

### After 24 h
**Reversal is disabled by design.** Use one of:
1. Record a write-off equal to the wrong amount with reason "wrong entry, refunded externally"
2. If both reverse + write-off are blocked, ops can manually edit `payment_records` and `payment_installment_links`:
   ```sql
   -- Document this in audit_logs immediately:
   INSERT INTO public.audit_logs (action, entity_type, entity_id, details)
   VALUES ('manual_payment_correction', 'payment_record', '<id>',
           jsonb_build_object('reason', '<…>', 'old_amount', X, 'new_amount', Y));

   UPDATE public.payment_records SET amount = Y WHERE id = '<id>';
   -- Then refresh aggregates:
   SELECT public.refresh_student_fee_aggregate('<student-id>');
   ```

### Reconciliation drift detected
A student's `student_academic_records.paid_fee` doesn't match `SUM(payment_records.amount)`. Recompute:

```sql
SELECT public.refresh_student_fee_aggregate('<student-id>');
```

If drift persists across many students, run for all in the active year:

```sql
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT student_id FROM public.student_academic_records
    WHERE academic_year_id = (SELECT id FROM public.academic_years WHERE is_active AND school_id='<sid>')
  LOOP
    PERFORM public.refresh_student_fee_aggregate(r.student_id);
  END LOOP;
END $$;
```

---

## 6. Wrong attendance submitted

### Within the same day
Principal: AttendanceManager → pick date+section → **Edit & Resubmit**. This re-runs `submit_attendance_atomic` ([migration 0139](supabase/migrations/0139_attendance_submit_atomic.sql)) which atomically replaces the children.

### After the day (record is locked)
1. Principal must enable Editor Mode
2. AttendanceManager → pick date+section → **Edit** (Editor Mode unlocks the form)
3. Resubmit
4. Audit row written automatically

The [`attsd_recompute_pct`](supabase/migrations/0138_attendance_percent_trigger.sql) trigger keeps `attendance_percent` in sync — no manual recompute needed.

---

## 7. Realtime stopped firing

### Symptom
Principal makes a payment in tab A; tab B doesn't update without manual refresh.

### Check
1. Browser console for WebSocket errors (Supabase Realtime uses WSS)
2. In Supabase Dashboard → Database → Replication, verify the table is in the publication
3. Network tab → filter "Realtime" → look for `system` messages

### Common causes
- **School-switch staleness:** older builds pinned `schoolId` at first render. Fixed in commit `1782921`. Verify [`src/shared/hooks/useRealtimeTable.ts`](src/shared/hooks/useRealtimeTable.ts) uses `useAuthStore(s => s.session?.schoolId ?? null)` (selector, not `getState()`)
- **Supabase free tier connection limit hit** — 200 concurrent connections per project. Upgrade plan or check for leaked channels
- **RLS blocks the broadcast** — Realtime sends events filtered by RLS. If a recent RLS change tightened the read policy, the parent's tab won't see the event

### Force reconnect
Tell the user to hard-refresh (Ctrl+Shift+R). The hook teardown + resubscribe will recreate the channel.

---

## 8. Vercel deploy failed

### Build error
1. Check Vercel deploy logs — usually a typecheck failure
2. Reproduce locally: `npm ci && npm run lint && npm run build`
3. If local passes but Vercel fails: clear Vercel build cache (Project Settings → General → Clear Build Cache)

### Function exceeds size limit
Vercel hard limit: 50 MB per function (zipped). If [`api/index.js`](api/index.js) crosses this:
1. Check bundle: `npx esbuild server/vercel-handler.ts --bundle --platform=node --target=node20 --analyze`
2. Look for accidentally bundled big deps (chart libs, full lodash, etc.)
3. Mark dev-only deps as `external` in the esbuild command

### Runtime errors after deploy
1. Vercel Dashboard → Functions → check Logs
2. Common: missing env var. Compare `.env.example` (if present) to Vercel's env-vars list
3. If a route just rolled out and 500s, **revert via Vercel Dashboard → Deployments → previous → Promote to Production**

---

## 9. Supabase Auth quota

### Signs
- New signups failing with "rate limited"
- Email confirmation links failing

### Limits to know (Supabase Free tier)
- 50 sign-ups per hour from the same IP
- 30 password resets per hour per user
- 100 sign-ins per IP per 5 min

### Fix
- Upgrade to Pro plan (≥ 100k MAU bundled)
- Or if it's an attack, check `/api/auth/login` rate limiter ([authLimiter](server/app.ts)) and tighten

---

## Quick reference — common SQL forensics

```sql
-- All reversals today by a specific principal
SELECT created_at, entity_id, details
  FROM audit_logs
 WHERE user_id = '<principal-uuid>'
   AND action = 'fee_payment_reversed'
   AND created_at >= (now() AT TIME ZONE 'Asia/Kolkata')::date::timestamptz
 ORDER BY created_at DESC;

-- Payment vs installment mismatch for one student
SELECT i.id, i.month, i.amount, i.paid_amount, i.write_off_amount,
       (SELECT COALESCE(SUM(amount_applied), 0)
        FROM payment_installment_links WHERE installment_id = i.id) AS sum_links
  FROM fee_installments i
 WHERE i.student_id = '<student-uuid>'
 ORDER BY due_date;

-- Schools that have been soft-deleted
SELECT id, name, code, deleted_at FROM schools WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC;

-- Active sessions for a user (if you suspect a stale JWT)
SELECT id, refresh_token FROM auth.sessions WHERE user_id = '<uuid>' AND not_after > now();
```

---

## When in doubt

1. **Take a backup before touching anything.** `pg_dump` on Supabase or Dashboard → Backups → "Create snapshot"
2. **Read [ARCHITECTURE.md §8.9](ARCHITECTURE.md#89-common-bugs--gotchas)** for known fee gotchas
3. **Don't run destructive SQL without `BEGIN; … ; ROLLBACK;` first** to verify the row count
4. **If money is involved, write an audit_logs entry** before AND after the manual fix. Future-you needs it
