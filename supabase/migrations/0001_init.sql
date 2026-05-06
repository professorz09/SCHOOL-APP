-- ============================================================================
-- EduGrow School Management — Initial Schema + RLS (Supabase)
-- Idempotent: safe to re-run on an empty or partially-applied database.
-- All primary keys are UUIDs (matches Supabase auth.users.id convention).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- TABLES
-- ============================================================================

-- Schools (root tenant) ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  location TEXT,
  address TEXT,
  phone TEXT,
  principal_name TEXT,
  principal_email TEXT,
  principal_phone TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','SUSPENDED')),
  plan TEXT NOT NULL DEFAULT 'BASIC',
  student_count INT NOT NULL DEFAULT 0,
  teacher_count INT NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'PENDING',
  payment_start_date DATE,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users (1:1 with auth.users) -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  mobile_number TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN','PRINCIPAL','TEACHER','DRIVER','PARENT','STUDENT')),
  name TEXT NOT NULL,
  email TEXT,
  school_id UUID REFERENCES public.schools(id) ON DELETE SET NULL,
  first_login_changed BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS users_school_id_idx ON public.users(school_id);
CREATE INDEX IF NOT EXISTS users_role_idx ON public.users(role);

-- Academic years -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.academic_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  board TEXT,
  medium TEXT,
  total_students INT NOT NULL DEFAULT 0,
  total_revenue BIGINT NOT NULL DEFAULT 0,
  total_expense BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(school_id, label)
);
CREATE INDEX IF NOT EXISTS academic_years_school_idx ON public.academic_years(school_id);

-- Subjects -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS subjects_school_year_idx ON public.subjects(school_id, academic_year_id);

-- Sections -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  class_name TEXT NOT NULL,
  section TEXT NOT NULL,
  class_teacher TEXT,
  student_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(academic_year_id, class_name, section)
);
CREATE INDEX IF NOT EXISTS sections_school_year_idx ON public.sections(school_id, academic_year_id);

-- Students (permanent identity) ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  admission_no TEXT UNIQUE NOT NULL,
  roll_no TEXT,
  dob DATE,
  gender TEXT,
  blood_group TEXT,
  aadhaar_no TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  photo TEXT,
  father_name TEXT,
  father_phone TEXT,
  father_email TEXT,
  father_occupation TEXT,
  father_income TEXT,
  mother_name TEXT,
  mother_phone TEXT,
  mother_occupation TEXT,
  guardian_name TEXT,
  guardian_phone TEXT,
  guardian_relation TEXT,
  religion TEXT,
  caste TEXT,
  pen_number TEXT,
  birth_cert_no TEXT,
  tc_number TEXT,
  is_rte BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','TC_ISSUED')),
  admission_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS students_school_idx ON public.students(school_id);
CREATE INDEX IF NOT EXISTS students_user_idx ON public.students(user_id);

-- Student documents ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  doc_url TEXT NOT NULL,
  uploaded_by UUID REFERENCES public.users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS student_documents_student_idx ON public.student_documents(student_id);

-- Parent ↔ student links -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.parent_student_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  relation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(parent_user_id, student_id)
);
CREATE INDEX IF NOT EXISTS parent_student_links_parent_idx ON public.parent_student_links(parent_user_id);
CREATE INDEX IF NOT EXISTS parent_student_links_student_idx ON public.parent_student_links(student_id);

-- Student academic record (per year) -----------------------------------------
CREATE TABLE IF NOT EXISTS public.student_academic_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  section_id UUID REFERENCES public.sections(id),
  class_name TEXT,
  section TEXT,
  roll_no TEXT,
  fee_status TEXT NOT NULL DEFAULT 'PENDING',
  total_fee BIGINT NOT NULL DEFAULT 0,
  paid_fee BIGINT NOT NULL DEFAULT 0,
  attendance_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  is_promoted BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'STUDYING' CHECK (status IN ('STUDYING','PROMOTED','FAILED','TC')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, academic_year_id)
);

-- Student change history -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_change_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  reason TEXT,
  proof_url TEXT,
  changed_by UUID REFERENCES public.users(id),
  approved_by UUID REFERENCES public.users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Student class movements (mid-year) -----------------------------------------
CREATE TABLE IF NOT EXISTS public.student_class_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  old_class TEXT,
  old_section TEXT,
  new_class TEXT,
  new_section TEXT,
  effective_date DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Staff (permanent identity) -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  subject TEXT,
  phone TEXT,
  email TEXT,
  aadhaar_no TEXT,
  salary BIGINT NOT NULL DEFAULT 0,
  joining_date DATE,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  address TEXT,
  photo TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS staff_school_idx ON public.staff(school_id);
CREATE INDEX IF NOT EXISTS staff_user_idx ON public.staff(user_id);

-- Staff class assignments ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_class_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE CASCADE,
  class_name TEXT NOT NULL
);
ALTER TABLE public.staff_class_assignments
  ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS sca_school_idx ON public.staff_class_assignments(school_id);
CREATE INDEX IF NOT EXISTS sca_staff_idx ON public.staff_class_assignments(staff_id);

-- Staff permissions (per academic year) --------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  section_id UUID REFERENCES public.sections(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.staff_permissions
  ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS sp_school_idx ON public.staff_permissions(school_id);
CREATE INDEX IF NOT EXISTS sp_staff_idx ON public.staff_permissions(staff_id);

-- Salary payments ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.salary_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  amount BIGINT NOT NULL,
  paid_at DATE NOT NULL DEFAULT CURRENT_DATE,
  transaction_id TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS salary_payments_school_idx ON public.salary_payments(school_id);

-- Fee installments -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fee_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  due_date DATE NOT NULL,
  fee_type TEXT NOT NULL,
  amount BIGINT NOT NULL,
  paid_amount BIGINT NOT NULL DEFAULT 0,
  write_off_amount BIGINT NOT NULL DEFAULT 0,
  write_off_reason TEXT,
  status TEXT NOT NULL DEFAULT 'UNPAID',
  payer_type TEXT NOT NULL DEFAULT 'PARENT',
  related_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fee_installments_student_year_idx ON public.fee_installments(student_id, academic_year_id);
CREATE INDEX IF NOT EXISTS fee_installments_school_idx ON public.fee_installments(school_id);

-- Payment records ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL,
  method TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  receipt_no TEXT UNIQUE NOT NULL,
  advance_amount BIGINT NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS payment_records_school_idx ON public.payment_records(school_id);

-- Payment ↔ installment allocation links -------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_installment_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.payment_records(id) ON DELETE CASCADE,
  installment_id UUID NOT NULL REFERENCES public.fee_installments(id) ON DELETE CASCADE,
  amount_applied BIGINT NOT NULL DEFAULT 0
);

-- Fee write-offs -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fee_write_offs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installment_id UUID NOT NULL REFERENCES public.fee_installments(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL,
  reason TEXT NOT NULL,
  approved_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Advance balances -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.advance_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID UNIQUE NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Government payments --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.government_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference_no TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.govt_payment_student_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  govt_payment_id UUID NOT NULL REFERENCES public.government_payments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE
);

-- Attendance -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  section_id UUID REFERENCES public.sections(id),
  class_name TEXT,
  section TEXT,
  date DATE NOT NULL,
  total_present INT NOT NULL DEFAULT 0,
  total_absent INT NOT NULL DEFAULT 0,
  total_students INT NOT NULL DEFAULT 0,
  marked_by UUID REFERENCES public.users(id),
  approved_by UUID REFERENCES public.users(id),
  approval_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (approval_status IN ('PENDING','APPROVED','REJECTED')),
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(section_id, date)
);
CREATE INDEX IF NOT EXISTS attendance_records_school_idx ON public.attendance_records(school_id);

CREATE TABLE IF NOT EXISTS public.attendance_student_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id UUID NOT NULL REFERENCES public.attendance_records(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  is_present BOOLEAN NOT NULL,
  UNIQUE(attendance_id, student_id)
);

-- Timetable ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.timetable_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  period_type TEXT NOT NULL DEFAULT 'TEACHING',
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.timetable_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL,
  day TEXT NOT NULL,
  slot_id TEXT NOT NULL,
  subject TEXT,
  teacher_id UUID REFERENCES public.staff(id),
  teacher_name TEXT,
  room TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(section_id, day, slot_id)
);
CREATE INDEX IF NOT EXISTS timetable_entries_school_idx ON public.timetable_entries(school_id);

-- Transport ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transport_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  vehicle_no TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL DEFAULT 'BUS',
  capacity INT NOT NULL DEFAULT 0,
  route_name TEXT,
  driver_id UUID REFERENCES public.staff(id),
  driver_name TEXT,
  driver_phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS transport_vehicles_school_idx ON public.transport_vehicles(school_id);

CREATE TABLE IF NOT EXISTS public.route_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES public.transport_vehicles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  estimated_time TEXT,
  lat DECIMAL(10,7),
  lng DECIMAL(10,7),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.student_transport_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES public.transport_vehicles(id),
  stop_id UUID REFERENCES public.route_stops(id),
  monthly_amount BIGINT NOT NULL DEFAULT 0,
  start_date DATE,
  end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.driver_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES public.transport_vehicles(id) ON DELETE CASCADE,
  lat DECIMAL(10,7) NOT NULL,
  lng DECIMAL(10,7) NOT NULL,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS driver_locations_vehicle_idx ON public.driver_locations(vehicle_id, reported_at DESC);

-- Homework -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.homework_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  section_id UUID REFERENCES public.sections(id),
  teacher_id UUID REFERENCES public.staff(id),
  class_name TEXT,
  section TEXT,
  subject TEXT,
  title TEXT NOT NULL,
  description TEXT,
  assigned_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  submitted_count INT NOT NULL DEFAULT 0,
  total_students INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notices --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'ALL',
  sent_by UUID REFERENCES public.users(id),
  sent_by_name TEXT,
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tests / Exam results -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.test_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  section_id UUID REFERENCES public.sections(id),
  teacher_id UUID REFERENCES public.staff(id),
  class_name TEXT,
  section TEXT,
  subject TEXT,
  test_type TEXT NOT NULL DEFAULT 'UNIT_TEST',
  title TEXT NOT NULL,
  scheduled_date DATE,
  duration INT,
  max_marks INT,
  syllabus TEXT,
  results_uploaded BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.exam_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES public.test_schedules(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  obtained_marks DECIMAL(6,2),
  grade TEXT,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(test_id, student_id)
);

-- Complaints -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.complaints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  from_role TEXT NOT NULL,
  from_name TEXT,
  from_user_id UUID REFERENCES public.users(id),
  from_class TEXT,
  subject TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN',
  response TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Expenses -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id UUID REFERENCES public.academic_years(id),
  category TEXT NOT NULL,
  amount BIGINT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  bill_url TEXT,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Approvals ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL,
  requested_by UUID REFERENCES public.users(id),
  entity_type TEXT,
  entity_id UUID,
  old_value JSONB,
  new_value JSONB,
  proof_url TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  approved_by UUID REFERENCES public.users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Broadcasts (super admin → schools) -----------------------------------------
CREATE TABLE IF NOT EXISTS public.broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sent_by UUID REFERENCES public.users(id),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  target_schools UUID[],
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- School billing -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.school_billing_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID UNIQUE NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  annual_amount BIGINT NOT NULL,
  billing_start_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.school_billing_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  year_label TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  annual_amount BIGINT NOT NULL,
  carried_forward BIGINT NOT NULL DEFAULT 0,
  total_due BIGINT NOT NULL,
  total_paid BIGINT NOT NULL DEFAULT 0,
  outstanding BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.school_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  billing_year_id UUID REFERENCES public.school_billing_years(id),
  amount BIGINT NOT NULL,
  paid_at DATE NOT NULL DEFAULT CURRENT_DATE,
  txn_id TEXT,
  method TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.school_payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_payment_id UUID NOT NULL REFERENCES public.school_payments(id) ON DELETE CASCADE,
  billing_year_id UUID NOT NULL REFERENCES public.school_billing_years(id) ON DELETE CASCADE,
  amount_applied BIGINT NOT NULL
);

-- Audit logs -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id),
  school_id UUID REFERENCES public.schools(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_logs_school_idx ON public.audit_logs(school_id, created_at DESC);

-- ============================================================================
-- HELPER FUNCTIONS (for RLS)
-- SECURITY DEFINER bypasses RLS on the users table to avoid recursion.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.current_user_role() RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.users WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.current_user_school_id() RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT school_id FROM public.users WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'SUPER_ADMIN' AND is_active
  )
$$;

CREATE OR REPLACE FUNCTION public.is_principal() RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'PRINCIPAL' AND is_active
  )
$$;

-- Returns the set of student.id values the current user can act on:
--   * STUDENT users → their own student row (students.user_id = auth.uid())
--   * PARENT  users → every student linked via parent_student_links
-- Used by RLS to scope reads/writes for both roles through one helper.
CREATE OR REPLACE FUNCTION public.linked_student_ids() RETURNS UUID[]
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(sid), ARRAY[]::UUID[]) FROM (
    SELECT student_id AS sid
    FROM public.parent_student_links
    WHERE parent_user_id = auth.uid()
    UNION
    SELECT id AS sid
    FROM public.students
    WHERE user_id = auth.uid()
  ) q
$$;

CREATE OR REPLACE FUNCTION public.driver_vehicle_ids() RETURNS UUID[]
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(v.id), ARRAY[]::UUID[])
  FROM public.transport_vehicles v
  JOIN public.staff s ON s.id = v.driver_id
  WHERE s.user_id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_school_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_principal() TO authenticated;
GRANT EXECUTE ON FUNCTION public.linked_student_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.driver_vehicle_ids() TO authenticated;

-- ============================================================================
-- updated_at TRIGGER
-- ============================================================================
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['schools','users','students','staff','transport_vehicles','fee_installments']) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', t, t);
  END LOOP;
END $$;

-- ============================================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ============================================================================
-- POLICIES
-- Pattern: SUPER_ADMIN sees all; PRINCIPAL/TEACHER/staff see same school;
-- PARENT sees only linked students' data; DRIVER sees own vehicle/route data.
-- Writes are restricted to SUPER_ADMIN and PRINCIPAL by default; later tasks
-- will refine teacher/parent write policies per feature.
-- ============================================================================

-- ─── users (own row + admins) ────────────────────────────────────────────────
DROP POLICY IF EXISTS users_select_self_or_admin ON public.users;
CREATE POLICY users_select_self_or_admin ON public.users FOR SELECT
  USING (
    id = auth.uid()
    OR public.is_super_admin()
    OR (public.is_principal() AND school_id = public.current_user_school_id())
  );

DROP POLICY IF EXISTS users_update_self ON public.users;
CREATE POLICY users_update_self ON public.users FOR UPDATE
  USING (id = auth.uid() OR public.is_super_admin())
  WITH CHECK (id = auth.uid() OR public.is_super_admin());

-- Lock down sensitive user columns: a non–super-admin can only touch profile
-- fields (name, email). Role / school_id / is_active / first_login_changed /
-- mobile_number / created_at are forced back to OLD values, so a malicious
-- client cannot self-promote to SUPER_ADMIN or jump tenants by updating their
-- own row. The first-login flag flip is exposed via the SECURITY DEFINER RPC
-- public.mark_first_login_complete() further down.
CREATE OR REPLACE FUNCTION public.users_prevent_self_escalation() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- service role / admin tooling, allow
  END IF;
  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;
  NEW.id := OLD.id;
  NEW.role := OLD.role;
  NEW.school_id := OLD.school_id;
  NEW.is_active := OLD.is_active;
  NEW.first_login_changed := OLD.first_login_changed;
  NEW.mobile_number := OLD.mobile_number;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_prevent_self_escalation ON public.users;
CREATE TRIGGER users_prevent_self_escalation
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.users_prevent_self_escalation();

-- One-way RPC the user calls after their first-login password change.
CREATE OR REPLACE FUNCTION public.mark_first_login_complete() RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  UPDATE public.users SET first_login_changed = TRUE WHERE id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION public.mark_first_login_complete() TO authenticated;

-- Inserts/deletes for users go through service role (admin createUser flow)

-- ─── schools ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS schools_select ON public.schools;
CREATE POLICY schools_select ON public.schools FOR SELECT
  USING (public.is_super_admin() OR id = public.current_user_school_id());

DROP POLICY IF EXISTS schools_admin_all ON public.schools;
CREATE POLICY schools_admin_all ON public.schools FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS schools_principal_update ON public.schools;
CREATE POLICY schools_principal_update ON public.schools FOR UPDATE
  USING (public.is_principal() AND id = public.current_user_school_id())
  WITH CHECK (public.is_principal() AND id = public.current_user_school_id());

-- ─── parent_student_links ──────────────────────────────────────────────────
DROP POLICY IF EXISTS psl_select ON public.parent_student_links;
CREATE POLICY psl_select ON public.parent_student_links FOR SELECT
  USING (
    parent_user_id = auth.uid()
    OR public.is_super_admin()
    OR (public.is_principal() AND EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_id AND s.school_id = public.current_user_school_id()
    ))
  );

DROP POLICY IF EXISTS psl_admin_write ON public.parent_student_links;
CREATE POLICY psl_admin_write ON public.parent_student_links FOR ALL
  USING (public.is_super_admin() OR public.is_principal())
  WITH CHECK (public.is_super_admin() OR public.is_principal());

-- ─── Generic helper for school-scoped tables ────────────────────────────────
-- We apply SELECT for: super admin OR same-school OR (parent & row belongs to linked student)
-- We apply WRITE  for: super admin OR principal (same school)
-- Tables with student_id column also allow parents to SELECT their child's rows.

-- Tables where every row has a school_id column.
-- SELECT: staff-side roles (PRINCIPAL/TEACHER) of the same school, or SUPER_ADMIN.
--         STUDENT/PARENT/DRIVER do NOT get blanket school read access here — they
--         get narrow access via the *_parent_select / driver / linked-student
--         policies declared further below.
-- WRITE:  SUPER_ADMIN or PRINCIPAL of the same school.
DO $$
DECLARE t TEXT;
DECLARE tables TEXT[] := ARRAY[
  'academic_years','subjects','sections','staff','staff_class_assignments',
  'staff_permissions','salary_payments','fee_installments','payment_records',
  'government_payments','attendance_records','timetable_periods','timetable_entries',
  'transport_vehicles','homework_assignments','notices','test_schedules','complaints',
  'expenses','approvals','school_billing_schedules','school_billing_years','school_payments',
  'audit_logs','students'
];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (public.is_super_admin() OR (public.current_user_role() IN (''PRINCIPAL'',''TEACHER'') AND school_id = public.current_user_school_id()))',
      t || '_select', t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_write', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (public.is_super_admin() OR (public.is_principal() AND school_id = public.current_user_school_id())) WITH CHECK (public.is_super_admin() OR (public.is_principal() AND school_id = public.current_user_school_id()))',
      t || '_write', t
    );
  END LOOP;
END $$;

-- Parents may also read rows tied to their linked students -------------------
DO $$
DECLARE t TEXT;
DECLARE tables TEXT[] := ARRAY[
  'fee_installments','payment_records','attendance_records','test_schedules'
];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_parent_select', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS students_parent_select ON public.students;
CREATE POLICY students_parent_select ON public.students FOR SELECT
  USING (id = ANY(public.linked_student_ids()));

DROP POLICY IF EXISTS fee_installments_parent_select ON public.fee_installments;
CREATE POLICY fee_installments_parent_select ON public.fee_installments FOR SELECT
  USING (student_id = ANY(public.linked_student_ids()));

DROP POLICY IF EXISTS payment_records_parent_select ON public.payment_records;
CREATE POLICY payment_records_parent_select ON public.payment_records FOR SELECT
  USING (student_id = ANY(public.linked_student_ids()));

-- Tables with student_id but no school_id (or where we want parent access) ---
DROP POLICY IF EXISTS sad_select ON public.student_academic_records;
CREATE POLICY sad_select ON public.student_academic_records FOR SELECT
  USING (
    public.is_super_admin()
    OR student_id = ANY(public.linked_student_ids())
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.school_id = public.current_user_school_id())
  );
DROP POLICY IF EXISTS sad_write ON public.student_academic_records;
CREATE POLICY sad_write ON public.student_academic_records FOR ALL
  USING (
    public.is_super_admin()
    OR (public.is_principal() AND EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.school_id = public.current_user_school_id()))
  )
  WITH CHECK (
    public.is_super_admin()
    OR (public.is_principal() AND EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.school_id = public.current_user_school_id()))
  );

DROP POLICY IF EXISTS sdocs_select ON public.student_documents;
CREATE POLICY sdocs_select ON public.student_documents FOR SELECT
  USING (
    public.is_super_admin()
    OR student_id = ANY(public.linked_student_ids())
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.school_id = public.current_user_school_id())
  );
DROP POLICY IF EXISTS sdocs_write ON public.student_documents;
CREATE POLICY sdocs_write ON public.student_documents FOR ALL
  USING (
    public.is_super_admin()
    OR (public.is_principal() AND EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.school_id = public.current_user_school_id()))
  )
  WITH CHECK (
    public.is_super_admin()
    OR (public.is_principal() AND EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.school_id = public.current_user_school_id()))
  );

DROP POLICY IF EXISTS sch_select ON public.student_change_history;
CREATE POLICY sch_select ON public.student_change_history FOR SELECT
  USING (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.school_id = public.current_user_school_id())
  );

DROP POLICY IF EXISTS scm_select ON public.student_class_movements;
CREATE POLICY scm_select ON public.student_class_movements FOR SELECT
  USING (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.school_id = public.current_user_school_id())
  );

DROP POLICY IF EXISTS attsd_select ON public.attendance_student_details;
CREATE POLICY attsd_select ON public.attendance_student_details FOR SELECT
  USING (
    public.is_super_admin()
    OR student_id = ANY(public.linked_student_ids())
    OR EXISTS (SELECT 1 FROM public.attendance_records r WHERE r.id = attendance_id AND r.school_id = public.current_user_school_id())
  );
DROP POLICY IF EXISTS attsd_write ON public.attendance_student_details;
CREATE POLICY attsd_write ON public.attendance_student_details FOR ALL
  USING (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.attendance_records r WHERE r.id = attendance_id AND r.school_id = public.current_user_school_id())
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.attendance_records r WHERE r.id = attendance_id AND r.school_id = public.current_user_school_id())
  );

DROP POLICY IF EXISTS pil_select ON public.payment_installment_links;
CREATE POLICY pil_select ON public.payment_installment_links FOR SELECT
  USING (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.payment_records p WHERE p.id = payment_id AND (p.school_id = public.current_user_school_id() OR p.student_id = ANY(public.linked_student_ids())))
  );

DROP POLICY IF EXISTS fwo_select ON public.fee_write_offs;
CREATE POLICY fwo_select ON public.fee_write_offs FOR SELECT
  USING (public.is_super_admin() OR school_id = public.current_user_school_id());
DROP POLICY IF EXISTS fwo_write ON public.fee_write_offs;
CREATE POLICY fwo_write ON public.fee_write_offs FOR ALL
  USING (public.is_super_admin() OR (public.is_principal() AND school_id = public.current_user_school_id()))
  WITH CHECK (public.is_super_admin() OR (public.is_principal() AND school_id = public.current_user_school_id()));

DROP POLICY IF EXISTS adv_select ON public.advance_balances;
CREATE POLICY adv_select ON public.advance_balances FOR SELECT
  USING (
    public.is_super_admin()
    OR student_id = ANY(public.linked_student_ids())
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.school_id = public.current_user_school_id())
  );

DROP POLICY IF EXISTS gpsl_select ON public.govt_payment_student_links;
CREATE POLICY gpsl_select ON public.govt_payment_student_links FOR SELECT
  USING (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.government_payments g WHERE g.id = govt_payment_id AND g.school_id = public.current_user_school_id())
  );

DROP POLICY IF EXISTS er_select ON public.exam_results;
CREATE POLICY er_select ON public.exam_results FOR SELECT
  USING (
    public.is_super_admin()
    OR student_id = ANY(public.linked_student_ids())
    OR EXISTS (SELECT 1 FROM public.test_schedules t WHERE t.id = test_id AND t.school_id = public.current_user_school_id())
  );

-- Transport: drivers can SELECT/UPDATE their own vehicle & route -------------
DROP POLICY IF EXISTS tv_driver_select ON public.transport_vehicles;
CREATE POLICY tv_driver_select ON public.transport_vehicles FOR SELECT
  USING (id = ANY(public.driver_vehicle_ids()));

DROP POLICY IF EXISTS rs_select ON public.route_stops;
CREATE POLICY rs_select ON public.route_stops FOR SELECT
  USING (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.transport_vehicles v WHERE v.id = vehicle_id AND (v.school_id = public.current_user_school_id() OR v.id = ANY(public.driver_vehicle_ids())))
  );
DROP POLICY IF EXISTS rs_write ON public.route_stops;
CREATE POLICY rs_write ON public.route_stops FOR ALL
  USING (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.transport_vehicles v WHERE v.id = vehicle_id AND public.is_principal() AND v.school_id = public.current_user_school_id())
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.transport_vehicles v WHERE v.id = vehicle_id AND public.is_principal() AND v.school_id = public.current_user_school_id())
  );

DROP POLICY IF EXISTS sta_select ON public.student_transport_assignments;
CREATE POLICY sta_select ON public.student_transport_assignments FOR SELECT
  USING (
    public.is_super_admin()
    OR student_id = ANY(public.linked_student_ids())
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.school_id = public.current_user_school_id())
    OR EXISTS (SELECT 1 FROM public.transport_vehicles v WHERE v.id = vehicle_id AND v.id = ANY(public.driver_vehicle_ids()))
  );

DROP POLICY IF EXISTS dl_select ON public.driver_locations;
CREATE POLICY dl_select ON public.driver_locations FOR SELECT
  USING (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.transport_vehicles v WHERE v.id = vehicle_id AND (v.school_id = public.current_user_school_id() OR v.id = ANY(public.driver_vehicle_ids())))
  );
DROP POLICY IF EXISTS dl_driver_insert ON public.driver_locations;
CREATE POLICY dl_driver_insert ON public.driver_locations FOR INSERT
  WITH CHECK (vehicle_id = ANY(public.driver_vehicle_ids()));

-- school billing payment allocations -----------------------------------------
DROP POLICY IF EXISTS spa_select ON public.school_payment_allocations;
CREATE POLICY spa_select ON public.school_payment_allocations FOR SELECT
  USING (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.school_payments p WHERE p.id = school_payment_id AND p.school_id = public.current_user_school_id())
  );
DROP POLICY IF EXISTS spa_admin_write ON public.school_payment_allocations;
CREATE POLICY spa_admin_write ON public.school_payment_allocations FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- broadcasts: every authenticated user can read --------------------------------
DROP POLICY IF EXISTS broadcasts_select ON public.broadcasts;
CREATE POLICY broadcasts_select ON public.broadcasts FOR SELECT
  USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS broadcasts_admin_write ON public.broadcasts;
CREATE POLICY broadcasts_admin_write ON public.broadcasts FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- complaints: any user can INSERT a complaint they author ---------------------
DROP POLICY IF EXISTS complaints_user_insert ON public.complaints;
CREATE POLICY complaints_user_insert ON public.complaints FOR INSERT
  WITH CHECK (from_user_id = auth.uid());

-- ─── Permanent identity rule ────────────────────────────────────────────────
-- students and staff rows must NEVER be hard-deleted; they are deactivated
-- via is_active=false instead. We enforce this at the DB layer with a
-- BEFORE DELETE trigger that always raises, regardless of the caller's role.
-- (Even SUPER_ADMIN cannot bypass it without disabling the trigger.)
CREATE OR REPLACE FUNCTION public.prevent_hard_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    '% rows are permanent identities and cannot be deleted; set is_active=false instead',
    TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS students_no_delete ON public.students;
CREATE TRIGGER students_no_delete
  BEFORE DELETE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete();

DROP TRIGGER IF EXISTS staff_no_delete ON public.staff;
CREATE TRIGGER staff_no_delete
  BEFORE DELETE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete();

DROP TRIGGER IF EXISTS users_no_delete ON public.users;
CREATE TRIGGER users_no_delete
  BEFORE DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete();
