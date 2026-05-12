-- 0120_students_driver_select_via_func.sql
-- Migration 0118 added students_driver_select with an inline EXISTS over
-- student_transport_assignments. That triggered an interaction between
-- PostgREST query planning and nested RLS on the sta table — the side
-- effect was that the driver could no longer see their assigned vehicle
-- on the home page (the embedded route_stops / assignment join planner
-- short-circuited under nested policy evaluation).
--
-- Replace the inline EXISTS with a SECURITY DEFINER helper. The helper
-- runs with full table access internally, returning a UUID[] of student
-- ids the calling driver may see. The students policy just checks
-- membership in that array — flat, no nested RLS recursion.

CREATE OR REPLACE FUNCTION public.driver_student_ids() RETURNS UUID[]
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(DISTINCT sta.student_id), ARRAY[]::UUID[])
    FROM public.student_transport_assignments sta
   WHERE sta.is_active = TRUE
     AND sta.vehicle_id = ANY(public.driver_vehicle_ids())
$$;

GRANT EXECUTE ON FUNCTION public.driver_student_ids() TO authenticated;

DROP POLICY IF EXISTS students_driver_select ON public.students;

CREATE POLICY students_driver_select ON public.students
  FOR SELECT
  USING (id = ANY(public.driver_student_ids()));
