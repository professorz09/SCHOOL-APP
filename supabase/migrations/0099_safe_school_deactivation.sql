-- 0099_safe_school_deactivation.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Critical fix for school deactivate ↔ reactivate flow.
--
-- Old behaviour (cascade_school_deactivation, migration ~0011):
--   • On deactivate: every user / student / staff row of the school flips
--     to is_active = FALSE.
--   • On reactivate: ONLY the principal flips back. Students + staff
--     stay deactivated forever, making them effectively disappear from
--     every UI (which filters by is_active = TRUE).
--
-- New behaviour:
--   • Track which rows were flipped BY the cascade in a "snapshot" table
--     keyed on (school_id, deactivated_at).
--   • On reactivate: restore only the rows captured in the most recent
--     snapshot for this school. Manually-deactivated users are NOT
--     accidentally re-activated.
--   • The snapshot is consumed (deleted) once reactivation completes,
--     so a second deactivate-reactivate cycle works correctly.
--
-- Also: stop muting student/staff is_active during deactivation. The
-- school itself is the gate — we don't need to corrupt per-row state.
-- We only deactivate USERS (login accounts), since RLS / app gating
-- already keys off schools.status for everything else.

CREATE TABLE IF NOT EXISTS public._school_deactivation_snapshot (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_ids    UUID[] NOT NULL DEFAULT '{}',
  student_ids UUID[] NOT NULL DEFAULT '{}',
  staff_ids   UUID[] NOT NULL DEFAULT '{}',
  taken_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS school_deactivation_snapshot_school_idx
  ON public._school_deactivation_snapshot(school_id, taken_at DESC);

-- Replace the trigger function.
CREATE OR REPLACE FUNCTION public.cascade_school_deactivation() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_ids    UUID[];
  v_student_ids UUID[];
  v_staff_ids   UUID[];
  v_snapshot_id UUID;
BEGIN
  -- ── DEACTIVATE / SUSPEND ──────────────────────────────────────────────
  IF NEW.status IN ('INACTIVE','SUSPENDED')
     AND (OLD.status IS DISTINCT FROM NEW.status) THEN

    -- Capture the IDs of currently-active rows BEFORE flipping them.
    -- These are the rows we will need to restore on the next reactivation.
    SELECT array_agg(id) INTO v_user_ids
      FROM public.users
      WHERE school_id = NEW.id AND role <> 'SUPER_ADMIN' AND is_active = TRUE;
    SELECT array_agg(id) INTO v_student_ids
      FROM public.students
      WHERE school_id = NEW.id AND is_active = TRUE;
    SELECT array_agg(id) INTO v_staff_ids
      FROM public.staff
      WHERE school_id = NEW.id AND is_active = TRUE;

    INSERT INTO public._school_deactivation_snapshot
      (school_id, user_ids, student_ids, staff_ids)
    VALUES
      (NEW.id,
       COALESCE(v_user_ids, '{}'),
       COALESCE(v_student_ids, '{}'),
       COALESCE(v_staff_ids, '{}'));

    -- Flip USER login accounts off (these block login at auth time).
    -- Students / staff are NOT touched — RLS + UI already gate on
    -- schools.status, and flipping their is_active was the cause of
    -- "data disappears" after reactivation.
    UPDATE public.users
       SET is_active = FALSE
     WHERE id = ANY(COALESCE(v_user_ids, '{}'::UUID[]));

  -- ── REACTIVATE ────────────────────────────────────────────────────────
  ELSIF NEW.status IN ('ACTIVE','TRIAL')
        AND OLD.status IN ('INACTIVE','SUSPENDED') THEN

    -- Pick up the most recent snapshot for this school. If we never
    -- snapshotted (legacy schools deactivated before this migration),
    -- fall back to flipping all non-super-admin users back on.
    SELECT id, user_ids INTO v_snapshot_id, v_user_ids
      FROM public._school_deactivation_snapshot
      WHERE school_id = NEW.id
      ORDER BY taken_at DESC LIMIT 1;

    IF v_snapshot_id IS NULL THEN
      -- Legacy fallback: re-activate every user that is currently
      -- inactive. Doesn't perfectly preserve manual deactivations from
      -- before this migration, but at least no rows stay invisible.
      UPDATE public.users
         SET is_active = TRUE
       WHERE school_id = NEW.id
         AND role <> 'SUPER_ADMIN'
         AND is_active = FALSE;
      UPDATE public.students SET is_active = TRUE WHERE school_id = NEW.id AND is_active = FALSE;
      UPDATE public.staff    SET is_active = TRUE WHERE school_id = NEW.id AND is_active = FALSE;
    ELSE
      -- Restore exactly what was snapshotted.
      UPDATE public.users
         SET is_active = TRUE
       WHERE id = ANY(COALESCE(v_user_ids, '{}'::UUID[]));
      -- Snapshot consumed.
      DELETE FROM public._school_deactivation_snapshot WHERE id = v_snapshot_id;
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

-- Trigger already wired by an earlier migration; CREATE OR REPLACE FUNCTION
-- is enough. Re-create the trigger guard idempotently in case the original
-- migration gets dropped.
DROP TRIGGER IF EXISTS schools_cascade_deactivation ON public.schools;
CREATE TRIGGER schools_cascade_deactivation
  AFTER UPDATE OF status ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.cascade_school_deactivation();

-- One-shot heal: schools currently INACTIVE/SUSPENDED whose previous
-- cascade silently flipped students/staff off — flip them back on so the
-- next reactivation surfaces them correctly.
UPDATE public.students SET is_active = TRUE
  WHERE is_active = FALSE
    AND school_id IN (SELECT id FROM public.schools WHERE status IN ('INACTIVE','SUSPENDED'));
UPDATE public.staff    SET is_active = TRUE
  WHERE is_active = FALSE
    AND school_id IN (SELECT id FROM public.schools WHERE status IN ('INACTIVE','SUSPENDED'));
