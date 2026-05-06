-- Allow STUDENT and PARENT roles to read timetable_entries for their own
-- section. The previous policy only included PRINCIPAL/TEACHER, which meant
-- the student timetable view always returned empty rows — even right after
-- the principal saved an entry.
--
-- Parents are scoped via parent_student_links → students.section_id; students
-- via their own students.user_id. Both join through students to confirm the
-- entry's section_id matches a section the user is enrolled in.

DROP POLICY IF EXISTS timetable_entries_select ON public.timetable_entries;

CREATE POLICY timetable_entries_select ON public.timetable_entries FOR SELECT
  USING (
    public.is_super_admin()
    OR (
      public.current_user_role() IN ('PRINCIPAL','TEACHER')
      AND school_id = public.current_user_school_id()
    )
    OR EXISTS (
      -- Student or parent: only their section's entries.
      SELECT 1
        FROM public.student_academic_records sar
        JOIN public.students s ON s.id = sar.student_id
       WHERE sar.section_id = timetable_entries.section_id
         AND sar.academic_year_id = timetable_entries.academic_year_id
         AND s.school_id = timetable_entries.school_id
         AND (
           s.user_id = auth.uid()
           OR s.id = ANY(public.linked_student_ids())
         )
    )
  );

-- Slots metadata (timetable_periods) drives the time/type column on the
-- student view. Apply the same opening-up so unmatched slots still render
-- correctly.
DROP POLICY IF EXISTS timetable_periods_select ON public.timetable_periods;

CREATE POLICY timetable_periods_select ON public.timetable_periods FOR SELECT
  USING (
    public.is_super_admin()
    OR school_id = public.current_user_school_id()
    OR EXISTS (
      SELECT 1 FROM public.students s
       WHERE s.school_id = timetable_periods.school_id
         AND (
           s.user_id = auth.uid()
           OR s.id = ANY(public.linked_student_ids())
         )
    )
  );
