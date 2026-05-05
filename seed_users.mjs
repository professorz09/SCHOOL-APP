// Wipes auth + reseeds: 1 school + 6 test users (one per role) + scaffolding.
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import 'dotenv/config';

const url     = process.env.SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service) { console.error('missing env'); process.exit(1); }

// Refuse to run against anything that smells like production. The script
// destroys all auth users and schools, and (formerly) seeded with mobile-as-
// password credentials — extremely unsafe to run against a live database.
const ALLOW_SEED = process.env.ALLOW_SEED === 'true';
const PROD_HINTS = /(^|\.)prod|production|live/i;
if (!ALLOW_SEED && PROD_HINTS.test(url)) {
  console.error(`refusing to seed: SUPABASE_URL "${url}" looks like production. Set ALLOW_SEED=true to override.`);
  process.exit(1);
}
if (process.env.NODE_ENV === 'production' && !ALLOW_SEED) {
  console.error('refusing to seed in NODE_ENV=production. Set ALLOW_SEED=true to override.');
  process.exit(1);
}

// Strong random temp passwords — not the mobile number. Written to a local
// gitignored file so the dev who ran the script can copy them; never logged
// to console (which can leak via CI).
const genPassword = () => randomBytes(12).toString('base64url') + 'A1';

const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });

// 1. Wipe existing auth users via admin API
const { data: existing } = await admin.auth.admin.listUsers({ perPage: 200 });
console.log(`wiping ${existing.users.length} existing auth users…`);
for (const u of existing.users) {
  const { error } = await admin.auth.admin.deleteUser(u.id);
  if (error) console.error(`  del ${u.email}:`, error.message);
}
console.log('auth wiped');

// 2. Wipe public.schools (cascades through everything else; users + students etc were
//    already truncated earlier).
await admin.from('schools').delete().neq('id', '00000000-0000-0000-0000-000000000000');

// 3. Create test school
const schoolId = crypto.randomUUID();
const { error: schErr } = await admin.from('schools').insert({
  id: schoolId, name: 'Test School', code: 'TEST001',
  status: 'ACTIVE', plan: 'FREE',
  address: '123 Test Street', city: 'Test City', state: 'Test State', pin: '110001',
  phone: '9999900002', email: 'principal@test.local',
  principal_name: 'Principal Test', principal_email: 'principal@test.local', principal_phone: '9999900002',
});
if (schErr) { console.error('school insert failed:', schErr); process.exit(1); }
console.log('school created:', schoolId);

// PARENT === STUDENT-side login in this app — App.tsx routes both roles to
// StudentLayout. So we seed only one "student-side" auth user (PARENT role)
// linked to the actual student record in public.students.
const seeds = [
  { mobile: '9999900001', name: 'Super Admin',    role: 'SUPER_ADMIN', email: 'super@test.local' },
  { mobile: '9999900002', name: 'Principal Test', role: 'PRINCIPAL',   email: 'principal@test.local' },
  { mobile: '9999900003', name: 'Teacher Test',   role: 'TEACHER',     email: 'teacher@test.local' },
  { mobile: '9999900004', name: 'Student Login',  role: 'PARENT',      email: 'student@test.local' },
  { mobile: '9999900005', name: 'Driver Test',    role: 'DRIVER',      email: 'driver@test.local' },
];

const created = [];
const credentials = [];
for (const s of seeds) {
  const password = genPassword();
  const { data, error } = await admin.auth.admin.createUser({
    email: `${s.mobile}@edugrow.local`, password, email_confirm: true,
    user_metadata: { mobile: s.mobile, name: s.name, role: s.role },
  });
  if (error) { console.error(`auth fail for ${s.mobile}:`, error.message); process.exit(1); }
  console.log(`auth ✓ ${s.role.padEnd(12)} ${s.mobile}  id=${data.user.id}`);
  created.push({ ...s, id: data.user.id });
  credentials.push({ role: s.role, mobile: s.mobile, password });
}

// Persist credentials to a gitignored local file so the dev can read them.
try { mkdirSync('.local', { recursive: true }); } catch {}
writeFileSync('.local/seeded-credentials.json', JSON.stringify(credentials, null, 2));
console.log('\ncredentials written to .local/seeded-credentials.json (do NOT commit)');

const { error: uErr } = await admin.from('users').insert(created.map(u => ({
  id: u.id, mobile_number: u.mobile, role: u.role, name: u.name, email: u.email,
  school_id: u.role === 'SUPER_ADMIN' ? null : schoolId,
  first_login_changed: true, is_active: true,
})));
if (uErr) { console.error('public.users insert failed:', uErr); process.exit(1); }
console.log('public.users mirrors inserted');

// Academic scaffolding
const yearId = crypto.randomUUID();
await admin.from('academic_years').insert({
  id: yearId, school_id: schoolId, label: '2025-26',
  start_date: '2025-04-01', end_date: '2026-03-31',
  is_active: true, is_closed: false,
});
const sectionId = crypto.randomUUID();
await admin.from('sections').insert({
  id: sectionId, school_id: schoolId, academic_year_id: yearId,
  class_name: 'Class 1', section: 'A', capacity: 30,
});

const teacher = created.find(u => u.role === 'TEACHER');
const driver  = created.find(u => u.role === 'DRIVER');
const studentLogin = created.find(u => u.role === 'PARENT'); // unified student/parent login
const today   = new Date().toISOString().slice(0,10);

await admin.from('staff').insert([
  { school_id: schoolId, user_id: teacher.id, name: teacher.name, phone: teacher.mobile, role: 'TEACHER', subject: 'Mathematics', status: 'ACTIVE', salary: 25000, joining_date: today, is_active: true },
  { school_id: schoolId, user_id: driver.id,  name: driver.name,  phone: driver.mobile,  role: 'DRIVER',  status: 'ACTIVE', salary: 15000, joining_date: today, is_active: true },
]);

// Student record — separate identity from the parent's auth user. The parent
// logs in (mobile 9999900004) and sees this student via parent_student_links.
const studentPid = crypto.randomUUID();
await admin.from('students').insert({
  id: studentPid, school_id: schoolId,
  name: 'Aarav Sharma', admission_no: 'TEST-ADM-001',
  gender: 'MALE', dob: '2015-06-15', address: '123 Test Street',
  father_name: studentLogin.name, father_phone: studentLogin.mobile,
  mother_name: 'Priya Sharma', mother_phone: studentLogin.mobile,
  is_rte: false, is_active: true, status: 'ACTIVE', admission_date: today,
});
await admin.from('student_academic_records').insert({
  student_id: studentPid, academic_year_id: yearId, section_id: sectionId,
  class_name: 'Class 1', section: 'A', roll_no: 1, status: 'STUDYING',
});
await admin.from('parent_student_links').insert({
  parent_user_id: studentLogin.id, student_id: studentPid, relation: 'FATHER',
});

console.log('\nLogin probe:');
const principalCred = credentials.find(c => c.role === 'PRINCIPAL');
const probe = createClient(url, process.env.SUPABASE_ANON_KEY);
const { error } = await probe.auth.signInWithPassword({
  email: '9999900002@edugrow.local', password: principalCred.password,
});
if (error) console.error('  ✗ login failed:', error.message);
else console.log('  ✓ principal login works');
