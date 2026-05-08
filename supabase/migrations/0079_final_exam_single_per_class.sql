-- =============================================================
-- 0079_final_exam_single_per_class.sql
-- =============================================================
-- Promotion is driven by a single FINAL exam per class per
-- academic year. Enforce uniqueness at the DB layer so race
-- conditions (two teachers tapping "Create" simultaneously)
-- can't produce two FINAL rows for the same class.
--
-- Edit / delete window for FINAL exam:
--   • While the AY is open  → any TEACHER assigned to the class
--     OR the principal can change it (existing RLS handles this).
--   • After AY is closed    → only PRINCIPAL with editor_mode_until
--     in the future may modify (existing reverse_payment-style
--     guard pattern). Enforced via a trigger that compares the
--     row's academic_year_id.is_closed with the caller's role +
--     editor_mode window.
-- =============================================================

-- Partial unique index: only one FINAL test per (year, class, section).
-- WHERE clause keeps the index lean — non-FINAL tests are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS test_schedules_one_final_per_class_idx
  ON public.test_schedules (academic_year_id, class_name, section)
  WHERE test_type = 'FINAL';

-- Edit / delete guard for FINAL after AY close.
CREATE OR REPLACE FUNCTION public.guard_final_exam_modification() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_target RECORD;
  v_year   RECORD;
  v_caller UUID := auth.uid();
  v_role   TEXT;
  v_editor TIMESTAMPTZ;
BEGIN
  -- Service-role inserts/updates (server adminDb) bypass auth.uid() — let them through.
  IF v_caller IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_target := COALESCE(NEW, OLD);

  -- Only guard FINAL rows.
  IF v_target.test_type IS DISTINCT FROM 'FINAL' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT is_closed INTO v_year
    FROM public.academic_years WHERE id = v_target.academic_year_id;
  IF NOT FOUND OR NOT v_year.is_closed THEN
    -- AY still open — normal RLS rules apply.
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- AY is closed → require principal with active editor mode.
  SELECT role, editor_mode_until INTO v_role, v_editor
    FROM public.users WHERE id = v_caller;

  IF v_role <> 'PRINCIPAL' OR v_editor IS NULL OR v_editor <= NOW() THEN
    RAISE EXCEPTION 'Final exam can only be modified after year close with editor mode on'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS final_exam_modification_guard ON public.test_schedules;
CREATE TRIGGER final_exam_modification_guard
  BEFORE UPDATE OR DELETE ON public.test_schedules
  FOR EACH ROW EXECUTE FUNCTION public.guard_final_exam_modification();
