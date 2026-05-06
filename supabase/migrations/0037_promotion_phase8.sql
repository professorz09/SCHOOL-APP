-- 0037_promotion_phase8.sql
--
-- Phase 8: Year Close + Promotion Wizard DB foundations
--
-- Adds:
--   • promoted_to_record_id column on student_academic_records (link old → new)
--   • tc_records table (TC issuance date + remarks, per student per year)
--   • promotion_log table (audit trail for every PROMOTE / RETAIN / TC decision)
--
-- Idempotent: IF NOT EXISTS / IF NOT EXISTS guards throughout.

BEGIN;

-- ─── 1. student_academic_records: link to the promoted-into record ─────────────

ALTER TABLE public.student_academic_records
  ADD COLUMN IF NOT EXISTS promoted_to_record_id UUID
    REFERENCES public.student_academic_records(id) ON DELETE SET NULL;

-- ─── 2. tc_records — one row per TC issuance ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tc_records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES public.schools(id)         ON DELETE CASCADE,
  student_id       UUID NOT NULL REFERENCES public.students(id),
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id),
  from_record_id   UUID             REFERENCES public.student_academic_records(id) ON DELETE SET NULL,
  tc_date          DATE NOT NULL,
  remarks          TEXT,
  issued_by        UUID             REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tc_records_student_idx  ON public.tc_records(student_id);
CREATE INDEX IF NOT EXISTS tc_records_school_idx   ON public.tc_records(school_id);
CREATE INDEX IF NOT EXISTS tc_records_year_idx     ON public.tc_records(academic_year_id);

-- Prevent duplicate TC for same student in same year
CREATE UNIQUE INDEX IF NOT EXISTS tc_records_student_year_uniq
  ON public.tc_records(student_id, academic_year_id);

-- ─── 3. promotion_log — full audit trail ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.promotion_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      UUID NOT NULL REFERENCES public.schools(id)         ON DELETE CASCADE,
  from_year_id   UUID NOT NULL REFERENCES public.academic_years(id),
  to_year_id     UUID             REFERENCES public.academic_years(id),
  student_id     UUID NOT NULL REFERENCES public.students(id),
  from_record_id UUID             REFERENCES public.student_academic_records(id) ON DELETE SET NULL,
  to_record_id   UUID             REFERENCES public.student_academic_records(id) ON DELETE SET NULL,
  decision       TEXT NOT NULL CHECK (decision IN ('PROMOTE', 'RETAIN', 'TC')),
  from_class     TEXT,
  to_class       TEXT,
  tc_date        DATE,
  promoted_by    UUID             REFERENCES public.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS promotion_log_student_idx   ON public.promotion_log(student_id);
CREATE INDEX IF NOT EXISTS promotion_log_school_idx    ON public.promotion_log(school_id);
CREATE INDEX IF NOT EXISTS promotion_log_from_year_idx ON public.promotion_log(from_year_id);

COMMIT;
