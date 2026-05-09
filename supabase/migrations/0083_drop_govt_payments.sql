-- =============================================================
-- 0083_drop_govt_payments.sql
-- =============================================================
-- Removes the RTE / government-payments parallel flow. Schools
-- should record any government grant as a regular payment with a
-- "Govt grant" note in the standard Collect Payment modal — the
-- separate RTE schedule + govt payment ledger added too much
-- complexity for the value it delivered.
--
-- What's dropped:
--   • record_govt_payment(...) RPC
--   • govt_payment_student_links table
--   • government_payments table
--   • /api/fees/govt-pay endpoint (handled in client; route now stub-404s)
--
-- What's KEPT (intentionally):
--   • students.is_rte boolean — admission-record flag, surfaces only
--     on the student profile.
--   • fee_installments.payer_type column — still present for back-compat
--     with historical rows; new rows always insert 'PARENT'. UI ignores it.
--
-- The columns / table drops are CASCADE because the linkage is one-way
-- (UI doesn't read these tables anymore).
-- =============================================================

DROP FUNCTION IF EXISTS public.record_govt_payment(BIGINT, DATE, TEXT, TEXT, UUID[]);
DROP TABLE IF EXISTS public.govt_payment_student_links CASCADE;
DROP TABLE IF EXISTS public.government_payments CASCADE;
