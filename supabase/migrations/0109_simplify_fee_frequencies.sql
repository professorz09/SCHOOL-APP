-- 0109_simplify_fee_frequencies.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Fee structures now expose only two frequencies in the UI: MONTHLY and
-- ONE_TIME. Earlier rows had QUARTERLY / HALF_YEARLY / ANNUAL too.
-- Normalize the stored `fee_heads` JSON so the schema converges to the
-- new taxonomy. Any frequency that isn't MONTHLY becomes ONE_TIME
-- (which matches how the simplified UI renders them).
--
-- Idempotent — running again is a no-op for rows already normalized.

UPDATE public.fee_structures
   SET fee_heads = (
     SELECT jsonb_agg(
       CASE
         WHEN COALESCE(h->>'frequency', 'MONTHLY') = 'MONTHLY'
           THEN h
         ELSE jsonb_set(h, '{frequency}', '"ONE_TIME"', true)
       END
       ORDER BY ord
     )
     FROM jsonb_array_elements(fee_heads) WITH ORDINALITY AS arr(h, ord)
   )
 WHERE EXISTS (
   SELECT 1 FROM jsonb_array_elements(fee_heads) e
   WHERE e->>'frequency' IN ('QUARTERLY','HALF_YEARLY','ANNUAL')
 );
