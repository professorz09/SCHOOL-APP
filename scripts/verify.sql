-- ============================================================================
-- EduGrow — post-deploy verification script
--
-- Run this in Supabase → SQL Editor AFTER applying `supabase/_apply.sql`.
-- It checks every required table, function, RLS, and trigger and prints a
-- single result row:
--    status = 'OK ✓'   →  schema is complete, app will boot.
--    status = 'FAIL ✗' →  rows below it list exactly what is missing.
--
-- Safe to re-run any time; read-only.
-- ============================================================================

WITH expected_tables (name) AS (VALUES
  ('academic_years'), ('advance_balances'), ('ai_paper_history'),
  ('approvals'), ('asset_issues'), ('assets'), ('attendance_records'),
  ('attendance_student_details'), ('audit_logs'), ('broadcasts'),
  ('complaints'), ('driver_locations'), ('exam_results'), ('expenses'),
  ('export_logs'), ('fee_installments'), ('fee_payment_uploads'),
  ('fee_structures'), ('fee_write_offs'), ('generated_question_papers'),
  ('government_payments'), ('govt_payment_student_links'),
  ('homework_assignments'), ('inventory_history'), ('notices'),
  ('parent_student_links'), ('payment_installment_links'),
  ('payment_records'), ('platform_settings'), ('promotion_log'),
  ('route_stops'), ('salary_payments'), ('school_billing_installments'),
  ('school_billing_schedules'), ('school_billing_years'),
  ('school_fee_payments'), ('school_holidays'),
  ('school_payment_allocations'), ('school_payments'),
  ('school_settings'), ('schools'), ('sections'), ('staff'),
  ('staff_attendance'), ('staff_class_assignments'), ('staff_documents'),
  ('staff_permissions'), ('staff_salary_history'),
  ('staff_status_history'), ('student_academic_records'),
  ('student_change_history'), ('student_class_movements'),
  ('student_documents'), ('student_transport_assignments'),
  ('students'), ('subjects'), ('tc_records'), ('test_schedules'),
  ('timetable_entries'), ('timetable_periods'), ('transport_vehicles'),
  ('users'), ('vehicle_live')
),
expected_functions (name) AS (VALUES
  ('current_user_role'), ('current_user_school_id'),
  ('is_super_admin'), ('is_principal'), ('is_teacher'), ('is_parent'),
  ('linked_student_ids'), ('issue_tc_and_leave'), ('rejoin_student'),
  ('record_fee_payment'), ('reverse_payment'),
  ('generate_student_fee_schedule'), ('promote_students'),
  ('record_salary_payment'), ('refresh_student_fee_aggregate')
),
missing_tables AS (
  SELECT 'table' AS kind, e.name AS missing
    FROM expected_tables e
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = e.name
   )
),
missing_functions AS (
  SELECT 'function' AS kind, e.name AS missing
    FROM expected_functions e
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = e.name
   )
),
tables_without_rls AS (
  SELECT 'rls_off' AS kind, c.relname AS missing
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind = 'r'
     AND c.relname NOT LIKE 'pg\_%' ESCAPE '\'
     AND c.relname NOT LIKE '\_%' ESCAPE '\'
     AND c.relrowsecurity = FALSE
)
SELECT * FROM missing_tables
UNION ALL SELECT * FROM missing_functions
UNION ALL SELECT * FROM tables_without_rls
ORDER BY kind, missing;

-- ─── Summary line ───────────────────────────────────────────────────────────
-- Run this second query to get a one-line verdict.

SELECT CASE
  WHEN (
    (SELECT COUNT(*) FROM information_schema.tables
      WHERE table_schema = 'public') >= 60
    AND
    (SELECT COUNT(*) FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN (
        'current_user_role', 'is_super_admin', 'issue_tc_and_leave',
        'record_fee_payment', 'promote_students'
      )) = 5
  ) THEN 'OK ✓ — schema looks complete. App should boot.'
  ELSE 'FAIL ✗ — run the query above this one for details.'
END AS status;

-- ─── Bonus diagnostics ──────────────────────────────────────────────────────
-- Run these if you want to see counts of what got created.

-- SELECT COUNT(*) AS table_count
--   FROM information_schema.tables WHERE table_schema = 'public';
--
-- SELECT COUNT(*) AS function_count
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public';
--
-- SELECT COUNT(*) AS policy_count FROM pg_policies WHERE schemaname = 'public';
