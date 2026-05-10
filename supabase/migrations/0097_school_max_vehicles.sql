-- 0097_school_max_vehicles.sql
--
-- Per-school vehicle cap controlled by super-admin. Same shape as the
-- max_students / max_staff guard (migration 0082) so the principal
-- gets a friendly error and can't blow past the licensed fleet size.
--
-- Semantics:
--   max_vehicles = NULL → unlimited (default for older schools)
--   max_vehicles = 0    → TRANSPORT SERVICE DISABLED. Principal can't
--                         create the first vehicle. UI also hides the
--                         Transport tile entirely so the school looks
--                         clean for institutions that don't run buses.
--   max_vehicles = N    → up to N active vehicles. Deactivation always
--                         allowed (matches student/staff trigger).

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS max_vehicles INT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schools_max_vehicles_chk') THEN
    ALTER TABLE public.schools ADD CONSTRAINT schools_max_vehicles_chk
      CHECK (max_vehicles IS NULL OR max_vehicles >= 0);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.school_active_vehicle_count(p_school_id UUID)
RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::INT FROM public.transport_vehicles
   WHERE school_id = p_school_id AND is_active = TRUE;
$$;

GRANT EXECUTE ON FUNCTION public.school_active_vehicle_count(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_vehicle_limit() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_limit INT;
  v_count INT;
BEGIN
  -- Only enforce on rows becoming active.
  IF NOT NEW.is_active THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_active = TRUE THEN RETURN NEW; END IF;

  SELECT max_vehicles INTO v_limit FROM public.schools WHERE id = NEW.school_id;
  IF v_limit IS NULL THEN RETURN NEW; END IF;

  IF v_limit = 0 THEN
    RAISE EXCEPTION 'Transport service is not enabled for this school. Contact platform admin to enable.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_count := public.school_active_vehicle_count(NEW.school_id);
  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'Vehicle limit reached (% / %). Contact your platform admin to raise the limit.', v_count, v_limit
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vehicle_limit ON public.transport_vehicles;
CREATE TRIGGER trg_vehicle_limit BEFORE INSERT OR UPDATE OF is_active ON public.transport_vehicles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_vehicle_limit();
