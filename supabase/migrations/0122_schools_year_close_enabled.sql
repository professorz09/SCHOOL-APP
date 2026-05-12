-- 0122_schools_year_close_enabled.sql
-- Super-admin-controlled toggle that gates the principal's "Close Academic
-- Year" action. Mirrors the existing schools.new_year_creation_enabled
-- pattern — year close is high-stakes (promotes students, finalises
-- fees + salaries, locks the timetable / attendance) and a stray click
-- can torch the whole tenant's records for the current session.
--
-- Default FALSE so every school is locked by default; super-admin flips
-- it on for a few days at year-end when the principal is ready, and the
-- RPC auto-resets it to FALSE after a successful close so the principal
-- can't re-trigger a second close without another approval.

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS year_close_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Rewrite close_academic_year to enforce the flag + auto-reset it.
-- Existing SECURITY DEFINER / principal-only / school-scope checks stay.
CREATE OR REPLACE FUNCTION public.close_academic_year(p_year_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school UUID := public.current_user_school_id();
  v_enabled BOOLEAN;
BEGIN
  IF NOT public.is_principal() THEN RAISE EXCEPTION 'principal only'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.academic_years WHERE id = p_year_id AND school_id = v_school) THEN
    RAISE EXCEPTION 'year not found in school';
  END IF;

  -- Gate: super-admin must have flipped year_close_enabled = TRUE for
  -- this school. The flag is one-shot — we reset it below so a second
  -- close requires another super-admin approval.
  SELECT year_close_enabled INTO v_enabled FROM public.schools WHERE id = v_school;
  IF v_enabled IS NOT TRUE THEN
    RAISE EXCEPTION 'Year close is locked. Ask the super-admin to enable Year Close for this school first.';
  END IF;

  UPDATE public.academic_years
     SET is_closed = TRUE, is_active = FALSE
   WHERE id = p_year_id;

  -- Auto-reset the permission so the principal can't double-trigger.
  UPDATE public.schools
     SET year_close_enabled = FALSE
   WHERE id = v_school;

  INSERT INTO public.audit_logs (user_id, school_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), v_school, 'close_year', 'academic_year', p_year_id, '{}'::jsonb);
END $$;

GRANT EXECUTE ON FUNCTION public.close_academic_year(UUID) TO authenticated;
