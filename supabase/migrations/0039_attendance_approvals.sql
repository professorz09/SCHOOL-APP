-- Phase 6: attendance_approvals table
-- Stores a per-record approval/rejection event log.
-- The source-of-truth lock state remains on attendance_records.is_locked /
-- approval_status for fast queries; this table provides a full audit trail.

CREATE TABLE IF NOT EXISTS attendance_approvals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id    uuid NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE,
  school_id        uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  action           text NOT NULL CHECK (action IN ('APPROVED', 'REJECTED', 'CORRECTION')),
  performed_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  reason           text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendance_approvals_attendance_id_idx
  ON attendance_approvals (attendance_id);

CREATE INDEX IF NOT EXISTS attendance_approvals_school_id_idx
  ON attendance_approvals (school_id);

-- RLS: same-school principals/teachers can read; inserts go through
-- service role (server-side only). Original draft referenced a
-- `school_admins` table that doesn't exist — replaced with the
-- canonical helpers used by every other policy.
ALTER TABLE attendance_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "school staff can view attendance_approvals" ON attendance_approvals;
CREATE POLICY "school staff can view attendance_approvals"
  ON attendance_approvals FOR SELECT
  USING (
    public.is_super_admin()
    OR (
      public.current_user_role() IN ('PRINCIPAL','TEACHER')
      AND school_id = public.current_user_school_id()
    )
  );
