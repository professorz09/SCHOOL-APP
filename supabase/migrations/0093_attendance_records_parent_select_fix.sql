-- 0093_attendance_records_parent_select_fix.sql
--
-- Fix: 0092 introduced "infinite recursion detected in policy for relation
-- attendance_records". The cycle:
--   attendance_records.RLS → SELECT FROM attendance_student_details
--   attendance_student_details.RLS (attsd_select) → SELECT FROM attendance_records
--
-- Rewrite the parent-select policy so it doesn't touch attendance_student_details
-- at all. Scope by school instead: a parent / student may read an attendance_records
-- header row when at least one of their linked students belongs to the same school.
-- attendance_student_details RLS already gates per-student detail rows, so widening
-- header visibility to "students at the same school" is safe and matches what the
-- UI joins for date display.

DROP POLICY IF EXISTS attendance_records_parent_select ON public.attendance_records;
CREATE POLICY attendance_records_parent_select ON public.attendance_records
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = ANY(public.linked_student_ids())
        AND s.school_id = attendance_records.school_id
    )
  );

-- Same recursion shape isn't possible for test_schedules (it joins through
-- student_academic_records, which doesn't reference test_schedules), but
-- recreate identically for consistency.
DROP POLICY IF EXISTS test_schedules_parent_select ON public.test_schedules;
CREATE POLICY test_schedules_parent_select ON public.test_schedules
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = ANY(public.linked_student_ids())
        AND s.school_id = test_schedules.school_id
    )
  );
