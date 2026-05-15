-- =============================================================
-- 0135_tc_lifecycle_status_sync.sql
-- =============================================================
-- TC lifecycle was setting students.is_active=FALSE but leaving
-- students.status at its prior value (usually 'ACTIVE'). Several
-- screens read EITHER column when deciding "is this kid currently
-- on the roster" — the StudentsManager archive tabs filter strictly
-- on status='TC_ISSUED', so TC'd kids vanished from the TC tab but
-- still appeared anywhere is_active was the only guard.
--
-- This migration:
--   1. Patches issue_tc_and_leave to also set status='TC_ISSUED'.
--   2. Patches rejoin_student to also reset status='ACTIVE'.
--   3. Back-fills existing students who were TC'd before the patch
--      so the archive tabs read the same number everywhere.
-- =============================================================

BEGIN;

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

  SELECT id, label INTO v_year_id, v_year_lbl
    FROM public.academic_years
   WHERE school_id = v_school AND is_active = TRUE LIMIT 1;
  IF v_year_id IS NULL THEN
    RAISE EXCEPTION 'No active academic year — TC cannot be issued';
  END IF;

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
     SET tc_number  = v_tc_number,
         is_active  = FALSE,
         status     = 'TC_ISSUED',
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


-- ─── Rejoin: also reset status to ACTIVE ─────────────────────────
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

  UPDATE public.students
     SET is_active  = TRUE,
         status     = 'ACTIVE',
         updated_at = NOW()
   WHERE id = p_student_id;

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


-- ─── Back-fill: anyone with a TC number is TC_ISSUED ─────────────
UPDATE public.students
   SET status = 'TC_ISSUED'
 WHERE tc_number IS NOT NULL
   AND is_active = FALSE
   AND status <> 'TC_ISSUED';

-- Promotion-flow TC'd kids never got a tc_number on students; they
-- have a tc_records row instead. Pick those up too.
UPDATE public.students s
   SET status    = 'TC_ISSUED',
       is_active = FALSE
  FROM public.tc_records t
 WHERE t.student_id = s.id
   AND s.status <> 'TC_ISSUED';

COMMIT;
