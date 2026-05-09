-- 0089_expense_void.sql
--
-- Replace hard-delete on expenses with a soft-void model. Financial
-- records must NEVER be erased — they're historically corrected. The
-- `void` mechanism marks a row as cancelled while keeping it in the
-- ledger so monthly reports, audit trails, and tally figures remain
-- internally consistent.
--
--   • voided_at TIMESTAMPTZ — when the void happened (NULL = active row)
--   • voided_by UUID        — which principal pressed Void
--   • void_reason TEXT      — mandatory free-text justification
--
-- A partial index keeps queries that scan only active rows fast even
-- when the voided history grows large.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.

BEGIN;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS voided_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by   UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

-- Most reads (active expense list, monthly aggregates) want only
-- non-voided rows. A partial index on (school_id, date) keeps those
-- queries cheap regardless of how many voids accumulate.
CREATE INDEX IF NOT EXISTS expenses_active_idx
  ON public.expenses (school_id, date DESC)
  WHERE voided_at IS NULL;

COMMIT;
