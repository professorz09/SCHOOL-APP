// Idempotent seed: creates the initial Super Admin account.
// Mobile: 9999999999, Password: admin@123, must change password on first login.
//
// Usage: tsx scripts/seed-super-admin.ts
import { adminClient } from './supabase-admin';

const MOBILE = '9999999999';
const PASSWORD = 'admin@123';
const EMAIL = `${MOBILE}@edugrow.local`;
const NAME = 'Super Admin';

async function main() {
  // 1. Check if an active SUPER_ADMIN already exists.
  const { data: existing, error: checkErr } = await adminClient
    .from('users')
    .select('id, mobile_number, role')
    .eq('role', 'SUPER_ADMIN')
    .eq('is_active', true)
    .maybeSingle();

  if (checkErr && checkErr.code !== 'PGRST116') {
    throw checkErr;
  }
  if (existing) {
    console.log(
      `✓ Super Admin already exists (id=${existing.id}, mobile=${existing.mobile_number}). Skipping.`
    );
    return;
  }

  // 2. Find or create the auth.users row for this mobile/email.
  let userId: string | null = null;
  {
    const { data: list, error } = await adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (error) throw error;
    const found = list.users.find((u: { email?: string | null; id: string }) => u.email === EMAIL);
    if (found) userId = found.id;
  }

  if (!userId) {
    const { data, error } = await adminClient.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { mobile_number: MOBILE, name: NAME, role: 'SUPER_ADMIN' },
    });
    if (error) throw error;
    userId = data.user.id;
    console.log(`✓ Created auth user (id=${userId})`);
  } else {
    console.log(`✓ Reusing existing auth user (id=${userId})`);
  }

  // 3. Upsert the public.users profile row.
  const { error: upsertErr } = await adminClient.from('users').upsert(
    {
      id: userId,
      mobile_number: MOBILE,
      role: 'SUPER_ADMIN',
      name: NAME,
      email: EMAIL,
      first_login_changed: false,
      is_active: true,
    },
    { onConflict: 'id' }
  );
  if (upsertErr) throw upsertErr;

  console.log('\n✅ Super Admin seeded.');
  console.log(`   Mobile:   ${MOBILE}`);
  console.log(`   Password: ${PASSWORD}  (must change on first login)`);
}

main().catch((err) => {
  console.error('\n❌ Seed failed:');
  console.error(err.message ?? err);
  process.exit(1);
});
