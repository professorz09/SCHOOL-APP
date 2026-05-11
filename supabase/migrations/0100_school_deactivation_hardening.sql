-- 0100_school_deactivation_hardening.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Tightens the deactivate-reactivate cascade introduced in 0099.
--
-- Audit found 4 problems with the original snapshot approach:
--   1. _school_deactivation_snapshot had no RLS — any client with the
--      anon key could read or tamper with it.
--   2. INACTIVE → SUSPENDED → INACTIVE-style transitions created a
--      second (empty) snapshot that overwrote the first on reactivate,
--      so users would never come back.
--   3. Snapshot rows could accumulate if reactivation never happened.
--   4. Trigger silently swallowed the case where a school was deleted
--      mid-flow (FK cascade handles it but worth noting).
--
-- Fix: only keep ONE snapshot per school (UNIQUE constraint) and skip
-- inserts when one already exists. On reactivate, consume EVERY snapshot
-- for the school (defensive). Lock the table down with RLS so only
-- SUPER_ADMINs (and the trigger function itself, which is SECURITY
-- DEFINER) can touch it.

-- 1. RLS lockdown ───────────────────────────────────────────────────────
ALTER TABLE public._school_deactivation_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sds_super_admin_all ON public._school_deactivation_snapshot;
CREATE POLICY sds_super_admin_all
  ON public._school_deactivation_snapshot
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- 2. Single-snapshot-per-school invariant ──────────────────────────────
-- Drop dupes that may already exist from the buggy transition window.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY school_id ORDER BY taken_at ASC) AS rn
    FROM public._school_deactivation_snapshot
)
DELETE FROM public._school_deactivation_snapshot
 WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS school_deactivation_snapshot_one_per_school
  ON public._school_deactivation_snapshot(school_id);

-- 3. Trigger function — only INSERT if no existing snapshot for this
--    school; on reactivate, delete ALL rows for the school. ────────────
CREATE OR REPLACE FUNCTION public.cascade_school_deactivation() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_ids    UUID[];
  v_existing    UUID;
BEGIN
  -- ── DEACTIVATE / SUSPEND ──────────────────────────────────────────────
  IF NEW.status IN ('INACTIVE','SUSPENDED')
     AND (OLD.status IS DISTINCT FROM NEW.status) THEN

    -- If a snapshot already exists for this school (e.g. coming from
    -- INACTIVE → SUSPENDED — both deactivated states), DO NOT replace
    -- it. The original snapshot still captures the correct "what was
    -- active at the time we first deactivated" set.
    SELECT id INTO v_existing
      FROM public._school_deactivation_snapshot
      WHERE school_id = NEW.id LIMIT 1;

    IF v_existing IS NULL THEN
      SELECT array_agg(id) INTO v_user_ids
        FROM public.users
        WHERE school_id = NEW.id AND role <> 'SUPER_ADMIN' AND is_active = TRUE;

      INSERT INTO public._school_deactivation_snapshot
        (school_id, user_ids)
      VALUES
        (NEW.id, COALESCE(v_user_ids, '{}'::UUID[]));

      -- Flip USER login accounts off. Students / staff is_active is NOT
      -- touched — schools.status is the gate, see 0099 for context.
      UPDATE public.users
         SET is_active = FALSE
       WHERE id = ANY(COALESCE(v_user_ids, '{}'::UUID[]));
    END IF;

  -- ── REACTIVATE ────────────────────────────────────────────────────────
  ELSIF NEW.status IN ('ACTIVE','TRIAL')
        AND OLD.status IN ('INACTIVE','SUSPENDED') THEN

    SELECT user_ids INTO v_user_ids
      FROM public._school_deactivation_snapshot
      WHERE school_id = NEW.id LIMIT 1;

    IF v_user_ids IS NULL THEN
      -- Legacy fallback: pre-0099 schools have no snapshot. Re-activate
      -- every user (and any students/staff that the buggy old cascade
      -- had flipped off) so nothing stays invisible.
      UPDATE public.users
         SET is_active = TRUE
       WHERE school_id = NEW.id
         AND role <> 'SUPER_ADMIN'
         AND is_active = FALSE;
      UPDATE public.students SET is_active = TRUE
        WHERE school_id = NEW.id AND is_active = FALSE;
      UPDATE public.staff    SET is_active = TRUE
        WHERE school_id = NEW.id AND is_active = FALSE;
    ELSE
      UPDATE public.users
         SET is_active = TRUE
       WHERE id = ANY(v_user_ids);
    END IF;

    -- Defensive: clear ALL snapshots for this school, not just one.
    DELETE FROM public._school_deactivation_snapshot WHERE school_id = NEW.id;

  END IF;

  RETURN NEW;
END;
$$;

-- Re-attach trigger (idempotent).
DROP TRIGGER IF EXISTS schools_cascade_deactivation ON public.schools;
CREATE TRIGGER schools_cascade_deactivation
  AFTER UPDATE OF status ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.cascade_school_deactivation();
