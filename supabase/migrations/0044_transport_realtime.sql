-- Migration 0044: Enable Supabase Realtime on transport tables
--
-- Adds transport_vehicles, route_stops, driver_locations, and
-- student_transport_assignments to the supabase_realtime publication so
-- TransportManager can subscribe to live changes instead of polling.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'transport_vehicles','route_stops','driver_locations','student_transport_assignments'
  ]) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
