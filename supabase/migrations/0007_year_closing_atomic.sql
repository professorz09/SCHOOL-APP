-- 0007_year_closing_atomic.sql
--
-- Atomic year-closing RPC. Wraps the three discrete steps (close old year,
-- create new year, promote students) in a SINGLE transaction so a partial
-- commit is impossible — if promotion fails after the new year is created,
-- the entire operation rolls back.
--
-- All sub-operations re-use the existing helpers (is_principal,
-- current_user_school_id, promote_students). PKs are untouched.

CREATE OR REPLACE FUNCTION public.commit_year_closing(
  p_old_year_id UUID,
  p_new_label   TEXT,
  p_new_start   DATE,
  p_new_end     DATE,
  p_new_board   TEXT DEFAULT 'CBSE',
  p_new_medium  TEXT DEFAULT 'English',
  p_decisions   JSONB DEFAULT '[]'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school      UUID := public.current_user_school_id();
  v_new_year_id UUID;
  v_promoted    INT  := 0;
BEGIN
  IF auth.uid() IS NULL                           THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF NOT public.is_principal()                    THEN RAISE EXCEPTION 'principal only'; END IF;
  IF v_school IS NULL                             THEN RAISE EXCEPTION 'no school for caller'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.academic_years
                  WHERE id = p_old_year_id AND school_id = v_school) THEN
    RAISE EXCEPTION 'old year not found in caller school';
  END IF;
  IF p_new_label IS NULL OR length(trim(p_new_label)) = 0 THEN
    RAISE EXCEPTION 'new year label required';
  END IF;
  IF p_new_start IS NULL OR p_new_end IS NULL OR p_new_end <= p_new_start THEN
    RAISE EXCEPTION 'invalid date range for new year';
  END IF;

  -- 1. Lock old year (idempotent — re-running on an already-closed year
  --    just re-applies the same WHERE)
  UPDATE public.academic_years
     SET is_closed = TRUE, is_active = FALSE
   WHERE id = p_old_year_id;

  -- 2. Atomically deactivate any other active years and insert the new one
  UPDATE public.academic_years
     SET is_active = FALSE
   WHERE school_id = v_school AND is_active;

  INSERT INTO public.academic_years
    (school_id, label, start_date, end_date, is_active, board, medium)
  VALUES
    (v_school, p_new_label, p_new_start, p_new_end, TRUE, p_new_board, p_new_medium)
  RETURNING id INTO v_new_year_id;

  -- 3. Promote students (errors here roll back steps 1 & 2 too)
  v_promoted := public.promote_students(p_old_year_id, v_new_year_id, p_decisions);

  -- 4. Single audit row covering the whole atomic operation
  INSERT INTO public.audit_logs
    (user_id, school_id, action, entity_type, entity_id, details)
  VALUES
    (auth.uid(), v_school, 'commit_year_closing', 'academic_year', p_old_year_id,
     jsonb_build_object(
       'new_year_id', v_new_year_id,
       'new_label',   p_new_label,
       'promoted',    v_promoted
     ));

  RETURN jsonb_build_object(
    'new_year_id', v_new_year_id,
    'new_label',   p_new_label,
    'promoted',    v_promoted
  );
END $$;

GRANT EXECUTE ON FUNCTION public.commit_year_closing(UUID, TEXT, DATE, DATE, TEXT, TEXT, JSONB) TO authenticated;
