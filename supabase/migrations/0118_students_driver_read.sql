-- 0118_students_driver_read.sql
-- DriverStudentsView lists the kids riding the driver's vehicle so the
-- driver knows who they're picking up. The underlying query joins
-- student_transport_assignments → students!inner. sta_select already lets
-- a driver see their own vehicle's assignment rows, but the students-side
-- of the join had no DRIVER-friendly policy — the inner join therefore
-- silently dropped to zero and the page rendered "No students assigned to
-- this vehicle" even when assignments existed.
--
-- Add a narrow SELECT policy: a DRIVER can read a student row only if
-- that student has an ACTIVE transport assignment on a vehicle this
-- driver owns. Scope is minimal — no other student data leaks across
-- vehicles or schools.

DROP POLICY IF EXISTS students_driver_select ON public.students;

CREATE POLICY students_driver_select ON public.students
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.student_transport_assignments sta
       WHERE sta.student_id = students.id
         AND sta.is_active = TRUE
         AND sta.vehicle_id = ANY(public.driver_vehicle_ids())
    )
  );
