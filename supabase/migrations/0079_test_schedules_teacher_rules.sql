-- =============================================================
-- 0079_test_schedules_teacher_rules.sql
-- =============================================================
-- 1. Only ONE 'FINAL' exam per (school, academic_year) — promotion
--    pulls from this one row, multiples would create ambiguity.
-- 2. Teachers may UPDATE/DELETE their OWN test rows while the
--    academic year is still ACTIVE. After year-close, the row is
--    immutable from RLS's perspective; the server-side editor-mode
--    flow remains the only way to amend (handled via service role).
-- =============================================================

-- ─── 1. Single FINAL per (school, year) ───────────────────────────
-- Partial unique index: only enforced for exam_type = 'FINAL'.
CREATE UNIQUE INDEX IF NOT EXISTS test_schedules_one_final_per_year
  ON public.test_schedules (school_id, academic_year_id)
  WHERE exam_type = 'FINAL';

-- ─── 2. Teacher UPDATE/DELETE policy on own tests ─────────────────
-- Existing test_schedules_write policy is principal-only and stays.
-- We add a TEACHER policy scoped by `teacher_id = staff(auth.uid())`
-- and gated by `academic_years.is_active = true`.
DROP POLICY IF EXISTS test_schedules_teacher_write ON public.test_schedules;

CREATE POLICY test_schedules_teacher_write ON public.test_schedules
  FOR ALL
  USING (
    public.current_user_role() = 'TEACHER'
    AND school_id = public.current_user_school_id()
    AND teacher_id IN (
      SELECT id FROM public.staff WHERE user_id = auth.uid()
    )
    AND academic_year_id IN (
      SELECT id FROM public.academic_years
       WHERE school_id = public.current_user_school_id() AND is_active = true
    )
  )
  WITH CHECK (
    public.current_user_role() = 'TEACHER'
    AND school_id = public.current_user_school_id()
    AND teacher_id IN (
      SELECT id FROM public.staff WHERE user_id = auth.uid()
    )
    AND academic_year_id IN (
      SELECT id FROM public.academic_years
       WHERE school_id = public.current_user_school_id() AND is_active = true
    )
  );
