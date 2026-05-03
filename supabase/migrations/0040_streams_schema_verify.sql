-- 0040_streams_schema_verify.sql ─────────────────────────────────────────────
-- Verify and ensure stream columns exist in all necessary tables.
-- Safe to run multiple times (uses IF NOT EXISTS).

-- academic_years.streams: already added in 0017, stores available streams for year
-- Expected default: ["Science","Commerce","Arts"]
ALTER TABLE public.academic_years
  ADD COLUMN IF NOT EXISTS streams JSONB NOT NULL DEFAULT '["Science","Commerce","Arts"]'::jsonb;

-- sections.stream: tracks which stream a section belongs to (nullable for non-stream classes)
-- For Class 11/12: must be one of academic_years.streams
-- For other classes: always NULL
ALTER TABLE public.sections
  ADD COLUMN IF NOT EXISTS stream TEXT;

-- sections.capacity: seat count for the section
ALTER TABLE public.sections
  ADD COLUMN IF NOT EXISTS capacity INT NOT NULL DEFAULT 45;

-- Index for fast section lookups by academic year + stream
CREATE INDEX IF NOT EXISTS sections_stream_idx ON public.sections(academic_year_id, stream) WHERE stream IS NOT NULL;

-- The create_academic_year_with_sections RPC (0018) already handles:
-- - Validating that Class 11/12 sections have streams from the year's available streams
-- - Ensuring non-stream classes have NULL stream values
-- - Inserting sections with capacity defaults

-- No breaking changes — all new columns have safe defaults.
