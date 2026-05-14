-- Default salary pay day to 7th of the month.
--
-- Reported: Salary Ledger header showed "SALARY DAY · not set" for
-- every school until the principal explicitly tapped Set. New schools
-- got NULL because the column had no DEFAULT. 7th is the typical
-- Indian school payday (first-week collection from parents, then
-- staff payout) so it's a safer baseline than NULL.
--
-- - ALTER the column to default to 7 going forward.
-- - Backfill existing NULL rows so the Ledger no longer reads "not set"
--   for schools that hadn't configured it yet. Principals can still
--   override via the Set / Edit pill in the Ledger header.

ALTER TABLE public.schools
  ALTER COLUMN salary_pay_day SET DEFAULT 7;

UPDATE public.schools
   SET salary_pay_day = 7
 WHERE salary_pay_day IS NULL;
