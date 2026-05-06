-- Migration 0036: School Simple Billing
-- Adds a fixed monthly fee field to schools and a simple payment ledger.

-- Add monthly fixed billing amount to schools
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS billing_fixed_amount BIGINT NOT NULL DEFAULT 0;

-- Simple per-school payment ledger (no allocation complexity)
CREATE TABLE IF NOT EXISTS public.school_fee_payments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  amount     BIGINT NOT NULL CHECK (amount > 0),
  paid_on    DATE NOT NULL DEFAULT CURRENT_DATE,
  note       TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sfp_school_idx  ON public.school_fee_payments(school_id);
CREATE INDEX IF NOT EXISTS sfp_paid_on_idx ON public.school_fee_payments(school_id, paid_on DESC);

-- RLS: only SUPER_ADMIN can access this table
ALTER TABLE public.school_fee_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sfp_superadmin_all ON public.school_fee_payments;
CREATE POLICY sfp_superadmin_all ON public.school_fee_payments
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'SUPER_ADMIN')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'SUPER_ADMIN')
  );
