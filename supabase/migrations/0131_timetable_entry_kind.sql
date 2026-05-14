-- Per-day non-teaching timetable entries.
--
-- Reported: marking Monday's 8:00-8:20 slot as "Assembly" applied to
-- every day of the week for that class, and removing it from one day
-- removed it everywhere. Cause: the slot's `period_type` (LUNCH /
-- ASSEMBLY / CLASS) sits on `timetable_periods` and is school-wide.
-- The UI's "Non-Teaching" toggle was calling updateSlot, mutating the
-- shared row.
--
-- Fix: per-day non-teaching designation lives on `timetable_entries`
-- (already a per-day-per-slot row). Add an `entry_kind` column —
-- 'TEACHING' (default, subject + teacher_id) or 'ACTIVITY' (subject
-- is the activity label, teacher_id NULL). The UI saves an
-- 'ACTIVITY' entry for just the affected day, leaving other days'
-- defaults intact.
--
-- Backwards-compat: existing rows default to 'TEACHING' so nothing
-- breaks. The slot's period_type still drives rendering whenever no
-- entry exists for a given (slot, day).

ALTER TABLE public.timetable_entries
  ADD COLUMN IF NOT EXISTS entry_kind TEXT NOT NULL DEFAULT 'TEACHING';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'timetable_entries_entry_kind_chk'
  ) THEN
    ALTER TABLE public.timetable_entries
      ADD CONSTRAINT timetable_entries_entry_kind_chk
      CHECK (entry_kind IN ('TEACHING', 'ACTIVITY'));
  END IF;
END $$;
