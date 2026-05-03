-- Migration 0044: Enable Supabase Realtime on transport tables
--
-- Adds transport_vehicles, route_stops, driver_locations, and
-- student_transport_assignments to the supabase_realtime publication so
-- TransportManager can subscribe to live changes instead of polling.

ALTER PUBLICATION supabase_realtime ADD TABLE public.transport_vehicles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.route_stops;
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_locations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.student_transport_assignments;
