-- Migration 0043: Staff attendance audit columns
--
-- Adds updated_at (auto-bumped on UPDATE) and modified_by (who last edited)
-- to staff_attendance. This lets the API distinguish a first-save (created_at
-- == updated_at) from a re-save / editor-mode correction (created_at <
-- updated_at), enabling proper savedAt vs modifiedAt timestamps in the UI.

ALTER TABLE public.staff_attendance
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS modified_by UUID REFERENCES public.users(id);

-- Backfill updated_at = created_at for existing rows
UPDATE public.staff_attendance SET updated_at = created_at WHERE updated_at IS NULL;

-- Trigger: auto-bump updated_at on every UPDATE
CREATE OR REPLACE FUNCTION public.touch_staff_attendance_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS staff_attendance_touch_updated_at ON public.staff_attendance;
CREATE TRIGGER staff_attendance_touch_updated_at
  BEFORE UPDATE ON public.staff_attendance
  FOR EACH ROW EXECUTE FUNCTION public.touch_staff_attendance_updated_at();
