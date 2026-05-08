-- =============================================================
-- 0078_complaints_teacher_insert.sql
-- =============================================================
-- The existing complaints insert policy only allowed PARENT/STUDENT
-- inserts (via linked_student_ids) and PRINCIPAL via the catch-all
-- complaints_write. TEACHERs hit a "new row violates row-level
-- security policy" when filing complaints from their own portal.
--
-- Add a TEACHER-scoped INSERT policy: a TEACHER may insert a complaint
-- against any student in their own school (school_id match) and the
-- row must be owned by them (from_user_id = auth.uid()).
-- =============================================================

DROP POLICY IF EXISTS complaints_teacher_insert ON public.complaints;

CREATE POLICY complaints_teacher_insert ON public.complaints
  FOR INSERT
  WITH CHECK (
    public.current_user_role() = 'TEACHER'
    AND from_user_id = auth.uid()
    AND school_id = public.current_user_school_id()
  );
