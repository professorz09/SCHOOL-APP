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
const checks = [
  ["users.editor_mode_until", `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='editor_mode_until') AS ok`],
  ["fn reverse_payment",      `SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname='reverse_payment') AS ok`],
  ["fn enable_editor_mode",   `SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname='enable_editor_mode') AS ok`],
  ["broadcasts_select policy",`SELECT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='broadcasts' AND policyname='broadcasts_select') AS ok`],
  ["complaints.student_id",   `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='complaints' AND column_name='student_id') AS ok`],
  ["platform_settings table", `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='platform_settings') AS ok`],
  ["plan_pricing seed",       `SELECT (SELECT count(*) FROM platform_settings WHERE key='plan_pricing') AS ok`],
];
for (const [name, sql] of checks) {
  const r = await client.query(sql);
  const v = r.rows[0]?.ok;
  console.log(`${v ? '✓' : '✗'}  ${name}: ${v}`);
}
await client.end();
