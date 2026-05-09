-- =============================================================
-- 0085_student_tc_lifecycle.sql
-- =============================================================
-- Adds two RPCs for student lifecycle from the profile panel:
--
--   issue_tc_and_leave(student_id, reason)
--     • Generates a sequential TC number (school-scoped)
--     • Stamps students.tc_number
--     • Sets students.is_active = FALSE
--     • Writes a TC_ISSUED row in student_change_history (audit trail)
--
--   rejoin_student(student_id, class_name, section, roll_no)
--     • Sets students.is_active = TRUE
--     • Creates a student_academic_records row for the ACTIVE year
--       (idempotent — no-op if already present)
--     • Writes a REJOINED row in student_change_history
--
-- Both gated server-side by:
--   • Caller is principal of the student's school (or super_admin)
--   • Editor Mode active (users.editor_mode_until > now())
--   • Active academic year exists for the school
--
-- No new columns — uses existing students.tc_number / is_active +
-- the existing student_change_history audit table.
-- =============================================================

CREATE OR REPLACE FUNCTION public.issue_tc_and_leave(
  p_student_id UUID,
  p_reason     TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller    UUID := auth.uid();
  v_school    UUID;
  v_year_id   UUID;
  v_year_lbl  TEXT;
  v_tc_number TEXT;
  v_seq       INT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  -- Authorise: principal of the student's school OR super_admin.
  SELECT school_id INTO v_school FROM public.students WHERE id = p_student_id;
  IF v_school IS NULL THEN RAISE EXCEPTION 'student not found'; END IF;
  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_school)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Editor Mode required — irreversible action, must be deliberate.
  IF NOT public.is_super_admin() THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.users
       WHERE id = v_caller AND editor_mode_until > NOW()
    ) THEN
      RAISE EXCEPTION 'Editor Mode not active — enable it from the principal dashboard first';
    END IF;
  END IF;

  -- Active year required — TC is dated to the active year.
  SELECT id, label INTO v_year_id, v_year_lbl
    FROM public.academic_years
   WHERE school_id = v_school AND is_active = TRUE LIMIT 1;
  IF v_year_id IS NULL THEN
    RAISE EXCEPTION 'No active academic year — TC cannot be issued';
  END IF;

  -- Generate next school-scoped TC sequence: TC-{year}-{NNN}
  -- Counts existing tc_number rows for this school in the active year.
  SELECT COALESCE(MAX(
           NULLIF(regexp_replace(tc_number, '^.*-(\d+)$', '\1'), '')::INT
         ), 0) + 1
    INTO v_seq
    FROM public.students
   WHERE school_id = v_school
     AND tc_number IS NOT NULL
     AND tc_number ~ ('^TC-' || split_part(v_year_lbl, '-', 1) || '-\d+$');

  v_tc_number := 'TC-' || split_part(v_year_lbl, '-', 1) || '-' || lpad(v_seq::text, 3, '0');

  UPDATE public.students
     SET tc_number = v_tc_number,
         is_active = FALSE,
         updated_at = NOW()
   WHERE id = p_student_id;

  INSERT INTO public.student_change_history
    (student_id, field_name, old_value, new_value, reason, changed_by, approved_by)
  VALUES
    (p_student_id, 'TC_ISSUED', NULL, v_tc_number,
     COALESCE(p_reason, 'Transfer Certificate issued'),
     v_caller, v_caller);

  INSERT INTO public.audit_logs (user_id, school_id, action, entity_type, entity_id, details)
  VALUES (v_caller, v_school, 'tc_issued', 'student', p_student_id,
          jsonb_build_object('tc_number', v_tc_number, 'reason', p_reason, 'year', v_year_lbl));

  RETURN v_tc_number;
END $$;

GRANT EXECUTE ON FUNCTION public.issue_tc_and_leave(UUID, TEXT) TO authenticated;


-- ─── Rejoin ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rejoin_student(
  p_student_id UUID,
  p_class_name TEXT,
  p_section    TEXT,
  p_roll_no    TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller  UUID := auth.uid();
  v_school  UUID;
  v_year_id UUID;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  SELECT school_id INTO v_school FROM public.students WHERE id = p_student_id;
  IF v_school IS NULL THEN RAISE EXCEPTION 'student not found'; END IF;
  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_school)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF NOT public.is_super_admin() THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.users
       WHERE id = v_caller AND editor_mode_until > NOW()
    ) THEN
      RAISE EXCEPTION 'Editor Mode not active — enable it from the principal dashboard first';
    END IF;
  END IF;

  SELECT id INTO v_year_id
    FROM public.academic_years
   WHERE school_id = v_school AND is_active = TRUE LIMIT 1;
  IF v_year_id IS NULL THEN
    RAISE EXCEPTION 'No active academic year — student cannot be re-admitted';
  END IF;

  IF p_class_name IS NULL OR length(trim(p_class_name)) = 0 THEN
    RAISE EXCEPTION 'class_name is required';
  END IF;

  -- Reactivate the student.
  UPDATE public.students
     SET is_active = TRUE,
         updated_at = NOW()
   WHERE id = p_student_id;

  -- Create AR row for the active year. Idempotent — if a row already
  -- exists for this (student, year) we just update class/section.
  INSERT INTO public.student_academic_records
    (student_id, academic_year_id, class_name, section, roll_no, fee_status)
  VALUES (p_student_id, v_year_id, trim(p_class_name), COALESCE(trim(p_section), ''), p_roll_no, 'PENDING')
  ON CONFLICT (student_id, academic_year_id) DO UPDATE
    SET class_name = EXCLUDED.class_name,
        section    = EXCLUDED.section,
        roll_no    = COALESCE(EXCLUDED.roll_no, public.student_academic_records.roll_no);

  INSERT INTO public.student_change_history
    (student_id, field_name, old_value, new_value, reason, changed_by, approved_by)
  VALUES
    (p_student_id, 'REJOINED', NULL,
     trim(p_class_name) || COALESCE('-' || trim(p_section), ''),
     'Re-admitted to ' || trim(p_class_name) || COALESCE('-' || trim(p_section), ''),
     v_caller, v_caller);

  INSERT INTO public.audit_logs (user_id, school_id, action, entity_type, entity_id, details)
  VALUES (v_caller, v_school, 'student_rejoined', 'student', p_student_id,
          jsonb_build_object('class', p_class_name, 'section', p_section));
END $$;

GRANT EXECUTE ON FUNCTION public.rejoin_student(UUID, TEXT, TEXT, TEXT) TO authenticated;
