-- =============================================================
-- 0076_school_salary_pay_day.sql
-- =============================================================
-- Single school-wide salary pay day (1-28). Drives the "Due Xth /
-- Overdue" badge in the Salary Ledger for every staff member's
-- monthly row. NULL = not configured (no badge, no overdue flag).
--
-- An earlier in-flight design used a per-staff salary_due_day on
-- public.staff; that approach was rolled back before reaching the
-- main branch because schools almost always pay every staff
-- member on the same day, so per-staff config was data-entry
-- overhead with no real value. Only this school-level field
-- ships.
-- =============================================================

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS salary_pay_day SMALLINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'schools_salary_pay_day_chk'
  ) THEN
    ALTER TABLE public.schools
      ADD CONSTRAINT schools_salary_pay_day_chk
      CHECK (salary_pay_day IS NULL OR (salary_pay_day BETWEEN 1 AND 28));
  END IF;
END $$;
