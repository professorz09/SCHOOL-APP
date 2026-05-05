-- Simplify parent fee submissions: drop screenshot upload entirely, require
-- a transaction_id text instead. Screenshots were unstructured proof that
-- needed lifecycle management; txn_id is structured, permanent, and
-- reconciles directly against bank/UPI statements.
--
-- Effects:
--   • fee_payment_uploads now requires transaction_id (NOT NULL)
--   • screenshot_name + screenshot_url columns removed
--   • payment_records gets transaction_id (nullable — cash payments don't
--     have one) so the canonical record carries the txn ref forever

-- 1. fee_payment_uploads
ALTER TABLE public.fee_payment_uploads
  ADD COLUMN IF NOT EXISTS transaction_id text;

-- Backfill any pre-existing rows so the NOT NULL flip below is safe. Dev
-- DBs are empty at this point but production safety first.
UPDATE public.fee_payment_uploads
  SET transaction_id = COALESCE(NULLIF(transaction_id, ''), 'LEGACY-' || id::text)
  WHERE transaction_id IS NULL OR transaction_id = '';

ALTER TABLE public.fee_payment_uploads
  ALTER COLUMN transaction_id SET NOT NULL;

ALTER TABLE public.fee_payment_uploads
  DROP COLUMN IF EXISTS screenshot_name,
  DROP COLUMN IF EXISTS screenshot_url;

-- 2. payment_records
ALTER TABLE public.payment_records
  ADD COLUMN IF NOT EXISTS transaction_id text;

-- Index for fast lookup by txn_id (accountant reconciliation flow).
CREATE INDEX IF NOT EXISTS payment_records_transaction_id_idx
  ON public.payment_records(transaction_id) WHERE transaction_id IS NOT NULL;
