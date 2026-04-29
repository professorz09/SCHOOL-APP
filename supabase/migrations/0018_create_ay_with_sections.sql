-- 0018_create_ay_with_sections.sql ─────────────────────────────────────────
-- Atomic "create academic year + sections" RPC for the Academic Year Setup
-- Wizard (Task #2 of the Full School App Flow).
--
-- The legacy `create_academic_year(label, start, end, board, medium)` RPC
-- (migration 0005) only inserts the AY row; the principal then has to walk
-- through Settings → Classes to create each section row separately. The
-- wizard collapses everything into a single principal action, so this RPC
-- accepts a JSONB array of sections and inserts everything in one
-- transaction (or fails as a unit).
--
-- The single-active-year trigger introduced in 0017
-- (`academic_years_single_active`) handles deactivating the previously
-- active year automatically when this RPC inserts the new row with
-- is_active = TRUE — we don't have to do it explicitly here.
--
-- Idempotent: CREATE OR REPLACE; safe to re-run.

CREATE OR REPLACE FUNCTION public.create_academic_year_with_sections(
  p_label    TEXT,
  p_start    DATE,
  p_end      DATE,
  p_board    TEXT  DEFAULT 'CBSE',
  p_medium   TEXT  DEFAULT 'English',
  p_streams  JSONB DEFAULT '["Science","Commerce","Arts"]'::JSONB,
  p_sections JSONB DEFAULT '[]'::JSONB
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school   UUID := public.current_user_school_id();
  v_id       UUID;
  v_sec      JSONB;
  v_class    TEXT;
  v_section  TEXT;
  v_stream   TEXT;
  v_capacity INT;
  v_count    INT := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF NOT public.is_principal() THEN RAISE EXCEPTION 'principal only'; END IF;
  IF v_school IS NULL THEN RAISE EXCEPTION 'no school for caller'; END IF;
  IF p_label IS NULL OR length(trim(p_label)) = 0 THEN
    RAISE EXCEPTION 'label is required';
  END IF;
  IF p_start IS NULL OR p_end IS NULL THEN
    RAISE EXCEPTION 'start and end dates are required';
  END IF;
  IF p_end <= p_start THEN
    RAISE EXCEPTION 'end date must be after start date';
  END IF;
  IF jsonb_typeof(p_streams) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'streams must be a JSON array';
  END IF;
  IF jsonb_typeof(p_sections) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'sections must be a JSON array';
  END IF;
  -- Server-side invariant: a year must always be created with >= 1 section,
  -- regardless of caller. Wizard UI enforces this too, but we don't want
  -- non-UI callers (DB scripts, future RPCs, manual SQL) to bypass the
  -- "year + sections in one shot" contract and leave a half-set-up year.
  IF jsonb_array_length(p_sections) = 0 THEN
    RAISE EXCEPTION 'at least one section is required to create an academic year';
  END IF;

  -- The single-active-year trigger from 0017 deactivates any other active
  -- year for this school as soon as this row commits with is_active = TRUE.
  INSERT INTO public.academic_years
    (school_id, label, start_date, end_date, is_active, board, medium, streams)
  VALUES
    (v_school, trim(p_label), p_start, p_end, TRUE, p_board, p_medium, p_streams)
  RETURNING id INTO v_id;

  FOR v_sec IN SELECT * FROM jsonb_array_elements(p_sections)
  LOOP
    v_class    := NULLIF(trim(COALESCE(v_sec->>'class_name', '')), '');
    v_section  := NULLIF(trim(COALESCE(v_sec->>'section', '')),    '');
    v_stream   := NULLIF(trim(COALESCE(v_sec->>'stream', '')),     '');
    v_capacity := COALESCE(NULLIF(v_sec->>'capacity', '')::INT,    45);

    IF v_class IS NULL OR v_section IS NULL THEN
      -- Whole transaction rolls back, taking the AY row with it.
      RAISE EXCEPTION 'each section needs class_name and section (got %)', v_sec;
    END IF;
    IF v_capacity < 0 THEN
      RAISE EXCEPTION 'capacity cannot be negative (got % for %-%)', v_capacity, v_class, v_section;
    END IF;

    INSERT INTO public.sections
      (school_id, academic_year_id, class_name, section, stream, capacity)
    VALUES
      (v_school, v_id, v_class, v_section, v_stream, v_capacity);

    v_count := v_count + 1;
  END LOOP;

  INSERT INTO public.audit_logs
    (user_id, school_id, action, entity_type, entity_id, details)
  VALUES
    (auth.uid(), v_school,
     'create_year_with_sections', 'academic_year', v_id,
     jsonb_build_object(
       'label', p_label,
       'start', p_start,
       'end', p_end,
       'board', p_board,
       'medium', p_medium,
       'streams', p_streams,
       'sections_count', v_count
     ));

  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.create_academic_year_with_sections(
  TEXT, DATE, DATE, TEXT, TEXT, JSONB, JSONB
) TO authenticated;
