-- 0108_timetable_periods_per_class.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Per-class timetable schedules. Earlier `timetable_periods` was scoped
-- only to (school, year) which forced every class to share the same
-- 6/7/8-period layout. Real schools vary: Class 5 may have 5 periods,
-- Class 11 may have 8. Adding `class_name` (nullable) lets each class
-- declare its own slot set while keeping the default fallback path.
--
-- Resolution rule used by the service:
--   • If rows with class_name = X exist for this (school, year) → use them.
--   • Else fall back to rows with class_name = NULL (the school default).
--   • Else fall back to the hard-coded DEFAULT_SLOTS in the JS layer.

ALTER TABLE public.timetable_periods
  ADD COLUMN IF NOT EXISTS class_name TEXT;

-- Index for the common lookup: school + year + (class or NULL).
CREATE INDEX IF NOT EXISTS timetable_periods_school_year_class_idx
  ON public.timetable_periods (school_id, academic_year_id, class_name, sort_order);
