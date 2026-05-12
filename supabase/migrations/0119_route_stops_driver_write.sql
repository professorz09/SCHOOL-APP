-- 0119_route_stops_driver_write.sql
-- DriverRouteView lets the driver add/edit/delete stops on their assigned
-- vehicle. The /api/transport/stops/{add,update,remove} endpoints use
-- adminDb so they *should* bypass RLS, but Supabase's new sb_secret_*
-- key format doesn't reliably carry BYPASSRLS through PostgREST. Without
-- bypass, the existing rs_write policy only permits PRINCIPAL writes —
-- a DRIVER DELETE returns silently with 0 rows affected, the UI marks
-- the stop "removed" optimistically, and the row is still in the DB.
--
-- Rewrite rs_write so a DRIVER can also touch route_stops on a vehicle
-- they own (driver_vehicle_ids() membership). Principal + super-admin
-- remain authoritative. WITH CHECK mirrors USING so an INSERT can't be
-- crafted to point at a vehicle the writer doesn't own.

DROP POLICY IF EXISTS rs_write ON public.route_stops;

CREATE POLICY rs_write ON public.route_stops
  FOR ALL
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1
        FROM public.transport_vehicles v
       WHERE v.id = route_stops.vehicle_id
         AND (
           (public.is_principal() AND v.school_id = public.current_user_school_id())
           OR v.id = ANY(public.driver_vehicle_ids())
         )
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1
        FROM public.transport_vehicles v
       WHERE v.id = route_stops.vehicle_id
         AND (
           (public.is_principal() AND v.school_id = public.current_user_school_id())
           OR v.id = ANY(public.driver_vehicle_ids())
         )
    )
  );
