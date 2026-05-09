-- 0091_ai_paper_quotas.sql
--
-- Two new pieces:
--
-- 1. `schools.ai_papers_monthly_limit` — INT, default 50, settable
--    by super-admin per school. 0 means UNLIMITED (boarding schools,
--    paid tier, etc). Server enforces by counting rows in
--    ai_paper_history for the current calendar month.
--
-- 2. `ai_paper_history` — captures every successfully-generated AI
--    paper. Used both for (a) the per-school monthly quota math and
--    (b) the "last 50 papers" recall list inside the principal/
--    teacher tools so a generated paper isn't lost on tab reload.
--
--    FIFO trim is enforced by an AFTER-INSERT trigger that deletes
--    the oldest rows beyond the cap (50 by default; tightened from
--    the limit if a school has a smaller monthly cap doesn't make
--    sense — the cap is store-window, not quota).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS.

BEGIN;

-- 1. Per-school monthly AI generation quota.
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS ai_papers_monthly_limit INT NOT NULL DEFAULT 50;

-- 2. Paper history. Stores prompt + generated content + metadata.
CREATE TABLE IF NOT EXISTS public.ai_paper_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  generated_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  request_json  JSONB NOT NULL,           -- full ExamPaperRequest
  paper_json    JSONB NOT NULL,           -- generated paper sections
  prompt_chars  INT,                       -- bookkeeping: how big was the prompt
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for the two read paths:
--   • Quota count: WHERE school_id=… AND created_at >= month_start
--   • History list: WHERE school_id=… ORDER BY created_at DESC LIMIT 50
CREATE INDEX IF NOT EXISTS ai_paper_history_school_created_idx
  ON public.ai_paper_history(school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_paper_history_school_month_idx
  ON public.ai_paper_history(school_id, created_at);

ALTER TABLE public.ai_paper_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_paper_history_select ON public.ai_paper_history;
CREATE POLICY ai_paper_history_select ON public.ai_paper_history FOR SELECT
USING (
  public.is_super_admin()
  OR (public.current_user_role() IN ('PRINCIPAL','TEACHER')
      AND school_id = public.current_user_school_id())
);

-- Writes flow only through the SECURITY DEFINER /api/ai/generate
-- endpoint (which uses adminDb), so the policy here is a hard NO
-- for any direct client insert/update — protects the row count
-- the quota math depends on.
DROP POLICY IF EXISTS ai_paper_history_write ON public.ai_paper_history;
CREATE POLICY ai_paper_history_write ON public.ai_paper_history FOR ALL
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

-- FIFO trim trigger — keep at most 50 rows per school. After every
-- insert, delete the oldest rows beyond the threshold so the table
-- doesn't grow unbounded.
CREATE OR REPLACE FUNCTION public.ai_paper_history_trim_fifo()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.ai_paper_history
   WHERE id IN (
     SELECT id FROM public.ai_paper_history
      WHERE school_id = NEW.school_id
      ORDER BY created_at DESC
      OFFSET 50
   );
  RETURN NULL; -- AFTER trigger
END $$;

DROP TRIGGER IF EXISTS ai_paper_history_trim_fifo_trg ON public.ai_paper_history;
CREATE TRIGGER ai_paper_history_trim_fifo_trg
AFTER INSERT ON public.ai_paper_history
FOR EACH ROW EXECUTE FUNCTION public.ai_paper_history_trim_fifo();

COMMIT;
