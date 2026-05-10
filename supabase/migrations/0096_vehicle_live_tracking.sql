-- 0096_vehicle_live_tracking.sql
--
-- Live GPS / trip-state for school transport vehicles. One row per
-- vehicle (PK = vehicle_id), UPDATE-only mutation pattern so the
-- table size is bounded at N = number of vehicles, never grows with
-- pings.
--
-- Driver client UPDATEs this row every 15 sec while tracking.
-- Principal client subscribes via Supabase Realtime Postgres Changes
-- and sees live position updates without polling. When driver app
-- closes / network drops, the row persists with last known position
-- and `last_seen` so the principal sees "Last seen N min ago"
-- instead of a mysterious blank.

CREATE TABLE IF NOT EXISTS public.vehicle_live (
  vehicle_id        UUID PRIMARY KEY REFERENCES public.transport_vehicles(id) ON DELETE CASCADE,
  school_id         UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  -- Last reported GPS coordinate. NULL until first ping after vehicle
  -- creation; principal renders "GPS not started" in that case.
  lat               DOUBLE PRECISION,
  lng               DOUBLE PRECISION,
  speed_kmh         DOUBLE PRECISION,
  -- Server-stamped on each ping. Used to compute "Live · 2s ago",
  -- "Last seen 5 min ago", "Offline since 12:45 PM" labels client-side.
  last_seen         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- True while driver explicitly has trip running. Flips to false
  -- on /api/transport/ping?stop=true (driver tapped Stop) OR when
  -- last_seen is > 30 min old (server-side staleness check).
  is_tracking       BOOLEAN NOT NULL DEFAULT false,
  -- Index of the stop the driver is heading toward (next stop).
  -- Same shape as the in-memory currentStopIndex used today, just
  -- persisted server-side so app reopen / principal view both stay
  -- in sync. NULL = no trip in progress.
  current_stop_idx  SMALLINT,
  -- Snapshotted at trip start so a "trip done" UI can highlight the
  -- run that just completed without a join.
  trip_started_at   TIMESTAMPTZ,
  trip_ended_at     TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vehicle_live_school_idx ON public.vehicle_live(school_id);
CREATE INDEX IF NOT EXISTS vehicle_live_last_seen_idx ON public.vehicle_live(last_seen DESC);

-- RLS — same shape as transport_vehicles. Principals + teachers see
-- their school's vehicles. Parents/students see vehicles their
-- linked student is assigned to. Driver writes go through service
-- role from the server, so we don't need a permissive write policy
-- here (defaults deny on UPDATE for non-service-role).

ALTER TABLE public.vehicle_live ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vehicle_live_select_school ON public.vehicle_live;
CREATE POLICY vehicle_live_select_school ON public.vehicle_live
  FOR SELECT
  USING (
    public.is_super_admin()
    OR (public.current_user_role() IN ('PRINCIPAL','TEACHER','DRIVER')
        AND school_id = public.current_user_school_id())
  );

DROP POLICY IF EXISTS vehicle_live_select_parent ON public.vehicle_live;
CREATE POLICY vehicle_live_select_parent ON public.vehicle_live
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.student_transport_assignments sta
      WHERE sta.vehicle_id = vehicle_live.vehicle_id
        AND sta.is_active = true
        AND sta.student_id = ANY(public.linked_student_ids())
    )
  );

-- Auto-stale: any vehicle whose last_seen is older than 30 minutes
-- is considered offline. The application clamps `is_tracking` to
-- false in the UI when this is true; we also expose a helper view
-- so realtime subscribers can rely on the server's view of "live".
-- (The is_tracking flag itself is only updated on writes, so without
-- this view the principal would see "ON TRIP" forever for a driver
-- whose phone died mid-route.)

-- Realtime publication — Supabase's `supabase_realtime` publication
-- is what enables Postgres Changes streaming. Add this table.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'vehicle_live'
  ) THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.vehicle_live;
    EXCEPTION WHEN OTHERS THEN
      -- Publication might not exist yet on a fresh project; the
      -- Realtime extension creates it on first dashboard touch.
      -- Skip silently.
      NULL;
    END;
  END IF;
END $$;
