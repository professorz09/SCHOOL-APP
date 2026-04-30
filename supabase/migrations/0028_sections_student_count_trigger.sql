-- 0028_sections_student_count_trigger.sql
-- Auto-maintain sections.student_count via trigger on student_academic_records.
-- Also adds missing RLS policies for the sections table.

-- ── Trigger function ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION _update_section_student_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_section UUID;
  v_new_section UUID;
BEGIN
  v_old_section := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN OLD.section_id ELSE NULL END;
  v_new_section := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN NEW.section_id ELSE NULL END;

  -- Recount the old section (on UPDATE when section changed, or on DELETE)
  IF v_old_section IS NOT NULL AND v_old_section IS DISTINCT FROM v_new_section THEN
    UPDATE sections
    SET student_count = (
      SELECT COUNT(*)
      FROM student_academic_records
      WHERE section_id = v_old_section
        AND status IN ('STUDYING', 'REPEATING')
    )
    WHERE id = v_old_section;
  END IF;

  -- Recount the new/current section
  IF v_new_section IS NOT NULL THEN
    UPDATE sections
    SET student_count = (
      SELECT COUNT(*)
      FROM student_academic_records
      WHERE section_id = v_new_section
        AND status IN ('STUDYING', 'REPEATING')
    )
    WHERE id = v_new_section;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- ── Attach trigger ───────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_section_student_count ON student_academic_records;
CREATE TRIGGER trg_section_student_count
  AFTER INSERT OR UPDATE OR DELETE ON student_academic_records
  FOR EACH ROW EXECUTE FUNCTION _update_section_student_count();

-- ── Backfill current counts ───────────────────────────────────────────────────

UPDATE sections s
SET student_count = (
  SELECT COUNT(*)
  FROM student_academic_records sar
  WHERE sar.section_id = s.id
    AND sar.status IN ('STUDYING', 'REPEATING')
);

-- ── RLS for sections ─────────────────────────────────────────────────────────

ALTER TABLE sections ENABLE ROW LEVEL SECURITY;

-- All school members (principals, teachers, students, parents, drivers) can read
-- sections belonging to their school.
CREATE POLICY sections_read_own_school ON sections
  FOR SELECT
  USING (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid() LIMIT 1)
    OR (SELECT role FROM users WHERE id = auth.uid() LIMIT 1) = 'SUPER_ADMIN'
  );

-- Only the principal can insert / update / delete sections in their school.
CREATE POLICY sections_principal_insert ON sections
  FOR INSERT
  WITH CHECK (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid() LIMIT 1)
    AND (SELECT role FROM users WHERE id = auth.uid() LIMIT 1) = 'PRINCIPAL'
  );

CREATE POLICY sections_principal_update ON sections
  FOR UPDATE
  USING (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid() LIMIT 1)
    AND (SELECT role FROM users WHERE id = auth.uid() LIMIT 1) = 'PRINCIPAL'
  );

CREATE POLICY sections_principal_delete ON sections
  FOR DELETE
  USING (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid() LIMIT 1)
    AND (SELECT role FROM users WHERE id = auth.uid() LIMIT 1) = 'PRINCIPAL'
  );

-- The trigger function runs as SECURITY DEFINER so it can bypass RLS when
-- updating section counts from student_academic_records events.
