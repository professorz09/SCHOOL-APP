-- 0092_attendance_records_parent_select.sql
--
-- Bug: PARENT/STUDENT homepage attendance % shows "—" and the
-- AttendanceView is empty because the `!inner(date)` join from
-- `attendance_student_details` to `attendance_records` returns 0 rows
-- under RLS. Migration 0011 dropped attendance_records_parent_select
-- (in a loop) and only rebuilt fee_installments / payment_records
-- afterwards — attendance_records and test_schedules were left without
-- a parent-facing SELECT policy. Default RLS deny means parents see
-- nothing.
--
-- Fix: allow PARENT/STUDENT to read an attendance_records row when it
-- has at least one attendance_student_details row for one of their
-- linked students. attendance_student_details already gates its own
-- SELECT by linked_student_ids, so this only widens visibility to the
-- header rows the child rows reference.

DROP POLICY IF EXISTS attendance_records_parent_select ON public.attendance_records;
CREATE POLICY attendance_records_parent_select ON public.attendance_records
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.attendance_student_details d
      WHERE d.attendance_id = attendance_records.id
        AND d.student_id = ANY(public.linked_student_ids())
    )
  );

-- test_schedules is in the same boat — parents need to see exam dates
-- for their child's class. Scope by class_id matching any linked
-- student's active academic record.
DROP POLICY IF EXISTS test_schedules_parent_select ON public.test_schedules;
CREATE POLICY test_schedules_parent_select ON public.test_schedules
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.student_academic_records sar
      WHERE sar.student_id = ANY(public.linked_student_ids())
        AND sar.academic_year_id = test_schedules.academic_year_id
    )
  );
