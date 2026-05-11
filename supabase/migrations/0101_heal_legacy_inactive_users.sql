-- 0101_heal_legacy_inactive_users.sql
-- ─────────────────────────────────────────────────────────────────────────
-- One-shot heal for schools that were reactivated by the OLD buggy
-- cascade trigger (pre-0099). The old trigger only flipped principals
-- back to is_active = TRUE on reactivation, leaving every other user,
-- student, and staff row stuck at is_active = FALSE — making them
-- effectively invisible in every UI.
--
-- This migration restores them for any school that is currently in an
-- ACTIVE / TRIAL state. Manually-deactivated rows for other schools
-- are not touched.
--
-- Note: this does flip back rows that may have been manually
-- deactivated *before* this heal (e.g. a teacher who left the school
-- before the school itself was deactivated). Acceptable one-time cost
-- — the alternative is leaving real students invisible. Future
-- deactivate-reactivate cycles use the snapshot path from 0099/0100
-- and won't trigger this fallback.

UPDATE public.users
   SET is_active = TRUE
 WHERE is_active = FALSE
   AND role <> 'SUPER_ADMIN'
   AND school_id IN (
     SELECT id FROM public.schools WHERE status IN ('ACTIVE', 'TRIAL')
   );

UPDATE public.students
   SET is_active = TRUE
 WHERE is_active = FALSE
   AND school_id IN (
     SELECT id FROM public.schools WHERE status IN ('ACTIVE', 'TRIAL')
   );

UPDATE public.staff
   SET is_active = TRUE
 WHERE is_active = FALSE
   AND school_id IN (
     SELECT id FROM public.schools WHERE status IN ('ACTIVE', 'TRIAL')
   );
