-- =============================================================
-- 0137_notices_class_section_rls.sql
-- =============================================================
-- Teachers can post notices targeted to `audience='SECTION:<uuid>'`
-- or `audience='CLASS:<name>'` (validated server-side in
-- server/routes/teacher.ts). The notices_select RLS policy only
-- matched ALL / STUDENTS / PARENTS / STUDENTS_PARENTS / PARENTS_STUDENTS,
-- so a section-targeted "Bring sports kit tomorrow" notice was
-- invisible to the parents and students of that very section — the
-- feature shipped but the audience couldn't read it.
--
-- This rewrite extends the parent/student branch with two extra
-- match cases, joined to student_academic_records for the active
-- year:
--
--   SECTION:<uuid>  ↔  ar.section_id matches
--   CLASS:<name>    ↔  ar.class_name matches
-- =============================================================

BEGIN;

DROP POLICY IF EXISTS notices_select ON public.notices;
CREATE POLICY notices_select ON public.notices FOR SELECT
  USING (
    public.is_super_admin()
    OR (
      public.current_user_role() IN ('PRINCIPAL','TEACHER')
      AND school_id = public.current_user_school_id()
    )
    OR EXISTS (
      SELECT 1
      FROM public.students s
      LEFT JOIN public.student_academic_records ar
        ON ar.student_id = s.id
       AND ar.academic_year_id = (
         SELECT id FROM public.academic_years
         WHERE school_id = s.school_id AND is_active = TRUE
         LIMIT 1
       )
      WHERE s.school_id = notices.school_id
        AND (s.id = ANY(public.linked_student_ids()) OR s.user_id = auth.uid())
        AND (
          notices.target_student_id = s.id
          OR notices.audience IN ('ALL','STUDENTS','PARENTS','STUDENTS_PARENTS','PARENTS_STUDENTS')
          OR (notices.audience LIKE 'SECTION:%' AND ar.section_id::text = SUBSTRING(notices.audience FROM 9))
          OR (notices.audience LIKE 'CLASS:%'   AND ar.class_name      = SUBSTRING(notices.audience FROM 7))
        )
    )
  );

COMMIT;
