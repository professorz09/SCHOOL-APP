import { Client } from 'pg';

const url = process.env.SUPABASE_URL!;
const password = process.env.SUPABASE_DB_PASSWORD!;
const ref = url.replace(/^https?:\/\//, '').split('.')[0];

const client = new Client({
  host: process.env.SUPABASE_DB_HOST ?? `aws-1-ap-northeast-1.pooler.supabase.com`,
  port: 5432,
  user: `postgres.${ref}`,
  password,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});
await client.connect();

console.log('--- All SELECT policies on transport_vehicles ---');
const pols = await client.query(`
  SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr
    FROM pg_policy
    WHERE polrelid = 'public.transport_vehicles'::regclass
`);
console.table(pols.rows);

console.log('\n--- RLS enabled? ---');
const rls = await client.query(`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = 'public.transport_vehicles'::regclass`);
console.table(rls.rows);

console.log('\n--- Helper functions ---');
const helpers = await client.query(`
  SELECT proname, pg_get_function_arguments(oid) AS args
    FROM pg_proc
    WHERE proname IN ('is_super_admin', 'current_user_role', 'current_user_school_id', 'driver_vehicle_ids', 'is_principal')
`);
console.table(helpers.rows);

console.log('\n--- Simulate principal SELECT (set role + GUC) ---');
await client.query(`SET LOCAL request.jwt.claim.sub = '0f9db571-b8cd-45aa-ad61-da063f35ad34'`);
await client.query(`SET LOCAL request.jwt.claims = '{"sub":"0f9db571-b8cd-45aa-ad61-da063f35ad34","role":"authenticated"}'`);
await client.query(`SET LOCAL ROLE authenticated`);
const sim = await client.query(`SELECT id, vehicle_no, school_id, is_active FROM public.transport_vehicles WHERE vehicle_no = 'Gn-204'`);
console.log('Rows visible to principal:', sim.rows.length);
console.table(sim.rows);

await client.query(`RESET ROLE`);
await client.end();
