-- 0098_school_billing_installments.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Replaces the old school_billings / billing_years / school_payments
-- system with a much simpler model: super-admin manually adds payment
-- installments for any school + any academic year (name + amount + due
-- date), then marks each one paid as the school pays.
--
-- Old tables are NOT dropped here — leaving them behind keeps existing
-- audit history readable and lets us roll back the UI without losing
-- data. They just become unreferenced by the live UI.
--
-- RLS: super-admin only. Schools / principals never see this table.

CREATE TABLE IF NOT EXISTS public.school_billing_installments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id  UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  description       TEXT,
  amount            BIGINT NOT NULL CHECK (amount >= 0),
  due_date          DATE NOT NULL,
  paid_amount       BIGINT NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  paid_at           TIMESTAMPTZ,
  paid_method       TEXT,
  paid_note         TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        UUID REFERENCES public.users(id) ON DELETE SET NULL
);

-- Idempotent column add for environments where the table already existed
-- without the description column (early adopters of 0098).
ALTER TABLE public.school_billing_installments
  ADD COLUMN IF NOT EXISTS description TEXT;

CREATE INDEX IF NOT EXISTS school_billing_installments_school_year_idx
  ON public.school_billing_installments(school_id, academic_year_id);

CREATE INDEX IF NOT EXISTS school_billing_installments_due_idx
  ON public.school_billing_installments(due_date);

ALTER TABLE public.school_billing_installments ENABLE ROW LEVEL SECURITY;

-- super_admin can do everything; everyone else is locked out.
DROP POLICY IF EXISTS sbi_super_admin_all ON public.school_billing_installments;
CREATE POLICY sbi_super_admin_all
  ON public.school_billing_installments
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- updated_at trigger
CREATE OR REPLACE FUNCTION public._touch_sbi_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_sbi_updated_at ON public.school_billing_installments;
CREATE TRIGGER trg_sbi_updated_at
  BEFORE UPDATE ON public.school_billing_installments
  FOR EACH ROW EXECUTE FUNCTION public._touch_sbi_updated_at();
