-- 0104_drop_legacy_billing.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Drops the leftover legacy super-admin billing surface. The new flat
-- school_billing_installments stack (migration 0098) replaced everything
-- below; nothing in the running UI or server reads these any more.
--
-- Dropped:
--   • table school_payments          (old per-school platform payments)
--   • table school_fee_payments      (old fixed-amount payment ledger)
--   • column schools.billing_fixed_amount (unused since 0098)
--
-- Kept (still referenced by code paths or audit history):
--   • schools.plan               (onboard_school RPC still accepts p_plan)
--   • schools.payment_start_date (set during onboarding for record-keeping)
--   • platform_settings table    (brand settings still live here)

DROP TABLE IF EXISTS public.school_payments      CASCADE;
DROP TABLE IF EXISTS public.school_fee_payments  CASCADE;

ALTER TABLE public.schools
  DROP COLUMN IF EXISTS billing_fixed_amount;
