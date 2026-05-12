-- 0121_audit_logs_retention.sql
-- audit_logs had no retention — every login, attendance mark, fee
-- payment, notice etc. piled up forever. For a 500-student school
-- that's ~18k rows / month / school. The login + attendance noise has
-- been stripped from the JS side (commit before this migration);
-- this migration adds a server-side cleanup function so existing
-- backlog can be purged on a schedule.
--
-- 90 days retention: covers quarterly reviews, fee year-end audits,
-- staff disputes. Older history lives in the principal's quick / full
-- backup ZIPs (already exists). Function returns INT (deleted count)
-- so the cron job can log a metric line.

CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs(p_days INT DEFAULT 90)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_deleted INT;
BEGIN
  IF p_days IS NULL OR p_days < 1 THEN
    RAISE EXCEPTION 'cleanup_old_audit_logs: p_days must be >= 1';
  END IF;

  WITH del AS (
    DELETE FROM public.audit_logs
     WHERE created_at < NOW() - (p_days || ' days')::INTERVAL
    RETURNING id
  )
  SELECT count(*)::INT INTO v_deleted FROM del;

  RETURN COALESCE(v_deleted, 0);
END $$;

REVOKE EXECUTE ON FUNCTION public.cleanup_old_audit_logs(INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cleanup_old_audit_logs(INT) TO service_role;
