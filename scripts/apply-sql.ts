import { Client } from 'pg';
import { readFileSync } from 'fs';

const url = process.env.SUPABASE_URL;
const password = process.env.SUPABASE_DB_PASSWORD;
if (!url || !password) {
  console.error('Missing SUPABASE_URL or SUPABASE_DB_PASSWORD');
  process.exit(1);
}
const ref = url.replace(/^https?:\/\//, '').split('.')[0];

const sql = readFileSync('supabase/_apply.sql', 'utf-8');
console.log(`Project ref: ${ref}, SQL bytes: ${sql.length}`);

const regions = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'ap-south-1', 'ap-southeast-1', 'ap-southeast-2',
  'ap-northeast-1', 'ap-northeast-2',
  'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-north-1',
  'sa-east-1', 'ca-central-1',
];
const candidates: { host: string; port: number; user: string }[] = [];
const cachedHost = process.env.SUPABASE_DB_HOST;
if (cachedHost) {
  candidates.push({ host: cachedHost, port: 5432, user: `postgres.${ref}` });
}
candidates.push({ host: `db.${ref}.supabase.co`, port: 5432, user: 'postgres' });
for (const region of regions) {
  for (const prefix of ['aws-0', 'aws-1']) {
    const host = `${prefix}-${region}.pooler.supabase.com`;
    if (host === cachedHost) continue;
    candidates.push({ host, port: 5432, user: `postgres.${ref}` });
  }
}

let conn: Client | null = null;
let used: { host: string; user: string } | null = null;
for (const c of candidates) {
  const client = new Client({
    host: c.host,
    port: c.port,
    user: c.user,
    password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
    statement_timeout: 120000,
  });
  try {
    await client.connect();
    await client.query('SELECT 1');
    conn = client;
    used = { host: c.host, user: c.user };
    console.log(`✓ Connected via ${c.host} (user=${c.user})`);
    break;
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    console.log(`✗ ${c.host}: ${err.code || err.message?.slice(0, 80)}`);
    try { await client.end(); } catch {}
  }
}

if (!conn) {
  console.error('No working Postgres host found.');
  process.exit(1);
}

try {
  console.log('Applying SQL...');
  await conn.query(sql);
  console.log('✓ SQL applied successfully via', used?.host);
} catch (e: unknown) {
  const err = e as { message?: string; position?: string; detail?: string };
  console.error('SQL failed:', err.message);
  if (err.position) console.error('  position:', err.position);
  if (err.detail) console.error('  detail:', err.detail);
  process.exit(1);
} finally {
  await conn.end();
}
