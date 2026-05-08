-- =============================================================
-- 0081_school_new_year_creation_toggle.sql
-- =============================================================
-- Per-school feature flag controlled by SUPER_ADMIN. When FALSE
-- (default), the principal's "Add Academic Year" wizard is gated
-- and the create RPC rejects with a friendly error so it can't be
-- bypassed via crafted requests. SUPER_ADMIN flips this to TRUE
-- when a school is ready to start a new AY (typically once per
-- year, around year-end planning).
-- =============================================================

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS new_year_creation_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Server-side guard for the principal's create-year flow. Any RPC
-- that inserts into academic_years for a school must call this
-- helper first; UI gating alone is not sufficient.
CREATE OR REPLACE FUNCTION public.assert_new_year_creation_allowed(p_school_id UUID)
RETURNS VOID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_enabled BOOLEAN;
BEGIN
  -- Super-admins bypass — they manage the toggle themselves.
  IF public.is_super_admin() THEN RETURN; END IF;

  SELECT new_year_creation_enabled INTO v_enabled
    FROM public.schools WHERE id = p_school_id;
  IF NOT COALESCE(v_enabled, FALSE) THEN
    RAISE EXCEPTION 'New academic year creation is disabled for this school. Please contact your platform administrator.'
      USING ERRCODE = 'check_violation';
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.assert_new_year_creation_allowed(UUID) TO authenticated;
