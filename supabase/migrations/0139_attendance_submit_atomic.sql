-- =============================================================
-- 0139_attendance_submit_atomic.sql
-- =============================================================
-- /api/attendance/submit did three writes in sequence:
--   1. UPSERT attendance_records (or INSERT new)
--   2. DELETE attendance_student_details for that record
--   3. INSERT replacement attendance_student_details rows
--
-- If step 3 failed (network blip, constraint hit on one student),
-- the parent row's totals were already mutated and the children were
-- already gone — the day's register read empty until someone resubmitted.
-- Two near-simultaneous submits (teacher tab + principal tab) also raced
-- between the "is there a row already?" SELECT and the INSERT.
--
-- This RPC does the whole thing inside one PG transaction with ON CONFLICT,
-- so a failure rolls back to the prior committed state and a concurrent
-- submit waits on the row lock instead of producing a duplicate.
-- Granted only to service_role (Express route calls via adminDb); direct
-- client callers go through the route's validation layer.
-- =============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.submit_attendance_atomic(
  p_school_id        UUID,
  p_section_id       UUID,
  p_date             DATE,
  p_class_name       TEXT,
  p_section          TEXT,
  p_academic_year_id UUID,
  p_total_present    INT,
  p_total_absent     INT,
  p_total_half       INT,
  p_total_holiday    INT,
  p_total_students   INT,
  p_marked_by        UUID,
  p_approved_by      UUID,
  p_approval_status  TEXT,
  p_is_locked        BOOLEAN,
  p_records          JSONB  -- array of {student_id, status, is_present}
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.attendance_records (
    school_id, academic_year_id, section_id, class_name, section,
    date, total_present, total_absent, total_holiday, total_half,
    total_students, marked_by, approval_status, is_locked, approved_by
  ) VALUES (
    p_school_id, p_academic_year_id, p_section_id, p_class_name, p_section,
    p_date, p_total_present, p_total_absent, p_total_holiday, p_total_half,
    p_total_students, p_marked_by, p_approval_status, p_is_locked, p_approved_by
  )
  ON CONFLICT (section_id, date) DO UPDATE
    SET total_present   = EXCLUDED.total_present,
        total_absent    = EXCLUDED.total_absent,
        total_holiday   = EXCLUDED.total_holiday,
        total_half      = EXCLUDED.total_half,
        total_students  = EXCLUDED.total_students,
        marked_by       = EXCLUDED.marked_by,
        approval_status = EXCLUDED.approval_status,
        is_locked       = EXCLUDED.is_locked,
        approved_by     = EXCLUDED.approved_by
  RETURNING id INTO v_id;

  DELETE FROM public.attendance_student_details WHERE attendance_id = v_id;

  IF jsonb_typeof(p_records) = 'array' AND jsonb_array_length(p_records) > 0 THEN
    INSERT INTO public.attendance_student_details (attendance_id, student_id, is_present, status)
    SELECT v_id,
           (r->>'student_id')::UUID,
           (r->>'is_present')::BOOLEAN,
           r->>'status'
      FROM jsonb_array_elements(p_records) r;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_attendance_atomic(
  UUID, UUID, DATE, TEXT, TEXT, UUID, INT, INT, INT, INT, INT, UUID, UUID, TEXT, BOOLEAN, JSONB
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.submit_attendance_atomic(
  UUID, UUID, DATE, TEXT, TEXT, UUID, INT, INT, INT, INT, INT, UUID, UUID, TEXT, BOOLEAN, JSONB
) TO service_role;

COMMIT;
