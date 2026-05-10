// Concatenate every SQL migration file under supabase/migrations into a single
// idempotent supabase/_apply.sql.  Then run `npm run db:apply` to execute it
// against the project (uses SUPABASE_DB_PASSWORD via the Supavisor pooler).
// As a fallback, the file can also be pasted into the Supabase Dashboard SQL
// Editor.
//
// Usage: tsx scripts/migrate.ts
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'supabase', 'migrations');
const OUT_FILE = join(__dirname, '..', 'supabase', '_apply.sql');

function main() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.error('No migration files found in supabase/migrations/');
    process.exit(1);
  }

  const banner = (label: string) =>
    `\n-- =============================================================\n-- ${label}\n-- =============================================================\n`;

  let combined = '-- Auto-generated. Do not edit. Re-run `npm run db:migrate` to refresh.\n';
  for (const f of files) {
    combined += banner(f);
    combined += readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
    combined += '\n';
  }
  writeFileSync(OUT_FILE, combined, 'utf8');

  const projectRef =
    (process.env.SUPABASE_URL ?? '').match(/https?:\/\/([^.]+)\./)?.[1] ?? null;
  const dashboardUrl = projectRef
    ? `https://supabase.com/dashboard/project/${projectRef}/sql/new`
    : 'https://supabase.com/dashboard';

  console.log('\n✅ Combined migration written to: supabase/_apply.sql');
  console.log(`   (${files.length} file${files.length === 1 ? '' : 's'}, ${combined.length} chars)`);
  console.log('\n👉  Apply the schema:');
  console.log('   Preferred (requires SUPABASE_DB_PASSWORD):');
  console.log('     npm run db:apply');
  console.log('   Fallback (manual paste in the Dashboard SQL Editor):');
  console.log(`     1. Open: ${dashboardUrl}`);
  console.log('     2. Paste the contents of supabase/_apply.sql');
  console.log('     3. Click "Run"');
  console.log('\n   After it succeeds, manually create your first super-admin');
  console.log('   via the Supabase dashboard (auth.users + public.users row).');
}

main();
