-- Phase 5: Exam Enhancements
-- Add support for Regular vs Final exams with pass/fail configuration and result locking

-- 1. Add exam_type column to distinguish REGULAR vs FINAL exams
ALTER TABLE test_schedules ADD COLUMN IF NOT EXISTS exam_type TEXT DEFAULT 'REGULAR' CHECK (exam_type IN ('REGULAR', 'FINAL'));

-- 2. Add pass_marks for whole exam (used in FINAL exams)
ALTER TABLE test_schedules ADD COLUMN IF NOT EXISTS pass_marks INTEGER;

-- 3. Add pass_marks_config JSONB for subject-wise pass marks (for FINAL exams)
-- Structure: { "subject_name": pass_marks_value, ... }
ALTER TABLE test_schedules ADD COLUMN IF NOT EXISTS pass_marks_config JSONB DEFAULT '{}'::jsonb;

-- 4. Add status column for result locking (DRAFT | SUBMITTED | LOCKED)
ALTER TABLE test_schedules ADD COLUMN IF NOT EXISTS result_status TEXT DEFAULT 'DRAFT' CHECK (result_status IN ('DRAFT', 'SUBMITTED', 'LOCKED'));

-- 5. Add locked_at timestamp for audit trail
ALTER TABLE test_schedules ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP WITH TIME ZONE;

-- 6. Add locked_by staff_id for audit trail
ALTER TABLE test_schedules ADD COLUMN IF NOT EXISTS locked_by UUID REFERENCES staff(id) ON DELETE SET NULL;

-- 7. Create index on exam_type and result_status for efficient filtering
CREATE INDEX IF NOT EXISTS idx_test_schedules_exam_type_status
  ON test_schedules(school_id, academic_year_id, exam_type, result_status);

-- 8. Add comments for clarity
COMMENT ON COLUMN test_schedules.exam_type IS 'REGULAR: Unit tests, Mid-term, etc. | FINAL: Year-end exam used for promotion';
COMMENT ON COLUMN test_schedules.pass_marks IS 'Overall passing marks for FINAL exams (e.g., 50 out of 100)';
COMMENT ON COLUMN test_schedules.pass_marks_config IS 'JSON object with subject-wise passing marks for FINAL exams: {"Math": 25, "English": 20}';
COMMENT ON COLUMN test_schedules.result_status IS 'DRAFT: Results being entered | SUBMITTED: Results submitted (immutable) | LOCKED: Principal locked (can be unlocked by principal only)';
