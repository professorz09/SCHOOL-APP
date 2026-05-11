-- 0111_drop_legacy_billing_tables.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Drop the legacy super-admin billing schema. The current flat billing
-- model (migration 0098 + 0104) uses only:
--   • schools.billing_fixed_amount         — already dropped in 0104
--   • school_billing_installments          — keep
--
-- These three tables predate the rewrite and are no longer referenced
-- anywhere in src/ or server/ (greppable proof: zero hits).
--
--   • school_billing_years        — per-school-per-year totals
--   • school_billing_schedules    — per-school annual amount schedule
--   • school_payment_allocations  — split of a payment across years
--
-- CASCADE removes any leftover FKs from sibling tables that pointed
-- back at these (none currently).

DROP TABLE IF EXISTS public.school_payment_allocations CASCADE;
DROP TABLE IF EXISTS public.school_billing_schedules  CASCADE;
DROP TABLE IF EXISTS public.school_billing_years      CASCADE;
