-- 0117_staff_driver_self_select.sql
-- The generic staff_select policy (init loop) lets SUPER_ADMIN +
-- PRINCIPAL + TEACHER read staff rows in their school. DRIVER role is not
-- in that list, so a driver logging in cannot even read their OWN staff
-- row. DriverRouteView's first query
--   SELECT id FROM public.staff WHERE user_id = auth.uid()
-- comes back empty, the early-return triggers, and the page renders
-- "No Vehicle Assigned" forever — regardless of how the principal set
-- up transport_vehicles.driver_id.
--
-- Add a self-read policy so each staff row is visible to its own linked
-- auth user (any role). Same pattern as students_parent_select but
-- scoped to the staff member themselves.

DROP POLICY IF EXISTS staff_self_select ON public.staff;

CREATE POLICY staff_self_select ON public.staff
  FOR SELECT
  USING (user_id = auth.uid());
