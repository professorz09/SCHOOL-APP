-- 0064_attendance_updated_at.sql
--
-- Adds attendance_records.updated_at + a BEFORE UPDATE trigger to keep it
-- fresh. The Mark-Attendance UI surfaces "Locked by X · time" using this
-- column so an edit (Editor Mode correction) shows the latest write time
-- instead of the stale original. The earlier service select crashed with
-- "column attendance_records.updated_at does not exist" because the
-- column was never created.
--
-- Backfilled to created_at so existing rows render with a sensible time
-- on the next read.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, DROP TRIGGER IF EXISTS, CREATE OR
-- REPLACE FUNCTION.

BEGIN;

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE public.attendance_records
   SET updated_at = created_at
 WHERE updated_at < created_at OR updated_at = '1970-01-01'::timestamptz;

CREATE OR REPLACE FUNCTION public.attendance_records_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS attendance_records_updated_at_trg ON public.attendance_records;
CREATE TRIGGER attendance_records_updated_at_trg
  BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.attendance_records_touch_updated_at();

COMMIT;
