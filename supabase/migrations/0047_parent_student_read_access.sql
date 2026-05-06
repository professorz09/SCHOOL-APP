-- Parents and students need read access to a few "shared" tables that were
-- previously locked to PRINCIPAL/TEACHER only:
--   • academic_years   — required by getActiveContext() (the parent dashboard
--                         entry point); without it, every student-side view
--                         that needs the active year errors out.
--   • fee_structures   — used by FeesView when rendering the schedule.
--   • transport_vehicles — used by TransportView to show the bus details.
--
-- Existing per-row policies (e.g. fee_installments_parent_select) already
-- guard the per-student data — these three tables are *parent* records of
-- that data, and parents/students need to read them for their own school.
--
-- A parent qualifies if any of their linked students belong to the school.
-- A student qualifies if their own user_id maps to a student in that school.

-- ─── academic_years ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS academic_years_select ON public.academic_years;
CREATE POLICY academic_years_select ON public.academic_years FOR SELECT
  USING (
    public.is_super_admin()
    OR (
      public.current_user_role() IN ('PRINCIPAL','TEACHER')
      AND school_id = public.current_user_school_id()
    )
    -- Parent: any of their linked students belongs to this school.
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.school_id = academic_years.school_id
        AND s.id = ANY(public.linked_student_ids())
    )
    -- Student: their own students row is in this school.
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.school_id = academic_years.school_id
        AND s.user_id = auth.uid()
    )
  );

-- ─── fee_structures ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS fee_structures_select ON public.fee_structures;
CREATE POLICY fee_structures_select ON public.fee_structures FOR SELECT
  USING (
    public.is_super_admin()
    OR (
      public.current_user_role() IN ('PRINCIPAL','TEACHER')
      AND school_id = public.current_user_school_id()
    )
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.school_id = fee_structures.school_id
        AND (s.id = ANY(public.linked_student_ids()) OR s.user_id = auth.uid())
    )
  );

-- ─── transport_vehicles ─────────────────────────────────────────────────────
-- Keep the existing driver-can-see-own-vehicle policy as a separate rule.
-- Add parent/student readability for their own school's fleet (so the
-- TransportView can join through to vehicle + route_stops).
DROP POLICY IF EXISTS transport_vehicles_select ON public.transport_vehicles;
CREATE POLICY transport_vehicles_select ON public.transport_vehicles FOR SELECT
  USING (
    public.is_super_admin()
    OR (
      public.current_user_role() IN ('PRINCIPAL','TEACHER')
      AND school_id = public.current_user_school_id()
    )
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.school_id = transport_vehicles.school_id
        AND (s.id = ANY(public.linked_student_ids()) OR s.user_id = auth.uid())
    )
  );
