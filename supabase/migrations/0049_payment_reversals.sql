-- Payment reversals — controlled "undo" for fee ledger mistakes.
--
-- Design (from the locked spec):
--   • A reversal is a NEW row in payment_records with a negative amount and
--     reverses_payment_id pointing to the original. Both rows live forever —
--     accountant sees: "05 Apr Payment ₹1000 / 06 Apr Reversal -₹1000".
--   • Original row's reversed_at timestamp marks it so the UI can show a
--     "Reversed 🔁" chip and the same payment can't be reversed twice.
--   • Allowed only the same calendar day (IST) by the principal in Editor
--     Mode — server enforces all guards.

ALTER TABLE public.payment_records
  ADD COLUMN IF NOT EXISTS reverses_payment_id UUID
    REFERENCES public.payment_records(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS reversed_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by        UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS reversal_reason    TEXT;

-- Index for "is this row reversed?" lookups + reverse-chain joins.
CREATE INDEX IF NOT EXISTS payment_records_reverses_idx
  ON public.payment_records(reverses_payment_id) WHERE reverses_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_records_reversed_at_idx
  ON public.payment_records(reversed_at) WHERE reversed_at IS NOT NULL;

-- Sanity constraint — a row that reverses another must carry a negative amount;
-- a row that doesn't must carry a positive amount. Prevents data corruption
-- if someone bypasses the API later.
ALTER TABLE public.payment_records
  DROP CONSTRAINT IF EXISTS payment_records_amount_sign_check;
ALTER TABLE public.payment_records
  ADD  CONSTRAINT payment_records_amount_sign_check CHECK (
    (reverses_payment_id IS NULL AND amount >= 0)
    OR (reverses_payment_id IS NOT NULL AND amount <= 0)
  );
