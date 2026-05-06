-- 0063_inventory_history.sql
--
-- Append-only audit log for inventory add / delete events.
--
-- Retention rules:
--   * 7-day TTL — anything older is purged on the next insert.
--   * 1000-row cap per school — once exceeded, oldest rows trimmed.
--
-- Both rules enforced by an AFTER INSERT trigger so the cleanup happens
-- without a cron job. The trigger is per-statement (not per-row) so a bulk
-- insert sees exactly one cleanup pass.
--
-- Columns intentionally denormalised (title / category / quantity copied
-- onto the row) so a delete event is still readable after the asset row
-- itself is gone.

BEGIN;

CREATE TABLE IF NOT EXISTS public.inventory_history (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  asset_id     UUID,                       -- nullable: row may outlive the asset
  action       TEXT NOT NULL CHECK (action IN ('ADD', 'DELETE', 'UPDATE')),
  title        TEXT NOT NULL,
  category     TEXT NOT NULL,
  quantity     INT  NOT NULL DEFAULT 0,
  description  TEXT,
  note         TEXT,
  done_by      UUID REFERENCES public.users(id),
  done_by_name TEXT,
  done_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inventory_history_school_done_at_idx
  ON public.inventory_history(school_id, done_at DESC);

-- ─── Retention trigger ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.inventory_history_prune()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- 7-day TTL — runs across all schools so we don't repeat the work per
  -- tenant. Cheap because of the (school_id, done_at) index.
  DELETE FROM public.inventory_history
   WHERE done_at < (NOW() - INTERVAL '7 days');

  -- Per-school 1000-row cap. Runs only against the school that just
  -- inserted, so even a busy school doesn't trigger a global scan.
  DELETE FROM public.inventory_history old
   WHERE old.school_id = NEW.school_id
     AND old.id IN (
       SELECT id FROM public.inventory_history
        WHERE school_id = NEW.school_id
        ORDER BY done_at DESC
        OFFSET 1000
     );

  RETURN NULL;  -- AFTER trigger; return value ignored
END
$$;

DROP TRIGGER IF EXISTS inventory_history_prune_trg ON public.inventory_history;
CREATE TRIGGER inventory_history_prune_trg
  AFTER INSERT ON public.inventory_history
  FOR EACH ROW EXECUTE FUNCTION public.inventory_history_prune();

-- ─── RLS ────────────────────────────────────────────────────────────────
-- Same shape as the assets table: super-admin sees all, principal/teacher
-- see their school. Writes are routed through the server with service role,
-- so the policy only governs reads.
ALTER TABLE public.inventory_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_history_select ON public.inventory_history;
CREATE POLICY inventory_history_select ON public.inventory_history FOR SELECT
  USING (
    public.is_super_admin()
    OR (public.current_user_role() IN ('PRINCIPAL', 'TEACHER')
        AND school_id = public.current_user_school_id())
  );

COMMIT;
