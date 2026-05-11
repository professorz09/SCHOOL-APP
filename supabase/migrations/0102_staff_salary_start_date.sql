-- 0102_staff_salary_start_date.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Adds staff.salary_start_date — the month a staff member's *paid* salary
-- ledger begins, separate from joining_date.
--
-- Why: in real schools the joining day is rarely also the first paid day.
-- A teacher who joins on the 18th of October typically gets their first
-- salary in November (not a partial Oct + full Nov). The old ledger
-- used joining_date as the lower bound, which produced a phantom
-- "October full salary" row that principals had to manually reconcile.
--
-- Default rule: salary_start_date = first day of the month *after*
-- joining_date. Principals can override at create time or via the
-- existing edit-staff form.
--
-- Backfill: for every existing row, set salary_start_date to the first
-- of the joining month (so historical ledgers don't shift around). The
-- "next-month" default only applies to staff added going forward.

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS salary_start_date DATE;

UPDATE public.staff
   SET salary_start_date = date_trunc('month', joining_date)::DATE
 WHERE salary_start_date IS NULL
   AND joining_date IS NOT NULL;
