-- Two coordinated changes the principal asked for:
--   1. Notices can target a specific student (in addition to the existing
--      ALL / STUDENTS / TEACHERS / STAFF / PARENTS broadcast audiences).
--   2. Parents/students can read their own school's broadcast notices and
--      their own complaints (incl. principal's reply on the response field).

-- ─── 1. NOTICES ────────────────────────────────────────────────────────────
ALTER TABLE public.notices
  ADD COLUMN IF NOT EXISTS target_student_id uuid REFERENCES public.students(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS notices_target_student_idx
  ON public.notices(target_student_id) WHERE target_student_id IS NOT NULL;

DROP POLICY IF EXISTS notices_select ON public.notices;
CREATE POLICY notices_select ON public.notices FOR SELECT
  USING (
    public.is_super_admin()
    OR (
      public.current_user_role() IN ('PRINCIPAL','TEACHER')
      AND school_id = public.current_user_school_id()
    )
    -- Parent/Student: their own school's notices, where the notice is
    -- targeted at them OR is a broadcast that includes their audience.
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.school_id = notices.school_id
        AND (s.id = ANY(public.linked_student_ids()) OR s.user_id = auth.uid())
        AND (
          notices.target_student_id = s.id
          OR notices.audience IN ('ALL','STUDENTS','PARENTS','STUDENTS_PARENTS','PARENTS_STUDENTS')
        )
    )
  );

-- ─── 2. COMPLAINTS ─────────────────────────────────────────────────────────
-- Parent/Student can read their OWN complaints (and the principal's reply
-- in `response`). Existing PRINCIPAL/TEACHER and SUPER_ADMIN access kept.
DROP POLICY IF EXISTS complaints_select ON public.complaints;
CREATE POLICY complaints_select ON public.complaints FOR SELECT
  USING (
    public.is_super_admin()
    OR (
      public.current_user_role() IN ('PRINCIPAL','TEACHER')
      AND school_id = public.current_user_school_id()
    )
    OR from_user_id = auth.uid()
  );

-- Allow authenticated parents/students to insert their own complaint row.
-- (Existing complaints_user_insert had no WITH CHECK condition.)
DROP POLICY IF EXISTS complaints_user_insert ON public.complaints;
CREATE POLICY complaints_user_insert ON public.complaints FOR INSERT
  TO authenticated
  WITH CHECK (
    from_user_id = auth.uid()
    AND school_id IN (
      SELECT school_id FROM public.students s
      WHERE s.id = ANY(public.linked_student_ids()) OR s.user_id = auth.uid()
    )
  );
