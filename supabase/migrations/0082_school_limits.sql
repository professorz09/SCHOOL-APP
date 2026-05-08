-- =============================================================
-- 0082_school_limits.sql
-- =============================================================
-- Per-school hard caps on active students + active staff. Both
-- columns nullable — NULL = no limit (default for legacy rows).
-- SUPER_ADMIN sets these from the school detail screen; principals
-- only see the usage meter.
--
-- Two enforcement guarantees:
--   1) Cannot add an (N+1)th active row when limit is set to N.
--   2) Cannot LOWER the limit below the current active count.
--      ("School me 1000 students hai aur limit 1200 hai — 800 nahi kar sakte")
--      The minimum new value is the current active count.
-- =============================================================

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS max_students INT,
  ADD COLUMN IF NOT EXISTS max_staff    INT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schools_max_students_chk') THEN
    ALTER TABLE public.schools ADD CONSTRAINT schools_max_students_chk
      CHECK (max_students IS NULL OR max_students >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schools_max_staff_chk') THEN
    ALTER TABLE public.schools ADD CONSTRAINT schools_max_staff_chk
      CHECK (max_staff IS NULL OR max_staff >= 0);
  END IF;
END $$;

-- ─── Counters ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.school_active_student_count(p_school_id UUID)
RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::INT FROM public.students
   WHERE school_id = p_school_id AND is_active = TRUE;
$$;

CREATE OR REPLACE FUNCTION public.school_active_staff_count(p_school_id UUID)
RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::INT FROM public.staff
   WHERE school_id = p_school_id AND is_active = TRUE;
$$;

GRANT EXECUTE ON FUNCTION public.school_active_student_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.school_active_staff_count(UUID)   TO authenticated;

-- ─── Pre-insert / pre-update guards ─────────────────────────────────────────
-- Trigger fires when:
--   • a new row is added, OR
--   • a soft-deleted row is reactivated (is_active flipping FALSE→TRUE).
-- It does NOT fire when a row is deactivated (FALSE), so deactivation can
-- always proceed even at limit.
CREATE OR REPLACE FUNCTION public.enforce_student_limit() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_limit INT;
  v_count INT;
BEGIN
  -- Only enforce on rows becoming active.
  IF NOT NEW.is_active THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_active = TRUE THEN RETURN NEW; END IF;

  SELECT max_students INTO v_limit FROM public.schools WHERE id = NEW.school_id;
  IF v_limit IS NULL THEN RETURN NEW; END IF;

  v_count := public.school_active_student_count(NEW.school_id);
  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'Student limit reached (% / %). Contact your platform admin to raise the limit.', v_count, v_limit
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_staff_limit() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_limit INT;
  v_count INT;
BEGIN
  IF NOT NEW.is_active THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_active = TRUE THEN RETURN NEW; END IF;

  SELECT max_staff INTO v_limit FROM public.schools WHERE id = NEW.school_id;
  IF v_limit IS NULL THEN RETURN NEW; END IF;

  v_count := public.school_active_staff_count(NEW.school_id);
  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'Staff limit reached (% / %). Contact your platform admin to raise the limit.', v_count, v_limit
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_student_limit ON public.students;
CREATE TRIGGER trg_student_limit BEFORE INSERT OR UPDATE OF is_active ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.enforce_student_limit();

DROP TRIGGER IF EXISTS trg_staff_limit ON public.staff;
CREATE TRIGGER trg_staff_limit BEFORE INSERT OR UPDATE OF is_active ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.enforce_staff_limit();

-- ─── Lowering-the-limit guard ───────────────────────────────────────────────
-- A SUPER_ADMIN cannot reduce max_students or max_staff below the current
-- active count. They CAN raise the limit, set it to NULL (unlimited), or
-- leave it untouched. Hard-blocked at the row level so any path (UI,
-- direct SQL, future API) is protected.
CREATE OR REPLACE FUNCTION public.enforce_school_limit_floor() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_active_students INT;
  v_active_staff    INT;
BEGIN
  IF NEW.max_students IS NOT NULL
     AND (OLD.max_students IS NULL OR NEW.max_students < OLD.max_students) THEN
    v_active_students := public.school_active_student_count(NEW.id);
    IF NEW.max_students < v_active_students THEN
      RAISE EXCEPTION 'Cannot lower student limit to % — school already has % active students. Set the limit to >= % or deactivate students first.',
        NEW.max_students, v_active_students, v_active_students
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.max_staff IS NOT NULL
     AND (OLD.max_staff IS NULL OR NEW.max_staff < OLD.max_staff) THEN
    v_active_staff := public.school_active_staff_count(NEW.id);
    IF NEW.max_staff < v_active_staff THEN
      RAISE EXCEPTION 'Cannot lower staff limit to % — school already has % active staff. Set the limit to >= % or deactivate staff first.',
        NEW.max_staff, v_active_staff, v_active_staff
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_school_limit_floor ON public.schools;
CREATE TRIGGER trg_school_limit_floor BEFORE UPDATE OF max_students, max_staff ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.enforce_school_limit_floor();
