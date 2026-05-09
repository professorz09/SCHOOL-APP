-- 0090_school_holidays.sql
--
-- Centralised holiday calendar for each school + academic year.
-- Principals declare specific dates (Diwali, 15 Aug, school anniversary,
-- etc.) and the system uses them to skip attendance, exclude from
-- attendance percentages, and grey out the date pickers.
--
-- Sundays are NOT stored as rows — they're computed client-side via
-- weekday math (cheaper, no rows × 52 per year per school). The
-- `weekly_off_days` column on `schools` lets a school define their
-- own weekly off (default: [0] for Sundays only).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS.

BEGIN;

-- Specific dated holidays. UNIQUE(school_id, academic_year_id, date)
-- so a date can't be declared twice for the same school+year.
CREATE TABLE IF NOT EXISTS public.school_holidays (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES public.schools(id)       ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  date             DATE NOT NULL,
  name             TEXT NOT NULL,
  notes            TEXT,
  created_by       UUID REFERENCES public.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(school_id, academic_year_id, date)
);
CREATE INDEX IF NOT EXISTS school_holidays_school_year_idx
  ON public.school_holidays(school_id, academic_year_id, date);

ALTER TABLE public.school_holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS school_holidays_select ON public.school_holidays;
CREATE POLICY school_holidays_select ON public.school_holidays FOR SELECT
USING (
  public.is_super_admin()
  OR (public.current_user_role() IN ('PRINCIPAL','TEACHER','STUDENT','PARENT')
      AND school_id = public.current_user_school_id())
);

DROP POLICY IF EXISTS school_holidays_write ON public.school_holidays;
CREATE POLICY school_holidays_write ON public.school_holidays FOR ALL
USING (
  public.is_super_admin()
  OR (public.is_principal() AND school_id = public.current_user_school_id())
)
WITH CHECK (
  public.is_super_admin()
  OR (public.is_principal() AND school_id = public.current_user_school_id())
);

-- Weekly off-days as an int array on `schools`. 0=Sunday … 6=Saturday.
-- Default [0] = Sundays only (most Indian schools). Schools that run
-- 6 days a week with Sat off can store [0,6]; CBSE schools that close
-- on the 2nd & 4th Saturdays use the dated table for those instead.
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS weekly_off_days INT[] NOT NULL DEFAULT ARRAY[0];

COMMIT;
