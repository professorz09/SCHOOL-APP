// Migration 0036 — School Simple Billing
// Run with: npx tsx scripts/migrate-0036.ts
// DB: aws-1-ap-northeast-1.pooler.supabase.com:5432

import { Pool } from 'pg';

const pool = new Pool({
  host: 'aws-1-ap-northeast-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.mpjyupcszzsorjgslbkr',
  password: process.env.SUPABASE_DB_PASSWORD,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(`ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS billing_fixed_amount BIGINT NOT NULL DEFAULT 0`);
    console.log('✓ billing_fixed_amount column');

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.school_fee_payments (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        school_id  UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
        amount     BIGINT NOT NULL CHECK (amount > 0),
        paid_on    DATE NOT NULL DEFAULT CURRENT_DATE,
        note       TEXT,
        created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('✓ school_fee_payments table');

    await client.query(`CREATE INDEX IF NOT EXISTS sfp_school_idx  ON public.school_fee_payments(school_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS sfp_paid_on_idx ON public.school_fee_payments(school_id, paid_on DESC)`);
    console.log('✓ indexes');

    await client.query(`ALTER TABLE public.school_fee_payments ENABLE ROW LEVEL SECURITY`);
    await client.query(`DROP POLICY IF EXISTS sfp_superadmin_all ON public.school_fee_payments`);
    await client.query(`
      CREATE POLICY sfp_superadmin_all ON public.school_fee_payments
        FOR ALL TO authenticated
        USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'SUPER_ADMIN'))
        WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'SUPER_ADMIN'))
    `);
    console.log('✓ RLS policy');
    console.log('Migration 0036 complete!');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(e => { console.error('Migration failed:', e.message); process.exit(1); });
