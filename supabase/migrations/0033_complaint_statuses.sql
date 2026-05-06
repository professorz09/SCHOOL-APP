-- 0033_complaint_statuses.sql
-- Spec gap audit · item 20.2 — adopt the canonical complaint status set:
--   PENDING · IN_REVIEW · RESOLVED · REJECTED
--
-- The complaints.status column is plain TEXT (no CHECK constraint), so this
-- migration only normalises legacy values. New rows are written with the new
-- status names from the application layer.

UPDATE public.complaints
   SET status = 'PENDING'
 WHERE status = 'OPEN';

UPDATE public.complaints
   SET status = 'IN_REVIEW'
 WHERE status = 'IN_PROGRESS';

-- Also make 'PENDING' the column default so any future direct insert
-- (e.g. via the SQL console) lands on the canonical value.
ALTER TABLE public.complaints
  ALTER COLUMN status SET DEFAULT 'PENDING';
