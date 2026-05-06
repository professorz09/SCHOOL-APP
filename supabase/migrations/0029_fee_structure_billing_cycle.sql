-- 0029_fee_structure_billing_cycle.sql
-- Adds billing_cycle column to fee_structures so the principal can choose
-- Monthly / Quarterly / Half-Yearly / Annually / Custom billing periods.

ALTER TABLE public.fee_structures
  ADD COLUMN IF NOT EXISTS billing_cycle TEXT NOT NULL DEFAULT 'MONTHLY'
    CHECK (billing_cycle IN ('MONTHLY','QUARTERLY','HALF_YEARLY','ANNUALLY','CUSTOM'));
