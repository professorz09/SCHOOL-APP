-- 0013_fee_upload_auto_record.sql
-- When a principal approves a fee_payment_uploads row, automatically record
-- the corresponding parent payment via record_fee_payment() in the same
-- transaction so the student's installment ledger and the upload row never
-- drift apart. Approving twice is idempotent — the second call returns the
-- previously-recorded payment id without inserting a duplicate.
-- ---------------------------------------------------------------------------

-- 1. Audit-trail link from the upload row to the resulting payment.
ALTER TABLE public.fee_payment_uploads
  ADD COLUMN IF NOT EXISTS recorded_payment_id UUID
    REFERENCES public.payment_records(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS fpu_recorded_payment_idx
  ON public.fee_payment_uploads(recorded_payment_id)
  WHERE recorded_payment_id IS NOT NULL;

-- 2. SECURITY DEFINER RPC that wraps the review + payment recording in one
--    transaction. Returns the payment_records.id when a payment was created
--    (or already exists from a prior approval), NULL otherwise.
CREATE OR REPLACE FUNCTION public.review_fee_payment_upload(
  p_upload_id UUID,
  p_decision  TEXT,
  p_note      TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller     UUID := auth.uid();
  v_upload     RECORD;
  v_payment_id UUID;
  v_note       TEXT := NULLIF(BTRIM(COALESCE(p_note, '')), '');
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_decision NOT IN ('APPROVED','REJECTED') THEN
    RAISE EXCEPTION 'invalid decision: %', p_decision;
  END IF;

  -- Lock the upload row for the duration of the txn so two concurrent
  -- approvals can't both race past the idempotency check below.
  SELECT id, school_id, student_id, amount, status, recorded_payment_id
    INTO v_upload
    FROM public.fee_payment_uploads
   WHERE id = p_upload_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'fee upload not found'; END IF;

  -- Authorisation: super admin or principal of the upload's school.
  IF NOT (public.is_super_admin()
          OR (public.is_principal()
              AND public.current_user_school_id() = v_upload.school_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Idempotency: re-applying the same decision is a no-op that returns the
  -- previously-recorded payment id (if any). Switching decisions on an
  -- already-reviewed row is rejected to avoid the ledger silently flipping.
  IF v_upload.status <> 'PENDING' THEN
    IF v_upload.status = p_decision THEN
      RETURN v_upload.recorded_payment_id;
    END IF;
    RAISE EXCEPTION 'upload already %; cannot change to %', v_upload.status, p_decision;
  END IF;

  IF p_decision = 'APPROVED' THEN
    -- Only create a payment for non-zero amounts; the upload table allows
    -- amount = 0 but a 0-rupee payment row would be meaningless.
    IF v_upload.amount > 0 THEN
      v_payment_id := public.record_fee_payment(
        v_upload.student_id,
        v_upload.amount,
        'UPI',
        CURRENT_DATE,
        COALESCE(v_note, 'Auto-recorded from parent upload ' || v_upload.id::text),
        FALSE
      );
    END IF;
  END IF;

  UPDATE public.fee_payment_uploads
     SET status              = p_decision,
         reviewed_by         = v_caller,
         reviewed_at         = NOW(),
         reviewer_note       = v_note,
         recorded_payment_id = COALESCE(v_payment_id, recorded_payment_id)
   WHERE id = p_upload_id;

  PERFORM public.log_audit(
    'fee_payment_upload_reviewed',
    'fee_payment_uploads',
    p_upload_id,
    jsonb_build_object(
      'decision', p_decision,
      'payment_id', v_payment_id,
      'amount', v_upload.amount
    )
  );

  RETURN v_payment_id;
END $$;

GRANT EXECUTE ON FUNCTION public.review_fee_payment_upload(UUID, TEXT, TEXT)
  TO authenticated;
