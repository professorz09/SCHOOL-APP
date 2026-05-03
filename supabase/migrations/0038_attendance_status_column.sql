-- Phase 6: Add status column to attendance_student_details
-- Values: present | absent | holiday | half
-- Backfill from is_present; keep is_present for backward compat.

ALTER TABLE public.attendance_student_details
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'present'
    CHECK (status IN ('present','absent','holiday','half'));

-- Backfill: true → present, false → absent
UPDATE public.attendance_student_details
SET status = CASE WHEN is_present THEN 'present' ELSE 'absent' END
WHERE status = 'present' OR status IS NULL;

ALTER TABLE public.attendance_student_details
  ALTER COLUMN status SET NOT NULL;

-- Add holiday/half-day counters to the header record
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS total_holiday INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_half    INT NOT NULL DEFAULT 0;
