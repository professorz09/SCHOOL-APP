// scripts/wipe-tenant-data.ts
//
// One-shot cleanup that resets the database to a "factory" state:
//   • removes every school and all of its school-scoped data (cascades),
//   • removes every non-SUPER_ADMIN user (and the corresponding
//     auth.users row so they can no longer log in),
//   • clears audit_logs (which has NO ACTION FKs and would block the
//     above otherwise),
//   • leaves SUPER_ADMIN identities untouched.
//
// Run with --confirm to actually execute. Without it, prints the counts
// it *would* delete and exits.
//
// Usage:  tsx scripts/wipe-tenant-data.ts --confirm

import 'dotenv/config';
import { Client } from 'pg';

const url = process.env.SUPABASE_URL;
const password = process.env.SUPABASE_DB_PASSWORD;
if (!url || !password) {
  console.error('Missing SUPABASE_URL or SUPABASE_DB_PASSWORD');
  process.exit(1);
}
const ref = url.replace(/^https?:\/\//, '').split('.')[0];
const confirmed = process.argv.includes('--confirm');

const cachedHost = process.env.SUPABASE_DB_HOST;
const candidates: { host: string; port: number; user: string }[] = [];
if (cachedHost) candidates.push({ host: cachedHost, port: 5432, user: `postgres.${ref}` });
candidates.push({ host: `db.${ref}.supabase.co`, port: 5432, user: 'postgres' });
const regions = [
  'ap-northeast-1', 'ap-northeast-2', 'ap-south-1', 'ap-southeast-1',
  'ap-southeast-2', 'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-north-1',
  'sa-east-1', 'ca-central-1',
];
for (const region of regions) {
  for (const prefix of ['aws-1', 'aws-0']) {
    const host = `${prefix}-${region}.pooler.supabase.com`;
    if (host === cachedHost) continue;
    candidates.push({ host, port: 5432, user: `postgres.${ref}` });
  }
}

let conn: Client | null = null;
for (const c of candidates) {
  const client = new Client({
    host: c.host, port: c.port, user: c.user, password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
    statement_timeout: 120000,
  });
  try {
    await client.connect();
    await client.query('SELECT 1');
    conn = client;
    console.log(`✓ Connected via ${c.host}`);
    break;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    console.log(`✗ ${c.host}: ${err.code || err.message?.slice(0, 80)}`);
    try { await client.end(); } catch {}
  }
}
if (!conn) { console.error('No working Postgres host found.'); process.exit(1); }

async function count(table: string, where = ''): Promise<number> {
  const { rows } = await conn!.query(`SELECT COUNT(*)::int AS n FROM ${table} ${where}`);
  return rows[0]?.n ?? 0;
}

try {
  console.log('\n── BEFORE ──────────────────────────────────────────────');
  const beforeSchools  = await count('public.schools');
  const beforeAudit    = await count('public.audit_logs');
  const beforeAdmins   = await count('public.users', `WHERE role = 'SUPER_ADMIN'`);
  const beforeOthers   = await count('public.users', `WHERE role <> 'SUPER_ADMIN'`);
  const beforeAuth     = await count('auth.users');
  console.log(`  schools           : ${beforeSchools}`);
  console.log(`  audit_logs        : ${beforeAudit}`);
  console.log(`  users SUPER_ADMIN : ${beforeAdmins}  (will be KEPT)`);
  console.log(`  users other roles : ${beforeOthers}  (will be DELETED)`);
  console.log(`  auth.users (total): ${beforeAuth}`);

  if (beforeAdmins === 0) {
    console.error('\n✗ No SUPER_ADMIN found — refusing to wipe (would lock you out).');
    console.error('  Run scripts/seed-super-admin.ts first.');
    process.exit(2);
  }

  if (!confirmed) {
    console.log('\nDry run only. Pass --confirm to actually delete.');
    process.exit(0);
  }

  console.log('\n── DELETING ────────────────────────────────────────────');
  await conn.query('BEGIN');
  // Permanent-identity triggers block hard deletes; suspend for the
  // duration of this transaction. Cascading deletes from schools also
  // fire BEFORE DELETE on students/staff/users.
  await conn.query('ALTER TABLE public.users    DISABLE TRIGGER users_no_delete');
  await conn.query('ALTER TABLE public.students DISABLE TRIGGER students_no_delete');
  await conn.query('ALTER TABLE public.staff    DISABLE TRIGGER staff_no_delete');

  // audit_logs has NO ACTION FKs to schools/users — must clear first.
  await conn.query('DELETE FROM public.audit_logs');
  console.log('  ✓ audit_logs cleared');

  // Cascades to every school-scoped table (students, staff, fees, etc.).
  await conn.query('DELETE FROM public.schools');
  console.log('  ✓ schools (and cascaded children) cleared');

  // users.school_id is ON DELETE SET NULL, so non-admin users now have
  // NULL school_id. Remove them, but keep SUPER_ADMIN.
  const delUsers = await conn.query(
    `DELETE FROM public.users WHERE role <> 'SUPER_ADMIN' RETURNING id`,
  );
  console.log(`  ✓ public.users non-admin removed: ${delUsers.rowCount ?? 0}`);

  // Strip the matching auth.users so they can't log back in. Anything
  // already orphaned (no public.users row) is also removed.
  const delAuth = await conn.query(
    `DELETE FROM auth.users
     WHERE id NOT IN (SELECT id FROM public.users)`,
  );
  console.log(`  ✓ auth.users orphans removed: ${delAuth.rowCount ?? 0}`);

  await conn.query('ALTER TABLE public.users    ENABLE TRIGGER users_no_delete');
  await conn.query('ALTER TABLE public.students ENABLE TRIGGER students_no_delete');
  await conn.query('ALTER TABLE public.staff    ENABLE TRIGGER staff_no_delete');
  await conn.query('COMMIT');

  console.log('\n── AFTER ───────────────────────────────────────────────');
  console.log(`  schools           : ${await count('public.schools')}`);
  console.log(`  audit_logs        : ${await count('public.audit_logs')}`);
  console.log(`  users SUPER_ADMIN : ${await count('public.users', `WHERE role = 'SUPER_ADMIN'`)}`);
  console.log(`  users other roles : ${await count('public.users', `WHERE role <> 'SUPER_ADMIN'`)}`);
  console.log(`  auth.users (total): ${await count('auth.users')}`);
  console.log('\n✓ Cleanup complete.');
} catch (e) {
  await conn.query('ROLLBACK').catch(() => {});
  const err = e as { message?: string; detail?: string };
  console.error('\n✗ Failed:', err.message);
  if (err.detail) console.error('  detail:', err.detail);
  process.exit(1);
} finally {
  await conn.end();
}
