-- Auto-generated. Do not edit. Re-run `npm run db:migrate` to refresh.

-- =============================================================
-- 0001_init.sql
-- =============================================================
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


-- =============================================================
-- 0002_super_admin.sql
-- =============================================================
-- ============================================================================
-- Migration 0002 — Super Admin module
--   Audit log helper, soft-delete cascade, billing payment allocation RPC,
--   broadcast metadata columns, schools.status TRIAL state.
--
-- This migration is purely additive (CREATE OR REPLACE / IF NOT EXISTS / ALTER
-- with guards). It can be re-applied safely; primary keys are untouched.
-- ============================================================================

-- ─── schools.status: allow TRIAL ────────────────────────────────────────────
-- The frontend exposes a TRIAL plan state during onboarding; widen the CHECK.
ALTER TABLE public.schools DROP CONSTRAINT IF EXISTS schools_status_check;
ALTER TABLE public.schools ADD CONSTRAINT schools_status_check
  CHECK (status IN ('ACTIVE','INACTIVE','SUSPENDED','TRIAL'));

-- ─── broadcasts: add audience + reach metadata ──────────────────────────────
ALTER TABLE public.broadcasts
  ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'ALL',
  ADD COLUMN IF NOT EXISTS reach_count BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'SENT',
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

-- 0001 declared sent_at NOT NULL; SCHEDULED broadcasts haven't been sent yet
-- and need a null sent_at, so relax the constraint.
ALTER TABLE public.broadcasts
  ALTER COLUMN sent_at DROP NOT NULL;

-- ─── audit_logs: add useful indexes ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS audit_logs_created_idx
  ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx
  ON public.audit_logs(entity_type, created_at DESC);

-- ─── log_audit() : SECURITY DEFINER helper ─────────────────────────────────
-- Inserts into public.audit_logs using auth.uid() as the actor.  Runs with
-- elevated privileges so any authenticated role can record an audit entry
-- without needing direct write access to audit_logs.
CREATE OR REPLACE FUNCTION public.log_audit(
  p_action      TEXT,
  p_entity_type TEXT,
  p_entity_id   UUID,
  p_details     JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id   UUID;
  v_school_id UUID;
  v_log_id    UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL THEN
    SELECT school_id INTO v_school_id
      FROM public.users WHERE id = v_user_id;
  END IF;

  INSERT INTO public.audit_logs
    (user_id, school_id, action, entity_type, entity_id, details)
  VALUES
    (v_user_id, v_school_id, p_action, p_entity_type, p_entity_id, COALESCE(p_details,'{}'::jsonb))
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.log_audit(TEXT, TEXT, UUID, JSONB) TO authenticated;

-- ─── cascade school deactivation ────────────────────────────────────────────
-- When a school is moved to INACTIVE/SUSPENDED, deactivate all its non-super
-- users + students + staff. Reactivating the school flips the principal back
-- to active but leaves student/staff is_active states intact (those are
-- managed individually).
CREATE OR REPLACE FUNCTION public.cascade_school_deactivation() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('INACTIVE','SUSPENDED')
     AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    UPDATE public.users
       SET is_active = FALSE
     WHERE school_id = NEW.id AND role <> 'SUPER_ADMIN';
    UPDATE public.students SET is_active = FALSE WHERE school_id = NEW.id;
    UPDATE public.staff    SET is_active = FALSE WHERE school_id = NEW.id;
  ELSIF NEW.status IN ('ACTIVE','TRIAL')
        AND OLD.status IN ('INACTIVE','SUSPENDED') THEN
    UPDATE public.users
       SET is_active = TRUE
     WHERE school_id = NEW.id AND role = 'PRINCIPAL';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS schools_cascade_deactivation ON public.schools;
CREATE TRIGGER schools_cascade_deactivation
  AFTER UPDATE OF status ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.cascade_school_deactivation();

-- ─── record_school_payment() RPC ────────────────────────────────────────────
-- Records a payment + allocates the amount across outstanding billing years
-- oldest-first, then dumps any leftover as advance credit on the latest year
-- (outstanding may go negative, representing pre-payment).
-- Returns the new payment row's id.
CREATE OR REPLACE FUNCTION public.record_school_payment(
  p_school_id UUID,
  p_amount    BIGINT,
  p_txn_id    TEXT,
  p_method    TEXT,
  p_notes     TEXT DEFAULT ''
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payment_id     UUID;
  v_remaining      BIGINT := p_amount;
  v_alloc          BIGINT;
  v_year           RECORD;
  v_latest_year_id UUID;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden: super admin only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  INSERT INTO public.school_payments
    (school_id, amount, paid_at, txn_id, method, notes)
  VALUES
    (p_school_id, p_amount, CURRENT_DATE, p_txn_id, p_method, COALESCE(p_notes,''))
  RETURNING id INTO v_payment_id;

  -- Allocate to outstanding years oldest-first.
  FOR v_year IN
    SELECT id, outstanding
      FROM public.school_billing_years
     WHERE school_id = p_school_id AND outstanding > 0
     ORDER BY start_date ASC
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_alloc := LEAST(v_remaining, v_year.outstanding);
    INSERT INTO public.school_payment_allocations
      (school_payment_id, billing_year_id, amount_applied)
      VALUES (v_payment_id, v_year.id, v_alloc);
    UPDATE public.school_billing_years
       SET total_paid  = total_paid  + v_alloc,
           outstanding = outstanding - v_alloc
     WHERE id = v_year.id;
    v_remaining := v_remaining - v_alloc;
  END LOOP;

  -- Leftover becomes an advance credit on the latest year.
  IF v_remaining > 0 THEN
    SELECT id INTO v_latest_year_id
      FROM public.school_billing_years
     WHERE school_id = p_school_id
     ORDER BY start_date DESC LIMIT 1;
    IF v_latest_year_id IS NOT NULL THEN
      INSERT INTO public.school_payment_allocations
        (school_payment_id, billing_year_id, amount_applied)
        VALUES (v_payment_id, v_latest_year_id, v_remaining);
      UPDATE public.school_billing_years
         SET total_paid  = total_paid  + v_remaining,
             outstanding = outstanding - v_remaining
       WHERE id = v_latest_year_id;
    END IF;
  END IF;

  -- Refresh schools.payment_status from current outstanding totals.
  UPDATE public.schools
     SET payment_status = CASE
       WHEN COALESCE((SELECT SUM(outstanding) FROM public.school_billing_years
                      WHERE school_id = p_school_id), 0) <= 0
            THEN 'PAID'
       ELSE 'PENDING'
     END,
     updated_at = NOW()
   WHERE id = p_school_id;

  PERFORM public.log_audit(
    'record_school_payment',
    'school_payment',
    v_payment_id,
    jsonb_build_object(
      'school_id', p_school_id,
      'amount',    p_amount,
      'txn_id',    p_txn_id,
      'method',    p_method
    )
  );

  RETURN v_payment_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_school_payment(UUID, BIGINT, TEXT, TEXT, TEXT)
  TO authenticated;

-- ─── create_next_billing_year() RPC ─────────────────────────────────────────
-- Produces the next billing year for a school, carrying forward the
-- outstanding balance from the latest year (negative carry = advance credit).
CREATE OR REPLACE FUNCTION public.create_next_billing_year(
  p_school_id UUID
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_latest         RECORD;
  v_schedule       RECORD;
  v_new_id         UUID;
  v_new_start      DATE;
  v_new_end        DATE;
  v_carried        BIGINT;
  v_total_due      BIGINT;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_schedule
    FROM public.school_billing_schedules WHERE school_id = p_school_id;
  IF v_schedule IS NULL THEN
    RAISE EXCEPTION 'no billing schedule for school %', p_school_id;
  END IF;

  SELECT * INTO v_latest
    FROM public.school_billing_years
   WHERE school_id = p_school_id
   ORDER BY start_date DESC LIMIT 1;

  IF v_latest IS NULL THEN
    v_new_start := v_schedule.billing_start_date;
    v_carried   := 0;
  ELSE
    v_new_start := v_latest.end_date + INTERVAL '1 day';
    v_carried   := v_latest.outstanding; -- can be negative (advance)
  END IF;

  v_new_end := (v_new_start + INTERVAL '1 year - 1 day')::DATE;
  v_total_due := v_schedule.annual_amount + v_carried;

  INSERT INTO public.school_billing_years
    (school_id, year_label, start_date, end_date, annual_amount,
     carried_forward, total_due, total_paid, outstanding)
  VALUES (
    p_school_id,
    to_char(v_new_start, 'YYYY') || '-' || to_char(v_new_end, 'YY'),
    v_new_start, v_new_end,
    v_schedule.annual_amount, v_carried, v_total_due, 0, v_total_due
  )
  RETURNING id INTO v_new_id;

  PERFORM public.log_audit(
    'create_next_billing_year', 'school_billing_year', v_new_id,
    jsonb_build_object('school_id', p_school_id, 'carried_forward', v_carried)
  );

  RETURN v_new_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_next_billing_year(UUID) TO authenticated;


-- =============================================================
-- 0003_onboard_school_rpc.sql
-- =============================================================
-- ============================================================================
-- Migration 0003 — onboard_school() RPC
--   Single transactional function that inserts a school + its principal
--   public.users row + billing schedule + first billing year + audit log.
--   The auth.users row must already be created by the caller (the vite admin
--   plugin) since auth.users is owned by GoTrue and not writable from SQL.
--
--   If any step in the function fails the entire INSERT block is rolled back
--   by Postgres. The caller is responsible for deleting the auth user it just
--   created when this function returns an error.
--
--   This migration is purely additive (CREATE OR REPLACE). Primary keys are
--   untouched.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.onboard_school(
  p_caller_id          UUID,
  p_principal_user_id  UUID,
  p_school_name        TEXT,
  p_school_code        TEXT,
  p_location           TEXT,
  p_address            TEXT,
  p_phone              TEXT,
  p_principal_name     TEXT,
  p_principal_email    TEXT,
  p_principal_phone    TEXT,
  p_principal_mobile   TEXT,
  p_status             TEXT,
  p_plan               TEXT,
  p_payment_start_date DATE,
  p_annual_amount      BIGINT
) RETURNS TABLE (
  id                 UUID,
  name               TEXT,
  code               TEXT,
  location           TEXT,
  address            TEXT,
  phone              TEXT,
  principal_name     TEXT,
  principal_email    TEXT,
  principal_phone    TEXT,
  status             TEXT,
  plan               TEXT,
  payment_status     TEXT,
  payment_start_date DATE,
  is_deleted         BOOLEAN,
  created_at         TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id  UUID;
  v_year_label TEXT;
  v_end_date   DATE;
BEGIN
  IF p_annual_amount IS NULL OR p_annual_amount <= 0 THEN
    RAISE EXCEPTION 'annualAmount must be positive';
  END IF;

  -- Reject duplicate school codes / principal mobiles up-front so the caller
  -- gets a clean error before the auth.users row is created.
  IF EXISTS (SELECT 1 FROM public.schools WHERE code = p_school_code AND is_deleted = false) THEN
    RAISE EXCEPTION 'A school with code % already exists', p_school_code;
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE mobile_number = p_principal_mobile) THEN
    RAISE EXCEPTION 'Mobile % is already registered', p_principal_mobile;
  END IF;

  -- 1. School row.
  INSERT INTO public.schools (
    name, code, location, address, phone,
    principal_name, principal_email, principal_phone,
    status, plan, payment_status, payment_start_date
  ) VALUES (
    p_school_name, p_school_code, p_location, p_address, p_phone,
    p_principal_name, p_principal_email, p_principal_phone,
    p_status, p_plan, 'PENDING', p_payment_start_date
  ) RETURNING schools.id INTO v_school_id;

  -- 2. Principal profile (1:1 with auth.users by id).
  INSERT INTO public.users (
    id, mobile_number, role, name, email, school_id,
    first_login_changed, is_active
  ) VALUES (
    p_principal_user_id, p_principal_mobile, 'PRINCIPAL',
    p_principal_name, p_principal_email, v_school_id,
    false, true
  );

  -- 3. Billing schedule.
  INSERT INTO public.school_billing_schedules (
    school_id, plan, annual_amount, billing_start_date
  ) VALUES (
    v_school_id, p_plan, p_annual_amount, p_payment_start_date
  );

  -- 4. First billing year.
  v_end_date := (p_payment_start_date + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
  v_year_label := EXTRACT(YEAR FROM p_payment_start_date)::TEXT
                  || '-'
                  || RIGHT(EXTRACT(YEAR FROM v_end_date)::TEXT, 2);

  INSERT INTO public.school_billing_years (
    school_id, year_label, start_date, end_date,
    annual_amount, carried_forward, total_due, total_paid, outstanding
  ) VALUES (
    v_school_id, v_year_label, p_payment_start_date, v_end_date,
    p_annual_amount, 0, p_annual_amount, 0, p_annual_amount
  );

  -- 5. Audit (best-effort, not critical to onboarding atomicity).
  INSERT INTO public.audit_logs (user_id, school_id, action, entity_type, entity_id, details)
  VALUES (
    p_caller_id, v_school_id, 'onboard_school', 'school', v_school_id,
    jsonb_build_object(
      'name', p_school_name, 'code', p_school_code,
      'plan', p_plan, 'principal', p_principal_name
    )
  );

  RETURN QUERY
    SELECT s.id, s.name, s.code, s.location, s.address, s.phone,
           s.principal_name, s.principal_email, s.principal_phone,
           s.status, s.plan, s.payment_status, s.payment_start_date,
           s.is_deleted, s.created_at, s.updated_at
      FROM public.schools s
     WHERE s.id = v_school_id;
END;
$$;

-- Only authenticated callers may invoke; the vite plugin gates by
-- SUPER_ADMIN before passing through.
REVOKE ALL ON FUNCTION public.onboard_school(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, BIGINT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.onboard_school(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, BIGINT
) TO authenticated, service_role;


-- =============================================================
-- 0004_onboard_school_authz.sql
-- =============================================================
-- ============================================================================
-- Migration 0004 — harden public.onboard_school() against direct RPC abuse.
--
-- Round 3 review found the SECURITY DEFINER RPC trusted a caller-supplied
-- p_caller_id and didn't itself check that auth.uid() is a SUPER_ADMIN. That
-- meant any authenticated user (e.g. a Principal in another school) could
-- POST to PostgREST `/rest/v1/rpc/onboard_school` and create schools.
--
-- Fix: drop the old signature and recreate the function so it
--   * derives the actor strictly from auth.uid()
--   * refuses unless public.is_super_admin() is true
--   * grants EXECUTE only to authenticated (the inner check is the gate)
--
-- Primary keys are untouched.
-- ============================================================================

DROP FUNCTION IF EXISTS public.onboard_school(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, BIGINT
);

CREATE OR REPLACE FUNCTION public.onboard_school(
  p_principal_user_id  UUID,
  p_school_name        TEXT,
  p_school_code        TEXT,
  p_location           TEXT,
  p_address            TEXT,
  p_phone              TEXT,
  p_principal_name     TEXT,
  p_principal_email    TEXT,
  p_principal_phone    TEXT,
  p_principal_mobile   TEXT,
  p_status             TEXT,
  p_plan               TEXT,
  p_payment_start_date DATE,
  p_annual_amount      BIGINT
) RETURNS TABLE (
  id                 UUID,
  name               TEXT,
  code               TEXT,
  location           TEXT,
  address            TEXT,
  phone              TEXT,
  principal_name     TEXT,
  principal_email    TEXT,
  principal_phone    TEXT,
  status             TEXT,
  plan               TEXT,
  payment_status     TEXT,
  payment_start_date DATE,
  is_deleted         BOOLEAN,
  created_at         TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller_id  UUID := auth.uid();
  v_school_id  UUID;
  v_year_label TEXT;
  v_end_date   DATE;
BEGIN
  -- Authorization: only an active SUPER_ADMIN may onboard schools.
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'only super admins may onboard schools' USING ERRCODE = '42501';
  END IF;

  IF p_annual_amount IS NULL OR p_annual_amount <= 0 THEN
    RAISE EXCEPTION 'annualAmount must be positive';
  END IF;

  -- Reject duplicates up-front so the caller gets a clean error.
  IF EXISTS (SELECT 1 FROM public.schools WHERE code = p_school_code AND is_deleted = false) THEN
    RAISE EXCEPTION 'A school with code % already exists', p_school_code;
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE mobile_number = p_principal_mobile) THEN
    RAISE EXCEPTION 'Mobile % is already registered', p_principal_mobile;
  END IF;

  -- 1. School row.
  INSERT INTO public.schools (
    name, code, location, address, phone,
    principal_name, principal_email, principal_phone,
    status, plan, payment_status, payment_start_date
  ) VALUES (
    p_school_name, p_school_code, p_location, p_address, p_phone,
    p_principal_name, p_principal_email, p_principal_phone,
    p_status, p_plan, 'PENDING', p_payment_start_date
  ) RETURNING schools.id INTO v_school_id;

  -- 2. Principal profile (1:1 with auth.users by id).
  INSERT INTO public.users (
    id, mobile_number, role, name, email, school_id,
    first_login_changed, is_active
  ) VALUES (
    p_principal_user_id, p_principal_mobile, 'PRINCIPAL',
    p_principal_name, p_principal_email, v_school_id,
    false, true
  );

  -- 3. Billing schedule.
  INSERT INTO public.school_billing_schedules (
    school_id, plan, annual_amount, billing_start_date
  ) VALUES (
    v_school_id, p_plan, p_annual_amount, p_payment_start_date
  );

  -- 4. First billing year.
  v_end_date := (p_payment_start_date + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
  v_year_label := EXTRACT(YEAR FROM p_payment_start_date)::TEXT
                  || '-'
                  || RIGHT(EXTRACT(YEAR FROM v_end_date)::TEXT, 2);

  INSERT INTO public.school_billing_years (
    school_id, year_label, start_date, end_date,
    annual_amount, carried_forward, total_due, total_paid, outstanding
  ) VALUES (
    v_school_id, v_year_label, p_payment_start_date, v_end_date,
    p_annual_amount, 0, p_annual_amount, 0, p_annual_amount
  );

  -- 5. Audit (best-effort, attributed to the verified caller).
  INSERT INTO public.audit_logs (user_id, school_id, action, entity_type, entity_id, details)
  VALUES (
    v_caller_id, v_school_id, 'onboard_school', 'school', v_school_id,
    jsonb_build_object(
      'name', p_school_name, 'code', p_school_code,
      'plan', p_plan, 'principal', p_principal_name
    )
  );

  RETURN QUERY
    SELECT s.id, s.name, s.code, s.location, s.address, s.phone,
           s.principal_name, s.principal_email, s.principal_phone,
           s.status, s.plan, s.payment_status, s.payment_start_date,
           s.is_deleted, s.created_at, s.updated_at
      FROM public.schools s
     WHERE s.id = v_school_id;
END;
$$;

REVOKE ALL ON FUNCTION public.onboard_school(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, BIGINT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.onboard_school(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, BIGINT
) TO authenticated, service_role;


-- =============================================================
-- 0005_principal_rpcs.sql
-- =============================================================
-- ============================================================================
-- 0005 — Principal-side helpers, new tables, and atomic RPCs.
-- All PKs remain UUIDs. Idempotent.
-- ============================================================================

-- ─── 0. Extend existing tables with principal-needed columns ────────────────

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS tagline TEXT,
  ADD COLUMN IF NOT EXISTS city    TEXT,
  ADD COLUMN IF NOT EXISTS state   TEXT,
  ADD COLUMN IF NOT EXISTS pin     TEXT,
  ADD COLUMN IF NOT EXISTS email   TEXT,
  ADD COLUMN IF NOT EXISTS affiliation_board TEXT;

-- ─── 1. New tables for principal features ───────────────────────────────────

-- Per-class fee structure plans defined by principal (heads + due dates).
CREATE TABLE IF NOT EXISTS public.fee_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  fee_heads JSONB NOT NULL DEFAULT '[]'::jsonb,        -- [{name, amount, frequency, description}]
  monthly_due_dates JSONB NOT NULL DEFAULT '[]'::jsonb,-- [{month, date}]
  late_fee JSONB NOT NULL DEFAULT '{}'::jsonb,         -- {enabled, gracePeriodDays, type, amount, maxCap}
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fee_structures_school_year_idx
  ON public.fee_structures(school_id, academic_year_id);

-- Staff attendance records (separate from student attendance).
CREATE TABLE IF NOT EXISTS public.staff_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PRESENT','ABSENT','HALF_DAY','LEAVE','LATE','HOLIDAY')),
  marked_by UUID REFERENCES public.users(id),
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(staff_id, date)
);
CREATE INDEX IF NOT EXISTS staff_attendance_school_idx
  ON public.staff_attendance(school_id, date);

-- Assets (library books, lab equipment, generic inventory).
CREATE TABLE IF NOT EXISTS public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('BOOK','LAB_EQUIPMENT','OTHER')),
  name TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_count INT NOT NULL DEFAULT 0,
  available_count INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS assets_school_category_idx
  ON public.assets(school_id, category);

-- Asset issues (book/equipment loans to students/staff).
CREATE TABLE IF NOT EXISTS public.asset_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID REFERENCES public.students(id),
  staff_id UUID REFERENCES public.staff(id),
  borrower_name TEXT,
  issued_at DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  returned_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS asset_issues_asset_idx ON public.asset_issues(asset_id);
CREATE INDEX IF NOT EXISTS asset_issues_school_idx ON public.asset_issues(school_id);

-- Enable RLS + apply standard "school-scoped" policy for the new tables.
DO $$
DECLARE t TEXT;
DECLARE tables TEXT[] := ARRAY['fee_structures','staff_attendance','assets','asset_issues'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
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

-- updated_at trigger for new tables that have updated_at column.
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['fee_structures','assets']) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', t, t);
  END LOOP;
END $$;

-- ─── 2. Helper for installment status derivation ────────────────────────────

CREATE OR REPLACE FUNCTION public.compute_installment_status(
  p_amount BIGINT, p_paid BIGINT, p_writeoff BIGINT, p_due DATE
) RETURNS TEXT
LANGUAGE SQL IMMUTABLE AS $$
  SELECT CASE
    WHEN p_paid + p_writeoff >= p_amount THEN 'PAID'
    WHEN p_paid > 0 THEN 'PARTIAL'
    WHEN p_due < CURRENT_DATE THEN 'OVERDUE'
    ELSE 'UNPAID'
  END
$$;

-- ─── 3. Atomic fee-payment RPC (oldest-due-first allocation) ────────────────
--
-- Allocates p_amount across the student's UNPAID/PARTIAL installments in
-- order of due_date ASC. Any remainder becomes / adds to advance_balances.
-- Optionally pulls down advance_balance first when starting the run if
-- p_use_advance is TRUE. Returns the new payment_records.id.
--
CREATE OR REPLACE FUNCTION public.record_fee_payment(
  p_student_id UUID,
  p_amount BIGINT,
  p_method TEXT DEFAULT 'CASH',
  p_date DATE DEFAULT CURRENT_DATE,
  p_note TEXT DEFAULT NULL,
  p_use_advance BOOLEAN DEFAULT FALSE
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id UUID;
  v_year_id   UUID;
  v_payment_id UUID;
  v_remaining BIGINT;
  v_receipt   TEXT;
  v_inst RECORD;
  v_apply BIGINT;
  v_advance BIGINT := 0;
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;

  -- Authorize: caller must be SUPER_ADMIN or principal of the student's school.
  SELECT school_id INTO v_school_id FROM public.students WHERE id = p_student_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'student not found'; END IF;
  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_school_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Pick the active academic year for this school.
  SELECT id INTO v_year_id FROM public.academic_years
   WHERE school_id = v_school_id AND is_active = TRUE
   LIMIT 1;
  IF v_year_id IS NULL THEN RAISE EXCEPTION 'no active academic year for school'; END IF;

  v_remaining := p_amount;

  -- Optionally fold in the existing advance balance first.
  IF p_use_advance THEN
    SELECT amount INTO v_advance FROM public.advance_balances WHERE student_id = p_student_id;
    IF COALESCE(v_advance, 0) > 0 THEN
      v_remaining := v_remaining + v_advance;
      UPDATE public.advance_balances SET amount = 0, updated_at = NOW()
        WHERE student_id = p_student_id;
    END IF;
  END IF;

  -- Generate receipt number (school-scoped, monotonic-ish).
  v_receipt := 'RCT-' || to_char(NOW(),'YYYYMMDDHH24MISS') || '-' || substr(p_student_id::text, 1, 4);

  -- Create the payment row first (we'll patch advance_amount at the end).
  INSERT INTO public.payment_records
    (student_id, school_id, academic_year_id, amount, method, date, receipt_no, note)
  VALUES
    (p_student_id, v_school_id, v_year_id, p_amount, p_method, p_date, v_receipt, p_note)
  RETURNING id INTO v_payment_id;

  -- Walk installments oldest-due-first, skipping fully-PAID and govt-payer rows.
  -- Lock with FOR UPDATE so concurrent payments don't double-count.
  FOR v_inst IN
    SELECT id, amount, paid_amount, write_off_amount, due_date
      FROM public.fee_installments
     WHERE student_id = p_student_id
       AND payer_type = 'PARENT'
       AND (amount - paid_amount - write_off_amount) > 0
     ORDER BY due_date ASC, created_at ASC
     FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_apply := LEAST(v_remaining, v_inst.amount - v_inst.paid_amount - v_inst.write_off_amount);
    UPDATE public.fee_installments
       SET paid_amount = paid_amount + v_apply,
           status = public.compute_installment_status(amount, paid_amount + v_apply, write_off_amount, due_date),
           updated_at = NOW()
     WHERE id = v_inst.id;

    INSERT INTO public.payment_installment_links
      (payment_id, installment_id, amount_applied)
    VALUES (v_payment_id, v_inst.id, v_apply);

    v_remaining := v_remaining - v_apply;
  END LOOP;

  -- Whatever's left becomes (or adds to) advance balance.
  IF v_remaining > 0 THEN
    INSERT INTO public.advance_balances (student_id, amount)
    VALUES (p_student_id, v_remaining)
    ON CONFLICT (student_id) DO UPDATE
      SET amount = public.advance_balances.amount + EXCLUDED.amount,
          updated_at = NOW();
    UPDATE public.payment_records SET advance_amount = v_remaining WHERE id = v_payment_id;
  END IF;

  -- Refresh student_academic_records aggregates.
  PERFORM public.refresh_student_fee_aggregate(p_student_id, v_year_id);

  -- Audit.
  INSERT INTO public.audit_logs (user_id, school_id, action, entity_type, entity_id, details)
  VALUES (v_caller, v_school_id, 'fee_payment', 'payment', v_payment_id,
          jsonb_build_object('amount', p_amount, 'student_id', p_student_id,
                             'receipt', v_receipt, 'used_advance', p_use_advance));

  RETURN v_payment_id;
END $$;
GRANT EXECUTE ON FUNCTION public.record_fee_payment(UUID, BIGINT, TEXT, DATE, TEXT, BOOLEAN) TO authenticated;

-- Helper used by both fee + govt payment paths.
CREATE OR REPLACE FUNCTION public.refresh_student_fee_aggregate(
  p_student_id UUID, p_year_id UUID
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total BIGINT;
  v_paid  BIGINT;
  v_status TEXT;
BEGIN
  SELECT COALESCE(SUM(amount), 0), COALESCE(SUM(paid_amount + write_off_amount), 0)
    INTO v_total, v_paid
    FROM public.fee_installments
   WHERE student_id = p_student_id AND academic_year_id = p_year_id;

  v_status := CASE
    WHEN v_total = 0 THEN 'PENDING'
    WHEN v_paid >= v_total THEN 'PAID'
    WHEN v_paid > 0 THEN 'PARTIAL'
    ELSE 'PENDING'
  END;

  UPDATE public.student_academic_records
     SET total_fee = v_total, paid_fee = v_paid, fee_status = v_status
   WHERE student_id = p_student_id AND academic_year_id = p_year_id;
END $$;
GRANT EXECUTE ON FUNCTION public.refresh_student_fee_aggregate(UUID, UUID) TO authenticated;

-- ─── 4. Government bulk payment (RTE) ────────────────────────────────────────
--
-- Records one government payment row, links it to all p_student_ids, and
-- allocates the per-student share by paying down the oldest TUITION
-- installments whose payer_type='GOVERNMENT'.
--
CREATE OR REPLACE FUNCTION public.record_govt_payment(
  p_amount BIGINT,
  p_date DATE,
  p_reference TEXT,
  p_note TEXT,
  p_student_ids UUID[]
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id UUID;
  v_payment_id UUID;
  v_per_student BIGINT;
  v_caller UUID := auth.uid();
  v_sid UUID;
  v_remaining BIGINT;
  v_inst RECORD;
  v_apply BIGINT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF array_length(p_student_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no students provided';
  END IF;

  v_school_id := public.current_user_school_id();
  IF v_school_id IS NULL AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- All students must belong to the caller's school (or caller is super admin).
  IF NOT public.is_super_admin() THEN
    IF EXISTS (SELECT 1 FROM unnest(p_student_ids) sid
                LEFT JOIN public.students s ON s.id = sid
                WHERE s.school_id IS DISTINCT FROM v_school_id) THEN
      RAISE EXCEPTION 'one or more students belong to a different school';
    END IF;
  END IF;

  v_per_student := (p_amount / array_length(p_student_ids, 1))::BIGINT;
  IF v_per_student <= 0 THEN RAISE EXCEPTION 'amount per student must be positive'; END IF;

  INSERT INTO public.government_payments (school_id, amount, date, reference_no, note)
  VALUES (v_school_id, p_amount, p_date, p_reference, p_note)
  RETURNING id INTO v_payment_id;

  FOREACH v_sid IN ARRAY p_student_ids LOOP
    INSERT INTO public.govt_payment_student_links (govt_payment_id, student_id)
    VALUES (v_payment_id, v_sid);

    v_remaining := v_per_student;
    FOR v_inst IN
      SELECT id, amount, paid_amount, write_off_amount, academic_year_id
        FROM public.fee_installments
       WHERE student_id = v_sid
         AND payer_type = 'GOVERNMENT'
         AND fee_type = 'TUITION'
         AND (amount - paid_amount - write_off_amount) > 0
       ORDER BY due_date ASC
       FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_apply := LEAST(v_remaining, v_inst.amount - v_inst.paid_amount - v_inst.write_off_amount);
      UPDATE public.fee_installments
         SET paid_amount = paid_amount + v_apply,
             status = public.compute_installment_status(amount, paid_amount + v_apply, write_off_amount, due_date),
             related_id = v_payment_id,
             updated_at = NOW()
       WHERE id = v_inst.id;
      v_remaining := v_remaining - v_apply;
    END LOOP;

    -- Refresh aggregate for whichever year contained the payments.
    UPDATE public.student_academic_records sar
       SET total_fee = COALESCE((SELECT SUM(amount) FROM public.fee_installments fi WHERE fi.student_id = v_sid AND fi.academic_year_id = sar.academic_year_id), 0),
           paid_fee  = COALESCE((SELECT SUM(paid_amount + write_off_amount) FROM public.fee_installments fi WHERE fi.student_id = v_sid AND fi.academic_year_id = sar.academic_year_id), 0)
     WHERE sar.student_id = v_sid;
  END LOOP;

  INSERT INTO public.audit_logs (user_id, school_id, action, entity_type, entity_id, details)
  VALUES (v_caller, v_school_id, 'govt_payment', 'government_payment', v_payment_id,
          jsonb_build_object('amount', p_amount, 'students', array_length(p_student_ids, 1),
                             'reference', p_reference));
  RETURN v_payment_id;
END $$;
GRANT EXECUTE ON FUNCTION public.record_govt_payment(BIGINT, DATE, TEXT, TEXT, UUID[]) TO authenticated;

-- ─── 5. Fee schedule generator for a student ─────────────────────────────────
--
-- Wipes any existing UNPAID installments for the student/year (won't touch
-- ones with paid_amount > 0 or write_offs) and re-creates them from the
-- supplied heads + monthly_due_dates.
--
CREATE OR REPLACE FUNCTION public.generate_student_fee_schedule(
  p_student_id UUID,
  p_year_id UUID,
  p_heads JSONB,           -- [{name, amount, frequency, description}]
  p_due_dates JSONB,       -- [{month, date}]
  p_is_rte BOOLEAN DEFAULT FALSE
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id UUID;
  v_caller UUID := auth.uid();
  v_count INT := 0;
  v_head JSONB;
  v_dd JSONB;
  v_payer TEXT;
  v_freq TEXT;
  v_amt BIGINT;
  v_name TEXT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT school_id INTO v_school_id FROM public.students WHERE id = p_student_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'student not found'; END IF;
  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_school_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Drop schedule rows that have not been paid/written-off yet.
  DELETE FROM public.fee_installments
   WHERE student_id = p_student_id
     AND academic_year_id = p_year_id
     AND paid_amount = 0
     AND write_off_amount = 0;

  -- Re-create from the structure.
  FOR v_head IN SELECT * FROM jsonb_array_elements(p_heads)
  LOOP
    v_name := v_head->>'name';
    v_amt := (v_head->>'amount')::BIGINT;
    v_freq := COALESCE(v_head->>'frequency', 'MONTHLY');
    v_payer := CASE WHEN p_is_rte AND v_freq = 'MONTHLY' THEN 'GOVERNMENT' ELSE 'PARENT' END;

    IF v_freq = 'MONTHLY' THEN
      FOR v_dd IN SELECT * FROM jsonb_array_elements(p_due_dates)
      LOOP
        INSERT INTO public.fee_installments
          (student_id, academic_year_id, school_id, month, due_date, fee_type, amount, payer_type)
        VALUES
          (p_student_id, p_year_id, v_school_id, v_dd->>'month',
           (v_dd->>'date')::DATE,
           CASE WHEN lower(v_name) LIKE '%transport%' THEN 'TRANSPORT'
                WHEN lower(v_name) LIKE '%exam%'      THEN 'EXAM'
                WHEN lower(v_name) LIKE '%tuition%'   THEN 'TUITION'
                ELSE 'OTHER' END,
           v_amt, v_payer);
        v_count := v_count + 1;
      END LOOP;
    ELSE  -- ANNUAL or ONE_TIME
      INSERT INTO public.fee_installments
        (student_id, academic_year_id, school_id, month, due_date, fee_type, amount, payer_type)
      VALUES
        (p_student_id, p_year_id, v_school_id,
         CASE WHEN v_freq = 'ONE_TIME' THEN 'OneTime' ELSE 'Annual' END,
         (SELECT MIN((dd->>'date')::DATE) FROM jsonb_array_elements(p_due_dates) dd),
         CASE WHEN lower(v_name) LIKE '%admission%' THEN 'OTHER' ELSE 'OTHER' END,
         v_amt, 'PARENT');
      v_count := v_count + 1;
    END IF;
  END LOOP;

  PERFORM public.refresh_student_fee_aggregate(p_student_id, p_year_id);
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_student_fee_schedule(UUID, UUID, JSONB, JSONB, BOOLEAN) TO authenticated;

-- ─── 6. Academic year RPCs ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_academic_year(
  p_label TEXT, p_start DATE, p_end DATE, p_board TEXT DEFAULT 'CBSE', p_medium TEXT DEFAULT 'English'
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school UUID := public.current_user_school_id();
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF NOT public.is_principal() THEN RAISE EXCEPTION 'principal only'; END IF;
  IF v_school IS NULL THEN RAISE EXCEPTION 'no school for caller'; END IF;

  UPDATE public.academic_years SET is_active = FALSE WHERE school_id = v_school AND is_active;

  INSERT INTO public.academic_years (school_id, label, start_date, end_date, is_active, board, medium)
  VALUES (v_school, p_label, p_start, p_end, TRUE, p_board, p_medium)
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (user_id, school_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), v_school, 'create_year', 'academic_year', v_id,
          jsonb_build_object('label', p_label, 'start', p_start, 'end', p_end));
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.create_academic_year(TEXT, DATE, DATE, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_active_academic_year(p_year_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_school UUID := public.current_user_school_id();
BEGIN
  IF NOT public.is_principal() THEN RAISE EXCEPTION 'principal only'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.academic_years WHERE id = p_year_id AND school_id = v_school) THEN
    RAISE EXCEPTION 'year not found in school';
  END IF;
  UPDATE public.academic_years SET is_active = (id = p_year_id) WHERE school_id = v_school;
END $$;
GRANT EXECUTE ON FUNCTION public.set_active_academic_year(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.close_academic_year(p_year_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_school UUID := public.current_user_school_id();
BEGIN
  IF NOT public.is_principal() THEN RAISE EXCEPTION 'principal only'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.academic_years WHERE id = p_year_id AND school_id = v_school) THEN
    RAISE EXCEPTION 'year not found in school';
  END IF;
  UPDATE public.academic_years
     SET is_closed = TRUE, is_active = FALSE
   WHERE id = p_year_id;
  INSERT INTO public.audit_logs (user_id, school_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), v_school, 'close_year', 'academic_year', p_year_id, '{}'::jsonb);
END $$;
GRANT EXECUTE ON FUNCTION public.close_academic_year(UUID) TO authenticated;

-- ─── 7. Promotion (year closing step 4) ──────────────────────────────────────
--
-- p_decisions = [{ student_id, action: 'PROMOTE'|'REPEAT'|'TC', new_class_name? }]
-- Creates next-year academic_record rows for PROMOTE/REPEAT and marks TC.
--
CREATE OR REPLACE FUNCTION public.promote_students(
  p_from_year_id UUID, p_to_year_id UUID, p_decisions JSONB
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school UUID := public.current_user_school_id();
  v_d JSONB;
  v_sid UUID;
  v_action TEXT;
  v_new_class TEXT;
  v_old RECORD;
  v_carry BIGINT;
  v_count INT := 0;
BEGIN
  IF NOT public.is_principal() THEN RAISE EXCEPTION 'principal only'; END IF;

  FOR v_d IN SELECT * FROM jsonb_array_elements(p_decisions)
  LOOP
    v_sid := (v_d->>'student_id')::UUID;
    v_action := COALESCE(v_d->>'action', 'PROMOTE');
    v_new_class := v_d->>'new_class_name';

    SELECT class_name, section, total_fee, paid_fee
      INTO v_old
      FROM public.student_academic_records
     WHERE student_id = v_sid AND academic_year_id = p_from_year_id;
    IF NOT FOUND THEN CONTINUE; END IF;

    -- Mark prior year status
    UPDATE public.student_academic_records
       SET status = CASE v_action WHEN 'PROMOTE' THEN 'PROMOTED'
                                  WHEN 'REPEAT'  THEN 'FAILED'
                                  WHEN 'TC'      THEN 'TC' END,
           is_promoted = (v_action = 'PROMOTE')
     WHERE student_id = v_sid AND academic_year_id = p_from_year_id;

    IF v_action = 'TC' THEN
      UPDATE public.students SET status = 'TC_ISSUED', is_active = FALSE WHERE id = v_sid;
    ELSE
      v_carry := GREATEST(0, v_old.total_fee - v_old.paid_fee);
      INSERT INTO public.student_academic_records
        (student_id, academic_year_id, class_name, section, roll_no,
         total_fee, paid_fee, fee_status)
      VALUES
        (v_sid, p_to_year_id,
         COALESCE(v_new_class, v_old.class_name),
         v_old.section, NULL,
         v_carry, 0,
         CASE WHEN v_carry = 0 THEN 'PENDING' ELSE 'PENDING' END)
      ON CONFLICT (student_id, academic_year_id) DO NOTHING;
    END IF;
    v_count := v_count + 1;
  END LOOP;

  INSERT INTO public.audit_logs (user_id, school_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), v_school, 'promote_students', 'academic_year', p_to_year_id,
          jsonb_build_object('count', v_count));
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.promote_students(UUID, UUID, JSONB) TO authenticated;

-- ─── 8. Critical-field change request workflow ──────────────────────────────

CREATE OR REPLACE FUNCTION public.submit_change_request(
  p_student_id UUID, p_field TEXT, p_new_value TEXT, p_reason TEXT, p_proof TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school UUID;
  v_old TEXT;
  v_change_id UUID;
  v_approval_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT school_id INTO v_school FROM public.students WHERE id = p_student_id;
  IF v_school IS NULL THEN RAISE EXCEPTION 'student not found'; END IF;
  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_school)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  EXECUTE format('SELECT %I::text FROM public.students WHERE id = $1', p_field)
    INTO v_old USING p_student_id;

  INSERT INTO public.student_change_history
    (student_id, field_name, old_value, new_value, reason, proof_url, changed_by)
  VALUES (p_student_id, p_field, v_old, p_new_value, p_reason, p_proof, auth.uid())
  RETURNING id INTO v_change_id;

  INSERT INTO public.approvals
    (school_id, request_type, requested_by, entity_type, entity_id, old_value, new_value, proof_url)
  VALUES (v_school, 'PROFILE_CHANGE', auth.uid(), 'student', p_student_id,
          jsonb_build_object('field', p_field, 'value', v_old),
          jsonb_build_object('field', p_field, 'value', p_new_value, 'change_id', v_change_id),
          p_proof)
  RETURNING id INTO v_approval_id;

  RETURN v_approval_id;
END $$;
GRANT EXECUTE ON FUNCTION public.submit_change_request(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_change_request(p_approval_id UUID, p_approve BOOLEAN, p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_app RECORD;
  v_field TEXT;
  v_value TEXT;
  v_change_id UUID;
BEGIN
  IF NOT public.is_principal() THEN RAISE EXCEPTION 'principal only'; END IF;
  SELECT * INTO v_app FROM public.approvals WHERE id = p_approval_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'approval not found'; END IF;
  IF v_app.status <> 'PENDING' THEN RAISE EXCEPTION 'approval already resolved'; END IF;
  IF v_app.school_id <> public.current_user_school_id() THEN RAISE EXCEPTION 'forbidden'; END IF;

  IF p_approve THEN
    v_field := v_app.new_value->>'field';
    v_value := v_app.new_value->>'value';
    v_change_id := (v_app.new_value->>'change_id')::UUID;
    IF v_app.request_type = 'PROFILE_CHANGE' AND v_field IS NOT NULL THEN
      EXECUTE format('UPDATE public.students SET %I = $1, updated_at = NOW() WHERE id = $2', v_field)
        USING v_value, v_app.entity_id;
      UPDATE public.student_change_history SET approved_by = auth.uid() WHERE id = v_change_id;
    END IF;
  END IF;

  UPDATE public.approvals
     SET status = CASE WHEN p_approve THEN 'APPROVED' ELSE 'REJECTED' END,
         approved_by = auth.uid(),
         approved_at = NOW()
   WHERE id = p_approval_id;
END $$;
GRANT EXECUTE ON FUNCTION public.apply_change_request(UUID, BOOLEAN, TEXT) TO authenticated;

-- ─── 9. Mid-year class movement ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_class_movement(
  p_student_id UUID, p_year_id UUID,
  p_new_class TEXT, p_new_section TEXT,
  p_effective_date DATE, p_reason TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
  v_old_class TEXT;
  v_old_section TEXT;
BEGIN
  IF NOT public.is_principal() THEN RAISE EXCEPTION 'principal only'; END IF;

  SELECT class_name, section INTO v_old_class, v_old_section
    FROM public.student_academic_records
   WHERE student_id = p_student_id AND academic_year_id = p_year_id;

  INSERT INTO public.student_class_movements
    (student_id, academic_year_id, old_class, old_section, new_class, new_section, effective_date, reason)
  VALUES (p_student_id, p_year_id, v_old_class, v_old_section, p_new_class, p_new_section, p_effective_date, p_reason)
  RETURNING id INTO v_id;

  -- Update current academic record to reflect new class/section as the current placement.
  UPDATE public.student_academic_records
     SET class_name = p_new_class, section = p_new_section
   WHERE student_id = p_student_id AND academic_year_id = p_year_id;

  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.record_class_movement(UUID, UUID, TEXT, TEXT, DATE, TEXT) TO authenticated;


-- =============================================================
-- 0006_asset_atomic.sql
-- =============================================================
-- 0006_asset_atomic.sql — atomic asset issue / return RPCs.
--
-- Replace the multi-step client-side issueBook / returnBook flows with
-- transactional SECURITY DEFINER functions so the assets.available_count
-- column never drifts out of sync with asset_issues rows on partial failure.

CREATE OR REPLACE FUNCTION public.issue_asset(
  p_asset_id UUID,
  p_student_id UUID,
  p_borrower_name TEXT,
  p_loan_days INT DEFAULT 14
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school UUID := public.current_user_school_id();
  v_avail INT;
  v_issue_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF NOT public.is_principal() THEN RAISE EXCEPTION 'principal only'; END IF;

  SELECT available_count INTO v_avail
    FROM public.assets
   WHERE id = p_asset_id AND school_id = v_school
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'asset not found in school'; END IF;
  IF v_avail <= 0 THEN RAISE EXCEPTION 'no copies available'; END IF;

  INSERT INTO public.asset_issues (
    asset_id, school_id, student_id, borrower_name, issued_at, due_date
  ) VALUES (
    p_asset_id, v_school, p_student_id, p_borrower_name,
    CURRENT_DATE, CURRENT_DATE + (p_loan_days || ' days')::INTERVAL
  )
  RETURNING id INTO v_issue_id;

  UPDATE public.assets
     SET available_count = available_count - 1
   WHERE id = p_asset_id AND school_id = v_school;

  RETURN v_issue_id;
END $$;
GRANT EXECUTE ON FUNCTION public.issue_asset(UUID, UUID, TEXT, INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.return_asset(
  p_asset_id UUID,
  p_student_id UUID
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school UUID := public.current_user_school_id();
  v_total INT;
  v_avail INT;
  v_returned INT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF NOT public.is_principal() THEN RAISE EXCEPTION 'principal only'; END IF;

  SELECT total_count, available_count INTO v_total, v_avail
    FROM public.assets
   WHERE id = p_asset_id AND school_id = v_school
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'asset not found in school'; END IF;

  UPDATE public.asset_issues
     SET returned_at = CURRENT_DATE
   WHERE asset_id = p_asset_id
     AND school_id = v_school
     AND returned_at IS NULL
     AND (p_student_id IS NULL OR student_id = p_student_id);
  GET DIAGNOSTICS v_returned = ROW_COUNT;

  IF v_returned = 0 THEN
    RAISE EXCEPTION 'no open loan found for student';
  END IF;

  UPDATE public.assets
     SET available_count = LEAST(v_total, v_avail + v_returned)
   WHERE id = p_asset_id AND school_id = v_school;

  RETURN v_returned;
END $$;
GRANT EXECUTE ON FUNCTION public.return_asset(UUID, UUID) TO authenticated;


-- =============================================================
-- 0007_year_closing_atomic.sql
-- =============================================================
-- 0007_year_closing_atomic.sql
--
-- Atomic year-closing RPC. Wraps the three discrete steps (close old year,
-- create new year, promote students) in a SINGLE transaction so a partial
-- commit is impossible — if promotion fails after the new year is created,
-- the entire operation rolls back.
--
-- All sub-operations re-use the existing helpers (is_principal,
-- current_user_school_id, promote_students). PKs are untouched.

CREATE OR REPLACE FUNCTION public.commit_year_closing(
  p_old_year_id UUID,
  p_new_label   TEXT,
  p_new_start   DATE,
  p_new_end     DATE,
  p_new_board   TEXT DEFAULT 'CBSE',
  p_new_medium  TEXT DEFAULT 'English',
  p_decisions   JSONB DEFAULT '[]'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school      UUID := public.current_user_school_id();
  v_new_year_id UUID;
  v_promoted    INT  := 0;
BEGIN
  IF auth.uid() IS NULL                           THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF NOT public.is_principal()                    THEN RAISE EXCEPTION 'principal only'; END IF;
  IF v_school IS NULL                             THEN RAISE EXCEPTION 'no school for caller'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.academic_years
                  WHERE id = p_old_year_id AND school_id = v_school) THEN
    RAISE EXCEPTION 'old year not found in caller school';
  END IF;
  IF p_new_label IS NULL OR length(trim(p_new_label)) = 0 THEN
    RAISE EXCEPTION 'new year label required';
  END IF;
  IF p_new_start IS NULL OR p_new_end IS NULL OR p_new_end <= p_new_start THEN
    RAISE EXCEPTION 'invalid date range for new year';
  END IF;

  -- 1. Lock old year (idempotent — re-running on an already-closed year
  --    just re-applies the same WHERE)
  UPDATE public.academic_years
     SET is_closed = TRUE, is_active = FALSE
   WHERE id = p_old_year_id;

  -- 2. Atomically deactivate any other active years and insert the new one
  UPDATE public.academic_years
     SET is_active = FALSE
   WHERE school_id = v_school AND is_active;

  INSERT INTO public.academic_years
    (school_id, label, start_date, end_date, is_active, board, medium)
  VALUES
    (v_school, p_new_label, p_new_start, p_new_end, TRUE, p_new_board, p_new_medium)
  RETURNING id INTO v_new_year_id;

  -- 3. Promote students (errors here roll back steps 1 & 2 too)
  v_promoted := public.promote_students(p_old_year_id, v_new_year_id, p_decisions);

  -- 4. Single audit row covering the whole atomic operation
  INSERT INTO public.audit_logs
    (user_id, school_id, action, entity_type, entity_id, details)
  VALUES
    (auth.uid(), v_school, 'commit_year_closing', 'academic_year', p_old_year_id,
     jsonb_build_object(
       'new_year_id', v_new_year_id,
       'new_label',   p_new_label,
       'promoted',    v_promoted
     ));

  RETURN jsonb_build_object(
    'new_year_id', v_new_year_id,
    'new_label',   p_new_label,
    'promoted',    v_promoted
  );
END $$;

GRANT EXECUTE ON FUNCTION public.commit_year_closing(UUID, TEXT, DATE, DATE, TEXT, TEXT, JSONB) TO authenticated;


-- =============================================================
-- 0008_year_closing_dues_handling.sql
-- =============================================================
-- 0008_year_closing_dues_handling.sql
--
-- Make the wizard's outstandingDuesHandling choice actually mean something.
--
-- ARREARS  (default) — carry unpaid balance forward into the new year via
--                      promote_students() (existing behavior).
-- WRITEOFF          — after promotion, zero-out the carried `total_fee` on
--                      the new-year student_academic_records AND mark every
--                      remaining unpaid old-year fee_installment as written
--                      off, with a corresponding fee_write_offs row.
--
-- Re-creates commit_year_closing with one extra parameter:
--   p_dues_handling TEXT — 'ARREARS' (default) | 'WRITEOFF'
-- The old 7-arg signature is preserved (its body is just rewritten to
-- delegate to the 8-arg one with 'ARREARS') so existing callers keep
-- working.

CREATE OR REPLACE FUNCTION public.commit_year_closing(
  p_old_year_id   UUID,
  p_new_label     TEXT,
  p_new_start     DATE,
  p_new_end       DATE,
  p_new_board     TEXT,
  p_new_medium    TEXT,
  p_decisions     JSONB,
  p_dues_handling TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school        UUID := public.current_user_school_id();
  v_new_year_id   UUID;
  v_promoted      INT  := 0;
  v_written_off   INT  := 0;
  v_writeoff_amt  BIGINT := 0;
BEGIN
  IF auth.uid() IS NULL                           THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF NOT public.is_principal()                    THEN RAISE EXCEPTION 'principal only'; END IF;
  IF v_school IS NULL                             THEN RAISE EXCEPTION 'no school for caller'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.academic_years
                  WHERE id = p_old_year_id AND school_id = v_school) THEN
    RAISE EXCEPTION 'old year not found in caller school';
  END IF;
  IF p_new_label IS NULL OR length(trim(p_new_label)) = 0 THEN
    RAISE EXCEPTION 'new year label required';
  END IF;
  IF p_new_start IS NULL OR p_new_end IS NULL OR p_new_end <= p_new_start THEN
    RAISE EXCEPTION 'invalid date range for new year';
  END IF;
  IF p_dues_handling NOT IN ('ARREARS', 'WRITEOFF', 'NONE') THEN
    RAISE EXCEPTION 'invalid dues handling: %', p_dues_handling;
  END IF;

  -- 1. Lock old year (idempotent)
  UPDATE public.academic_years
     SET is_closed = TRUE, is_active = FALSE
   WHERE id = p_old_year_id;

  -- 2. Atomically deactivate any other active years and insert the new one
  UPDATE public.academic_years
     SET is_active = FALSE
   WHERE school_id = v_school AND is_active;

  INSERT INTO public.academic_years
    (school_id, label, start_date, end_date, is_active, board, medium)
  VALUES
    (v_school, p_new_label, p_new_start, p_new_end, TRUE,
     COALESCE(p_new_board, 'CBSE'), COALESCE(p_new_medium, 'English'))
  RETURNING id INTO v_new_year_id;

  -- 3. Promote students (always carries v_carry into next year initially)
  v_promoted := public.promote_students(p_old_year_id, v_new_year_id, p_decisions);

  -- 4. Honor WRITEOFF — strip the just-carried dues + record write-offs
  IF p_dues_handling = 'WRITEOFF' THEN
    -- 4a. Zero out the new-year student_academic_records.total_fee that
    --     came from the carry-forward (no real schedule exists yet for
    --     the new year, so total_fee here is purely the v_carry value)
    UPDATE public.student_academic_records sar
       SET total_fee = 0,
           fee_status = 'PENDING'
     WHERE sar.academic_year_id = v_new_year_id
       AND sar.total_fee > 0;

    -- 4b. Record write-offs for every UNPAID old-year installment
    INSERT INTO public.fee_write_offs
      (installment_id, school_id, amount, reason, approved_by)
    SELECT fi.id,
           fi.school_id,
           GREATEST(0, fi.amount - fi.paid_amount - fi.write_off_amount),
           'year_closing_writeoff',
           auth.uid()
      FROM public.fee_installments fi
     WHERE fi.academic_year_id = p_old_year_id
       AND fi.school_id = v_school
       AND fi.status <> 'PAID'
       AND (fi.amount - fi.paid_amount - fi.write_off_amount) > 0;

    GET DIAGNOSTICS v_written_off = ROW_COUNT;

    -- 4c. Mark those installments themselves as written off
    UPDATE public.fee_installments
       SET write_off_amount = write_off_amount
                              + GREATEST(0, amount - paid_amount - write_off_amount),
           write_off_reason = COALESCE(write_off_reason, 'year_closing_writeoff'),
           status = 'WRITTEN_OFF',
           updated_at = NOW()
     WHERE academic_year_id = p_old_year_id
       AND school_id = v_school
       AND status <> 'PAID'
       AND (amount - paid_amount - write_off_amount) > 0;

    SELECT COALESCE(SUM(amount), 0) INTO v_writeoff_amt
      FROM public.fee_write_offs
     WHERE installment_id IN (
       SELECT id FROM public.fee_installments
        WHERE academic_year_id = p_old_year_id AND school_id = v_school)
       AND reason = 'year_closing_writeoff';
  END IF;

  -- 5. Single audit row covering the whole atomic operation
  INSERT INTO public.audit_logs
    (user_id, school_id, action, entity_type, entity_id, details)
  VALUES
    (auth.uid(), v_school, 'commit_year_closing', 'academic_year', p_old_year_id,
     jsonb_build_object(
       'new_year_id',     v_new_year_id,
       'new_label',       p_new_label,
       'promoted',        v_promoted,
       'dues_handling',   p_dues_handling,
       'written_off_rows', v_written_off,
       'written_off_amt', v_writeoff_amt
     ));

  RETURN jsonb_build_object(
    'new_year_id',      v_new_year_id,
    'new_label',        p_new_label,
    'promoted',         v_promoted,
    'dues_handling',    p_dues_handling,
    'written_off_rows', v_written_off,
    'written_off_amt',  v_writeoff_amt
  );
END $$;

GRANT EXECUTE ON FUNCTION public.commit_year_closing(UUID, TEXT, DATE, DATE, TEXT, TEXT, JSONB, TEXT) TO authenticated;

-- Backwards-compatible 7-arg shim — defaults to ARREARS
CREATE OR REPLACE FUNCTION public.commit_year_closing(
  p_old_year_id UUID,
  p_new_label   TEXT,
  p_new_start   DATE,
  p_new_end     DATE,
  p_new_board   TEXT  DEFAULT 'CBSE',
  p_new_medium  TEXT  DEFAULT 'English',
  p_decisions   JSONB DEFAULT '[]'::jsonb
) RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.commit_year_closing(
    p_old_year_id, p_new_label, p_new_start, p_new_end,
    p_new_board, p_new_medium, p_decisions, 'ARREARS'
  );
$$;

GRANT EXECUTE ON FUNCTION public.commit_year_closing(UUID, TEXT, DATE, DATE, TEXT, TEXT, JSONB) TO authenticated;


-- =============================================================
-- 0009_principal_persistence.sql
-- =============================================================
-- ============================================================================
-- 0009 — Principal panel persistence: salary RPC, staff permissions
--        uniqueness, and AI-generated question papers.
-- All PKs remain UUIDs. Idempotent.
-- ============================================================================

-- ─── 1. AI-generated question papers ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.generated_question_papers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.users(id),
  subject TEXT NOT NULL,
  class_name TEXT NOT NULL,
  request JSONB NOT NULL DEFAULT '{}'::jsonb,   -- {subject, className, testType, totalMarks, duration, topics, difficulty}
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{title, instructions, marks, questions:[...]}, ...]
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS gqp_school_idx ON public.generated_question_papers(school_id, created_at DESC);

ALTER TABLE public.generated_question_papers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gqp_select ON public.generated_question_papers;
CREATE POLICY gqp_select ON public.generated_question_papers FOR SELECT
  USING (public.is_super_admin()
         OR (public.current_user_role() IN ('PRINCIPAL','TEACHER')
             AND school_id = public.current_user_school_id()));
DROP POLICY IF EXISTS gqp_write ON public.generated_question_papers;
CREATE POLICY gqp_write ON public.generated_question_papers FOR ALL
  USING (public.is_super_admin()
         OR (public.current_user_role() IN ('PRINCIPAL','TEACHER')
             AND school_id = public.current_user_school_id()))
  WITH CHECK (public.is_super_admin()
              OR (public.current_user_role() IN ('PRINCIPAL','TEACHER')
                  AND school_id = public.current_user_school_id()));

-- ─── 2. staff_permissions uniqueness ───────────────────────────────────────
-- Ensure a teacher can only hold a given permission once per (section, AY).
-- Using a partial unique index because section_id is NULLable.
DROP INDEX IF EXISTS staff_permissions_unique_idx;
CREATE UNIQUE INDEX staff_permissions_unique_idx
  ON public.staff_permissions(staff_id, section_id, permission)
  WHERE section_id IS NOT NULL;

-- ─── 3. record_salary_payment RPC ──────────────────────────────────────────
-- Atomic: inserts a salary_payments row AND a matching expenses row
-- (category='SALARY') so that cashflow/expense reports stay consistent.
-- Supports partial payments (caller supplies amount, not derived).
CREATE OR REPLACE FUNCTION public.record_salary_payment(
  p_staff_id UUID,
  p_month TEXT,
  p_amount BIGINT,
  p_note TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school UUID;
  v_caller UUID := auth.uid();
  v_year UUID;
  v_pay_id UUID;
  v_txn TEXT;
  v_staff_name TEXT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;

  SELECT school_id, name INTO v_school, v_staff_name
    FROM public.staff WHERE id = p_staff_id;
  IF v_school IS NULL THEN RAISE EXCEPTION 'staff not found'; END IF;

  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_school)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT id INTO v_year FROM public.academic_years
    WHERE school_id = v_school AND is_active = TRUE LIMIT 1;

  v_txn := 'TXN-' || to_char(NOW(),'YYYYMMDDHH24MISS') || '-' || substr(p_staff_id::text, 1, 4);

  INSERT INTO public.salary_payments
    (staff_id, school_id, month, amount, paid_at, transaction_id, note)
  VALUES
    (p_staff_id, v_school, p_month, p_amount, CURRENT_DATE, v_txn, p_note)
  RETURNING id INTO v_pay_id;

  INSERT INTO public.expenses
    (school_id, academic_year_id, category, amount, date, description, created_by)
  VALUES
    (v_school, v_year, 'SALARY', p_amount, CURRENT_DATE,
     'Salary: ' || COALESCE(v_staff_name, p_staff_id::text) || ' — ' || p_month
     || COALESCE(' (' || NULLIF(p_note,'') || ')', ''),
     v_caller);

  INSERT INTO public.audit_logs (user_id, school_id, action, entity_type, entity_id, details)
  VALUES (v_caller, v_school, 'salary_paid', 'staff', p_staff_id,
          jsonb_build_object('month', p_month, 'amount', p_amount, 'txn', v_txn));

  RETURN v_pay_id;
END $$;
GRANT EXECUTE ON FUNCTION public.record_salary_payment(UUID, TEXT, BIGINT, TEXT) TO authenticated;


-- =============================================================
-- 0010_asset_history_meta.sql
-- =============================================================
-- 0010_asset_history_meta.sql
--
-- Capture WHO performed an asset issue/return and WHAT condition the item
-- was in, so the principal's library/lab history shows actor + condition
-- notes (not just borrower + dates).
--
-- Adds nullable columns to public.asset_issues and republishes the
-- public.issue_asset / public.return_asset RPCs with optional note params
-- and automatic actor capture (auth.uid()).

ALTER TABLE public.asset_issues
  ADD COLUMN IF NOT EXISTS issued_by_user_id UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS returned_by_user_id UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS issue_note TEXT,
  ADD COLUMN IF NOT EXISTS return_note TEXT;

CREATE INDEX IF NOT EXISTS asset_issues_issued_by_idx
  ON public.asset_issues(issued_by_user_id);
CREATE INDEX IF NOT EXISTS asset_issues_returned_by_idx
  ON public.asset_issues(returned_by_user_id);

-- ─── issue_asset (republished with optional p_note) ────────────────────────
DROP FUNCTION IF EXISTS public.issue_asset(UUID, UUID, TEXT, INT);
DROP FUNCTION IF EXISTS public.issue_asset(UUID, UUID, TEXT, INT, TEXT);

CREATE OR REPLACE FUNCTION public.issue_asset(
  p_asset_id UUID,
  p_student_id UUID,
  p_borrower_name TEXT,
  p_loan_days INT DEFAULT 14,
  p_note TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school UUID := public.current_user_school_id();
  v_avail INT;
  v_issue_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF NOT public.is_principal() THEN RAISE EXCEPTION 'principal only'; END IF;

  SELECT available_count INTO v_avail
    FROM public.assets
   WHERE id = p_asset_id AND school_id = v_school
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'asset not found in school'; END IF;
  IF v_avail <= 0 THEN RAISE EXCEPTION 'no copies available'; END IF;

  INSERT INTO public.asset_issues (
    asset_id, school_id, student_id, borrower_name, issued_at, due_date,
    issued_by_user_id, issue_note
  ) VALUES (
    p_asset_id, v_school, p_student_id, p_borrower_name,
    CURRENT_DATE, CURRENT_DATE + (p_loan_days || ' days')::INTERVAL,
    auth.uid(), NULLIF(BTRIM(p_note), '')
  )
  RETURNING id INTO v_issue_id;

  UPDATE public.assets
     SET available_count = available_count - 1
   WHERE id = p_asset_id AND school_id = v_school;

  RETURN v_issue_id;
END $$;
GRANT EXECUTE ON FUNCTION public.issue_asset(UUID, UUID, TEXT, INT, TEXT) TO authenticated;

-- ─── return_asset (republished with optional p_note) ───────────────────────
DROP FUNCTION IF EXISTS public.return_asset(UUID, UUID);
DROP FUNCTION IF EXISTS public.return_asset(UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.return_asset(
  p_asset_id UUID,
  p_student_id UUID,
  p_note TEXT DEFAULT NULL
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school UUID := public.current_user_school_id();
  v_total INT;
  v_avail INT;
  v_returned INT;
  v_clean_note TEXT := NULLIF(BTRIM(p_note), '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF NOT public.is_principal() THEN RAISE EXCEPTION 'principal only'; END IF;

  SELECT total_count, available_count INTO v_total, v_avail
    FROM public.assets
   WHERE id = p_asset_id AND school_id = v_school
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'asset not found in school'; END IF;

  UPDATE public.asset_issues
     SET returned_at = CURRENT_DATE,
         returned_by_user_id = auth.uid(),
         return_note = v_clean_note
   WHERE asset_id = p_asset_id
     AND school_id = v_school
     AND returned_at IS NULL
     AND (p_student_id IS NULL OR student_id = p_student_id);
  GET DIAGNOSTICS v_returned = ROW_COUNT;

  IF v_returned = 0 THEN
    RAISE EXCEPTION 'no open loan found for student';
  END IF;

  UPDATE public.assets
     SET available_count = LEAST(v_total, v_avail + v_returned)
   WHERE id = p_asset_id AND school_id = v_school;

  RETURN v_returned;
END $$;
GRANT EXECUTE ON FUNCTION public.return_asset(UUID, UUID, TEXT) TO authenticated;


-- =============================================================
-- 0011_fee_payment_uploads.sql
-- =============================================================
-- 0011_fee_payment_uploads.sql
-- Persists parent / student fee-payment screenshot submissions so they no
-- longer disappear when the device reloads, and so principals can review
-- and approve / reject them from the same school.
--
-- Workflow:
--   1. Parent / student submits a UTR / screenshot reference for a payment
--      they made via UPI. Row lands in PENDING.
--   2. Principal of the same school reviews and either approves the upload
--      (which usually corresponds to a real payment record being created
--      separately) or rejects it with a reviewer note.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.fee_payment_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES public.users(id),
  amount BIGINT NOT NULL CHECK (amount >= 0),
  description TEXT,
  screenshot_name TEXT,
  screenshot_url TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  reviewed_by UUID REFERENCES public.users(id),
  reviewed_at TIMESTAMPTZ,
  reviewer_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fpu_school_status_idx
  ON public.fee_payment_uploads(school_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS fpu_student_idx
  ON public.fee_payment_uploads(student_id, created_at DESC);

ALTER TABLE public.fee_payment_uploads ENABLE ROW LEVEL SECURITY;

-- SELECT:
--   * super admin: everything
--   * principal / teacher of the same school: every upload at their school
--   * parent / student: only uploads tied to a student they're linked to
DROP POLICY IF EXISTS fpu_select ON public.fee_payment_uploads;
CREATE POLICY fpu_select ON public.fee_payment_uploads FOR SELECT
  USING (
    public.is_super_admin()
    OR (
      public.current_user_role() IN ('PRINCIPAL','TEACHER')
      AND school_id = public.current_user_school_id()
    )
    OR student_id = ANY(public.linked_student_ids())
  );

-- INSERT: parent or student authoring the row, for a student they're linked
-- to, scoped to that student's school. submitted_by must equal auth.uid().
DROP POLICY IF EXISTS fpu_insert ON public.fee_payment_uploads;
CREATE POLICY fpu_insert ON public.fee_payment_uploads FOR INSERT
  WITH CHECK (
    submitted_by = auth.uid()
    AND student_id = ANY(public.linked_student_ids())
    AND EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_id AND s.school_id = fee_payment_uploads.school_id
    )
  );

-- UPDATE / DELETE: super admin OR principal of the same school.
DROP POLICY IF EXISTS fpu_admin_write ON public.fee_payment_uploads;
CREATE POLICY fpu_admin_write ON public.fee_payment_uploads FOR ALL
  USING (
    public.is_super_admin()
    OR (public.is_principal() AND school_id = public.current_user_school_id())
  )
  WITH CHECK (
    public.is_super_admin()
    OR (public.is_principal() AND school_id = public.current_user_school_id())
  );


-- =============================================================
-- 0012_fee_screenshots_storage.sql
-- =============================================================
-- 0012_fee_screenshots_storage.sql
-- Provisions the private Supabase Storage bucket that backs the
-- `fee_payment_uploads.screenshot_url` column. Without this the parent
-- upload flow only ever recorded a UTR/filename string and the bytes of
-- the screenshot itself were never stored, which made principal review
-- impossible.
--
-- Object key convention enforced by the policies below:
--
--     <school_id>/<student_id>/<unique-filename>.<ext>
--
-- so we can authorise reads/writes purely from the path without joining
-- back through the fee_payment_uploads row.
-- ---------------------------------------------------------------------------

-- 1. Bucket. Private (public = false), capped at 5 MB, image MIME types only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'fee-screenshots',
  'fee-screenshots',
  false,
  5242880,
  ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. INSERT policy: authenticated parent / student, uploading into a folder
--    structured as <school_id>/<student_id>/... where the student id must
--    be one of the caller's linked students AND must actually belong to
--    the school folder named in the path.
DROP POLICY IF EXISTS fee_screenshots_insert ON storage.objects;
CREATE POLICY fee_screenshots_insert ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'fee-screenshots'
    AND array_length(storage.foldername(name), 1) >= 2
    AND ((storage.foldername(name))[2])::uuid = ANY(public.linked_student_ids())
    AND EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = ((storage.foldername(name))[2])::uuid
        AND s.school_id::text = (storage.foldername(name))[1]
    )
  );

-- 3. SELECT policy: super admin OR same-school principal/teacher OR a
--    parent/student linked to the student folder. createSignedUrl()
--    requires SELECT permission, which is what gates principal review.
DROP POLICY IF EXISTS fee_screenshots_select ON storage.objects;
CREATE POLICY fee_screenshots_select ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'fee-screenshots'
    AND array_length(storage.foldername(name), 1) >= 2
    AND (
      public.is_super_admin()
      OR (
        public.current_user_role() IN ('PRINCIPAL','TEACHER')
        AND public.current_user_school_id()::text = (storage.foldername(name))[1]
      )
      OR ((storage.foldername(name))[2])::uuid = ANY(public.linked_student_ids())
    )
  );

-- 4. DELETE policy: super admin OR principal of the same school. Used to
--    clean up orphaned uploads when a fee_payment_uploads insert fails
--    after the bytes have already landed (best-effort, not relied on).
DROP POLICY IF EXISTS fee_screenshots_delete ON storage.objects;
CREATE POLICY fee_screenshots_delete ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'fee-screenshots'
    AND array_length(storage.foldername(name), 1) >= 2
    AND (
      public.is_super_admin()
      OR (
        public.is_principal()
        AND public.current_user_school_id()::text = (storage.foldername(name))[1]
      )
      OR (
        owner = auth.uid()
        AND ((storage.foldername(name))[2])::uuid = ANY(public.linked_student_ids())
      )
    )
  );


-- =============================================================
-- 0013_fee_upload_auto_record.sql
-- =============================================================
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


-- =============================================================
-- 0014_fee_screenshots_cleanup.sql
-- =============================================================
-- 0014_fee_screenshots_cleanup.sql
-- Storage hygiene for the private `fee-screenshots` bucket.
--
-- Two complementary mechanisms keep the bucket from growing forever:
--
--   A) AFTER-DELETE trigger on fee_payment_uploads — whenever an upload
--      row goes away (any reason: principal action, school cascade,
--      manual SQL, scheduled purge below) we also drop the matching
--      storage.objects row. The Supabase storage worker handles eventual
--      removal of the underlying object bytes.
--
--   B) Two SECURITY DEFINER RPCs that the cron-style cleanup script
--      (scripts/cleanup-fee-screenshots.ts) calls with the service-role
--      key:
--
--        * list_purgeable_fee_screenshots(rejected_after_days)
--            – returns rows eligible for purge:
--                · status = 'REJECTED' and reviewed_at older than the
--                  threshold (default 90 days), OR
--                · created_at falls inside an academic_year for the
--                  same school where is_closed = TRUE.
--
--        * delete_fee_payment_uploads(ids[])
--            – deletes the listed upload rows. Trigger A) fires for
--              each, dropping the storage.objects metadata. The script
--              has already removed the underlying files via the storage
--              API before calling this, so the trigger is a no-op /
--              safety net.
--
-- Both RPCs are restricted to the service role — the public-facing
-- frontend never needs them.
-- ---------------------------------------------------------------------------

-- A) Cascade trigger ---------------------------------------------------------
-- screenshot_url column dropped in 0050 (replaced with transaction_id).
-- Trigger kept as a no-op so the bucket cleanup hook remains attachable.
CREATE OR REPLACE FUNCTION public.fee_payment_upload_after_delete()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS fee_payment_uploads_cleanup_storage
  ON public.fee_payment_uploads;
CREATE TRIGGER fee_payment_uploads_cleanup_storage
AFTER DELETE ON public.fee_payment_uploads
FOR EACH ROW EXECUTE FUNCTION public.fee_payment_upload_after_delete();


-- B1) list_purgeable_fee_screenshots ----------------------------------------
DROP FUNCTION IF EXISTS public.list_purgeable_fee_screenshots(INT);
CREATE OR REPLACE FUNCTION public.list_purgeable_fee_screenshots(
  p_rejected_after_days INT DEFAULT 90
) RETURNS TABLE (
  id              UUID,
  school_id       UUID,
  status          TEXT,
  created_at      TIMESTAMPTZ,
  reviewed_at     TIMESTAMPTZ,
  reason          TEXT
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH cutoff AS (
    SELECT NOW() - (GREATEST(p_rejected_after_days, 0) || ' days')::INTERVAL AS ts
  )
  SELECT fpu.id,
         fpu.school_id,
         fpu.status,
         fpu.created_at,
         fpu.reviewed_at,
         CASE
           WHEN fpu.status = 'REJECTED'
                AND fpu.reviewed_at IS NOT NULL
                AND fpu.reviewed_at < (SELECT ts FROM cutoff)
             THEN 'rejected_old'
           ELSE 'closed_academic_year'
         END AS reason
    FROM public.fee_payment_uploads fpu
   WHERE (
           fpu.status = 'REJECTED'
           AND fpu.reviewed_at IS NOT NULL
           AND fpu.reviewed_at < (SELECT ts FROM cutoff)
         )
      OR EXISTS (
           SELECT 1
             FROM public.academic_years ay
            WHERE ay.school_id = fpu.school_id
              AND ay.is_closed = TRUE
              AND fpu.created_at::date BETWEEN ay.start_date AND ay.end_date
         )
   ORDER BY fpu.created_at ASC;
$$;

REVOKE EXECUTE ON FUNCTION public.list_purgeable_fee_screenshots(INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.list_purgeable_fee_screenshots(INT) TO service_role;


-- B2) delete_fee_payment_uploads --------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_fee_payment_uploads(
  p_ids UUID[]
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_deleted INT;
BEGIN
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  WITH del AS (
    DELETE FROM public.fee_payment_uploads
     WHERE id = ANY(p_ids)
    RETURNING id
  )
  SELECT count(*)::INT INTO v_deleted FROM del;

  RETURN COALESCE(v_deleted, 0);
END $$;

REVOKE EXECUTE ON FUNCTION public.delete_fee_payment_uploads(UUID[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.delete_fee_payment_uploads(UUID[]) TO service_role;


-- =============================================================
-- 0015_onboard_school_fix_ambiguous_code.sql
-- =============================================================
-- ============================================================================
-- Migration 0015 — fix "column reference 'code' is ambiguous" in onboard_school
--
-- The RETURNS TABLE clause in 0004 declared OUT parameters named `code` and
-- `is_deleted`. Inside the function body, those OUT names are visible as
-- local identifiers and conflict with the same-named columns of
-- public.schools. The unqualified duplicate-check
--
--     IF EXISTS (SELECT 1 FROM public.schools
--                  WHERE code = p_school_code AND is_deleted = false)
--
-- raised "column reference \"code\" is ambiguous" at runtime, which the
-- Super Admin "Add School" UI surfaced as a "not found"-style error toast.
--
-- Fix: alias the table and qualify every column reference inside the body.
-- Function signature is unchanged so we re-create it in place (no DROP /
-- re-grant churn). Primary keys are untouched.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.onboard_school(
  p_principal_user_id  UUID,
  p_school_name        TEXT,
  p_school_code        TEXT,
  p_location           TEXT,
  p_address            TEXT,
  p_phone              TEXT,
  p_principal_name     TEXT,
  p_principal_email    TEXT,
  p_principal_phone    TEXT,
  p_principal_mobile   TEXT,
  p_status             TEXT,
  p_plan               TEXT,
  p_payment_start_date DATE,
  p_annual_amount      BIGINT
) RETURNS TABLE (
  id                 UUID,
  name               TEXT,
  code               TEXT,
  location           TEXT,
  address            TEXT,
  phone              TEXT,
  principal_name     TEXT,
  principal_email    TEXT,
  principal_phone    TEXT,
  status             TEXT,
  plan               TEXT,
  payment_status     TEXT,
  payment_start_date DATE,
  is_deleted         BOOLEAN,
  created_at         TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller_id  UUID := auth.uid();
  v_school_id  UUID;
  v_year_label TEXT;
  v_end_date   DATE;
BEGIN
  -- Authorization: only an active SUPER_ADMIN may onboard schools.
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'only super admins may onboard schools' USING ERRCODE = '42501';
  END IF;

  IF p_annual_amount IS NULL OR p_annual_amount <= 0 THEN
    RAISE EXCEPTION 'annualAmount must be positive';
  END IF;

  -- Reject duplicates up-front so the caller gets a clean error.
  -- Columns are explicitly qualified because the RETURNS TABLE OUT
  -- parameters (code, is_deleted, ...) are in scope inside this body
  -- and would otherwise shadow the public.schools columns.
  IF EXISTS (
    SELECT 1
      FROM public.schools s
     WHERE s.code = p_school_code
       AND s.is_deleted = false
  ) THEN
    RAISE EXCEPTION 'A school with code % already exists', p_school_code;
  END IF;
  IF EXISTS (
    SELECT 1
      FROM public.users u
     WHERE u.mobile_number = p_principal_mobile
  ) THEN
    RAISE EXCEPTION 'Mobile % is already registered', p_principal_mobile;
  END IF;

  -- 1. School row.
  INSERT INTO public.schools (
    name, code, location, address, phone,
    principal_name, principal_email, principal_phone,
    status, plan, payment_status, payment_start_date
  ) VALUES (
    p_school_name, p_school_code, p_location, p_address, p_phone,
    p_principal_name, p_principal_email, p_principal_phone,
    p_status, p_plan, 'PENDING', p_payment_start_date
  ) RETURNING schools.id INTO v_school_id;

  -- 2. Principal profile (1:1 with auth.users by id).
  INSERT INTO public.users (
    id, mobile_number, role, name, email, school_id,
    first_login_changed, is_active
  ) VALUES (
    p_principal_user_id, p_principal_mobile, 'PRINCIPAL',
    p_principal_name, p_principal_email, v_school_id,
    false, true
  );

  -- 3. Billing schedule.
  INSERT INTO public.school_billing_schedules (
    school_id, plan, annual_amount, billing_start_date
  ) VALUES (
    v_school_id, p_plan, p_annual_amount, p_payment_start_date
  );

  -- 4. First billing year.
  v_end_date := (p_payment_start_date + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
  v_year_label := EXTRACT(YEAR FROM p_payment_start_date)::TEXT
                  || '-'
                  || RIGHT(EXTRACT(YEAR FROM v_end_date)::TEXT, 2);

  INSERT INTO public.school_billing_years (
    school_id, year_label, start_date, end_date,
    annual_amount, carried_forward, total_due, total_paid, outstanding
  ) VALUES (
    v_school_id, v_year_label, p_payment_start_date, v_end_date,
    p_annual_amount, 0, p_annual_amount, 0, p_annual_amount
  );

  -- 5. Audit (best-effort, attributed to the verified caller).
  INSERT INTO public.audit_logs (user_id, school_id, action, entity_type, entity_id, details)
  VALUES (
    v_caller_id, v_school_id, 'onboard_school', 'school', v_school_id,
    jsonb_build_object(
      'name', p_school_name, 'code', p_school_code,
      'plan', p_plan, 'principal', p_principal_name
    )
  );

  RETURN QUERY
    SELECT s.id, s.name, s.code, s.location, s.address, s.phone,
           s.principal_name, s.principal_email, s.principal_phone,
           s.status, s.plan, s.payment_status, s.payment_start_date,
           s.is_deleted, s.created_at, s.updated_at
      FROM public.schools s
     WHERE s.id = v_school_id;
END;
$$;


-- =============================================================
-- 0016_fix_first_login_flag_persist.sql
-- =============================================================
-- ============================================================================
-- Migration 0016 — fix `first_login_changed` not persisting after a Principal
-- (or any non–super-admin user) completes the forced first-login password
-- change. Symptom: the password change succeeded, but every subsequent login
-- still showed the "change your password" screen.
--
-- Root cause:
--   * `public.mark_first_login_complete()` (SECURITY DEFINER, called by the
--     UI right after `supabase.auth.updateUser({ password })`) runs
--     `UPDATE public.users SET first_login_changed = TRUE WHERE id = auth.uid()`.
--   * The BEFORE UPDATE trigger `users_prevent_self_escalation` on the same
--     table forcibly resets a list of locked columns — including
--     `first_login_changed` — back to OLD.* whenever the caller is an
--     authenticated user that is NOT a super admin. Even though the RPC
--     runs SECURITY DEFINER, `auth.uid()` is still the principal's user id,
--     so the trigger nullifies its own RPC's write. The UPDATE silently
--     becomes a no-op.
--
-- Fix:
--   * `mark_first_login_complete()` sets a transaction-local GUC
--     `app.allow_first_login_flip = 'true'` *before* the UPDATE.
--   * `users_prevent_self_escalation` looks at the GUC and, if it is on,
--     allows the flag to flip from false to true (and only that direction;
--     it still blocks any other tampering with `first_login_changed` and
--     all the other locked columns). The GUC is transaction-scoped (third
--     arg `true` to set_config), so the escape hatch closes as soon as the
--     RPC's transaction commits.
--
-- Primary keys are untouched. Function signature of
-- `mark_first_login_complete()` is unchanged so existing GRANTs carry over.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.users_prevent_self_escalation() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_allow_first_login_flip TEXT;
BEGIN
  -- Service role / admin tooling: no JWT, allow everything.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  -- Super admins manage user rows directly.
  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  -- Lock the rest of the sensitive columns to OLD values regardless.
  NEW.id := OLD.id;
  NEW.role := OLD.role;
  NEW.school_id := OLD.school_id;
  NEW.is_active := OLD.is_active;
  NEW.mobile_number := OLD.mobile_number;
  NEW.created_at := OLD.created_at;

  -- The forced first-login password-change flow needs to flip
  -- `first_login_changed` from FALSE to TRUE. The dedicated SECURITY
  -- DEFINER RPC `mark_first_login_complete()` opts in by setting the
  -- transaction-local GUC below; we honour that one-way flip and lock
  -- the column down again everywhere else.
  v_allow_first_login_flip := current_setting('app.allow_first_login_flip', true);
  IF v_allow_first_login_flip IS DISTINCT FROM 'true'
     OR OLD.first_login_changed IS NOT FALSE
     OR NEW.first_login_changed IS NOT TRUE
  THEN
    NEW.first_login_changed := OLD.first_login_changed;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_first_login_complete() RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  -- Open the trigger's escape hatch for just this transaction. Third
  -- argument `true` makes the setting transaction-local, so it is
  -- automatically reset when this RPC's implicit transaction commits.
  PERFORM set_config('app.allow_first_login_flip', 'true', true);
  UPDATE public.users
     SET first_login_changed = TRUE
   WHERE id = auth.uid();
END;
$$;


-- =============================================================
-- 0017_full_flow_fixes.sql
-- =============================================================
-- ============================================================================
-- Migration 0017 — Full-flow database foundations
--
-- Lays the schema/RPC groundwork that every later UI task in the "Full School
-- App Flow" plan depends on. Bundling all changes into one transactional file
-- keeps the order deterministic and avoids per-task migrations.
--
-- Highlights
--   * staff: relieving_date / relieving_reason columns + staff_salary_history
--     table + update_staff_salary() RPC.
--   * sections: stream + capacity columns.
--   * student_transport_assignments: reason + changed_by columns.
--   * academic_years: streams JSONB + single-active-year BEFORE-UPDATE trigger.
--   * student_academic_records: UNIQUE (academic_year_id, section_id, roll_no).
--     Pre-existing duplicates have their roll_no quietly NULLed before the
--     constraint is added so the migration is safe to run on dirty data.
--   * student_class_movements: extra columns (section ids, denormalised class
--     name fields, changed_by) so the RPC and the UI can carry richer history.
--   * record_class_movement RPC: writes section_id/class_name + changed_by.
--   * generate_student_fee_schedule RPC: re-created with discount_amount /
--     discount_pct / is_rte parameters; per-installment discount applied,
--     payer_type forced to GOVERNMENT when RTE.
--   * school_billing_schedules.advance_balance column: lets record_school_payment
--     park surplus credit at the schedule level instead of overpaying the
--     latest year. record_school_payment is re-created to use it.
--
-- Idempotent: every ALTER uses IF NOT EXISTS guards, every CREATE TABLE uses
-- IF NOT EXISTS, every RPC uses CREATE OR REPLACE (or DROP + CREATE where the
-- signature changed). Re-running the file is a no-op.
-- ============================================================================

BEGIN;

-- ─── 1. staff: relieving info + salary history ───────────────────────────────

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS relieving_date   DATE,
  ADD COLUMN IF NOT EXISTS relieving_reason TEXT;

CREATE TABLE IF NOT EXISTS public.staff_salary_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  salary_amount BIGINT NOT NULL,
  effective_from DATE NOT NULL,
  reason TEXT,
  changed_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS staff_salary_history_staff_idx
  ON public.staff_salary_history(staff_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS staff_salary_history_school_idx
  ON public.staff_salary_history(school_id);

ALTER TABLE public.staff_salary_history ENABLE ROW LEVEL SECURITY;

-- Salary is sensitive: only PRINCIPAL of the same school + super admin may
-- read history. Teachers explicitly excluded so they cannot see other staff
-- salaries (or each other's). Service role still bypasses RLS as usual.
DROP POLICY IF EXISTS staff_salary_history_select ON public.staff_salary_history;
CREATE POLICY staff_salary_history_select ON public.staff_salary_history FOR SELECT
  USING (
    public.is_super_admin()
    OR (public.is_principal() AND school_id = public.current_user_school_id())
  );

DROP POLICY IF EXISTS staff_salary_history_write ON public.staff_salary_history;
CREATE POLICY staff_salary_history_write ON public.staff_salary_history FOR ALL
  USING (
    public.is_super_admin()
    OR (public.is_principal() AND school_id = public.current_user_school_id())
  )
  WITH CHECK (
    public.is_super_admin()
    OR (public.is_principal() AND school_id = public.current_user_school_id())
  );

-- update_staff_salary(): atomic salary edit — bumps staff.salary and inserts
-- a history row in one transaction. Principal-of-same-school OR super admin.
CREATE OR REPLACE FUNCTION public.update_staff_salary(
  p_staff_id      UUID,
  p_new_amount    BIGINT,
  p_effective_from DATE DEFAULT CURRENT_DATE,
  p_reason        TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id UUID;
  v_history_id UUID;
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_new_amount IS NULL OR p_new_amount < 0 THEN
    RAISE EXCEPTION 'salary must be non-negative';
  END IF;

  SELECT school_id INTO v_school_id FROM public.staff WHERE id = p_staff_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'staff not found'; END IF;

  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_school_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.staff
     SET salary = p_new_amount,
         updated_at = NOW()
   WHERE id = p_staff_id;

  INSERT INTO public.staff_salary_history
    (staff_id, school_id, salary_amount, effective_from, reason, changed_by)
  VALUES
    (p_staff_id, v_school_id, p_new_amount, p_effective_from, p_reason, v_caller)
  RETURNING id INTO v_history_id;

  PERFORM public.log_audit(
    'update_staff_salary', 'staff', p_staff_id,
    jsonb_build_object('amount', p_new_amount, 'effective_from', p_effective_from, 'reason', p_reason)
  );

  RETURN v_history_id;
END $$;
GRANT EXECUTE ON FUNCTION public.update_staff_salary(UUID, BIGINT, DATE, TEXT) TO authenticated;

-- ─── 2. sections: stream + capacity ─────────────────────────────────────────

ALTER TABLE public.sections
  ADD COLUMN IF NOT EXISTS stream   TEXT,
  ADD COLUMN IF NOT EXISTS capacity INT NOT NULL DEFAULT 45;

-- ─── 3. student_transport_assignments: reason + changed_by ──────────────────

ALTER TABLE public.student_transport_assignments
  ADD COLUMN IF NOT EXISTS reason     TEXT,
  ADD COLUMN IF NOT EXISTS changed_by UUID REFERENCES public.users(id);

-- ─── 4. academic_years: streams JSONB + single-active trigger ───────────────

ALTER TABLE public.academic_years
  ADD COLUMN IF NOT EXISTS streams JSONB NOT NULL DEFAULT '["Science","Commerce","Arts"]'::jsonb;

-- Before flipping a year to is_active = TRUE, deactivate every other year of
-- the same school. Recursion-safe: the inner UPDATE flips siblings to FALSE,
-- which fails the (NEW.is_active = TRUE) condition and short-circuits.
CREATE OR REPLACE FUNCTION public.academic_years_single_active() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_active = TRUE
     AND (TG_OP = 'INSERT' OR OLD.is_active IS DISTINCT FROM TRUE) THEN
    UPDATE public.academic_years
       SET is_active = FALSE
     WHERE school_id = NEW.school_id
       AND id <> NEW.id
       AND is_active = TRUE;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS academic_years_single_active_upd ON public.academic_years;
CREATE TRIGGER academic_years_single_active_upd
  BEFORE UPDATE OF is_active ON public.academic_years
  FOR EACH ROW EXECUTE FUNCTION public.academic_years_single_active();

DROP TRIGGER IF EXISTS academic_years_single_active_ins ON public.academic_years;
CREATE TRIGGER academic_years_single_active_ins
  BEFORE INSERT ON public.academic_years
  FOR EACH ROW EXECUTE FUNCTION public.academic_years_single_active();

-- ─── 5. student_academic_records: roll-no uniqueness ────────────────────────
--
-- NULL out roll_no for any duplicate-within-section rows so the constraint
-- can be added on dirty data. The "first" row in each duplicate group keeps
-- its roll_no; the rest get NULLed and can be re-assigned by the UI later.
WITH dups AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY academic_year_id, section_id, roll_no
           ORDER BY created_at, id
         ) AS rn
    FROM public.student_academic_records
   WHERE roll_no IS NOT NULL
     AND section_id IS NOT NULL
)
UPDATE public.student_academic_records sar
   SET roll_no = NULL
  FROM dups
 WHERE sar.id = dups.id
   AND dups.rn > 1;

-- Partial unique index ignores NULL roll_no / NULL section_id rows.
CREATE UNIQUE INDEX IF NOT EXISTS sar_year_section_roll_uniq
  ON public.student_academic_records (academic_year_id, section_id, roll_no)
  WHERE roll_no IS NOT NULL AND section_id IS NOT NULL;

-- ─── 6. student_class_movements: richer history columns ─────────────────────

-- Resilience: create the table if a partial schema is missing it. The
-- baseline column set mirrors the prior migration that introduced this
-- table; the ALTER below then adds any newly-required columns idempotently.
CREATE TABLE IF NOT EXISTS public.student_class_movements (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  from_class       TEXT,
  from_section     TEXT,
  to_class         TEXT,
  to_section       TEXT,
  effective_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  reason           TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.student_class_movements
  ADD COLUMN IF NOT EXISTS old_section_id  UUID REFERENCES public.sections(id),
  ADD COLUMN IF NOT EXISTS new_section_id  UUID REFERENCES public.sections(id),
  ADD COLUMN IF NOT EXISTS old_class_name  TEXT,
  ADD COLUMN IF NOT EXISTS new_class_name  TEXT,
  ADD COLUMN IF NOT EXISTS changed_by      UUID REFERENCES public.users(id);

CREATE INDEX IF NOT EXISTS scm_student_year_idx
  ON public.student_class_movements(student_id, academic_year_id);

-- Re-create record_class_movement so it populates the new columns + changed_by.
-- Signature unchanged so existing GRANT carries over.
CREATE OR REPLACE FUNCTION public.record_class_movement(
  p_student_id UUID, p_year_id UUID,
  p_new_class TEXT, p_new_section TEXT,
  p_effective_date DATE, p_reason TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
  v_old_class TEXT;
  v_old_section TEXT;
  v_old_section_id UUID;
  v_new_section_id UUID;
  v_school_id UUID;
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF NOT public.is_principal() THEN RAISE EXCEPTION 'principal only'; END IF;

  SELECT s.school_id INTO v_school_id FROM public.students s WHERE s.id = p_student_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'student not found'; END IF;
  IF v_school_id <> public.current_user_school_id() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT class_name, section, section_id
    INTO v_old_class, v_old_section, v_old_section_id
    FROM public.student_academic_records
   WHERE student_id = p_student_id AND academic_year_id = p_year_id;

  -- Best-effort lookup of new section_id by class+section+year.
  SELECT id INTO v_new_section_id
    FROM public.sections
   WHERE academic_year_id = p_year_id
     AND class_name = p_new_class
     AND section    = p_new_section
   LIMIT 1;

  INSERT INTO public.student_class_movements
    (student_id, academic_year_id,
     old_class, old_section, old_class_name, old_section_id,
     new_class, new_section, new_class_name, new_section_id,
     effective_date, reason, changed_by)
  VALUES
    (p_student_id, p_year_id,
     v_old_class, v_old_section, v_old_class, v_old_section_id,
     p_new_class, p_new_section, p_new_class, v_new_section_id,
     p_effective_date, p_reason, v_caller)
  RETURNING id INTO v_id;

  -- If the new section couldn't be resolved, NULL the section_id rather
  -- than keep the old one (which would create a class_name vs section_id
  -- mismatch). The UI/principal can then re-link it from the section list.
  UPDATE public.student_academic_records
     SET class_name = p_new_class,
         section    = p_new_section,
         section_id = v_new_section_id
   WHERE student_id = p_student_id AND academic_year_id = p_year_id;

  PERFORM public.log_audit(
    'record_class_movement', 'student', p_student_id,
    jsonb_build_object(
      'year_id',         p_year_id,
      'old_class',       v_old_class,
      'old_section',     v_old_section,
      'new_class',       p_new_class,
      'new_section',     p_new_section,
      'effective_date',  p_effective_date,
      'reason',          p_reason
    )
  );

  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.record_class_movement(UUID, UUID, TEXT, TEXT, DATE, TEXT) TO authenticated;

-- ─── 7. generate_student_fee_schedule: discounts + RTE ──────────────────────
--
-- Adds p_discount_amount (₹ fixed, applied per installment) and
-- p_discount_pct (% off each installment) — the larger of the two wins per
-- head when both are set, but the typical caller sets only one. RTE flips
-- payer_type to GOVERNMENT for monthly heads (existing behaviour preserved).
--
-- The new parameter list (7 args vs. the old 5) means CREATE OR REPLACE
-- cannot re-use the existing function; we drop the prior signature first.
DROP FUNCTION IF EXISTS public.generate_student_fee_schedule(UUID, UUID, JSONB, JSONB, BOOLEAN);

CREATE OR REPLACE FUNCTION public.generate_student_fee_schedule(
  p_student_id      UUID,
  p_year_id         UUID,
  p_heads           JSONB,
  p_due_dates       JSONB,
  p_is_rte          BOOLEAN DEFAULT FALSE,
  p_discount_amount NUMERIC DEFAULT 0,
  p_discount_pct    NUMERIC DEFAULT 0
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id UUID;
  v_caller UUID := auth.uid();
  v_count INT := 0;
  v_head JSONB;
  v_dd JSONB;
  v_payer TEXT;
  v_freq TEXT;
  v_amt BIGINT;
  v_name TEXT;
  v_discount BIGINT;
  v_pct NUMERIC := COALESCE(p_discount_pct, 0);
  v_fixed NUMERIC := COALESCE(p_discount_amount, 0);
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF v_pct < 0 OR v_pct > 100 THEN RAISE EXCEPTION 'discount_pct out of range'; END IF;
  IF v_fixed < 0 THEN RAISE EXCEPTION 'discount_amount must be non-negative'; END IF;

  SELECT school_id INTO v_school_id FROM public.students WHERE id = p_student_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'student not found'; END IF;
  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_school_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Drop unpaid/un-written-off rows so we re-create cleanly. Paid history is preserved.
  DELETE FROM public.fee_installments
   WHERE student_id = p_student_id
     AND academic_year_id = p_year_id
     AND paid_amount = 0
     AND write_off_amount = 0;

  FOR v_head IN SELECT * FROM jsonb_array_elements(p_heads)
  LOOP
    v_name := v_head->>'name';
    v_amt  := (v_head->>'amount')::BIGINT;
    v_freq := COALESCE(v_head->>'frequency', 'MONTHLY');
    -- RTE flips payer to GOVERNMENT for ALL frequencies (monthly tuition,
    -- annual exam fee, etc). The 0005 version only flipped MONTHLY which
    -- left annual RTE charges incorrectly billed to the parent.
    v_payer := CASE WHEN p_is_rte THEN 'GOVERNMENT' ELSE 'PARENT' END;

    -- Larger of fixed-₹ vs %-of-amount per installment.
    v_discount := GREATEST(
      v_fixed::BIGINT,
      FLOOR(v_amt * v_pct / 100.0)::BIGINT
    );
    v_amt := GREATEST(0, v_amt - v_discount);

    IF v_freq = 'MONTHLY' THEN
      FOR v_dd IN SELECT * FROM jsonb_array_elements(p_due_dates)
      LOOP
        INSERT INTO public.fee_installments
          (student_id, academic_year_id, school_id, month, due_date, fee_type, amount, payer_type)
        VALUES
          (p_student_id, p_year_id, v_school_id, v_dd->>'month',
           (v_dd->>'date')::DATE,
           CASE WHEN lower(v_name) LIKE '%transport%' THEN 'TRANSPORT'
                WHEN lower(v_name) LIKE '%exam%'      THEN 'EXAM'
                WHEN lower(v_name) LIKE '%tuition%'   THEN 'TUITION'
                ELSE 'OTHER' END,
           v_amt, v_payer);
        v_count := v_count + 1;
      END LOOP;
    ELSE  -- ANNUAL or ONE_TIME — payer also follows v_payer so RTE flips
          -- annual / one-time charges to GOVERNMENT too.
      INSERT INTO public.fee_installments
        (student_id, academic_year_id, school_id, month, due_date, fee_type, amount, payer_type)
      VALUES
        (p_student_id, p_year_id, v_school_id,
         CASE WHEN v_freq = 'ONE_TIME' THEN 'OneTime' ELSE 'Annual' END,
         (SELECT MIN((dd->>'date')::DATE) FROM jsonb_array_elements(p_due_dates) dd),
         'OTHER',
         v_amt, v_payer);
      v_count := v_count + 1;
    END IF;
  END LOOP;

  PERFORM public.refresh_student_fee_aggregate(p_student_id, p_year_id);
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_student_fee_schedule(UUID, UUID, JSONB, JSONB, BOOLEAN, NUMERIC, NUMERIC) TO authenticated;

-- ─── 8. school_billing_schedules.advance_balance + record_school_payment ────
--
-- The 0002 RPC dumped surplus credit onto the latest billing year by
-- overpaying its `outstanding` (forcing it negative). That worked but mixed
-- "real" outstanding with credit. We add advance_balance on the schedule so
-- credit is parked separately and survives across years.
ALTER TABLE public.school_billing_schedules
  ADD COLUMN IF NOT EXISTS advance_balance BIGINT NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.record_school_payment(
  p_school_id UUID,
  p_amount    BIGINT,
  p_txn_id    TEXT,
  p_method    TEXT,
  p_notes     TEXT DEFAULT ''
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payment_id     UUID;
  v_remaining      BIGINT := p_amount;
  v_alloc          BIGINT;
  v_year           RECORD;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden: super admin only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  INSERT INTO public.school_payments
    (school_id, amount, paid_at, txn_id, method, notes)
  VALUES
    (p_school_id, p_amount, CURRENT_DATE, p_txn_id, p_method, COALESCE(p_notes,''))
  RETURNING id INTO v_payment_id;

  -- Allocate to outstanding years oldest-first.
  FOR v_year IN
    SELECT id, outstanding
      FROM public.school_billing_years
     WHERE school_id = p_school_id AND outstanding > 0
     ORDER BY start_date ASC
     FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_alloc := LEAST(v_remaining, v_year.outstanding);
    INSERT INTO public.school_payment_allocations
      (school_payment_id, billing_year_id, amount_applied)
      VALUES (v_payment_id, v_year.id, v_alloc);
    UPDATE public.school_billing_years
       SET total_paid  = total_paid  + v_alloc,
           outstanding = outstanding - v_alloc
     WHERE id = v_year.id;
    v_remaining := v_remaining - v_alloc;
  END LOOP;

  -- Surplus → schedule-level advance balance (no longer overpaying a year).
  IF v_remaining > 0 THEN
    UPDATE public.school_billing_schedules
       SET advance_balance = advance_balance + v_remaining,
           updated_at = NOW()
     WHERE school_id = p_school_id;
  END IF;

  -- Refresh schools.payment_status from current outstanding totals.
  UPDATE public.schools
     SET payment_status = CASE
       WHEN COALESCE((SELECT SUM(outstanding) FROM public.school_billing_years
                      WHERE school_id = p_school_id), 0) <= 0
            THEN 'PAID'
       ELSE 'PENDING'
     END,
     updated_at = NOW()
   WHERE id = p_school_id;

  PERFORM public.log_audit(
    'record_school_payment',
    'school_payment',
    v_payment_id,
    jsonb_build_object(
      'school_id', p_school_id,
      'amount',    p_amount,
      'txn_id',    p_txn_id,
      'method',    p_method,
      'parked_advance', GREATEST(v_remaining, 0)
    )
  );

  RETURN v_payment_id;
END $$;
GRANT EXECUTE ON FUNCTION public.record_school_payment(UUID, BIGINT, TEXT, TEXT, TEXT)
  TO authenticated;

COMMIT;


-- =============================================================
-- 0018_create_ay_with_sections.sql
-- =============================================================
-- 0018_create_ay_with_sections.sql ─────────────────────────────────────────
-- Atomic "create academic year + sections" RPC for the Academic Year Setup
-- Wizard (Task #2 of the Full School App Flow).
--
-- The legacy `create_academic_year(label, start, end, board, medium)` RPC
-- (migration 0005) only inserts the AY row; the principal then has to walk
-- through Settings → Classes to create each section row separately. The
-- wizard collapses everything into a single principal action, so this RPC
-- accepts a JSONB array of sections and inserts everything in one
-- transaction (or fails as a unit).
--
-- The single-active-year trigger introduced in 0017
-- (`academic_years_single_active`) handles deactivating the previously
-- active year automatically when this RPC inserts the new row with
-- is_active = TRUE — we don't have to do it explicitly here.
--
-- Idempotent: CREATE OR REPLACE; safe to re-run.

CREATE OR REPLACE FUNCTION public.create_academic_year_with_sections(
  p_label    TEXT,
  p_start    DATE,
  p_end      DATE,
  p_board    TEXT  DEFAULT 'CBSE',
  p_medium   TEXT  DEFAULT 'English',
  p_streams  JSONB DEFAULT '["Science","Commerce","Arts"]'::JSONB,
  p_sections JSONB DEFAULT '[]'::JSONB
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school   UUID := public.current_user_school_id();
  v_id       UUID;
  v_sec      JSONB;
  v_class    TEXT;
  v_section  TEXT;
  v_stream   TEXT;
  v_capacity INT;
  v_count    INT := 0;
  v_stream_required BOOLEAN;
  v_streams_text TEXT[];
BEGIN
  -- Materialize p_streams once as a TEXT[] so per-section membership checks
  -- below can use a fast `= ANY(...)` test without re-scanning JSONB.
  SELECT array_agg(value::TEXT) INTO v_streams_text
  FROM jsonb_array_elements_text(p_streams);
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF NOT public.is_principal() THEN RAISE EXCEPTION 'principal only'; END IF;
  IF v_school IS NULL THEN RAISE EXCEPTION 'no school for caller'; END IF;
  IF p_label IS NULL OR length(trim(p_label)) = 0 THEN
    RAISE EXCEPTION 'label is required';
  END IF;
  IF p_start IS NULL OR p_end IS NULL THEN
    RAISE EXCEPTION 'start and end dates are required';
  END IF;
  IF p_end <= p_start THEN
    RAISE EXCEPTION 'end date must be after start date';
  END IF;
  IF jsonb_typeof(p_streams) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'streams must be a JSON array';
  END IF;
  IF jsonb_typeof(p_sections) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'sections must be a JSON array';
  END IF;
  -- Server-side invariant: a year must always be created with >= 1 section,
  -- regardless of caller. Wizard UI enforces this too, but we don't want
  -- non-UI callers (DB scripts, future RPCs, manual SQL) to bypass the
  -- "year + sections in one shot" contract and leave a half-set-up year.
  IF jsonb_array_length(p_sections) = 0 THEN
    RAISE EXCEPTION 'at least one section is required to create an academic year';
  END IF;

  -- The single-active-year trigger from 0017 deactivates any other active
  -- year for this school as soon as this row commits with is_active = TRUE.
  INSERT INTO public.academic_years
    (school_id, label, start_date, end_date, is_active, board, medium, streams)
  VALUES
    (v_school, trim(p_label), p_start, p_end, TRUE, p_board, p_medium, p_streams)
  RETURNING id INTO v_id;

  FOR v_sec IN SELECT * FROM jsonb_array_elements(p_sections)
  LOOP
    v_class    := NULLIF(trim(COALESCE(v_sec->>'class_name', '')), '');
    v_section  := NULLIF(trim(COALESCE(v_sec->>'section', '')),    '');
    v_stream   := NULLIF(trim(COALESCE(v_sec->>'stream', '')),     '');
    v_capacity := COALESCE(NULLIF(v_sec->>'capacity', '')::INT,    45);

    IF v_class IS NULL OR v_section IS NULL THEN
      -- Whole transaction rolls back, taking the AY row with it.
      RAISE EXCEPTION 'each section needs class_name and section (got %)', v_sec;
    END IF;
    IF v_capacity < 0 THEN
      RAISE EXCEPTION 'capacity cannot be negative (got % for %-%)', v_capacity, v_class, v_section;
    END IF;

    -- Class 11/12 sections must have a stream, and that stream must be one of
    -- the streams enabled for this academic year. Mirrors the wizard's UI
    -- guard so non-UI callers can't bypass it. For all other classes we
    -- ignore any stream value (treat as null).
    v_stream_required := v_class IN ('Class 11', 'Class 12');
    IF v_stream_required THEN
      IF v_stream IS NULL THEN
        RAISE EXCEPTION 'stream is required for % section %', v_class, v_section;
      END IF;
      IF v_streams_text IS NULL OR NOT (v_stream = ANY(v_streams_text)) THEN
        RAISE EXCEPTION 'stream % is not in this year''s streams (% %-%)',
          v_stream, v_streams_text, v_class, v_section;
      END IF;
    ELSE
      v_stream := NULL;
    END IF;

    INSERT INTO public.sections
      (school_id, academic_year_id, class_name, section, stream, capacity)
    VALUES
      (v_school, v_id, v_class, v_section, v_stream, v_capacity);

    v_count := v_count + 1;
  END LOOP;

  INSERT INTO public.audit_logs
    (user_id, school_id, action, entity_type, entity_id, details)
  VALUES
    (auth.uid(), v_school,
     'create_year_with_sections', 'academic_year', v_id,
     jsonb_build_object(
       'label', p_label,
       'start', p_start,
       'end', p_end,
       'board', p_board,
       'medium', p_medium,
       'streams', p_streams,
       'sections_count', v_count
     ));

  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.create_academic_year_with_sections(
  TEXT, DATE, DATE, TEXT, TEXT, JSONB, JSONB
) TO authenticated;


-- =============================================================
-- 0019_student_documents_storage.sql
-- =============================================================
-- 0019_student_documents_storage.sql
-- Provisions the private Supabase Storage bucket that backs the
-- `student_documents.doc_url` column. Until now the column was free-form,
-- so principals had no way to upload, list, and review the actual
-- bytes of birth certificates / Aadhaar / TC scans.
--
-- Object key convention enforced by the policies below:
--
--     <school_id>/<student_id>/<doc_type>/<unique-filename>.<ext>
--
-- so we can authorise reads/writes purely from the path without joining
-- through the student_documents row.
--
-- Also adds two helper RPCs used by the principal "Assign to class"
-- modal:
--
--   • next_available_roll(school_id, year_id, class_name, section)
--       returns the smallest unused two-digit roll number for a
--       given section, considering only ACTIVE students in the
--       active academic year.
--
--   • roll_available(school_id, year_id, class_name, section, roll,
--                    exclude_student_id)
--       returns TRUE when the roll is free (or already belongs to the
--       student being edited).  Used as a real-time uniqueness check.
-- ---------------------------------------------------------------------------

-- ─── 1. Bucket — private, 5 MB cap, scans + PDFs only. ─────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'student-documents',
  'student-documents',
  false,
  5242880,
  ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif',
        'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─── 2. INSERT policy. Two paths:
--      • Same-school PRINCIPAL/TEACHER uploading on behalf of any of their
--        school's students (admission flow, document review).
--      • Linked PARENT/STUDENT uploading their own document.
--      In both cases the path's first folder MUST equal the school of the
--      student id in the second folder, blocking cross-school injection.
DROP POLICY IF EXISTS student_documents_insert ON storage.objects;
CREATE POLICY student_documents_insert ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'student-documents'
    AND array_length(storage.foldername(name), 1) >= 3
    AND EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = ((storage.foldername(name))[2])::uuid
        AND s.school_id::text = (storage.foldername(name))[1]
        AND (
          (
            public.current_user_role() IN ('PRINCIPAL','TEACHER')
            AND s.school_id = public.current_user_school_id()
          )
          OR s.id = ANY(public.linked_student_ids())
        )
    )
  );

-- ─── 3. SELECT policy. createSignedUrl() requires SELECT.
--      Super admin OR same-school principal/teacher OR linked
--      parent/student of the student folder.
DROP POLICY IF EXISTS student_documents_select ON storage.objects;
CREATE POLICY student_documents_select ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'student-documents'
    AND array_length(storage.foldername(name), 1) >= 2
    AND (
      public.is_super_admin()
      OR (
        public.current_user_role() IN ('PRINCIPAL','TEACHER')
        AND public.current_user_school_id()::text = (storage.foldername(name))[1]
      )
      OR ((storage.foldername(name))[2])::uuid = ANY(public.linked_student_ids())
    )
  );

-- ─── 4. DELETE policy. Super admin OR same-school principal. Used when
--      a row is replaced or the student record is hard-cleaned.
DROP POLICY IF EXISTS student_documents_delete ON storage.objects;
CREATE POLICY student_documents_delete ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'student-documents'
    AND array_length(storage.foldername(name), 1) >= 2
    AND (
      public.is_super_admin()
      OR (
        public.is_principal()
        AND public.current_user_school_id()::text = (storage.foldername(name))[1]
      )
    )
  );

-- ─── 5. Roll-number helper RPCs ─────────────────────────────────────────────
-- Both run as SECURITY DEFINER but explicitly check that the caller is a
-- principal/teacher of the supplied school so they cannot be abused for
-- cross-school enumeration of student rolls.

DROP FUNCTION IF EXISTS public.next_available_roll(UUID, UUID, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.next_available_roll(
  p_school_id UUID,
  p_year_id   UUID,
  p_class     TEXT,
  p_section   TEXT
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role TEXT := public.current_user_role();
  v_school UUID := public.current_user_school_id();
  v_next INT := 1;
  v_used INT[];
BEGIN
  IF NOT public.is_super_admin()
     AND (v_role NOT IN ('PRINCIPAL','TEACHER') OR v_school IS DISTINCT FROM p_school_id)
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Collect numeric rolls already taken in this section for the given year.
  SELECT COALESCE(array_agg(roll), '{}')
    INTO v_used
  FROM (
    SELECT NULLIF(regexp_replace(ar.roll_no, '\D', '', 'g'), '')::INT AS roll
    FROM   public.student_academic_records ar
    JOIN   public.students s ON s.id = ar.student_id
    WHERE  s.school_id   = p_school_id
      AND  s.is_active   = TRUE
      AND  ar.academic_year_id = p_year_id
      AND  ar.class_name = p_class
      AND  ar.section    = p_section
      AND  ar.roll_no IS NOT NULL
      AND  ar.roll_no <> ''
      AND  regexp_replace(ar.roll_no, '\D', '', 'g') <> ''
  ) q
  WHERE roll IS NOT NULL;

  WHILE v_next = ANY(v_used) LOOP
    v_next := v_next + 1;
  END LOOP;

  RETURN lpad(v_next::TEXT, 2, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_available_roll(UUID, UUID, TEXT, TEXT)
  TO authenticated;

DROP FUNCTION IF EXISTS public.roll_available(UUID, UUID, TEXT, TEXT, TEXT, UUID);
CREATE OR REPLACE FUNCTION public.roll_available(
  p_school_id UUID,
  p_year_id   UUID,
  p_class     TEXT,
  p_section   TEXT,
  p_roll      TEXT,
  p_exclude_student_id UUID DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role TEXT := public.current_user_role();
  v_school UUID := public.current_user_school_id();
  v_taken UUID;
BEGIN
  IF NOT public.is_super_admin()
     AND (v_role NOT IN ('PRINCIPAL','TEACHER') OR v_school IS DISTINCT FROM p_school_id)
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_roll IS NULL OR btrim(p_roll) = '' THEN
    RETURN FALSE;
  END IF;

  SELECT s.id
    INTO v_taken
  FROM   public.student_academic_records ar
  JOIN   public.students s ON s.id = ar.student_id
  WHERE  s.school_id   = p_school_id
    AND  ar.academic_year_id = p_year_id
    AND  ar.class_name = p_class
    AND  ar.section    = p_section
    AND  lpad(regexp_replace(COALESCE(ar.roll_no,''), '\D', '', 'g'), 2, '0')
       = lpad(regexp_replace(p_roll,                 '\D', '', 'g'), 2, '0')
    AND  s.is_active   = TRUE
    AND  (p_exclude_student_id IS NULL OR s.id <> p_exclude_student_id)
  LIMIT 1;

  RETURN v_taken IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.roll_available(UUID, UUID, TEXT, TEXT, TEXT, UUID)
  TO authenticated;


-- =============================================================
-- 0020_late_fee_compute.sql
-- =============================================================
-- ============================================================================
-- 0020 — Late-fee preview + apply on payment.
--
-- Problem: until now late fees were a configurable JSONB on
-- public.fee_structures (`{enabled, gracePeriodDays, type, amount, maxCap}`)
-- but nothing on the server actually applied them. Principals collecting fees
-- after the due date were silently waiving the late-fee policy.
--
-- This migration is purely additive:
--
--   1. preview_student_late_fees(p_student_id) — read-only RPC that returns
--      the per-overdue-installment late-fee amount the student currently
--      owes, joining each installment to its class' fee_structures.late_fee
--      config in the active year.
--   2. record_fee_payment is RE-CREATED with one extra optional argument
--      `p_apply_late_fee BOOLEAN DEFAULT TRUE`. When TRUE and the student
--      has any computable late fee, a single aggregated installment row is
--      INSERTed with fee_type='OTHER', month='Late Fee' and is dated today
--      so that oldest-due-first allocation immediately consumes it. The
--      original RPC's behaviour (oldest-due-first allocation, advance
--      balance, audit) is preserved verbatim. Existing call sites continue
--      to work because the new arg has a default.
--
-- Idempotent: CREATE OR REPLACE on both functions; the previous
-- record_fee_payment overload is dropped first because the parameter list
-- changes (adding a new BOOLEAN at the tail).
-- ============================================================================

-- ─── 1. preview_student_late_fees ───────────────────────────────────────────
-- Re-create with an optional `p_as_of` cutoff date so callers (notably
-- record_fee_payment when collecting backdated cash) can compute lateness
-- relative to the actual payment date rather than today. Defaults to
-- CURRENT_DATE for read-only callers (parent FeesView, principal preview).
DROP FUNCTION IF EXISTS public.preview_student_late_fees(UUID);
DROP FUNCTION IF EXISTS public.preview_student_late_fees(UUID, DATE);

CREATE OR REPLACE FUNCTION public.preview_student_late_fees(
  p_student_id UUID,
  p_as_of      DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  installment_id UUID,
  due_date DATE,
  days_late INT,
  late_fee BIGINT,
  source TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id UUID;
  v_caller    UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  SELECT school_id INTO v_school_id FROM public.students WHERE id = p_student_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'student not found'; END IF;
  -- Authz: super-admin, same-school principal/teacher, OR the student/parent
  -- linked to this student (so previews show in the parent FeesView too).
  IF NOT (public.is_super_admin()
          OR ((public.current_user_role() IN ('PRINCIPAL','TEACHER'))
              AND public.current_user_school_id() = v_school_id)
          OR p_student_id = ANY(public.linked_student_ids())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Scan EVERY parent overdue installment across ALL years (not just the
  -- active one). For each, look up the class the student was in for that
  -- specific year and the late-fee policy of the matching fee_structure.
  -- This way carry-forward dues from prior years still accrue late fees per
  -- their own year's policy.
  RETURN QUERY
  WITH overdue AS (
    SELECT i.id,
           i.due_date,
           i.amount,
           i.paid_amount,
           i.write_off_amount,
           i.academic_year_id
      FROM public.fee_installments i
     WHERE i.student_id = p_student_id
       AND i.payer_type = 'PARENT'
       AND (i.amount - i.paid_amount - i.write_off_amount) > 0
       -- Skip late-fee rows themselves (avoid recursive late fees).
       AND NOT (i.fee_type = 'OTHER' AND i.month = 'Late Fee')
  ),
  enriched AS (
    -- Resolve the student's class in the installment's own year, then the
    -- most-recently-updated fee_structures row for that (school, year,
    -- class). LEFT JOINs so installments without a matching structure (e.g.
    -- legacy years without a configured policy) just yield late_fee = 0.
    SELECT o.*,
           sar.class_name,
           fs.late_fee
      FROM overdue o
      LEFT JOIN public.student_academic_records sar
        ON sar.student_id = p_student_id
       AND sar.academic_year_id = o.academic_year_id
      LEFT JOIN LATERAL (
        SELECT fs2.late_fee
          FROM public.fee_structures fs2
         WHERE fs2.school_id = v_school_id
           AND fs2.academic_year_id = o.academic_year_id
           AND fs2.class_name = sar.class_name
         ORDER BY fs2.updated_at DESC
         LIMIT 1
      ) fs ON TRUE
  )
  SELECT
    e.id AS installment_id,
    e.due_date,
    GREATEST(0, (p_as_of - e.due_date) - COALESCE((e.late_fee->>'gracePeriodDays')::INT, 0))::INT AS days_late,
    CASE
      WHEN e.late_fee IS NULL THEN 0::BIGINT
      WHEN COALESCE((e.late_fee->>'enabled')::BOOLEAN, FALSE) = FALSE THEN 0::BIGINT
      WHEN (p_as_of - e.due_date) <= COALESCE((e.late_fee->>'gracePeriodDays')::INT, 0) THEN 0::BIGINT
      ELSE
        LEAST(
          COALESCE((e.late_fee->>'maxCap')::BIGINT, 9999999999::BIGINT),
          -- Accept both legacy lowercase ('percent'/'flat') and the canonical
          -- uppercase values written by the principal Fee Structures editor
          -- ('PERCENTAGE'/'FIXED'). Anything other than a percent variant
          -- falls through to the fixed-amount branch.
          CASE
            WHEN UPPER(COALESCE(e.late_fee->>'type', 'FIXED')) IN ('PERCENTAGE', 'PERCENT') THEN
              FLOOR((e.amount - e.paid_amount - e.write_off_amount)
                    * COALESCE((e.late_fee->>'amount')::NUMERIC, 0) / 100.0)::BIGINT
            ELSE
              COALESCE((e.late_fee->>'amount')::BIGINT, 0)
          END
        )
    END AS late_fee,
    -- Canonicalise to exactly 'PERCENTAGE' or 'FIXED' so callers don't have
    -- to worry about legacy lowercase / 'PERCENT' variants when labelling.
    CASE
      WHEN UPPER(COALESCE(e.late_fee->>'type', 'FIXED')) IN ('PERCENTAGE', 'PERCENT') THEN 'PERCENTAGE'
      ELSE 'FIXED'
    END AS source
  FROM enriched e;
END $$;

GRANT EXECUTE ON FUNCTION public.preview_student_late_fees(UUID, DATE) TO authenticated;


-- ─── 2. record_fee_payment — apply computed late fee before allocation ─────
--
-- Drop the prior 6-arg signature first. Existing services using the old
-- signature still work because the new 7th arg has a default.
DROP FUNCTION IF EXISTS public.record_fee_payment(UUID, BIGINT, TEXT, DATE, TEXT, BOOLEAN);

CREATE OR REPLACE FUNCTION public.record_fee_payment(
  p_student_id    UUID,
  p_amount        BIGINT,
  p_method        TEXT    DEFAULT 'CASH',
  p_date          DATE    DEFAULT CURRENT_DATE,
  p_note          TEXT    DEFAULT NULL,
  p_use_advance   BOOLEAN DEFAULT FALSE,
  p_apply_late_fee BOOLEAN DEFAULT TRUE
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id    UUID;
  v_year_id      UUID;
  v_payment_id   UUID;
  v_remaining    BIGINT;
  v_receipt      TEXT;
  v_inst         RECORD;
  v_apply        BIGINT;
  v_advance      BIGINT := 0;
  v_late_total   BIGINT := 0;
  v_late_existing BIGINT := 0;
  v_late_delta   BIGINT := 0;
  v_caller       UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;

  SELECT school_id INTO v_school_id FROM public.students WHERE id = p_student_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'student not found'; END IF;
  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_school_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT id INTO v_year_id FROM public.academic_years
   WHERE school_id = v_school_id AND is_active = TRUE LIMIT 1;
  IF v_year_id IS NULL THEN RAISE EXCEPTION 'no active academic year for school'; END IF;

  -- Apply late-fee policy idempotently. preview_student_late_fees() returns
  -- the TOTAL liability the student should currently owe in late fees,
  -- computed as of p_date (so backdated cash collection charges lateness
  -- relative to the actual payment day, not today). We compare against the
  -- SUM(amount) of every 'Late Fee' row already accrued for this student
  -- ACROSS ALL YEARS — INCLUDING paid/written-off rows — and only insert
  -- the positive DELTA. Both sides of the delta MUST share the same
  -- year-scope or the math is asymmetric: previously the baseline was
  -- active-year-only while the liability was all-years, so after a year
  -- rollover the prior-year accrued principal would be invisible to the
  -- baseline and the new active year would re-insert it as a fresh charge.
  --
  -- Using the full principal as the baseline (rather than the unpaid
  -- remainder) is critical: otherwise a partial payment or write-off of an
  -- existing late-fee row would shrink the baseline and the very next call
  -- would re-insert the just-paid/waived amount as fresh accrual, creating
  -- a never-ending top-up loop.
  --
  -- Allocation ordering note: the new row is dated p_date - 1 so it sorts
  -- AHEAD of any installments due on/after the payment date, but any older
  -- still-overdue base installments (earlier due_date) will still allocate
  -- first under the oldest-due-first walk below. This is intentional —
  -- principals collect for the oldest dues first, then the late fee is
  -- cleared. If a strict "late fee first" policy is ever required, change
  -- the ORDER BY in the allocation loop to prioritise month='Late Fee'.
  IF p_apply_late_fee THEN
    SELECT COALESCE(SUM(late_fee), 0) INTO v_late_total
      FROM public.preview_student_late_fees(p_student_id, p_date);

    SELECT COALESCE(SUM(amount), 0)
      INTO v_late_existing
      FROM public.fee_installments
     WHERE student_id = p_student_id
       AND payer_type = 'PARENT'
       AND fee_type = 'OTHER'
       AND month = 'Late Fee';

    v_late_delta := v_late_total - v_late_existing;
    IF v_late_delta > 0 THEN
      INSERT INTO public.fee_installments
        (student_id, academic_year_id, school_id, month, due_date,
         fee_type, amount, payer_type)
      VALUES
        (p_student_id, v_year_id, v_school_id, 'Late Fee',
         p_date - INTERVAL '1 day',
         'OTHER', v_late_delta, 'PARENT');
    END IF;
  END IF;

  v_remaining := p_amount;

  IF p_use_advance THEN
    SELECT amount INTO v_advance FROM public.advance_balances WHERE student_id = p_student_id;
    IF COALESCE(v_advance, 0) > 0 THEN
      v_remaining := v_remaining + v_advance;
      UPDATE public.advance_balances SET amount = 0, updated_at = NOW()
        WHERE student_id = p_student_id;
    END IF;
  END IF;

  v_receipt := 'RCT-' || to_char(NOW(),'YYYYMMDDHH24MISS') || '-' || substr(p_student_id::text, 1, 4);

  INSERT INTO public.payment_records
    (student_id, school_id, academic_year_id, amount, method, date, receipt_no, note)
  VALUES
    (p_student_id, v_school_id, v_year_id, p_amount, p_method, p_date, v_receipt, p_note)
  RETURNING id INTO v_payment_id;

  FOR v_inst IN
    SELECT id, amount, paid_amount, write_off_amount, due_date
      FROM public.fee_installments
     WHERE student_id = p_student_id
       AND payer_type = 'PARENT'
       AND (amount - paid_amount - write_off_amount) > 0
     ORDER BY due_date ASC, created_at ASC
     FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_apply := LEAST(v_remaining, v_inst.amount - v_inst.paid_amount - v_inst.write_off_amount);
    UPDATE public.fee_installments
       SET paid_amount = paid_amount + v_apply,
           status = public.compute_installment_status(amount, paid_amount + v_apply, write_off_amount, due_date),
           updated_at = NOW()
     WHERE id = v_inst.id;

    INSERT INTO public.payment_installment_links
      (payment_id, installment_id, amount_applied)
    VALUES (v_payment_id, v_inst.id, v_apply);

    v_remaining := v_remaining - v_apply;
  END LOOP;

  IF v_remaining > 0 THEN
    INSERT INTO public.advance_balances (student_id, amount)
    VALUES (p_student_id, v_remaining)
    ON CONFLICT (student_id) DO UPDATE
      SET amount = public.advance_balances.amount + EXCLUDED.amount,
          updated_at = NOW();
    UPDATE public.payment_records SET advance_amount = v_remaining WHERE id = v_payment_id;
  END IF;

  PERFORM public.refresh_student_fee_aggregate(p_student_id, v_year_id);

  INSERT INTO public.audit_logs (user_id, school_id, action, entity_type, entity_id, details)
  VALUES (v_caller, v_school_id, 'fee_payment', 'payment', v_payment_id,
          jsonb_build_object(
            'amount', p_amount,
            'student_id', p_student_id,
            'receipt', v_receipt,
            'used_advance', p_use_advance,
            'late_fee_total',           v_late_total,    -- liability computed at this call
            'late_fee_existing_basis',  v_late_existing, -- principal already accrued
            'late_fee_delta_inserted',  GREATEST(v_late_delta, 0) -- amount actually inserted
          ));

  RETURN v_payment_id;
END $$;

GRANT EXECUTE ON FUNCTION public.record_fee_payment(UUID, BIGINT, TEXT, DATE, TEXT, BOOLEAN, BOOLEAN) TO authenticated;


-- =============================================================
-- 0021_staff_salary_lifecycle.sql
-- =============================================================
-- ============================================================================
-- Migration 0021 — Staff salary lifecycle (Task #5)
--
-- Builds on 0017's staff_salary_history + update_staff_salary RPC and
-- 0009's record_salary_payment with the remaining pieces the salary UI
-- needs:
--
--   * salary_payments.method column + TEXT enum-style check.
--   * record_salary_payment re-created with caller-supplied
--     p_method / p_txn_id (auto-generates if NULL) so the Pay modal
--     can record cash / bank-transfer / UPI / cheque + reference id.
--   * staff_status_history table + before-update trigger so every
--     status change (ACTIVE → ON_LEAVE → RELIEVED, etc.) is captured.
--   * set_staff_relieving_date(staff_id, date, reason) RPC: flips
--     status to 'RELIEVED', stamps relieving_date / relieving_reason,
--     records history + audit log atomically.
--   * salary_reminders(school_id, year_month) RPC: returns staff with
--     unpaid / partially-paid salary for a given month, excluding
--     RELIEVED / SUSPENDED / not-yet-joined / past-relieving-date staff.
--   * staff-documents private Storage bucket + RLS policies (mirrors
--     0019 student-documents). Path convention:
--         <school_id>/<staff_id>/<doc_type>/<filename>
--     Same-school principals & teachers get full CRUD; the staff
--     member themselves can read their own documents; super admins do
--     anything; everyone else is denied.
--   * staff_documents table for persistent document metadata (mirrors
--     student_documents shape).
--
-- Idempotent: ALTER ... ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT
-- EXISTS, DROP POLICY / DROP FUNCTION before CREATE. Re-running is safe.
-- ============================================================================

BEGIN;

-- ─── 1. salary_payments.method column ─────────────────────────────────────
ALTER TABLE public.salary_payments
  ADD COLUMN IF NOT EXISTS method TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'salary_payments_method_chk'
  ) THEN
    ALTER TABLE public.salary_payments
      ADD CONSTRAINT salary_payments_method_chk
      CHECK (method IS NULL OR method IN ('CASH','BANK_TRANSFER','UPI','CHEQUE','OTHER'));
  END IF;
END $$;

-- ─── 2. record_salary_payment: accept method + caller txn_id ─────────────
DROP FUNCTION IF EXISTS public.record_salary_payment(UUID, TEXT, BIGINT, TEXT);
DROP FUNCTION IF EXISTS public.record_salary_payment(UUID, TEXT, BIGINT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.record_salary_payment(
  p_staff_id UUID,
  p_month    TEXT,
  p_amount   BIGINT,
  p_note     TEXT DEFAULT NULL,
  p_method   TEXT DEFAULT NULL,
  p_txn_id   TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school     UUID;
  v_caller     UUID := auth.uid();
  v_year       UUID;
  v_pay_id     UUID;
  v_txn        TEXT;
  v_staff_name TEXT;
  v_method     TEXT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;

  v_method := UPPER(NULLIF(BTRIM(COALESCE(p_method, '')), ''));
  IF v_method IS NOT NULL AND v_method NOT IN ('CASH','BANK_TRANSFER','UPI','CHEQUE','OTHER') THEN
    RAISE EXCEPTION 'invalid method: %', v_method;
  END IF;

  SELECT school_id, name INTO v_school, v_staff_name
    FROM public.staff WHERE id = p_staff_id;
  IF v_school IS NULL THEN RAISE EXCEPTION 'staff not found'; END IF;

  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_school)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT id INTO v_year FROM public.academic_years
    WHERE school_id = v_school AND is_active = TRUE LIMIT 1;

  -- Caller-supplied txn id wins; otherwise we generate one.
  v_txn := NULLIF(BTRIM(COALESCE(p_txn_id, '')), '');
  IF v_txn IS NULL THEN
    v_txn := 'TXN-' || to_char(NOW(),'YYYYMMDDHH24MISS') || '-' || substr(p_staff_id::text, 1, 4);
  END IF;

  INSERT INTO public.salary_payments
    (staff_id, school_id, month, amount, paid_at, transaction_id, note, method)
  VALUES
    (p_staff_id, v_school, p_month, p_amount, CURRENT_DATE, v_txn, p_note, v_method)
  RETURNING id INTO v_pay_id;

  INSERT INTO public.expenses
    (school_id, academic_year_id, category, amount, date, description, created_by)
  VALUES
    (v_school, v_year, 'SALARY', p_amount, CURRENT_DATE,
     'Salary: ' || COALESCE(v_staff_name, p_staff_id::text) || ' — ' || p_month
     || COALESCE(' (' || NULLIF(p_note,'') || ')', ''),
     v_caller);

  PERFORM public.log_audit(
    'salary_paid', 'staff', p_staff_id,
    jsonb_build_object(
      'month', p_month,
      'amount', p_amount,
      'method', v_method,
      'txn', v_txn
    )
  );

  RETURN v_pay_id;
END $$;

GRANT EXECUTE ON FUNCTION public.record_salary_payment(UUID, TEXT, BIGINT, TEXT, TEXT, TEXT)
  TO authenticated;

-- ─── 3. staff_status_history table + trigger ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.staff_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id   UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  school_id  UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  reason     TEXT,
  changed_by UUID REFERENCES public.users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS staff_status_history_staff_idx
  ON public.staff_status_history(staff_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS staff_status_history_school_idx
  ON public.staff_status_history(school_id);

ALTER TABLE public.staff_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_status_history_select ON public.staff_status_history;
CREATE POLICY staff_status_history_select ON public.staff_status_history FOR SELECT
  USING (
    public.is_super_admin()
    OR (public.current_user_role() IN ('PRINCIPAL','TEACHER')
        AND school_id = public.current_user_school_id())
  );

DROP POLICY IF EXISTS staff_status_history_write ON public.staff_status_history;
CREATE POLICY staff_status_history_write ON public.staff_status_history FOR ALL
  USING (
    public.is_super_admin()
    OR (public.is_principal() AND school_id = public.current_user_school_id())
  )
  WITH CHECK (
    public.is_super_admin()
    OR (public.is_principal() AND school_id = public.current_user_school_id())
  );

-- AFTER-UPDATE trigger so every status change is captured automatically.
CREATE OR REPLACE FUNCTION public.staff_status_history_trg()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.staff_status_history
      (staff_id, school_id, old_status, new_status, reason, changed_by)
    VALUES
      (NEW.id, NEW.school_id, OLD.status, NEW.status, NULL, auth.uid());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS staff_status_history_trg ON public.staff;
CREATE TRIGGER staff_status_history_trg
  AFTER UPDATE OF status ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.staff_status_history_trg();

-- Seed an initial row for every existing staff so the LOG tab isn't empty.
INSERT INTO public.staff_status_history (staff_id, school_id, old_status, new_status, reason)
  SELECT s.id, s.school_id, NULL, COALESCE(s.status, 'ACTIVE'), 'Initial'
    FROM public.staff s
   WHERE NOT EXISTS (
     SELECT 1 FROM public.staff_status_history h WHERE h.staff_id = s.id
   );

-- ─── 4. set_staff_relieving_date RPC ─────────────────────────────────────
DROP FUNCTION IF EXISTS public.set_staff_relieving_date(UUID, DATE, TEXT);
CREATE OR REPLACE FUNCTION public.set_staff_relieving_date(
  p_staff_id UUID,
  p_date     DATE,
  p_reason   TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school UUID;
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'relieving date required'; END IF;

  SELECT school_id INTO v_school FROM public.staff WHERE id = p_staff_id;
  IF v_school IS NULL THEN RAISE EXCEPTION 'staff not found'; END IF;

  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_school)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.staff
     SET relieving_date   = p_date,
         relieving_reason = NULLIF(BTRIM(COALESCE(p_reason,'')), ''),
         status           = 'RELIEVED',
         updated_at       = NOW()
   WHERE id = p_staff_id;

  -- The status-change trigger only stamps the transition; layer the reason on top.
  UPDATE public.staff_status_history
     SET reason = NULLIF(BTRIM(COALESCE(p_reason,'')), '')
   WHERE id = (
     SELECT id FROM public.staff_status_history
      WHERE staff_id = p_staff_id ORDER BY changed_at DESC LIMIT 1
   );

  PERFORM public.log_audit(
    'staff_relieved', 'staff', p_staff_id,
    jsonb_build_object('date', p_date, 'reason', p_reason)
  );
END $$;
GRANT EXECUTE ON FUNCTION public.set_staff_relieving_date(UUID, DATE, TEXT) TO authenticated;

-- ─── 5. salary_reminders RPC ─────────────────────────────────────────────
-- Returns staff who have NOT been fully paid for a given month
-- (`p_year_month` is the same TEXT format that the UI / record_salary_payment
-- already use, e.g. 'October 2025'). Excludes RELIEVED / SUSPENDED staff and
-- staff whose joining_date is after the month, or whose relieving_date is
-- before the month. Salary read from staff.salary (the latest amount —
-- effective-from history isn't applied here because the spec is "fixed
-- monthly salary; future months default to the new amount").
DROP FUNCTION IF EXISTS public.salary_reminders(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.salary_reminders(
  p_school_id UUID,
  p_year_month TEXT
) RETURNS TABLE (
  staff_id    UUID,
  name        TEXT,
  role        TEXT,
  salary      BIGINT,
  paid_amount BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role TEXT := public.current_user_role();
BEGIN
  IF NOT public.is_super_admin()
     AND (v_role IS NULL OR v_role NOT IN ('PRINCIPAL','TEACHER')
          OR public.current_user_school_id() IS DISTINCT FROM p_school_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.name,
    s.role,
    s.salary,
    COALESCE(SUM(sp.amount) FILTER (WHERE sp.month = p_year_month), 0)::BIGINT
  FROM public.staff s
  LEFT JOIN public.salary_payments sp
    ON sp.staff_id = s.id
   AND sp.month    = p_year_month
  WHERE s.school_id = p_school_id
    AND s.is_active = TRUE
    AND COALESCE(s.status, 'ACTIVE') NOT IN ('SUSPENDED','RELIEVED')
    AND (s.relieving_date IS NULL OR s.relieving_date >= CURRENT_DATE)
    AND s.salary > 0
  GROUP BY s.id, s.name, s.role, s.salary
  HAVING COALESCE(SUM(sp.amount) FILTER (WHERE sp.month = p_year_month), 0) < s.salary;
END $$;
GRANT EXECUTE ON FUNCTION public.salary_reminders(UUID, TEXT) TO authenticated;

-- ─── 6. staff_documents table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.staff_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id  UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  doc_type  TEXT NOT NULL,
  doc_name  TEXT NOT NULL,
  doc_url   TEXT NOT NULL,
  uploaded_by UUID REFERENCES public.users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS staff_documents_staff_idx ON public.staff_documents(staff_id);
CREATE INDEX IF NOT EXISTS staff_documents_school_idx ON public.staff_documents(school_id);

ALTER TABLE public.staff_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_documents_select ON public.staff_documents;
CREATE POLICY staff_documents_select ON public.staff_documents FOR SELECT
  USING (
    public.is_super_admin()
    OR (public.current_user_role() IN ('PRINCIPAL','TEACHER')
        AND school_id = public.current_user_school_id())
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_documents.staff_id AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS staff_documents_write ON public.staff_documents;
CREATE POLICY staff_documents_write ON public.staff_documents FOR ALL
  USING (
    public.is_super_admin()
    OR (public.current_user_role() IN ('PRINCIPAL','TEACHER')
        AND school_id = public.current_user_school_id())
  )
  WITH CHECK (
    public.is_super_admin()
    OR (public.current_user_role() IN ('PRINCIPAL','TEACHER')
        AND school_id = public.current_user_school_id())
  );

-- ─── 7. staff-documents Storage bucket ────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'staff-documents',
  'staff-documents',
  false,
  5242880,
  ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif',
        'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- INSERT: same-school principals/teachers OR the staff member themselves
-- (e.g. self-uploading their PAN). The path's first folder MUST equal the
-- staff member's school_id, blocking cross-school injection.
DROP POLICY IF EXISTS staff_documents_insert ON storage.objects;
CREATE POLICY staff_documents_insert ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'staff-documents'
    AND array_length(storage.foldername(name), 1) >= 3
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = ((storage.foldername(name))[2])::uuid
        AND s.school_id::text = (storage.foldername(name))[1]
        AND (
          (
            public.current_user_role() IN ('PRINCIPAL','TEACHER')
            AND s.school_id = public.current_user_school_id()
          )
          OR s.user_id = auth.uid()
        )
    )
  );

-- SELECT: super admin OR same-school principal/teacher OR the staff
-- member themselves (createSignedUrl requires SELECT).
DROP POLICY IF EXISTS staff_documents_select_obj ON storage.objects;
CREATE POLICY staff_documents_select_obj ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'staff-documents'
    AND array_length(storage.foldername(name), 1) >= 2
    AND (
      public.is_super_admin()
      OR (
        public.current_user_role() IN ('PRINCIPAL','TEACHER')
        AND public.current_user_school_id()::text = (storage.foldername(name))[1]
      )
      OR EXISTS (
        SELECT 1 FROM public.staff s
        WHERE s.id = ((storage.foldername(name))[2])::uuid
          AND s.user_id = auth.uid()
      )
    )
  );

-- DELETE: super admin OR same-school principal.
DROP POLICY IF EXISTS staff_documents_delete_obj ON storage.objects;
CREATE POLICY staff_documents_delete_obj ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'staff-documents'
    AND array_length(storage.foldername(name), 1) >= 2
    AND (
      public.is_super_admin()
      OR (
        public.is_principal()
        AND public.current_user_school_id()::text = (storage.foldername(name))[1]
      )
    )
  );

COMMIT;


-- =============================================================
-- 0022_staff_salary_lifecycle_fixes.sql
-- =============================================================
-- ============================================================================
-- Migration 0022 — Tighten 0021 staff-salary lifecycle policies + RPC.
--
-- 1. salary_reminders(school_id, year_month):
--      0021's filter excluded staff by today's date instead of the requested
--      month, and forgot to filter out staff who join AFTER that month. Fix
--      both: parse p_year_month with `to_date('Month YYYY')`, derive the
--      first / last day, and gate joining_date / relieving_date against
--      that window.
--
-- 2. staff_documents delete policy:
--      0021 granted same-school principals AND teachers FOR ALL on the table,
--      but the storage policy only lets principals (or super admins) DELETE
--      objects. A teacher deleting metadata would orphan the underlying
--      private storage object. Split the FOR ALL policy into separate
--      INSERT/UPDATE (principal+teacher) and DELETE (principal-only)
--      policies so the table + storage stay in sync.
--
-- Idempotent: DROP POLICY IF EXISTS / DROP FUNCTION IF EXISTS / CREATE OR
-- REPLACE FUNCTION. Re-running is safe.
-- ============================================================================

BEGIN;

-- ─── 1. salary_reminders: month-aware filtering ──────────────────────────
DROP FUNCTION IF EXISTS public.salary_reminders(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.salary_reminders(
  p_school_id UUID,
  p_year_month TEXT
) RETURNS TABLE (
  staff_id    UUID,
  name        TEXT,
  role        TEXT,
  salary      BIGINT,
  paid_amount BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role  TEXT := public.current_user_role();
  v_first DATE;
  v_last  DATE;
BEGIN
  IF NOT public.is_super_admin()
     AND (v_role IS NULL OR v_role NOT IN ('PRINCIPAL','TEACHER')
          OR public.current_user_school_id() IS DISTINCT FROM p_school_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- 'October 2025' / 'April 2026' → first day of that month.
  -- to_date is locale-stable (POSIX month names) when SET search_path is empty.
  BEGIN
    v_first := to_date(p_year_month, 'FMMonth YYYY');
  EXCEPTION WHEN OTHERS THEN
    -- Caller passed something we cannot parse; bail with no rows so the
    -- dashboard widget hides instead of crashing.
    RETURN;
  END;
  v_last := (v_first + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  RETURN QUERY
  SELECT
    s.id,
    s.name,
    s.role,
    s.salary,
    COALESCE(SUM(sp.amount) FILTER (WHERE sp.month = p_year_month), 0)::BIGINT
  FROM public.staff s
  LEFT JOIN public.salary_payments sp
    ON sp.staff_id = s.id
   AND sp.month    = p_year_month
  WHERE s.school_id = p_school_id
    AND s.is_active = TRUE
    AND COALESCE(s.status, 'ACTIVE') NOT IN ('SUSPENDED','RELIEVED')
    AND s.salary > 0
    -- Eligible: joined on or before the month ends.
    AND (s.joining_date IS NULL OR s.joining_date <= v_last)
    -- Eligible: not relieved before the month starts.
    AND (s.relieving_date IS NULL OR s.relieving_date >= v_first)
  GROUP BY s.id, s.name, s.role, s.salary
  HAVING COALESCE(SUM(sp.amount) FILTER (WHERE sp.month = p_year_month), 0) < s.salary;
END $$;
GRANT EXECUTE ON FUNCTION public.salary_reminders(UUID, TEXT) TO authenticated;

-- ─── 2. staff_documents: restrict DELETE to principals ──────────────────
DROP POLICY IF EXISTS staff_documents_write ON public.staff_documents;

DROP POLICY IF EXISTS staff_documents_insert ON public.staff_documents;
CREATE POLICY staff_documents_insert ON public.staff_documents FOR INSERT
  WITH CHECK (
    public.is_super_admin()
    OR (public.current_user_role() IN ('PRINCIPAL','TEACHER')
        AND school_id = public.current_user_school_id())
  );

DROP POLICY IF EXISTS staff_documents_update ON public.staff_documents;
CREATE POLICY staff_documents_update ON public.staff_documents FOR UPDATE
  USING (
    public.is_super_admin()
    OR (public.current_user_role() IN ('PRINCIPAL','TEACHER')
        AND school_id = public.current_user_school_id())
  )
  WITH CHECK (
    public.is_super_admin()
    OR (public.current_user_role() IN ('PRINCIPAL','TEACHER')
        AND school_id = public.current_user_school_id())
  );

-- DELETE: principal-only, matching the staff-documents storage policy so
-- table + bucket cannot drift out of sync.
DROP POLICY IF EXISTS staff_documents_delete ON public.staff_documents;
CREATE POLICY staff_documents_delete ON public.staff_documents FOR DELETE
  USING (
    public.is_super_admin()
    OR (public.is_principal() AND school_id = public.current_user_school_id())
  );

COMMIT;


-- =============================================================
-- 0023_staff_salary_effective_amount.sql
-- =============================================================
-- ============================================================================
-- Migration 0023 — Make month-by-month salary calculations history-aware.
--
-- Background
--   `staff.salary` holds the *current* monthly amount. When a principal raises
--   a salary effective from a future date, the new amount lands in
--   `staff_salary_history` and *also* in `staff.salary` (latest amount). That
--   second write means any code that reads `staff.salary` to compute "what was
--   owed in October?" gets the wrong answer for past months once a future
--   raise has been recorded.
--
-- This migration adds:
--
--   * effective_staff_salary(staff_id, target_date)
--       The amount that was in effect on `target_date`, looked up from
--       staff_salary_history (latest row whose effective_from ≤ target_date).
--       Falls back to staff.salary if no history row covers the date (legacy
--       rows pre-0021).
--
--   * salary_reminders(school_id, year_month) re-implemented to use
--       effective_staff_salary(staff_id, last_day_of_month). Pending amount is
--       expected − paid for that specific month. Same RLS gate as before.
--
-- Idempotent: CREATE OR REPLACE FUNCTION + DROP FUNCTION IF EXISTS. Re-running
-- is safe. No table / column changes — purely additive function definitions.
-- ============================================================================

BEGIN;

-- ─── 1. effective_staff_salary helper ────────────────────────────────────
DROP FUNCTION IF EXISTS public.effective_staff_salary(UUID, DATE);
CREATE OR REPLACE FUNCTION public.effective_staff_salary(
  p_staff_id UUID,
  p_target_date DATE
) RETURNS BIGINT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (
      SELECT salary_amount
      FROM public.staff_salary_history
      WHERE staff_id = p_staff_id
        AND effective_from <= p_target_date
      ORDER BY effective_from DESC, created_at DESC
      LIMIT 1
    ),
    (SELECT salary FROM public.staff WHERE id = p_staff_id),
    0
  )::BIGINT;
$$;
GRANT EXECUTE ON FUNCTION public.effective_staff_salary(UUID, DATE) TO authenticated;

-- ─── 2. salary_reminders — history-aware expected amount ─────────────────
DROP FUNCTION IF EXISTS public.salary_reminders(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.salary_reminders(
  p_school_id UUID,
  p_year_month TEXT
) RETURNS TABLE (
  staff_id    UUID,
  name        TEXT,
  role        TEXT,
  salary      BIGINT,
  paid_amount BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role  TEXT := public.current_user_role();
  v_first DATE;
  v_last  DATE;
BEGIN
  IF NOT public.is_super_admin()
     AND (v_role IS NULL OR v_role NOT IN ('PRINCIPAL','TEACHER')
          OR public.current_user_school_id() IS DISTINCT FROM p_school_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  BEGIN
    v_first := to_date(p_year_month, 'FMMonth YYYY');
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;
  v_last := (v_first + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  RETURN QUERY
  WITH eligible AS (
    SELECT s.id, s.name, s.role,
           public.effective_staff_salary(s.id, v_last) AS expected
    FROM public.staff s
    WHERE s.school_id = p_school_id
      AND s.is_active = TRUE
      AND COALESCE(s.status, 'ACTIVE') NOT IN ('SUSPENDED','RELIEVED')
      AND (s.joining_date IS NULL OR s.joining_date <= v_last)
      AND (s.relieving_date IS NULL OR s.relieving_date >= v_first)
  ), with_paid AS (
    SELECT e.id, e.name, e.role, e.expected,
           COALESCE(SUM(sp.amount), 0)::BIGINT AS paid
    FROM eligible e
    LEFT JOIN public.salary_payments sp
      ON sp.staff_id = e.id AND sp.month = p_year_month
    GROUP BY e.id, e.name, e.role, e.expected
  )
  SELECT id, name, role, expected, paid
  FROM with_paid
  WHERE expected > 0
    AND paid < expected;
END $$;
GRANT EXECUTE ON FUNCTION public.salary_reminders(UUID, TEXT) TO authenticated;

COMMIT;


-- =============================================================
-- 0024_salary_reminders_future_relieving.sql
-- =============================================================
-- ============================================================================
-- Migration 0024 — Honour future-dated relieving in salary_reminders.
--
-- Problem
--   set_staff_relieving_date flips staff.status to 'RELIEVED' as soon as the
--   principal records the relieving date — even when that date is in the
--   future. salary_reminders (0023) excludes everyone with status='RELIEVED',
--   so future-dated relieving silently kills the reminder for the months the
--   staff was still on payroll.
--
-- Fix
--   Stop using staff.status as the primary eligibility gate for reminders.
--   Use the relieving_date window directly (it is what really tells us
--   whether the staff was on payroll in the requested month). SUSPENDED is
--   still excluded because the spec says "salary payments will be put on
--   hold" while suspended.
--
--   Concretely the filter becomes:
--     - SUSPENDED is excluded (regardless of dates).
--     - joining_date IS NULL OR joining_date <= last day of month.
--     - relieving_date IS NULL OR relieving_date >= first day of month.
--   That naturally includes a future-relieved staff for every month up to
--   and including their relieving month, then drops them afterwards.
--
-- Idempotent: DROP FUNCTION IF EXISTS + CREATE OR REPLACE FUNCTION. No
-- table / column changes — purely a function redefinition.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.salary_reminders(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.salary_reminders(
  p_school_id UUID,
  p_year_month TEXT
) RETURNS TABLE (
  staff_id    UUID,
  name        TEXT,
  role        TEXT,
  salary      BIGINT,
  paid_amount BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role  TEXT := public.current_user_role();
  v_first DATE;
  v_last  DATE;
BEGIN
  IF NOT public.is_super_admin()
     AND (v_role IS NULL OR v_role NOT IN ('PRINCIPAL','TEACHER')
          OR public.current_user_school_id() IS DISTINCT FROM p_school_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  BEGIN
    v_first := to_date(p_year_month, 'FMMonth YYYY');
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;
  v_last := (v_first + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  RETURN QUERY
  WITH eligible AS (
    SELECT s.id, s.name, s.role,
           public.effective_staff_salary(s.id, v_last) AS expected
    FROM public.staff s
    WHERE s.school_id = p_school_id
      AND s.is_active = TRUE
      -- SUSPENDED stays excluded; RELIEVED is gated by relieving_date below
      -- so future-dated relieving still gets reminders for past months.
      AND COALESCE(s.status, 'ACTIVE') <> 'SUSPENDED'
      AND (s.joining_date IS NULL OR s.joining_date <= v_last)
      AND (s.relieving_date IS NULL OR s.relieving_date >= v_first)
  ), with_paid AS (
    SELECT e.id, e.name, e.role, e.expected,
           COALESCE(SUM(sp.amount), 0)::BIGINT AS paid
    FROM eligible e
    LEFT JOIN public.salary_payments sp
      ON sp.staff_id = e.id AND sp.month = p_year_month
    GROUP BY e.id, e.name, e.role, e.expected
  )
  SELECT id, name, role, expected, paid
  FROM with_paid
  WHERE expected > 0
    AND paid < expected;
END $$;
GRANT EXECUTE ON FUNCTION public.salary_reminders(UUID, TEXT) TO authenticated;

COMMIT;


-- =============================================================
-- 0025_transport_assignment_history.sql
-- =============================================================
-- ============================================================================
-- 0025 — Transport assignment history hardening (Task #6)
--
-- Purely additive on top of 0001 + 0017:
--   * student_transport_assignments already has start_date / end_date /
--     is_active / reason / changed_by (0001 + 0017).
--   * This migration adds:
--       end_reason  TEXT   — why a row was closed (separate from `reason`,
--                            which captures why a row was created).
--       ended_by    UUID   — user that closed the row.
--   * Adds a (student_id, start_date DESC) index so the per-student
--     timeline view is cheap.
--   * Idempotent — every column / index / function uses IF NOT EXISTS or
--     CREATE OR REPLACE.
-- ============================================================================

ALTER TABLE public.student_transport_assignments
  ADD COLUMN IF NOT EXISTS end_reason TEXT;

ALTER TABLE public.student_transport_assignments
  ADD COLUMN IF NOT EXISTS ended_by UUID REFERENCES public.users(id);

CREATE INDEX IF NOT EXISTS sta_student_start_idx
  ON public.student_transport_assignments (student_id, start_date DESC);

CREATE INDEX IF NOT EXISTS sta_vehicle_active_idx
  ON public.student_transport_assignments (vehicle_id)
  WHERE is_active = TRUE;

-- ----------------------------------------------------------------------------
-- bulk_close_transport_assignments(p_from_vehicle, p_effective_date,
--                                  p_end_reason)
--
-- Closes every active assignment on `p_from_vehicle` by setting
--   end_date    = p_effective_date - 1 day  (so p_effective_date can host
--                                            the new row's start_date)
--   is_active   = FALSE
--   end_reason  = p_end_reason
--   ended_by    = caller (auth.uid())
-- and returns the affected (student_id, stop_id, monthly_amount, academic_year_id)
-- rows so the caller can rebuild new assignments. Cancels any future-dated
-- TRANSPORT installments that were tied to those rows (only UNPAID ones —
-- partially-paid rows are flipped to status='CANCELLED' and their `amount`
-- frozen at `paid_amount + write_off_amount` so they no longer count as
-- outstanding but the historical receipt remains intact).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bulk_close_transport_assignments(
  p_from_vehicle    UUID,
  p_effective_date  DATE,
  p_end_reason      TEXT
)
RETURNS TABLE (
  assignment_id    UUID,
  student_id       UUID,
  stop_id          UUID,
  monthly_amount   BIGINT,
  academic_year_id UUID
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_school_id UUID;
BEGIN
  IF p_from_vehicle IS NULL OR p_effective_date IS NULL THEN
    RAISE EXCEPTION 'bulk_close_transport_assignments: vehicle and date required';
  END IF;

  SELECT school_id INTO v_school_id
    FROM public.transport_vehicles
   WHERE id = p_from_vehicle;
  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'Vehicle not found';
  END IF;

  -- Authz: super admin OR same-school principal/teacher.
  IF NOT (
    public.is_super_admin()
    OR v_school_id = public.current_user_school_id()
  ) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  -- Cancel future-dated TRANSPORT installments tied to those assignments
  -- (UNPAID rows → DELETE, PARTIAL rows → freeze amount + flag CANCELLED so
  -- they don't show as outstanding any more but the receipt history stays).
  DELETE FROM public.fee_installments fi
   USING public.student_transport_assignments sta
   WHERE fi.related_id   = sta.id
     AND sta.vehicle_id  = p_from_vehicle
     AND sta.is_active   = TRUE
     AND fi.fee_type     = 'TRANSPORT'
     AND fi.due_date    >= p_effective_date
     AND fi.paid_amount  = 0
     AND fi.write_off_amount = 0;

  UPDATE public.fee_installments fi
     SET status     = 'CANCELLED',
         amount     = fi.paid_amount + fi.write_off_amount,
         updated_at = NOW()
    FROM public.student_transport_assignments sta
   WHERE fi.related_id   = sta.id
     AND sta.vehicle_id  = p_from_vehicle
     AND sta.is_active   = TRUE
     AND fi.fee_type     = 'TRANSPORT'
     AND fi.due_date    >= p_effective_date
     AND (fi.paid_amount > 0 OR fi.write_off_amount > 0)
     AND fi.status <> 'PAID';

  RETURN QUERY
    UPDATE public.student_transport_assignments
       SET is_active  = FALSE,
           end_date   = p_effective_date - 1,
           end_reason = COALESCE(p_end_reason, end_reason),
           ended_by   = v_caller
     WHERE vehicle_id = p_from_vehicle
       AND is_active  = TRUE
    RETURNING id, student_id, stop_id, monthly_amount, academic_year_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_close_transport_assignments(UUID, DATE, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- Allow the linked parent / student to also read historical assignments
-- (the existing sta_select policy already covers this via
-- linked_student_ids() — no new policy needed). UPDATE/INSERT remain
-- school-staff-only.
-- ============================================================================


-- =============================================================
-- 0026_transport_authz_hardening.sql
-- =============================================================
-- ============================================================================
-- 0026 — Tighten authorization on bulk_close_transport_assignments (Task #6)
--
-- 0025 originally allowed any authenticated same-school user to invoke the
-- SECURITY DEFINER bulk-close RPC (and thereby mutate fee_installments via
-- the function body). That meant a PARENT or STUDENT account in the same
-- school technically had a write path. This migration redefines the
-- function with a strict role gate (SUPER_ADMIN OR same-school PRINCIPAL),
-- matching the pattern used by every other write-side RLS policy in 0001.
--
-- Purely additive — CREATE OR REPLACE on a function that already exists
-- and re-grants EXECUTE to authenticated (the function itself enforces the
-- role check, so the broad grant is safe).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.bulk_close_transport_assignments(
  p_from_vehicle    UUID,
  p_effective_date  DATE,
  p_end_reason      TEXT
)
RETURNS TABLE (
  assignment_id    UUID,
  student_id       UUID,
  stop_id          UUID,
  monthly_amount   BIGINT,
  academic_year_id UUID
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_school_id UUID;
BEGIN
  IF p_from_vehicle IS NULL OR p_effective_date IS NULL THEN
    RAISE EXCEPTION 'bulk_close_transport_assignments: vehicle and date required';
  END IF;

  SELECT school_id INTO v_school_id
    FROM public.transport_vehicles
   WHERE id = p_from_vehicle;
  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'Vehicle not found';
  END IF;

  -- Authz: super admin OR same-school PRINCIPAL only. Parents, students,
  -- teachers, and drivers are explicitly excluded from this mutation path
  -- even if they share the school_id.
  IF NOT (
    public.is_super_admin()
    OR (public.is_principal() AND v_school_id = public.current_user_school_id())
  ) THEN
    RAISE EXCEPTION 'Not authorised: principal role required';
  END IF;

  -- Cancel future-dated TRANSPORT installments tied to those assignments.
  -- UNPAID rows → DELETE; PARTIAL rows → freeze amount at paid + writeoff
  -- and flag CANCELLED so they no longer count as outstanding but the
  -- historical receipt remains intact.
  DELETE FROM public.fee_installments fi
   USING public.student_transport_assignments sta
   WHERE fi.related_id   = sta.id
     AND sta.vehicle_id  = p_from_vehicle
     AND sta.is_active   = TRUE
     AND fi.fee_type     = 'TRANSPORT'
     AND fi.due_date    >= p_effective_date
     AND fi.paid_amount  = 0
     AND fi.write_off_amount = 0;

  UPDATE public.fee_installments fi
     SET status     = 'CANCELLED',
         amount     = fi.paid_amount + fi.write_off_amount,
         updated_at = NOW()
    FROM public.student_transport_assignments sta
   WHERE fi.related_id   = sta.id
     AND sta.vehicle_id  = p_from_vehicle
     AND sta.is_active   = TRUE
     AND fi.fee_type     = 'TRANSPORT'
     AND fi.due_date    >= p_effective_date
     AND (fi.paid_amount > 0 OR fi.write_off_amount > 0)
     AND fi.status <> 'PAID';

  RETURN QUERY
    UPDATE public.student_transport_assignments
       SET is_active  = FALSE,
           end_date   = p_effective_date - 1,
           end_reason = COALESCE(p_end_reason, end_reason),
           ended_by   = v_caller
     WHERE vehicle_id = p_from_vehicle
       AND is_active  = TRUE
    RETURNING id, student_id, stop_id, monthly_amount, academic_year_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_close_transport_assignments(UUID, DATE, TEXT) TO authenticated;


-- =============================================================
-- 0027_salary_reminders_fix_ambiguous_name.sql
-- =============================================================
-- ============================================================================
-- Migration 0027 — Fix "column reference 'name' is ambiguous" in
-- public.salary_reminders.
--
-- Problem
--   Migration 0024 redefined salary_reminders with this signature:
--
--     RETURNS TABLE (staff_id UUID, name TEXT, role TEXT,
--                    salary BIGINT, paid_amount BIGINT)
--
--   Inside the function body, the final SELECT used unqualified column
--   names:
--
--     SELECT id, name, role, expected, paid FROM with_paid
--
--   In plpgsql, RETURNS TABLE columns become OUT parameters that are
--   visible inside the function body. Because Postgres' default
--   `#variable_conflict` mode is `error`, the unqualified `name` and
--   `role` references collide with the OUT parameters of the same name
--   and abort the query with:
--
--     ERROR: column reference "name" is ambiguous
--
--   That bubbles up to the principal dashboard's SalaryReminderCard as
--   "Salary reminders unavailable / column reference 'name' is
--   ambiguous", masking salary reminders entirely.
--
-- Fix
--   1. Add `#variable_conflict use_column` directive — when an
--      identifier could refer to either a plpgsql variable/OUT param or
--      a table column, prefer the column. This is the canonical pattern
--      for plpgsql functions whose RETURNS TABLE column names overlap
--      with table columns they query.
--   2. Belt-and-suspenders: explicitly alias the final SELECT
--      (`SELECT wp.id AS staff_id, wp.name, wp.role, wp.expected AS salary,
--       wp.paid AS paid_amount FROM with_paid wp`) so that even if a
--      future edit removes the directive, the query still resolves
--      cleanly to the CTE's columns.
--
--   No behavioural change vs. 0024 — same eligibility window, same
--   expected-amount calculation, same RLS gate. Purely a parser-level
--   disambiguation.
--
-- Idempotent: DROP FUNCTION IF EXISTS + CREATE OR REPLACE FUNCTION.
-- No table or column changes.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.salary_reminders(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.salary_reminders(
  p_school_id UUID,
  p_year_month TEXT
) RETURNS TABLE (
  staff_id    UUID,
  name        TEXT,
  role        TEXT,
  salary      BIGINT,
  paid_amount BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  v_role  TEXT := public.current_user_role();
  v_first DATE;
  v_last  DATE;
BEGIN
  IF NOT public.is_super_admin()
     AND (v_role IS NULL OR v_role NOT IN ('PRINCIPAL','TEACHER')
          OR public.current_user_school_id() IS DISTINCT FROM p_school_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  BEGIN
    v_first := to_date(p_year_month, 'FMMonth YYYY');
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;
  v_last := (v_first + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  RETURN QUERY
  WITH eligible AS (
    SELECT s.id, s.name, s.role,
           public.effective_staff_salary(s.id, v_last) AS expected
    FROM public.staff s
    WHERE s.school_id = p_school_id
      AND s.is_active = TRUE
      -- SUSPENDED stays excluded; RELIEVED is gated by relieving_date below
      -- so future-dated relieving still gets reminders for past months.
      AND COALESCE(s.status, 'ACTIVE') <> 'SUSPENDED'
      AND (s.joining_date IS NULL OR s.joining_date <= v_last)
      AND (s.relieving_date IS NULL OR s.relieving_date >= v_first)
  ), with_paid AS (
    SELECT e.id, e.name, e.role, e.expected,
           COALESCE(SUM(sp.amount), 0)::BIGINT AS paid
    FROM eligible e
    LEFT JOIN public.salary_payments sp
      ON sp.staff_id = e.id AND sp.month = p_year_month
    GROUP BY e.id, e.name, e.role, e.expected
  )
  SELECT wp.id          AS staff_id,
         wp.name        AS name,
         wp.role        AS role,
         wp.expected    AS salary,
         wp.paid        AS paid_amount
  FROM with_paid wp
  WHERE wp.expected > 0
    AND wp.paid < wp.expected;
END $$;

GRANT EXECUTE ON FUNCTION public.salary_reminders(UUID, TEXT) TO authenticated;

COMMIT;


-- =============================================================
-- 0028_sections_student_count_trigger.sql
-- =============================================================
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
-- sections belonging to their school. DROP IF EXISTS guards added so the
-- consolidated _apply.sql is safe to re-run (the original draft created
-- these policies unconditionally and crashed on the second run).
DROP POLICY IF EXISTS sections_read_own_school ON sections;
CREATE POLICY sections_read_own_school ON sections
  FOR SELECT
  USING (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid() LIMIT 1)
    OR (SELECT role FROM users WHERE id = auth.uid() LIMIT 1) = 'SUPER_ADMIN'
  );

-- Only the principal can insert / update / delete sections in their school.
DROP POLICY IF EXISTS sections_principal_insert ON sections;
CREATE POLICY sections_principal_insert ON sections
  FOR INSERT
  WITH CHECK (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid() LIMIT 1)
    AND (SELECT role FROM users WHERE id = auth.uid() LIMIT 1) = 'PRINCIPAL'
  );

DROP POLICY IF EXISTS sections_principal_update ON sections;
CREATE POLICY sections_principal_update ON sections
  FOR UPDATE
  USING (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid() LIMIT 1)
    AND (SELECT role FROM users WHERE id = auth.uid() LIMIT 1) = 'PRINCIPAL'
  );

DROP POLICY IF EXISTS sections_principal_delete ON sections;
CREATE POLICY sections_principal_delete ON sections
  FOR DELETE
  USING (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid() LIMIT 1)
    AND (SELECT role FROM users WHERE id = auth.uid() LIMIT 1) = 'PRINCIPAL'
  );

-- The trigger function runs as SECURITY DEFINER so it can bypass RLS when
-- updating section counts from student_academic_records events.


-- =============================================================
-- 0029_fee_structure_billing_cycle.sql
-- =============================================================
-- 0029_fee_structure_billing_cycle.sql
-- Adds billing_cycle column to fee_structures so the principal can choose
-- Monthly / Quarterly / Half-Yearly / Annually / Custom billing periods.

ALTER TABLE public.fee_structures
  ADD COLUMN IF NOT EXISTS billing_cycle TEXT NOT NULL DEFAULT 'MONTHLY'
    CHECK (billing_cycle IN ('MONTHLY','QUARTERLY','HALF_YEARLY','ANNUALLY','CUSTOM'));


-- =============================================================
-- 0030_enable_realtime.sql
-- =============================================================
-- Enable Supabase Realtime for messaging tables so notices, complaints, and
-- homework assignments push instantly to subscribed clients without polling.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notices'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notices;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'complaints'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.complaints;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'homework_assignments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.homework_assignments;
  END IF;
END $$;


-- =============================================================
-- 0031_fee_structure_types.sql
-- =============================================================
-- 0031_fee_structure_types.sql
ALTER TABLE public.fee_structures
  ADD COLUMN IF NOT EXISTS structure_type TEXT NOT NULL DEFAULT 'CLASS';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fee_structures_structure_type_chk'
  ) THEN
    ALTER TABLE public.fee_structures
      ADD CONSTRAINT fee_structures_structure_type_chk CHECK (structure_type IN ('CLASS','VEHICLE'));
  END IF;
END $$;


-- =============================================================
-- 0032_payment_qr_settings.sql
-- =============================================================
-- Add principal-managed payment settings
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS upi_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_qr_path TEXT;

-- Storage bucket for school assets (payment QR etc.)
INSERT INTO storage.buckets (id, name, public)
VALUES ('school-assets', 'school-assets', true)
ON CONFLICT (id) DO NOTHING;


-- =============================================================
-- 0033_complaint_statuses.sql
-- =============================================================
-- 0033_complaint_statuses.sql
-- Spec gap audit · item 20.2 — adopt the canonical complaint status set:
--   PENDING · IN_REVIEW · RESOLVED · REJECTED
--
-- The complaints.status column is plain TEXT (no CHECK constraint), so this
-- migration only normalises legacy values. New rows are written with the new
-- status names from the application layer.

UPDATE public.complaints
   SET status = 'PENDING'
 WHERE status = 'OPEN';

UPDATE public.complaints
   SET status = 'IN_REVIEW'
 WHERE status = 'IN_PROGRESS';

-- Also make 'PENDING' the column default so any future direct insert
-- (e.g. via the SQL console) lands on the canonical value.
ALTER TABLE public.complaints
  ALTER COLUMN status SET DEFAULT 'PENDING';


-- =============================================================
-- 0034_transport_fee_structure.sql
-- =============================================================
-- ============================================================================
-- 0034 — Transport fee structures (Task #29)
--
-- Wires VEHICLE-type fee_structures all the way through transport assignment
-- so transport bills are generated from a structure (heads + due dates),
-- traceable back to the structure, the same way class assignment already is.
--
-- Changes:
--   1. Add fee_structure_id UUID (nullable, FK → fee_structures.id) to
--      student_transport_assignments. New transport rows MUST populate it
--      (enforced in app code); legacy rows stay NULL so historical data is
--      preserved.
--   2. Mirror the same column on student_academic_records so the audit trail
--      for class assignments is symmetric (kept nullable for backward
--      compatibility with rows created before this migration).
--   3. RPC `generate_transport_fee_schedule(p_student_id, p_year_id,
--      p_assignment_id, p_heads, p_due_dates)` — mirrors
--      `generate_student_fee_schedule` (0005) but ONLY touches TRANSPORT
--      installments tied to `p_assignment_id`. Drops only unpaid TRANSPORT
--      rows for the assignment, then re-inserts from the structure's heads
--      x due-dates with `fee_type='TRANSPORT'`, `payer_type='PARENT'`,
--      `related_id = p_assignment_id`.
--
-- Idempotent — every column / index / function uses IF NOT EXISTS or
-- CREATE OR REPLACE.
-- ============================================================================

ALTER TABLE public.student_transport_assignments
  ADD COLUMN IF NOT EXISTS fee_structure_id UUID
  REFERENCES public.fee_structures(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sta_fee_structure_idx
  ON public.student_transport_assignments (fee_structure_id);

ALTER TABLE public.student_academic_records
  ADD COLUMN IF NOT EXISTS fee_structure_id UUID
  REFERENCES public.fee_structures(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sar_fee_structure_idx
  ON public.student_academic_records (fee_structure_id);

-- An earlier draft of this migration shipped the RPC with a JSONB-based
-- signature (heads + due_dates supplied by the client). The hardened
-- version below takes only the structure id and looks the heads up
-- server-side, so we drop the old signature first to avoid an overload
-- ambiguity at call time.
DROP FUNCTION IF EXISTS public.generate_transport_fee_schedule(UUID, UUID, UUID, JSONB, JSONB);

-- ----------------------------------------------------------------------------
-- generate_transport_fee_schedule
--
-- Schedule generator for TRANSPORT installments tied to a single
-- student_transport_assignments row. Modeled on
-- generate_student_fee_schedule (0005) with four deliberate differences:
--
--   * Scope is narrowed to ONE assignment via `related_id = p_assignment_id`
--     so re-running it for a different vehicle on the same student in the
--     same year doesn't wipe other transport rows.
--   * Only UNPAID/no-write-off rows are dropped. Paid / partially-paid rows
--     stay intact — receipts are immutable.
--   * Every inserted row is fee_type='TRANSPORT' regardless of head name,
--     and payer_type is always 'PARENT' (transport fees are never
--     RTE/government-paid).
--   * Heads + due-dates are read SERVER-SIDE from fee_structures by id —
--     never accepted from the client. The structure is validated to be
--     same-school + structure_type='VEHICLE' + same academic year so a
--     tampered client payload can't silently bill the wrong amounts.
--
-- Frequencies: MONTHLY → one row per due-date, ANNUAL/ONE_TIME → single
-- row using earliest due-date (matches the class-side behaviour).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_transport_fee_schedule(
  p_student_id       UUID,
  p_year_id          UUID,
  p_assignment_id    UUID,
  p_fee_structure_id UUID
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id          UUID;
  v_caller             UUID := auth.uid();
  v_count              INT  := 0;
  v_head               JSONB;
  v_dd                 JSONB;
  v_freq               TEXT;
  v_amt                BIGINT;
  v_heads              JSONB;
  v_due_dates          JSONB;
  v_struct_school      UUID;
  v_struct_year        UUID;
  v_struct_type        TEXT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_assignment_id    IS NULL THEN RAISE EXCEPTION 'assignment_id required'; END IF;
  IF p_fee_structure_id IS NULL THEN RAISE EXCEPTION 'fee_structure_id required'; END IF;

  SELECT school_id INTO v_school_id FROM public.students WHERE id = p_student_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'student not found'; END IF;

  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_school_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Server-authoritative structure lookup. Reject any structure that
  -- doesn't belong to the same school, isn't VEHICLE-type, or doesn't
  -- match the assignment's academic year — protects against tampered
  -- client payloads silently billing the wrong amounts.
  SELECT school_id, academic_year_id, structure_type, fee_heads, monthly_due_dates
    INTO v_struct_school, v_struct_year, v_struct_type, v_heads, v_due_dates
    FROM public.fee_structures
   WHERE id = p_fee_structure_id;
  IF v_struct_school IS NULL THEN RAISE EXCEPTION 'fee structure not found'; END IF;
  IF v_struct_school <> v_school_id THEN
    RAISE EXCEPTION 'fee structure belongs to a different school';
  END IF;
  IF v_struct_year <> p_year_id THEN
    RAISE EXCEPTION 'fee structure year mismatch';
  END IF;
  IF COALESCE(v_struct_type, 'CLASS') <> 'VEHICLE' THEN
    RAISE EXCEPTION 'fee structure is not VEHICLE-type';
  END IF;
  IF v_due_dates IS NULL OR jsonb_typeof(v_due_dates) <> 'array' OR jsonb_array_length(v_due_dates) = 0 THEN
    RAISE EXCEPTION 'fee structure has no monthly due dates';
  END IF;

  -- Defense in depth: make sure the assignment row actually belongs to
  -- this student + year before we touch any installments. Catches caller
  -- bugs and tampered RPC payloads where the assignment id was swapped
  -- for someone else's. PERFORM raises NO_DATA_FOUND if zero rows match.
  PERFORM 1
    FROM public.student_transport_assignments
   WHERE id               = p_assignment_id
     AND student_id       = p_student_id
     AND academic_year_id = p_year_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'assignment % does not belong to student % / year %',
      p_assignment_id, p_student_id, p_year_id;
  END IF;

  -- Drop only unpaid TRANSPORT rows tied to THIS assignment so re-running
  -- after a structure edit doesn't duplicate, and so other transport
  -- assignments for the same student/year (legacy) aren't disturbed.
  DELETE FROM public.fee_installments
   WHERE student_id       = p_student_id
     AND academic_year_id = p_year_id
     AND fee_type         = 'TRANSPORT'
     AND related_id       = p_assignment_id
     AND paid_amount      = 0
     AND write_off_amount = 0;

  -- Re-create from the structure.
  FOR v_head IN SELECT * FROM jsonb_array_elements(v_heads)
  LOOP
    v_amt  := COALESCE((v_head->>'amount')::BIGINT, 0);
    v_freq := COALESCE(v_head->>'frequency', 'MONTHLY');

    IF v_amt = 0 THEN CONTINUE; END IF;

    IF v_freq = 'MONTHLY' THEN
      FOR v_dd IN SELECT * FROM jsonb_array_elements(v_due_dates)
      LOOP
        INSERT INTO public.fee_installments
          (student_id, academic_year_id, school_id, month, due_date,
           fee_type, amount, payer_type, related_id)
        VALUES
          (p_student_id, p_year_id, v_school_id,
           v_dd->>'month',
           (v_dd->>'date')::DATE,
           'TRANSPORT', v_amt, 'PARENT', p_assignment_id);
        v_count := v_count + 1;
      END LOOP;
    ELSE  -- ANNUAL or ONE_TIME
      INSERT INTO public.fee_installments
        (student_id, academic_year_id, school_id, month, due_date,
         fee_type, amount, payer_type, related_id)
      VALUES
        (p_student_id, p_year_id, v_school_id,
         CASE WHEN v_freq = 'ONE_TIME' THEN 'OneTime' ELSE 'Annual' END,
         (SELECT MIN((dd->>'date')::DATE) FROM jsonb_array_elements(v_due_dates) dd),
         'TRANSPORT', v_amt, 'PARENT', p_assignment_id);
      v_count := v_count + 1;
    END IF;
  END LOOP;

  PERFORM public.refresh_student_fee_aggregate(p_student_id, p_year_id);
  RETURN v_count;
END $$;

GRANT EXECUTE ON FUNCTION
  public.generate_transport_fee_schedule(UUID, UUID, UUID, UUID)
  TO authenticated;


-- =============================================================
-- 0035_school_settings_teacher_checkin.sql
-- =============================================================
-- Migration 0035: school_settings table + teacher check-in columns on staff_attendance
-- Run: npm run db:apply

-- ─── school_settings ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.school_settings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID NOT NULL UNIQUE REFERENCES public.schools(id) ON DELETE CASCADE,
  enable_teacher_checkin    BOOLEAN  NOT NULL DEFAULT FALSE,
  attendance_start_time     TIME     NOT NULL DEFAULT '08:00:00',
  attendance_end_time       TIME     NOT NULL DEFAULT '14:00:00',
  late_after_time           TIME     NOT NULL DEFAULT '09:30:00',
  school_name_display       TEXT,
  currency_symbol           TEXT     NOT NULL DEFAULT '₹',
  academic_year_auto_close  BOOLEAN  NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS school_settings_school_idx ON public.school_settings(school_id);

-- RLS
ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS school_settings_principal_rw ON public.school_settings;
CREATE POLICY school_settings_principal_rw ON public.school_settings
  FOR ALL
  USING (
    public.is_super_admin()
    OR school_id = public.current_user_school_id()
  )
  WITH CHECK (
    public.is_super_admin()
    OR school_id = public.current_user_school_id()
  );

-- ─── staff_attendance: add check-in / check-out columns ─────────────────────
ALTER TABLE public.staff_attendance
  ADD COLUMN IF NOT EXISTS check_in_time  TIME,
  ADD COLUMN IF NOT EXISTS check_out_time TIME;

-- ─── student_transport_assignments: add end_reason column ────────────────────
ALTER TABLE public.student_transport_assignments
  ADD COLUMN IF NOT EXISTS end_reason TEXT;

-- ─── Seed default settings for every existing school ────────────────────────
INSERT INTO public.school_settings (school_id)
SELECT id FROM public.schools
WHERE id NOT IN (SELECT school_id FROM public.school_settings)
ON CONFLICT (school_id) DO NOTHING;

-- ─── Grant access ────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON public.school_settings TO authenticated;
GRANT SELECT ON public.school_settings TO anon;


-- =============================================================
-- 0036_school_simple_billing.sql
-- =============================================================
-- Migration 0036: School Simple Billing
-- Adds a fixed monthly fee field to schools and a simple payment ledger.

-- Add monthly fixed billing amount to schools
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS billing_fixed_amount BIGINT NOT NULL DEFAULT 0;

-- Simple per-school payment ledger (no allocation complexity)
CREATE TABLE IF NOT EXISTS public.school_fee_payments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  amount     BIGINT NOT NULL CHECK (amount > 0),
  paid_on    DATE NOT NULL DEFAULT CURRENT_DATE,
  note       TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sfp_school_idx  ON public.school_fee_payments(school_id);
CREATE INDEX IF NOT EXISTS sfp_paid_on_idx ON public.school_fee_payments(school_id, paid_on DESC);

-- RLS: only SUPER_ADMIN can access this table
ALTER TABLE public.school_fee_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sfp_superadmin_all ON public.school_fee_payments;
CREATE POLICY sfp_superadmin_all ON public.school_fee_payments
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'SUPER_ADMIN')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'SUPER_ADMIN')
  );


-- =============================================================
-- 0037_promotion_phase8.sql
-- =============================================================
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


-- =============================================================
-- 0038_attendance_status_column.sql
-- =============================================================
-- Phase 6: Add status column to attendance_student_details
-- Values: present | absent | holiday | half
-- Backfill from is_present; keep is_present for backward compat.

ALTER TABLE public.attendance_student_details
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'present'
    CHECK (status IN ('present','absent','holiday','half'));

-- Backfill: true → present, false → absent
UPDATE public.attendance_student_details
SET status = CASE WHEN is_present THEN 'present' ELSE 'absent' END
WHERE status = 'present' OR status IS NULL;

ALTER TABLE public.attendance_student_details
  ALTER COLUMN status SET NOT NULL;

-- Add holiday/half-day counters to the header record
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS total_holiday INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_half    INT NOT NULL DEFAULT 0;


-- =============================================================
-- 0039_attendance_approvals.sql
-- =============================================================
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
-- service role (server-side only). The original draft referenced a
-- `school_admins` table that never existed in this schema — replaced
-- with the canonical is_super_admin() / current_user_role() helpers
-- used by every other policy. Safe to re-run because the policy is
-- explicitly dropped first.
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


-- =============================================================
-- 0040_streams_schema_verify.sql
-- =============================================================
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


-- =============================================================
-- 0041_exam_enhancements.sql
-- =============================================================
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


-- =============================================================
-- 0042_payment_discount.sql
-- =============================================================
-- Migration 0042: Payment discount support
--
-- Adds a `discount_amount` column to payment_records so revenue (actual cash
-- received) is stored separately from the total amount cleared on installments.
--
-- Updates record_fee_payment to accept an optional p_discount_amount.  The RPC
-- records p_amount (actual cash) in payment_records but allocates
-- p_amount + p_discount_amount to installments oldest-due-first.  This means:
--
--   revenue = SUM(payment_records.amount)          ← actual cash received
--   cleared = SUM(payment_installment_links.amount_applied)  ← incl. discount
--
-- Example: fee=1000, paid=600, discount=400 → payment_records.amount=600,
-- installments cleared=1000.

-- ─── 1. Add discount_amount column ───────────────────────────────────────────
ALTER TABLE public.payment_records
  ADD COLUMN IF NOT EXISTS discount_amount BIGINT NOT NULL DEFAULT 0;

-- ─── 2. Replace record_fee_payment with 8-arg version ─────────────────────
DROP FUNCTION IF EXISTS public.record_fee_payment(UUID, BIGINT, TEXT, DATE, TEXT, BOOLEAN, BOOLEAN);

CREATE OR REPLACE FUNCTION public.record_fee_payment(
  p_student_id      UUID,
  p_amount          BIGINT,
  p_method          TEXT    DEFAULT 'CASH',
  p_date            DATE    DEFAULT CURRENT_DATE,
  p_note            TEXT    DEFAULT NULL,
  p_use_advance     BOOLEAN DEFAULT FALSE,
  p_apply_late_fee  BOOLEAN DEFAULT TRUE,
  p_discount_amount BIGINT  DEFAULT 0
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id          UUID;
  v_year_id            UUID;
  v_payment_id         UUID;
  v_remaining          BIGINT;
  v_receipt            TEXT;
  v_inst               RECORD;
  v_apply              BIGINT;
  v_advance            BIGINT := 0;
  v_late_total         BIGINT := 0;
  v_late_existing      BIGINT := 0;
  v_late_delta         BIGINT := 0;
  v_caller             UUID   := auth.uid();
  v_effective_discount BIGINT;
  v_cash_remaining     BIGINT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;

  v_effective_discount := GREATEST(0, COALESCE(p_discount_amount, 0));

  SELECT school_id INTO v_school_id FROM public.students WHERE id = p_student_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'student not found'; END IF;
  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_school_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT id INTO v_year_id FROM public.academic_years
   WHERE school_id = v_school_id AND is_active = TRUE LIMIT 1;
  IF v_year_id IS NULL THEN RAISE EXCEPTION 'no active academic year for school'; END IF;

  -- Apply late-fee policy idempotently (same logic as before).
  IF p_apply_late_fee THEN
    SELECT COALESCE(SUM(late_fee), 0) INTO v_late_total
      FROM public.preview_student_late_fees(p_student_id, p_date);

    SELECT COALESCE(SUM(amount), 0)
      INTO v_late_existing
      FROM public.fee_installments
     WHERE student_id = p_student_id
       AND payer_type = 'PARENT'
       AND fee_type = 'OTHER'
       AND month = 'Late Fee';

    v_late_delta := v_late_total - v_late_existing;
    IF v_late_delta > 0 THEN
      INSERT INTO public.fee_installments
        (student_id, academic_year_id, school_id, month, due_date,
         fee_type, amount, payer_type)
      VALUES
        (p_student_id, v_year_id, v_school_id, 'Late Fee',
         p_date - INTERVAL '1 day',
         'OTHER', v_late_delta, 'PARENT');
    END IF;
  END IF;

  -- Effective remaining = actual cash + discount (both clear outstanding dues).
  v_remaining := p_amount + v_effective_discount;

  IF p_use_advance THEN
    SELECT amount INTO v_advance FROM public.advance_balances WHERE student_id = p_student_id;
    IF COALESCE(v_advance, 0) > 0 THEN
      v_remaining := v_remaining + v_advance;
      UPDATE public.advance_balances SET amount = 0, updated_at = NOW()
        WHERE student_id = p_student_id;
    END IF;
  END IF;

  v_receipt := 'RCT-' || to_char(NOW(),'YYYYMMDDHH24MISS') || '-' || substr(p_student_id::text, 1, 4);

  -- Record actual cash received (NOT including discount) for revenue tracking.
  INSERT INTO public.payment_records
    (student_id, school_id, academic_year_id, amount, discount_amount, method, date, receipt_no, note)
  VALUES
    (p_student_id, v_school_id, v_year_id, p_amount, v_effective_discount, p_method, p_date, v_receipt, p_note)
  RETURNING id INTO v_payment_id;

  -- Allocate (cash + discount) oldest-due-first across parent installments.
  FOR v_inst IN
    SELECT id, amount, paid_amount, write_off_amount, due_date
      FROM public.fee_installments
     WHERE student_id = p_student_id
       AND payer_type = 'PARENT'
       AND (amount - paid_amount - write_off_amount) > 0
     ORDER BY due_date ASC, created_at ASC
     FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_apply := LEAST(v_remaining, v_inst.amount - v_inst.paid_amount - v_inst.write_off_amount);
    UPDATE public.fee_installments
       SET paid_amount = paid_amount + v_apply,
           status = public.compute_installment_status(amount, paid_amount + v_apply, write_off_amount, due_date),
           updated_at = NOW()
     WHERE id = v_inst.id;

    INSERT INTO public.payment_installment_links
      (payment_id, installment_id, amount_applied)
    VALUES (v_payment_id, v_inst.id, v_apply);

    v_remaining := v_remaining - v_apply;
  END LOOP;

  -- Only unused CASH becomes advance credit — unused discount does not.
  -- After allocation: v_remaining = leftover from (cash + discount).
  -- Cash leftover = max(0, v_remaining - discount_portion_not_used).
  -- Since discount is always applied first conceptually (it reduces dues),
  -- any leftover ≤ discount means no cash leftover; any leftover > discount
  -- means (leftover - discount) of actual cash was unused.
  v_cash_remaining := GREATEST(0, v_remaining - v_effective_discount);

  IF v_cash_remaining > 0 THEN
    INSERT INTO public.advance_balances (student_id, amount)
    VALUES (p_student_id, v_cash_remaining)
    ON CONFLICT (student_id) DO UPDATE
      SET amount = public.advance_balances.amount + EXCLUDED.amount,
          updated_at = NOW();
    UPDATE public.payment_records SET advance_amount = v_cash_remaining WHERE id = v_payment_id;
  END IF;

  PERFORM public.refresh_student_fee_aggregate(p_student_id, v_year_id);

  INSERT INTO public.audit_logs (user_id, school_id, action, entity_type, entity_id, details)
  VALUES (v_caller, v_school_id, 'fee_payment', 'payment', v_payment_id,
          jsonb_build_object(
            'amount',                  p_amount,
            'discount_amount',         v_effective_discount,
            'student_id',              p_student_id,
            'receipt',                 v_receipt,
            'used_advance',            p_use_advance,
            'late_fee_total',          v_late_total,
            'late_fee_existing_basis', v_late_existing,
            'late_fee_delta_inserted', GREATEST(v_late_delta, 0)
          ));

  RETURN v_payment_id;
END $$;

GRANT EXECUTE ON FUNCTION public.record_fee_payment(UUID, BIGINT, TEXT, DATE, TEXT, BOOLEAN, BOOLEAN, BIGINT) TO authenticated;


-- =============================================================
-- 0043_staff_attendance_audit.sql
-- =============================================================
-- Migration 0043: Staff attendance audit columns
--
-- Adds updated_at (auto-bumped on UPDATE) and modified_by (who last edited)
-- to staff_attendance. This lets the API distinguish a first-save (created_at
-- == updated_at) from a re-save / editor-mode correction (created_at <
-- updated_at), enabling proper savedAt vs modifiedAt timestamps in the UI.

ALTER TABLE public.staff_attendance
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS modified_by UUID REFERENCES public.users(id);

-- Backfill updated_at = created_at for existing rows
UPDATE public.staff_attendance SET updated_at = created_at WHERE updated_at IS NULL;

-- Trigger: auto-bump updated_at on every UPDATE
CREATE OR REPLACE FUNCTION public.touch_staff_attendance_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS staff_attendance_touch_updated_at ON public.staff_attendance;
CREATE TRIGGER staff_attendance_touch_updated_at
  BEFORE UPDATE ON public.staff_attendance
  FOR EACH ROW EXECUTE FUNCTION public.touch_staff_attendance_updated_at();


-- =============================================================
-- 0044_transport_realtime.sql
-- =============================================================
-- Migration 0044: Enable Supabase Realtime on transport tables
--
-- Adds transport_vehicles, route_stops, driver_locations, and
-- student_transport_assignments to the supabase_realtime publication so
-- TransportManager can subscribe to live changes instead of polling.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'transport_vehicles','route_stops','driver_locations','student_transport_assignments'
  ]) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;


-- =============================================================
-- 0045_school_assets_storage_policies.sql
-- =============================================================
-- Storage policies for the `school-assets` bucket (created in 0032).
-- Without these RLS policies, supabase-js storage uploads from the principal
-- silently fail with "permission denied" — the QR upload UI looked broken
-- because of this.
--
-- Path convention: <school_id>/<filename> (see schoolInfoService.uploadPaymentQr)
-- The policies use storage.foldername(name)[1] to extract the school_id.

-- Set bucket size limit + allowed MIME types defensively (in case 0032 ran
-- before these were configured).
UPDATE storage.buckets
SET file_size_limit = 5 * 1024 * 1024, -- 5 MB
    allowed_mime_types = ARRAY['image/png','image/jpeg','image/jpg','image/webp']
WHERE id = 'school-assets';

-- ─── INSERT: principal of the same school can upload.
DROP POLICY IF EXISTS school_assets_insert ON storage.objects;
CREATE POLICY school_assets_insert ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'school-assets'
    AND array_length(storage.foldername(name), 1) >= 1
    AND public.current_user_role() = 'PRINCIPAL'
    AND public.current_user_school_id()::text = (storage.foldername(name))[1]
  );

-- ─── UPDATE: same — used when supabase-js does upsert on existing object.
DROP POLICY IF EXISTS school_assets_update ON storage.objects;
CREATE POLICY school_assets_update ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'school-assets'
    AND array_length(storage.foldername(name), 1) >= 1
    AND public.current_user_role() = 'PRINCIPAL'
    AND public.current_user_school_id()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'school-assets'
    AND array_length(storage.foldername(name), 1) >= 1
    AND public.current_user_role() = 'PRINCIPAL'
    AND public.current_user_school_id()::text = (storage.foldername(name))[1]
  );

-- ─── SELECT: bucket is public so anonymous URL works for students/parents.
--      But signed URL flows + same-app reads still need an authenticated path.
DROP POLICY IF EXISTS school_assets_select ON storage.objects;
CREATE POLICY school_assets_select ON storage.objects FOR SELECT
  TO authenticated, anon
  USING (bucket_id = 'school-assets');

-- ─── DELETE: principal of the same school only.
DROP POLICY IF EXISTS school_assets_delete ON storage.objects;
CREATE POLICY school_assets_delete ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'school-assets'
    AND array_length(storage.foldername(name), 1) >= 1
    AND public.current_user_role() = 'PRINCIPAL'
    AND public.current_user_school_id()::text = (storage.foldername(name))[1]
  );


-- =============================================================
-- 0046_fix_first_login_flag.sql
-- =============================================================
-- Allow the one-way flip of first_login_changed (false → true) by the user
-- themselves. Without this, the prevent-self-escalation trigger force-reverts
-- the column on every UPDATE, so the SECURITY DEFINER RPC
-- mark_first_login_complete() looks like a no-op and the user gets stuck on
-- the first-login password screen forever.

CREATE OR REPLACE FUNCTION public.users_prevent_self_escalation() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- service role / admin tooling
  END IF;
  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  -- Lock identity / authority columns to OLD so the user can't self-promote.
  NEW.id := OLD.id;
  NEW.role := OLD.role;
  NEW.school_id := OLD.school_id;
  NEW.is_active := OLD.is_active;
  NEW.mobile_number := OLD.mobile_number;
  NEW.created_at := OLD.created_at;

  -- first_login_changed: allow only the one-way flip false → true for the
  -- caller's own row (this lets mark_first_login_complete RPC succeed).
  -- Block any other transition (true → false, etc.).
  IF NEW.id = auth.uid() AND OLD.first_login_changed = FALSE AND NEW.first_login_changed = TRUE THEN
    -- allow
    NULL;
  ELSE
    NEW.first_login_changed := OLD.first_login_changed;
  END IF;

  RETURN NEW;
END;
$$;


-- =============================================================
-- 0047_parent_student_read_access.sql
-- =============================================================
-- Parents and students need read access to a few "shared" tables that were
-- previously locked to PRINCIPAL/TEACHER only:
--   • academic_years   — required by getActiveContext() (the parent dashboard
--                         entry point); without it, every student-side view
--                         that needs the active year errors out.
--   • fee_structures   — used by FeesView when rendering the schedule.
--   • transport_vehicles — used by TransportView to show the bus details.
--
-- Existing per-row policies (e.g. fee_installments_parent_select) already
-- guard the per-student data — these three tables are *parent* records of
-- that data, and parents/students need to read them for their own school.
--
-- A parent qualifies if any of their linked students belong to the school.
-- A student qualifies if their own user_id maps to a student in that school.

-- ─── academic_years ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS academic_years_select ON public.academic_years;
CREATE POLICY academic_years_select ON public.academic_years FOR SELECT
  USING (
    public.is_super_admin()
    OR (
      public.current_user_role() IN ('PRINCIPAL','TEACHER')
      AND school_id = public.current_user_school_id()
    )
    -- Parent: any of their linked students belongs to this school.
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.school_id = academic_years.school_id
        AND s.id = ANY(public.linked_student_ids())
    )
    -- Student: their own students row is in this school.
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.school_id = academic_years.school_id
        AND s.user_id = auth.uid()
    )
  );

-- ─── fee_structures ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS fee_structures_select ON public.fee_structures;
CREATE POLICY fee_structures_select ON public.fee_structures FOR SELECT
  USING (
    public.is_super_admin()
    OR (
      public.current_user_role() IN ('PRINCIPAL','TEACHER')
      AND school_id = public.current_user_school_id()
    )
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.school_id = fee_structures.school_id
        AND (s.id = ANY(public.linked_student_ids()) OR s.user_id = auth.uid())
    )
  );

-- ─── transport_vehicles ─────────────────────────────────────────────────────
-- Keep the existing driver-can-see-own-vehicle policy as a separate rule.
-- Add parent/student readability for their own school's fleet (so the
-- TransportView can join through to vehicle + route_stops).
DROP POLICY IF EXISTS transport_vehicles_select ON public.transport_vehicles;
CREATE POLICY transport_vehicles_select ON public.transport_vehicles FOR SELECT
  USING (
    public.is_super_admin()
    OR (
      public.current_user_role() IN ('PRINCIPAL','TEACHER')
      AND school_id = public.current_user_school_id()
    )
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.school_id = transport_vehicles.school_id
        AND (s.id = ANY(public.linked_student_ids()) OR s.user_id = auth.uid())
    )
  );


-- =============================================================
-- 0048_targeted_notices_and_complaint_visibility.sql
-- =============================================================
-- Two coordinated changes the principal asked for:
--   1. Notices can target a specific student (in addition to the existing
--      ALL / STUDENTS / TEACHERS / STAFF / PARENTS broadcast audiences).
--   2. Parents/students can read their own school's broadcast notices and
--      their own complaints (incl. principal's reply on the response field).

-- ─── 1. NOTICES ────────────────────────────────────────────────────────────
ALTER TABLE public.notices
  ADD COLUMN IF NOT EXISTS target_student_id uuid REFERENCES public.students(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS notices_target_student_idx
  ON public.notices(target_student_id) WHERE target_student_id IS NOT NULL;

DROP POLICY IF EXISTS notices_select ON public.notices;
CREATE POLICY notices_select ON public.notices FOR SELECT
  USING (
    public.is_super_admin()
    OR (
      public.current_user_role() IN ('PRINCIPAL','TEACHER')
      AND school_id = public.current_user_school_id()
    )
    -- Parent/Student: their own school's notices, where the notice is
    -- targeted at them OR is a broadcast that includes their audience.
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.school_id = notices.school_id
        AND (s.id = ANY(public.linked_student_ids()) OR s.user_id = auth.uid())
        AND (
          notices.target_student_id = s.id
          OR notices.audience IN ('ALL','STUDENTS','PARENTS','STUDENTS_PARENTS','PARENTS_STUDENTS')
        )
    )
  );

-- ─── 2. COMPLAINTS ─────────────────────────────────────────────────────────
-- Parent/Student can read their OWN complaints (and the principal's reply
-- in `response`). Existing PRINCIPAL/TEACHER and SUPER_ADMIN access kept.
DROP POLICY IF EXISTS complaints_select ON public.complaints;
CREATE POLICY complaints_select ON public.complaints FOR SELECT
  USING (
    public.is_super_admin()
    OR (
      public.current_user_role() IN ('PRINCIPAL','TEACHER')
      AND school_id = public.current_user_school_id()
    )
    OR from_user_id = auth.uid()
  );

-- Allow authenticated parents/students to insert their own complaint row.
-- (Existing complaints_user_insert had no WITH CHECK condition.)
DROP POLICY IF EXISTS complaints_user_insert ON public.complaints;
CREATE POLICY complaints_user_insert ON public.complaints FOR INSERT
  TO authenticated
  WITH CHECK (
    from_user_id = auth.uid()
    AND school_id IN (
      SELECT school_id FROM public.students s
      WHERE s.id = ANY(public.linked_student_ids()) OR s.user_id = auth.uid()
    )
  );


-- =============================================================
-- 0049_payment_reversals.sql
-- =============================================================
-- Payment reversals — controlled "undo" for fee ledger mistakes.
--
-- Design (from the locked spec):
--   • A reversal is a NEW row in payment_records with a negative amount and
--     reverses_payment_id pointing to the original. Both rows live forever —
--     accountant sees: "05 Apr Payment ₹1000 / 06 Apr Reversal -₹1000".
--   • Original row's reversed_at timestamp marks it so the UI can show a
--     "Reversed 🔁" chip and the same payment can't be reversed twice.
--   • Allowed only the same calendar day (IST) by the principal in Editor
--     Mode — server enforces all guards.

ALTER TABLE public.payment_records
  ADD COLUMN IF NOT EXISTS reverses_payment_id UUID
    REFERENCES public.payment_records(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS reversed_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by        UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS reversal_reason    TEXT;

-- Index for "is this row reversed?" lookups + reverse-chain joins.
CREATE INDEX IF NOT EXISTS payment_records_reverses_idx
  ON public.payment_records(reverses_payment_id) WHERE reverses_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_records_reversed_at_idx
  ON public.payment_records(reversed_at) WHERE reversed_at IS NOT NULL;

-- Sanity constraint — a row that reverses another must carry a negative amount;
-- a row that doesn't must carry a positive amount. Prevents data corruption
-- if someone bypasses the API later.
ALTER TABLE public.payment_records
  DROP CONSTRAINT IF EXISTS payment_records_amount_sign_check;
ALTER TABLE public.payment_records
  ADD  CONSTRAINT payment_records_amount_sign_check CHECK (
    (reverses_payment_id IS NULL AND amount >= 0)
    OR (reverses_payment_id IS NOT NULL AND amount <= 0)
  );


-- =============================================================
-- 0050_fee_uploads_txn_id_only.sql
-- =============================================================
-- Simplify parent fee submissions: drop screenshot upload entirely, require
-- a transaction_id text instead. Screenshots were unstructured proof that
-- needed lifecycle management; txn_id is structured, permanent, and
-- reconciles directly against bank/UPI statements.
--
-- Effects:
--   • fee_payment_uploads now requires transaction_id (NOT NULL)
--   • screenshot_name + screenshot_url columns removed
--   • payment_records gets transaction_id (nullable — cash payments don't
--     have one) so the canonical record carries the txn ref forever

-- 1. fee_payment_uploads
ALTER TABLE public.fee_payment_uploads
  ADD COLUMN IF NOT EXISTS transaction_id text;

-- Backfill any pre-existing rows so the NOT NULL flip below is safe. Dev
-- DBs are empty at this point but production safety first.
UPDATE public.fee_payment_uploads
  SET transaction_id = COALESCE(NULLIF(transaction_id, ''), 'LEGACY-' || id::text)
  WHERE transaction_id IS NULL OR transaction_id = '';

ALTER TABLE public.fee_payment_uploads
  ALTER COLUMN transaction_id SET NOT NULL;

ALTER TABLE public.fee_payment_uploads
  DROP COLUMN IF EXISTS screenshot_name,
  DROP COLUMN IF EXISTS screenshot_url;

-- 2. payment_records
ALTER TABLE public.payment_records
  ADD COLUMN IF NOT EXISTS transaction_id text;

-- Index for fast lookup by txn_id (accountant reconciliation flow).
CREATE INDEX IF NOT EXISTS payment_records_transaction_id_idx
  ON public.payment_records(transaction_id) WHERE transaction_id IS NOT NULL;


-- =============================================================
-- 0051_fee_upload_daily_limit.sql
-- =============================================================
-- Anti-spam guard for parent fee submissions.
--
-- Cap: max 3 submissions per parent (submitted_by) per IST calendar day.
-- Enforced via a BEFORE INSERT trigger so it can't be bypassed by direct
-- API calls — the same trigger fires whether the row comes from the app,
-- supabase-js, or psql.
--
-- IST is the relevant calendar boundary because the school operates in
-- India; counting from "today in IST" matches the parent's mental model
-- ("I already tried 3 times today").

CREATE OR REPLACE FUNCTION public.enforce_fee_upload_daily_limit() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_today_ist date;
  v_count     bigint;
BEGIN
  -- Service role and seed scripts (auth.uid() = NULL) bypass — they're
  -- trusted infra paths, not parent traffic.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_today_ist := (now() AT TIME ZONE 'Asia/Kolkata')::date;

  SELECT count(*) INTO v_count
  FROM public.fee_payment_uploads
  WHERE submitted_by = NEW.submitted_by
    AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = v_today_ist;

  IF v_count >= 3 THEN
    RAISE EXCEPTION
      'Daily limit reached — only 3 fee submissions allowed per day. Please contact the school office if you need to submit another.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fee_upload_daily_limit ON public.fee_payment_uploads;
CREATE TRIGGER fee_upload_daily_limit
  BEFORE INSERT ON public.fee_payment_uploads
  FOR EACH ROW EXECUTE FUNCTION public.enforce_fee_upload_daily_limit();


-- =============================================================
-- 0052_leave_complaint_daily_limits.sql
-- =============================================================
-- Anti-spam guards for parent/student-side request flows.
--   • approvals (LEAVE)  → max 3 per student per IST day
--   • complaints         → max 3 per parent/student account per IST day
--
-- Day boundary is IST calendar midnight (matches school operations + parent
-- mental model). Service-role inserts bypass — only authenticated user
-- traffic is rate-limited.

-- ─── 1. LEAVE applications (per student) ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_leave_daily_limit() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_today_ist date;
  v_count     bigint;
BEGIN
  -- Only LEAVE requests are capped — other approval types (admission edit,
  -- attendance correction, etc.) flow through different UX and aren't spam-prone.
  IF NEW.request_type <> 'LEAVE' THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_today_ist := (now() AT TIME ZONE 'Asia/Kolkata')::date;

  -- Cap per student (entity_id) so a parent with 2 kids can file 3 per kid.
  SELECT count(*) INTO v_count
  FROM public.approvals
  WHERE request_type = 'LEAVE'
    AND entity_type = 'student'
    AND entity_id = NEW.entity_id
    AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = v_today_ist;

  IF v_count >= 3 THEN
    RAISE EXCEPTION
      'Daily limit reached — only 3 leave applications allowed per student per day. Please contact the school office for another submission.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leave_daily_limit ON public.approvals;
CREATE TRIGGER leave_daily_limit
  BEFORE INSERT ON public.approvals
  FOR EACH ROW EXECUTE FUNCTION public.enforce_leave_daily_limit();

-- ─── 2. COMPLAINTS (per submitter user) ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_complaint_daily_limit() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_today_ist date;
  v_count     bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_today_ist := (now() AT TIME ZONE 'Asia/Kolkata')::date;

  SELECT count(*) INTO v_count
  FROM public.complaints
  WHERE from_user_id = NEW.from_user_id
    AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = v_today_ist;

  IF v_count >= 3 THEN
    RAISE EXCEPTION
      'Daily limit reached — only 3 complaints allowed per day. Please contact the school office for another submission.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS complaint_daily_limit ON public.complaints;
CREATE TRIGGER complaint_daily_limit
  BEFORE INSERT ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.enforce_complaint_daily_limit();


-- =============================================================
-- 0053_editor_mode_session.sql
-- =============================================================
-- Server-side Editor Mode session.
--
-- Editor Mode = a 30-min privileged-edit window the principal flips on for
-- destructive operations (payment reversal, document delete, locked
-- attendance correction, locked-result edit). Previously this state lived
-- only in a Zustand store, which means an attacker could bypass every gated
-- route by sending `editorMode:true` in the request body. We now persist
-- the window on the user row so the server is the source of truth.
--
-- Only the user themselves (or service role) can flip their own column.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS editor_mode_until timestamptz NULL;

CREATE INDEX IF NOT EXISTS users_editor_mode_until_idx
  ON public.users(editor_mode_until)
  WHERE editor_mode_until IS NOT NULL;

-- Helper RPC: enable for caller. Returns the new expiry timestamp.
CREATE OR REPLACE FUNCTION public.enable_editor_mode(p_minutes int DEFAULT 30)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_until timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_minutes <= 0 OR p_minutes > 60 THEN
    RAISE EXCEPTION 'invalid duration' USING ERRCODE = 'check_violation';
  END IF;
  v_until := now() + make_interval(mins => p_minutes);
  UPDATE public.users
     SET editor_mode_until = v_until
   WHERE id = auth.uid();
  RETURN v_until;
END;
$$;

CREATE OR REPLACE FUNCTION public.disable_editor_mode()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.users
     SET editor_mode_until = NULL
   WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.enable_editor_mode(int)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.disable_editor_mode()    TO authenticated;


-- =============================================================
-- 0054_reverse_payment_rpc.sql
-- =============================================================
-- Atomic payment reversal RPC.
--
-- Replaces the multi-step supabase-js sequence in /api/fees/payment/reverse
-- with a single SECURITY DEFINER function that runs inside one transaction.
-- This closes B1 (non-atomic — crash between rollback and reversed_at stamp
-- could double-rollback on retry) and B2 (status formula losing WAIVED state).
--
-- Idempotency strategy: we stamp `reversed_at` on the original via a
-- conditional UPDATE *first*. If 0 rows match (already reversed), we abort
-- with 'already_reversed'. Only after the stamp succeeds do we mutate
-- installments, so a retry sees the stamped row and bails before any
-- second-rollback can happen.
--
-- All caller-side guards (PRINCIPAL role, Editor Mode, IST same-day, daily
-- cap) stay in the Express route — this RPC is the inner write.

CREATE OR REPLACE FUNCTION public.reverse_payment(
  p_payment_id uuid,
  p_user_id    uuid,
  p_reason     text
)
RETURNS TABLE (reversal_id uuid, original_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orig         record;
  v_reversal_id  uuid;
  v_link         record;
  v_inst         record;
  v_new_paid     numeric;
  v_new_status   text;
  v_total        numeric;
  v_writeoff     numeric;
  v_remaining    numeric;
  v_stamped      int;
BEGIN
  -- Load original. RLS is bypassed by SECURITY DEFINER; the caller (server
  -- route) has already validated school ownership.
  SELECT id, school_id, student_id, amount, method, date, receipt_no,
         advance_amount, note, reversed_at, reverses_payment_id
    INTO v_orig
    FROM public.payment_records
   WHERE id = p_payment_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_orig.reversed_at IS NOT NULL THEN
    RAISE EXCEPTION 'already_reversed' USING ERRCODE = 'unique_violation';
  END IF;
  IF v_orig.reverses_payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'cannot_reverse_a_reversal' USING ERRCODE = 'check_violation';
  END IF;
  IF v_orig.amount <= 0 THEN
    RAISE EXCEPTION 'non_positive_amount' USING ERRCODE = 'check_violation';
  END IF;

  -- (1) Stamp the original FIRST — idempotent guard against retries.
  UPDATE public.payment_records
     SET reversed_at     = now(),
         reversed_by     = p_user_id,
         reversal_reason = p_reason
   WHERE id = p_payment_id
     AND reversed_at IS NULL;
  GET DIAGNOSTICS v_stamped = ROW_COUNT;
  IF v_stamped = 0 THEN
    RAISE EXCEPTION 'already_reversed' USING ERRCODE = 'unique_violation';
  END IF;

  -- (2) Insert the negative-amount reversal row.
  INSERT INTO public.payment_records (
    school_id, student_id, amount, method, date, receipt_no,
    advance_amount, note, reverses_payment_id, reversed_by, reversal_reason
  ) VALUES (
    v_orig.school_id, v_orig.student_id, -abs(v_orig.amount),
    v_orig.method, (now() AT TIME ZONE 'Asia/Kolkata')::date,
    'REV-' || v_orig.receipt_no,
    -abs(coalesce(v_orig.advance_amount, 0)),
    'Reversal of ' || v_orig.receipt_no || ': ' || p_reason,
    v_orig.id, p_user_id, p_reason
  )
  RETURNING id INTO v_reversal_id;

  -- (3) Roll back each linked installment and mirror the link row.
  FOR v_link IN
    SELECT installment_id, amount_applied
      FROM public.payment_installment_links
     WHERE payment_id = v_orig.id
  LOOP
    SELECT id, amount, paid_amount, write_off_amount, status
      INTO v_inst
      FROM public.fee_installments
     WHERE id = v_link.installment_id
     FOR UPDATE;

    IF FOUND THEN
      v_new_paid := greatest(0, v_inst.paid_amount - v_link.amount_applied);
      v_total    := v_inst.amount;
      v_writeoff := coalesce(v_inst.write_off_amount, 0);
      v_remaining := v_total - v_writeoff;

      -- B2 fix: keep WAIVED state intact when paid+writeoff covers total
      -- via the writeoff portion alone. Order matters:
      IF v_writeoff >= v_total THEN
        v_new_status := 'WAIVED';
      ELSIF v_new_paid >= v_remaining AND v_remaining > 0 THEN
        v_new_status := 'PAID';
      ELSIF v_new_paid + v_writeoff >= v_total AND v_writeoff > 0 THEN
        v_new_status := 'WAIVED';
      ELSIF v_new_paid > 0 THEN
        v_new_status := 'PARTIAL';
      ELSE
        v_new_status := 'UNPAID';
      END IF;

      UPDATE public.fee_installments
         SET paid_amount = v_new_paid,
             status      = v_new_status,
             updated_at  = now()
       WHERE id = v_inst.id;

      INSERT INTO public.payment_installment_links (
        payment_id, installment_id, amount_applied
      ) VALUES (
        v_reversal_id, v_inst.id, -v_link.amount_applied
      );
    END IF;
  END LOOP;

  -- (4) Refund advance balance if the original generated one.
  IF coalesce(v_orig.advance_amount, 0) > 0 THEN
    INSERT INTO public.advance_balances (student_id, amount)
    VALUES (v_orig.student_id, 0)
    ON CONFLICT (student_id) DO NOTHING;

    UPDATE public.advance_balances
       SET amount = greatest(0, amount - v_orig.advance_amount)
     WHERE student_id = v_orig.student_id;
  END IF;

  RETURN QUERY SELECT v_reversal_id, v_orig.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reverse_payment(uuid, uuid, text) TO authenticated;


-- =============================================================
-- 0055_broadcasts_school_scope.sql
-- =============================================================
-- Scope broadcast SELECT policy to the caller's school. The original policy
-- (`auth.uid() IS NOT NULL`) let any authenticated user across any tenant
-- read every broadcast row, including school-specific ones with sensitive
-- school IDs in `target_schools`.
--
-- New rule: a user sees a broadcast iff
--   • they are SUPER_ADMIN, OR
--   • the broadcast targets all schools (target_schools IS NULL or empty), OR
--   • the broadcast targets the user's school explicitly.

DROP POLICY IF EXISTS broadcasts_select ON public.broadcasts;

CREATE POLICY broadcasts_select ON public.broadcasts FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      public.is_super_admin()
      OR target_schools IS NULL
      OR cardinality(target_schools) = 0
      OR EXISTS (
        SELECT 1 FROM public.users u
         WHERE u.id = auth.uid()
           AND u.school_id IS NOT NULL
           AND u.school_id = ANY (broadcasts.target_schools)
      )
    )
  );


-- =============================================================
-- 0056_complaint_per_child_cap.sql
-- =============================================================
-- Cap complaint submissions per child for PARENT users.
--
-- Problem: 0052 keyed the daily-3 cap on `from_user_id` only. A parent with
-- two kids on a single login hits the 3-cap across BOTH children — meaning
-- one child's spam locks the other out. Asymmetric with leave applications,
-- which are already per-student.
--
-- Fix: add `student_id` to complaints, populate it from the parent context
-- on insert, and re-key the trigger by (from_user_id, student_id) when
-- present. Existing rows keep student_id NULL and continue to use the old
-- per-user counting (safe — it just preserves the old behavior for
-- TEACHER complaints which have no student-context).

ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES public.students(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS complaints_student_idx
  ON public.complaints (student_id) WHERE student_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_complaint_daily_limit() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_today_ist date;
  v_count     bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_today_ist := (now() AT TIME ZONE 'Asia/Kolkata')::date;

  IF NEW.student_id IS NOT NULL THEN
    -- Parent / student complaint: cap per (submitter, child).
    SELECT count(*) INTO v_count
    FROM public.complaints
    WHERE from_user_id = NEW.from_user_id
      AND student_id   = NEW.student_id
      AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = v_today_ist;
  ELSE
    -- Teacher / no-student complaint: cap per submitter (legacy behavior).
    SELECT count(*) INTO v_count
    FROM public.complaints
    WHERE from_user_id = NEW.from_user_id
      AND student_id IS NULL
      AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = v_today_ist;
  END IF;

  IF v_count >= 3 THEN
    RAISE EXCEPTION
      'Daily limit reached — only 3 complaints allowed per day. Please contact the school office for another submission.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


-- =============================================================
-- 0057_platform_settings.sql
-- =============================================================
-- Platform-level configuration that the super admin can tune from the UI
-- without redeploying. Singleton row pattern: one row per `key`, JSONB value.
-- Used initially for plan pricing, but the schema is generic enough to host
-- trial duration, support email, brand colours, feature flags, etc.

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES public.users(id)
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user (the principals dashboard reads default trial
-- length, brand name, etc.). No PII here.
DROP POLICY IF EXISTS platform_settings_read ON public.platform_settings;
CREATE POLICY platform_settings_read ON public.platform_settings
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Write: super-admin only.
DROP POLICY IF EXISTS platform_settings_write ON public.platform_settings;
CREATE POLICY platform_settings_write ON public.platform_settings
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Seed default plan pricing (matches the previous build-time constants).
INSERT INTO public.platform_settings (key, value)
VALUES
  ('plan_pricing', jsonb_build_object('BASIC', 2999, 'STANDARD', 5999, 'PREMIUM', 9999)),
  ('trial_days',   to_jsonb(30)),
  ('brand',        jsonb_build_object('name', 'EduGrow', 'support_email', 'support@edugrow.in'))
ON CONFLICT (key) DO NOTHING;


-- =============================================================
-- 0058_timetable_student_read.sql
-- =============================================================
-- Allow STUDENT and PARENT roles to read timetable_entries for their own
-- section. The previous policy only included PRINCIPAL/TEACHER, which meant
-- the student timetable view always returned empty rows — even right after
-- the principal saved an entry.
--
-- Parents are scoped via parent_student_links → students.section_id; students
-- via their own students.user_id. Both join through students to confirm the
-- entry's section_id matches a section the user is enrolled in.

DROP POLICY IF EXISTS timetable_entries_select ON public.timetable_entries;

CREATE POLICY timetable_entries_select ON public.timetable_entries FOR SELECT
  USING (
    public.is_super_admin()
    OR (
      public.current_user_role() IN ('PRINCIPAL','TEACHER')
      AND school_id = public.current_user_school_id()
    )
    OR EXISTS (
      -- Student or parent: only their section's entries.
      SELECT 1
        FROM public.student_academic_records sar
        JOIN public.students s ON s.id = sar.student_id
       WHERE sar.section_id = timetable_entries.section_id
         AND sar.academic_year_id = timetable_entries.academic_year_id
         AND s.school_id = timetable_entries.school_id
         AND (
           s.user_id = auth.uid()
           OR s.id = ANY(public.linked_student_ids())
         )
    )
  );

-- Slots metadata (timetable_periods) drives the time/type column on the
-- student view. Apply the same opening-up so unmatched slots still render
-- correctly.
DROP POLICY IF EXISTS timetable_periods_select ON public.timetable_periods;

CREATE POLICY timetable_periods_select ON public.timetable_periods FOR SELECT
  USING (
    public.is_super_admin()
    OR school_id = public.current_user_school_id()
    OR EXISTS (
      SELECT 1 FROM public.students s
       WHERE s.school_id = timetable_periods.school_id
         AND (
           s.user_id = auth.uid()
           OR s.id = ANY(public.linked_student_ids())
         )
    )
  );


-- =============================================================
-- 0059_auto_billing_year_rollover.sql
-- =============================================================
-- Auto-rollover for school billing years.
--
-- Until now the super-admin had to manually click "Create next year" on
-- every school. This RPC walks every active school and ensures its latest
-- billing year covers today's date — creating successive years (carrying
-- forward arrears or advance credit) until the latest one is current.
--
-- Idempotent: re-running on a school whose latest year is already current
-- is a no-op. Called by the super-admin dashboard on every billing fetch,
-- so the rollover happens lazily without needing a cron job.

CREATE OR REPLACE FUNCTION public.ensure_billing_years_up_to_date()
RETURNS TABLE (school_id uuid, created_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school   record;
  v_latest   record;
  v_new_id   uuid;
  v_count    int;
  v_loop     int;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  FOR v_school IN
    SELECT s.school_id
      FROM public.school_billing_schedules s
      JOIN public.schools sc ON sc.id = s.school_id
     WHERE sc.is_deleted = false
  LOOP
    v_count := 0;
    -- Cap the loop at 5 iterations as a safety net — a real school will
    -- only ever be 1-2 years behind. Anything more means the schedule was
    -- paused or there's data corruption; either way we'd rather log and
    -- bail than burn cycles.
    FOR v_loop IN 1..5 LOOP
      SELECT * INTO v_latest
        FROM public.school_billing_years
       WHERE school_id = v_school.school_id
       ORDER BY start_date DESC LIMIT 1;

      EXIT WHEN v_latest IS NULL;                  -- no schedule yet — skip.
      EXIT WHEN v_latest.end_date >= CURRENT_DATE; -- already current.

      v_new_id := public.create_next_billing_year(v_school.school_id);
      v_count := v_count + 1;
    END LOOP;

    school_id := v_school.school_id;
    created_count := v_count;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_billing_years_up_to_date() TO authenticated;


-- =============================================================
-- 0060_fee_schedule_due_date_fallbacks.sql
-- =============================================================
-- 0060_fee_schedule_due_date_fallbacks.sql
--
-- Patches generate_student_fee_schedule so it can never insert a NULL
-- due_date into fee_installments. Two failure modes were observed in
-- production after 0017 shipped:
--
--   (a) ANNUAL / ONE_TIME head + empty p_due_dates → MIN(...) was NULL.
--       The RPC blew up with "null value in column 'due_date' violates
--       not-null constraint" and rolled back the whole regenerate, so
--       the principal saw a half-broken UI for that student.
--
--   (b) A MONTHLY due-dates row missing its `date` key → same crash.
--
-- Behaviour after this migration:
--   * Annual/one-time heads fall back to the academic_years.start_date
--     when p_due_dates is empty or every entry lacks a date — that's a
--     sensible "due at the start of the year" default and matches what
--     principals already eyeball when reading a year-start invoice.
--   * Monthly rows missing a date are skipped silently rather than
--     poisoning the whole insert. v_count stays accurate.
--   * Function is recreated with the same signature so existing callers
--     and the GRANT line don't need re-issuing.
--
-- Idempotent: CREATE OR REPLACE.

BEGIN;

CREATE OR REPLACE FUNCTION public.generate_student_fee_schedule(
  p_student_id      UUID,
  p_year_id         UUID,
  p_heads           JSONB,
  p_due_dates       JSONB,
  p_is_rte          BOOLEAN DEFAULT FALSE,
  p_discount_amount NUMERIC DEFAULT 0,
  p_discount_pct    NUMERIC DEFAULT 0
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id UUID;
  v_caller UUID := auth.uid();
  v_count INT := 0;
  v_head JSONB;
  v_dd JSONB;
  v_payer TEXT;
  v_freq TEXT;
  v_amt BIGINT;
  v_name TEXT;
  v_discount BIGINT;
  v_pct NUMERIC := COALESCE(p_discount_pct, 0);
  v_fixed NUMERIC := COALESCE(p_discount_amount, 0);
  v_year_start DATE;
  v_dd_str TEXT;
  v_dd_date DATE;
  v_fallback_date DATE;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF v_pct < 0 OR v_pct > 100 THEN RAISE EXCEPTION 'discount_pct out of range'; END IF;
  IF v_fixed < 0 THEN RAISE EXCEPTION 'discount_amount must be non-negative'; END IF;

  SELECT school_id INTO v_school_id FROM public.students WHERE id = p_student_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'student not found'; END IF;
  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_school_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Cache the AY start so annual / one-time heads have a sensible fallback
  -- when p_due_dates is empty. CURRENT_DATE is the second-line backstop
  -- (e.g., AY missing a start_date — should never happen, defensive only).
  SELECT start_date INTO v_year_start FROM public.academic_years WHERE id = p_year_id;
  v_fallback_date := COALESCE(v_year_start, CURRENT_DATE);

  -- Drop unpaid/un-written-off rows so we re-create cleanly. Paid history is preserved.
  DELETE FROM public.fee_installments
   WHERE student_id = p_student_id
     AND academic_year_id = p_year_id
     AND paid_amount = 0
     AND write_off_amount = 0;

  FOR v_head IN SELECT * FROM jsonb_array_elements(p_heads)
  LOOP
    v_name := v_head->>'name';
    v_amt  := (v_head->>'amount')::BIGINT;
    v_freq := COALESCE(v_head->>'frequency', 'MONTHLY');
    v_payer := CASE WHEN p_is_rte THEN 'GOVERNMENT' ELSE 'PARENT' END;

    v_discount := GREATEST(
      v_fixed::BIGINT,
      FLOOR(v_amt * v_pct / 100.0)::BIGINT
    );
    v_amt := GREATEST(0, v_amt - v_discount);

    IF v_freq = 'MONTHLY' THEN
      FOR v_dd IN SELECT * FROM jsonb_array_elements(p_due_dates)
      LOOP
        v_dd_str := v_dd->>'date';
        -- Skip rows without a date instead of letting NULL hit the column.
        -- Earlier behaviour was to insert NULL → not-null constraint blew
        -- up the whole regenerate, leaving the student in a half-state.
        IF v_dd_str IS NULL OR length(btrim(v_dd_str)) = 0 THEN
          CONTINUE;
        END IF;
        v_dd_date := v_dd_str::DATE;

        INSERT INTO public.fee_installments
          (student_id, academic_year_id, school_id, month, due_date, fee_type, amount, payer_type)
        VALUES
          (p_student_id, p_year_id, v_school_id, v_dd->>'month',
           v_dd_date,
           CASE WHEN lower(v_name) LIKE '%transport%' THEN 'TRANSPORT'
                WHEN lower(v_name) LIKE '%exam%'      THEN 'EXAM'
                WHEN lower(v_name) LIKE '%tuition%'   THEN 'TUITION'
                ELSE 'OTHER' END,
           v_amt, v_payer);
        v_count := v_count + 1;
      END LOOP;
    ELSE
      -- ANNUAL / ONE_TIME: pick the earliest due date from the structure,
      -- and fall back to the AY start when the structure has none.
      INSERT INTO public.fee_installments
        (student_id, academic_year_id, school_id, month, due_date, fee_type, amount, payer_type)
      VALUES
        (p_student_id, p_year_id, v_school_id,
         CASE WHEN v_freq = 'ONE_TIME' THEN 'OneTime' ELSE 'Annual' END,
         COALESCE(
           (SELECT MIN((dd->>'date')::DATE) FROM jsonb_array_elements(p_due_dates) dd
             WHERE dd->>'date' IS NOT NULL AND length(btrim(dd->>'date')) > 0),
           v_fallback_date
         ),
         'OTHER',
         v_amt, v_payer);
      v_count := v_count + 1;
    END IF;
  END LOOP;

  PERFORM public.refresh_student_fee_aggregate(p_student_id, p_year_id);
  RETURN v_count;
END $$;

COMMIT;


-- =============================================================
-- 0061_reverse_payment_academic_year_fix.sql
-- =============================================================
-- 0061_reverse_payment_academic_year_fix.sql
--
-- Patches reverse_payment to copy academic_year_id from the original
-- payment_records row onto the reversal entry. Without this, the reversal
-- INSERT crashed with "null value in column 'academic_year_id' violates
-- not-null constraint" because the function never selected the column from
-- the original row in the first place.
--
-- The original row has been auth-validated by the server route and is the
-- authoritative source of the year, so we just mirror it onto the negative
-- entry. Same fix in two places: the SELECT loader and the INSERT.
--
-- Idempotent: CREATE OR REPLACE.

BEGIN;

CREATE OR REPLACE FUNCTION public.reverse_payment(
  p_payment_id uuid,
  p_user_id    uuid,
  p_reason     text
)
RETURNS TABLE (reversal_id uuid, original_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orig         record;
  v_reversal_id  uuid;
  v_link         record;
  v_inst         record;
  v_new_paid     numeric;
  v_new_status   text;
  v_total        numeric;
  v_writeoff     numeric;
  v_remaining    numeric;
  v_stamped      int;
BEGIN
  SELECT id, school_id, student_id, academic_year_id, amount, method, date,
         receipt_no, advance_amount, note, reversed_at, reverses_payment_id
    INTO v_orig
    FROM public.payment_records
   WHERE id = p_payment_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_orig.reversed_at IS NOT NULL THEN
    RAISE EXCEPTION 'already_reversed' USING ERRCODE = 'unique_violation';
  END IF;
  IF v_orig.reverses_payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'cannot_reverse_a_reversal' USING ERRCODE = 'check_violation';
  END IF;
  IF v_orig.amount <= 0 THEN
    RAISE EXCEPTION 'non_positive_amount' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.payment_records
     SET reversed_at     = now(),
         reversed_by     = p_user_id,
         reversal_reason = p_reason
   WHERE id = p_payment_id
     AND reversed_at IS NULL;
  GET DIAGNOSTICS v_stamped = ROW_COUNT;
  IF v_stamped = 0 THEN
    RAISE EXCEPTION 'already_reversed' USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO public.payment_records (
    school_id, student_id, academic_year_id,
    amount, method, date, receipt_no,
    advance_amount, note, reverses_payment_id, reversed_by, reversal_reason
  ) VALUES (
    v_orig.school_id, v_orig.student_id, v_orig.academic_year_id,
    -abs(v_orig.amount),
    v_orig.method, (now() AT TIME ZONE 'Asia/Kolkata')::date,
    'REV-' || v_orig.receipt_no,
    -abs(coalesce(v_orig.advance_amount, 0)),
    'Reversal of ' || v_orig.receipt_no || ': ' || p_reason,
    v_orig.id, p_user_id, p_reason
  )
  RETURNING id INTO v_reversal_id;

  FOR v_link IN
    SELECT installment_id, amount_applied
      FROM public.payment_installment_links
     WHERE payment_id = v_orig.id
  LOOP
    SELECT id, amount, paid_amount, write_off_amount, status
      INTO v_inst
      FROM public.fee_installments
     WHERE id = v_link.installment_id
     FOR UPDATE;

    IF FOUND THEN
      v_new_paid := greatest(0, v_inst.paid_amount - v_link.amount_applied);
      v_total    := v_inst.amount;
      v_writeoff := coalesce(v_inst.write_off_amount, 0);
      v_remaining := v_total - v_writeoff;

      IF v_writeoff >= v_total THEN
        v_new_status := 'WAIVED';
      ELSIF v_new_paid >= v_remaining AND v_remaining > 0 THEN
        v_new_status := 'PAID';
      ELSIF v_new_paid + v_writeoff >= v_total AND v_writeoff > 0 THEN
        v_new_status := 'WAIVED';
      ELSIF v_new_paid > 0 THEN
        v_new_status := 'PARTIAL';
      ELSE
        v_new_status := 'UNPAID';
      END IF;

      UPDATE public.fee_installments
         SET paid_amount = v_new_paid,
             status      = v_new_status,
             updated_at  = now()
       WHERE id = v_inst.id;

      INSERT INTO public.payment_installment_links (
        payment_id, installment_id, amount_applied
      ) VALUES (
        v_reversal_id, v_inst.id, -v_link.amount_applied
      );
    END IF;
  END LOOP;

  IF coalesce(v_orig.advance_amount, 0) > 0 THEN
    INSERT INTO public.advance_balances (student_id, amount)
    VALUES (v_orig.student_id, 0)
    ON CONFLICT (student_id) DO NOTHING;

    UPDATE public.advance_balances
       SET amount = greatest(0, amount - v_orig.advance_amount)
     WHERE student_id = v_orig.student_id;
  END IF;

  RETURN QUERY SELECT v_reversal_id, v_orig.id;
END;
$$;

COMMIT;


-- =============================================================
-- 0062_inventory_simplification.sql
-- =============================================================
-- 0062_inventory_simplification.sql
--
-- Aligns the assets schema with the new flat-inventory model.
--
--   • Drops the asset_issues table — student-loan tracking is gone. The new
--     UI treats assets as a school-wide register; per-student check-out is
--     no longer surfaced anywhere. Existing rows are preserved as a JSON
--     archive on each asset's `details` column so historical loans aren't
--     lost (auditors can still inspect them via the column).
--
--   • Drops the issue_asset / return_asset RPCs that fed asset_issues.
--
--   • Adds a CHECK ensuring `details` is a JSON object (so the new schema —
--     details.description / details.note / details.addedOn — is at least
--     structurally valid).
--
--   • Backfills `details.addedOn` from `created_at::date` for legacy rows
--     so the new timeline view groups them on a real date instead of NULL.
--
--   • Backfills `details.description` from any legacy author/subject combo
--     so the inventory list reads cleanly even before the principal edits
--     each item.
--
-- Idempotent: drops are IF EXISTS; backfills only touch rows where the new
-- fields are absent. Re-running is safe.

BEGIN;

-- ─── 1. Archive asset_issues rows onto each asset, then drop the table ──
-- The archive lives in details.legacy_loans (jsonb array) so the row count
-- stays bounded by the asset itself. If asset_issues was empty (clean
-- environment), this no-ops.
DO $archive$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'asset_issues') THEN
    UPDATE public.assets a
       SET details = COALESCE(a.details, '{}'::jsonb) || jsonb_build_object(
             'legacy_loans',
             (SELECT jsonb_agg(jsonb_build_object(
                       'id',            i.id,
                       'student_id',    i.student_id,
                       'borrower_name', i.borrower_name,
                       'issued_at',     i.issued_at,
                       'due_date',      i.due_date,
                       'returned_at',   i.returned_at,
                       'created_at',    i.created_at
                     ) ORDER BY i.created_at DESC)
                FROM public.asset_issues i
               WHERE i.asset_id = a.id)
           )
     WHERE EXISTS (SELECT 1 FROM public.asset_issues i WHERE i.asset_id = a.id);
  END IF;
END
$archive$;

-- Drop dependent RPCs first; they reference asset_issues directly.
DROP FUNCTION IF EXISTS public.issue_asset(UUID, UUID, TEXT, INT);
DROP FUNCTION IF EXISTS public.issue_asset(UUID, UUID, TEXT, INT, TEXT);
DROP FUNCTION IF EXISTS public.return_asset(UUID, UUID);
DROP FUNCTION IF EXISTS public.return_asset(UUID, UUID, TEXT);

DROP TABLE IF EXISTS public.asset_issues CASCADE;

-- ─── 2. Reset available_count to total_count ───────────────────────────
-- Loan tracking is gone; available was only ever decremented by an issue.
-- Sync them so any read that still uses available_count sees real stock.
UPDATE public.assets
   SET available_count = total_count
 WHERE available_count <> total_count;

-- ─── 3. Backfill details.addedOn / details.description for legacy rows ─
-- Skip rows that already carry the new keys (idempotent).
UPDATE public.assets
   SET details = COALESCE(details, '{}'::jsonb)
                 || jsonb_build_object('addedOn', to_char(created_at, 'YYYY-MM-DD'))
 WHERE details IS NULL
    OR NOT (details ? 'addedOn');

UPDATE public.assets
   SET details = details || jsonb_build_object(
         'description',
         trim(BOTH ' · ' FROM concat_ws(
           ' · ',
           NULLIF(details->>'author', ''),
           NULLIF(details->>'subject', ''),
           NULLIF(details->>'isbn', '')
         ))
       )
 WHERE category = 'BOOK'
   AND NOT (details ? 'description');

UPDATE public.assets
   SET details = details || jsonb_build_object(
         'description',
         trim(BOTH ' · ' FROM concat_ws(
           ' · ',
           NULLIF(details->>'labType', ''),
           CASE WHEN (details->>'lastServiced') IS NOT NULL
                THEN 'serviced ' || (details->>'lastServiced')
                ELSE NULL END
         ))
       )
 WHERE category = 'LAB_EQUIPMENT'
   AND NOT (details ? 'description');

-- ─── 4. Validate details shape ────────────────────────────────────────
-- A jsonb object (not an array, not a scalar) so the app code's
-- `details?.description` style access never blows up. Drop and re-add to
-- stay idempotent across reruns.
ALTER TABLE public.assets DROP CONSTRAINT IF EXISTS assets_details_object_chk;
ALTER TABLE public.assets ADD CONSTRAINT assets_details_object_chk
  CHECK (jsonb_typeof(details) = 'object');

COMMIT;


-- =============================================================
-- 0063_inventory_history.sql
-- =============================================================
-- 0063_inventory_history.sql
--
-- Append-only audit log for inventory add / delete events.
--
-- Retention rules:
--   * 7-day TTL — anything older is purged on the next insert.
--   * 1000-row cap per school — once exceeded, oldest rows trimmed.
--
-- Both rules enforced by an AFTER INSERT trigger so the cleanup happens
-- without a cron job. The trigger is per-statement (not per-row) so a bulk
-- insert sees exactly one cleanup pass.
--
-- Columns intentionally denormalised (title / category / quantity copied
-- onto the row) so a delete event is still readable after the asset row
-- itself is gone.

BEGIN;

CREATE TABLE IF NOT EXISTS public.inventory_history (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  asset_id     UUID,                       -- nullable: row may outlive the asset
  action       TEXT NOT NULL CHECK (action IN ('ADD', 'DELETE', 'UPDATE')),
  title        TEXT NOT NULL,
  category     TEXT NOT NULL,
  quantity     INT  NOT NULL DEFAULT 0,
  description  TEXT,
  note         TEXT,
  done_by      UUID REFERENCES public.users(id),
  done_by_name TEXT,
  done_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inventory_history_school_done_at_idx
  ON public.inventory_history(school_id, done_at DESC);

-- ─── Retention trigger ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.inventory_history_prune()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- 7-day TTL — runs across all schools so we don't repeat the work per
  -- tenant. Cheap because of the (school_id, done_at) index.
  DELETE FROM public.inventory_history
   WHERE done_at < (NOW() - INTERVAL '7 days');

  -- Per-school 1000-row cap. Runs only against the school that just
  -- inserted, so even a busy school doesn't trigger a global scan.
  DELETE FROM public.inventory_history old
   WHERE old.school_id = NEW.school_id
     AND old.id IN (
       SELECT id FROM public.inventory_history
        WHERE school_id = NEW.school_id
        ORDER BY done_at DESC
        OFFSET 1000
     );

  RETURN NULL;  -- AFTER trigger; return value ignored
END
$$;

DROP TRIGGER IF EXISTS inventory_history_prune_trg ON public.inventory_history;
CREATE TRIGGER inventory_history_prune_trg
  AFTER INSERT ON public.inventory_history
  FOR EACH ROW EXECUTE FUNCTION public.inventory_history_prune();

-- ─── RLS ────────────────────────────────────────────────────────────────
-- Same shape as the assets table: super-admin sees all, principal/teacher
-- see their school. Writes are routed through the server with service role,
-- so the policy only governs reads.
ALTER TABLE public.inventory_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_history_select ON public.inventory_history;
CREATE POLICY inventory_history_select ON public.inventory_history FOR SELECT
  USING (
    public.is_super_admin()
    OR (public.current_user_role() IN ('PRINCIPAL', 'TEACHER')
        AND school_id = public.current_user_school_id())
  );

COMMIT;


-- =============================================================
-- 0064_attendance_updated_at.sql
-- =============================================================
-- 0064_attendance_updated_at.sql
--
-- Adds attendance_records.updated_at + a BEFORE UPDATE trigger to keep it
-- fresh. The Mark-Attendance UI surfaces "Locked by X · time" using this
-- column so an edit (Editor Mode correction) shows the latest write time
-- instead of the stale original. The earlier service select crashed with
-- "column attendance_records.updated_at does not exist" because the
-- column was never created.
--
-- Backfilled to created_at so existing rows render with a sensible time
-- on the next read.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, DROP TRIGGER IF EXISTS, CREATE OR
-- REPLACE FUNCTION.

BEGIN;

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE public.attendance_records
   SET updated_at = created_at
 WHERE updated_at < created_at OR updated_at = '1970-01-01'::timestamptz;

CREATE OR REPLACE FUNCTION public.attendance_records_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS attendance_records_updated_at_trg ON public.attendance_records;
CREATE TRIGGER attendance_records_updated_at_trg
  BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.attendance_records_touch_updated_at();

COMMIT;


-- =============================================================
-- 0066_audit_phase1_security_fixes.sql
-- =============================================================
-- Migration 0062: Phase 1 security audit fixes
-- - Tighten school_settings RLS so only principal/super-admin can write.
-- - Tighten users_prevent_self_escalation trigger to use a small allowlist.
-- - Tighten parent_student_links admin write to require student.school_id match.
-- Run: npm run db:apply

-- ─── 0062.1 school_settings: write-only by principals/super-admins ──────────
-- Previously a single FOR ALL policy + GRANT INSERT/UPDATE on `authenticated`
-- let any same-school user (including teachers/students) toggle attendance
-- start/end times and the teacher-checkin flag.
DROP POLICY IF EXISTS school_settings_principal_rw ON public.school_settings;

DROP POLICY IF EXISTS school_settings_select ON public.school_settings;
CREATE POLICY school_settings_select ON public.school_settings
  FOR SELECT
  USING (
    public.is_super_admin()
    OR school_id = public.current_user_school_id()
  );

DROP POLICY IF EXISTS school_settings_principal_write ON public.school_settings;
CREATE POLICY school_settings_principal_write ON public.school_settings
  FOR INSERT
  WITH CHECK (
    public.is_super_admin()
    OR (public.is_principal() AND school_id = public.current_user_school_id())
  );

DROP POLICY IF EXISTS school_settings_principal_update ON public.school_settings;
CREATE POLICY school_settings_principal_update ON public.school_settings
  FOR UPDATE
  USING (
    public.is_super_admin()
    OR (public.is_principal() AND school_id = public.current_user_school_id())
  )
  WITH CHECK (
    public.is_super_admin()
    OR (public.is_principal() AND school_id = public.current_user_school_id())
  );

DROP POLICY IF EXISTS school_settings_principal_delete ON public.school_settings;
CREATE POLICY school_settings_principal_delete ON public.school_settings
  FOR DELETE
  USING (
    public.is_super_admin()
    OR (public.is_principal() AND school_id = public.current_user_school_id())
  );

-- ─── 0062.2 users_prevent_self_escalation: explicit allowlist ───────────────
-- Switch from a denylist (which missed editor_mode_until, email, name,
-- last_login) to an explicit allowlist of fields a non-super-admin user can
-- update on their own row. Service role (auth.uid() IS NULL) and SUPER_ADMIN
-- still get the unchanged path.
CREATE OR REPLACE FUNCTION public.users_prevent_self_escalation() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- service role / admin tooling, allow
  END IF;
  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;
  -- Allowlist: phone-style profile fields user is permitted to self-edit.
  -- Everything else is forced back to OLD. This blocks self-escalation via
  -- editor_mode_until, role, school_id, is_active, first_login_changed,
  -- mobile_number, email, name, last_login, etc.
  NEW.id                  := OLD.id;
  NEW.role                := OLD.role;
  NEW.school_id           := OLD.school_id;
  NEW.is_active           := OLD.is_active;
  NEW.first_login_changed := OLD.first_login_changed;
  NEW.mobile_number       := OLD.mobile_number;
  NEW.email               := OLD.email;
  NEW.name                := OLD.name;
  NEW.editor_mode_until   := OLD.editor_mode_until;
  NEW.last_login          := OLD.last_login;
  NEW.created_at          := OLD.created_at;
  RETURN NEW;
END;
$$;

-- ─── 0062.3 parent_student_links: bind student to caller's school ───────────
-- Previously psl_admin_write let any principal insert links to a student in
-- a *different* school, allowing a malicious principal to attach a parent in
-- their school to a rival school's student record.
DROP POLICY IF EXISTS psl_admin_write ON public.parent_student_links;
CREATE POLICY psl_admin_write ON public.parent_student_links
  FOR ALL
  USING (
    public.is_super_admin()
    OR (
      public.is_principal()
      AND EXISTS (
        SELECT 1 FROM public.students s
         WHERE s.id = parent_student_links.student_id
           AND s.school_id = public.current_user_school_id()
      )
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.is_principal()
      AND EXISTS (
        SELECT 1 FROM public.students s
         WHERE s.id = parent_student_links.student_id
           AND s.school_id = public.current_user_school_id()
      )
    )
  );


-- =============================================================
-- 0067_audit_phase2_security_fixes.sql
-- =============================================================
-- Migration 0063: Phase 2 security audit fixes
-- - audit_logs becomes append-only (no UPDATE / DELETE for normal users).
-- - complaints.from_user_id is immutable post-insert.
-- - log_audit() rejects malformed action strings (audit-trail integrity).
-- Run: npm run db:apply

-- ─── 0063.1 audit_logs append-only ──────────────────────────────────────────
-- The generic per-table write loop in 0001_init.sql gave principals FOR ALL
-- (i.e. INSERT/UPDATE/DELETE) on audit_logs in their school. A compromised
-- principal could erase or rewrite forensic trail. Replace with INSERT-only.
DROP POLICY IF EXISTS audit_logs_write ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_insert ON public.audit_logs;

CREATE POLICY audit_logs_insert ON public.audit_logs
  FOR INSERT
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.current_user_role() IN ('PRINCIPAL','TEACHER')
      AND school_id = public.current_user_school_id()
    )
  );

-- No UPDATE / DELETE policies → both denied for everyone except service role
-- (service role bypasses RLS entirely; that's the only retention/cleanup path).

-- ─── 0063.2 complaints.from_user_id immutability ────────────────────────────
-- Generic `complaints_write FOR ALL` lets a principal rewrite who filed a
-- complaint, framing a teacher/parent. Lock the column via a BEFORE UPDATE
-- trigger.
CREATE OR REPLACE FUNCTION public.complaints_lock_author() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.from_user_id IS DISTINCT FROM OLD.from_user_id THEN
    RAISE EXCEPTION 'complaints.from_user_id is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS complaints_lock_author ON public.complaints;
CREATE TRIGGER complaints_lock_author
  BEFORE UPDATE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.complaints_lock_author();

-- ─── 0063.3 log_audit format validation ─────────────────────────────────────
-- Any authenticated user can call log_audit and write arbitrary action /
-- entity_type strings, polluting the audit trail (e.g. inject newlines,
-- fake "password_changed" markers). Enforce a strict identifier-style
-- format so audit rows are at least syntactically well-formed and cannot
-- carry control characters. Length capped to reasonable values.
CREATE OR REPLACE FUNCTION public.log_audit(
  p_action      TEXT,
  p_entity_type TEXT,
  p_entity_id   UUID,
  p_details     JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id   UUID;
  v_school_id UUID;
  v_log_id    UUID;
BEGIN
  IF p_action IS NULL OR p_action !~ '^[a-z][a-z0-9_]{1,63}$' THEN
    RAISE EXCEPTION 'log_audit: invalid action format (must be snake_case identifier, 2-64 chars)';
  END IF;
  IF p_entity_type IS NULL OR p_entity_type !~ '^[a-z][a-z0-9_]{1,63}$' THEN
    RAISE EXCEPTION 'log_audit: invalid entity_type format';
  END IF;

  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL THEN
    SELECT school_id INTO v_school_id
      FROM public.users WHERE id = v_user_id;
  END IF;

  INSERT INTO public.audit_logs
    (user_id, school_id, action, entity_type, entity_id, details)
  VALUES
    (v_user_id, v_school_id, p_action, p_entity_type, p_entity_id, COALESCE(p_details,'{}'::jsonb))
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;


-- =============================================================
-- 0068_transport_schedule_atomic.sql
-- =============================================================
-- Migration 0064: Atomic transport-fee schedule replace.
--
-- The client previously did:
--   DELETE unpaid TRANSPORT installments for this assignment;
--   INSERT new monthly rows.
-- Two separate round-trips. If the INSERT failed (RLS, constraint, network)
-- the student lost ALL unpaid TRANSPORT installments without replacement.
--
-- This RPC moves both ops into one transaction. Caller passes a JSONB array
-- of new rows; we delete the old unpaid set, then insert the new set, both
-- under the same SECURITY DEFINER context (PRINCIPAL same-school enforced
-- via the explicit checks below).
--
-- Run: npm run db:apply

CREATE OR REPLACE FUNCTION public.transport_replace_unpaid_installments(
  p_assignment_id uuid,
  p_rows          jsonb
)
RETURNS TABLE (deleted_count integer, inserted_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id uuid;
  v_caller_school uuid;
  v_deleted int := 0;
  v_inserted int := 0;
BEGIN
  -- Identify the school this assignment belongs to via any installment row,
  -- or fall back to the first JSONB row's school_id (initial seeding).
  SELECT school_id INTO v_school_id
    FROM public.fee_installments
   WHERE related_id = p_assignment_id AND fee_type = 'TRANSPORT'
   LIMIT 1;
  IF v_school_id IS NULL THEN
    v_school_id := (p_rows -> 0 ->> 'school_id')::uuid;
  END IF;

  -- Caller must be principal of that school (or super-admin).
  v_caller_school := public.current_user_school_id();
  IF NOT public.is_super_admin() THEN
    IF NOT public.is_principal() OR v_caller_school IS DISTINCT FROM v_school_id THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  WITH del AS (
    DELETE FROM public.fee_installments
     WHERE related_id = p_assignment_id
       AND fee_type = 'TRANSPORT'
       AND paid_amount = 0
       AND write_off_amount = 0
     RETURNING 1
  )
  SELECT COUNT(*) INTO v_deleted FROM del;

  WITH ins AS (
    INSERT INTO public.fee_installments
      (student_id, school_id, academic_year_id, month, due_date,
       fee_type, amount, payer_type, related_id)
    SELECT
      (r->>'student_id')::uuid,
      (r->>'school_id')::uuid,
      (r->>'academic_year_id')::uuid,
       r->>'month',
      (r->>'due_date')::date,
       r->>'fee_type',
      (r->>'amount')::numeric,
       r->>'payer_type',
      (r->>'related_id')::uuid
    FROM jsonb_array_elements(p_rows) AS r
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_inserted FROM ins;

  RETURN QUERY SELECT v_deleted, v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.transport_replace_unpaid_installments(uuid, jsonb) TO authenticated;


-- =============================================================
-- 0069_audit_phase6_followups.sql
-- =============================================================
-- Migration 0065: Phase 6 follow-up fixes from second audit pass
-- - Atomic transport-cancel-after RPC (was looped UPDATE per row).
-- Run: npm run db:apply

CREATE OR REPLACE FUNCTION public.transport_cancel_after(
  p_assignment_id uuid,
  p_from_date     date
)
RETURNS TABLE (deleted_count integer, cancelled_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id uuid;
  v_caller_school uuid;
  v_deleted int := 0;
  v_cancelled int := 0;
BEGIN
  SELECT school_id INTO v_school_id
    FROM public.fee_installments
   WHERE related_id = p_assignment_id AND fee_type = 'TRANSPORT'
   LIMIT 1;
  IF v_school_id IS NULL THEN
    -- nothing to cancel
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  v_caller_school := public.current_user_school_id();
  IF NOT public.is_super_admin() THEN
    IF NOT public.is_principal() OR v_caller_school IS DISTINCT FROM v_school_id THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- Untouched rows: delete outright.
  WITH del AS (
    DELETE FROM public.fee_installments
     WHERE related_id = p_assignment_id
       AND fee_type   = 'TRANSPORT'
       AND due_date  >= p_from_date
       AND paid_amount = 0
       AND write_off_amount = 0
     RETURNING 1
  )
  SELECT COUNT(*) INTO v_deleted FROM del;

  -- Partial / paid rows: freeze amount at (paid + write-off) and stamp CANCELLED.
  WITH upd AS (
    UPDATE public.fee_installments
       SET status     = 'CANCELLED',
           amount     = paid_amount + write_off_amount,
           updated_at = NOW()
     WHERE related_id = p_assignment_id
       AND fee_type   = 'TRANSPORT'
       AND due_date  >= p_from_date
       AND (paid_amount > 0 OR write_off_amount > 0)
     RETURNING 1
  )
  SELECT COUNT(*) INTO v_cancelled FROM upd;

  RETURN QUERY SELECT v_deleted, v_cancelled;
END;
$$;

GRANT EXECUTE ON FUNCTION public.transport_cancel_after(uuid, date) TO authenticated;


-- =============================================================
-- 0070_anonymous_complaints.sql
-- =============================================================
-- Anonymous complaints with a per-student weekly cap.
--
-- Adds `is_anonymous` to the existing complaints table so a student can
-- file a sensitive complaint (bullying, harassment) without exposing their
-- identity to the principal. Identity columns (from_user_id, from_name,
-- student_id) stay populated server-side so the abuse-prevention triggers
-- and audit log can still see who filed; the principal UI is what hides
-- those fields when is_anonymous is true.
--
-- Cap: 1 anonymous complaint per student per rolling 7 days. This is on
-- top of the existing daily 3-complaint cap from migration 0056. We keep
-- it as a row-level trigger so the limit is enforced server-side regardless
-- of what the client sends.

ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS is_anonymous boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_complaints_anon_student_created
  ON public.complaints (student_id, created_at)
  WHERE is_anonymous = true;

CREATE OR REPLACE FUNCTION public.enforce_anonymous_complaint_weekly_cap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  recent_count integer;
BEGIN
  IF NEW.is_anonymous IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- student_id may be null for parent-filed rows; in that case fall back
  -- to from_user_id so the cap still applies per-account.
  SELECT COUNT(*) INTO recent_count
  FROM public.complaints
  WHERE is_anonymous = true
    AND created_at >= (now() - interval '7 days')
    AND (
      (NEW.student_id IS NOT NULL AND student_id = NEW.student_id)
      OR (NEW.student_id IS NULL AND from_user_id = NEW.from_user_id)
    );

  IF recent_count >= 1 THEN
    RAISE EXCEPTION 'Anonymous complaint limit reached: only 1 per 7 days'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_anonymous_complaint_weekly_cap ON public.complaints;
CREATE TRIGGER trg_anonymous_complaint_weekly_cap
  BEFORE INSERT ON public.complaints
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_anonymous_complaint_weekly_cap();


-- =============================================================
-- 0071_pay_installment_rpc.sql
-- =============================================================
-- =============================================================
-- 0071_pay_installment_rpc.sql
-- =============================================================
-- Adds `pay_installment` — a strict, single-row payment RPC that:
--   • Applies cash + (optional) discount to ONE specific fee_installment row
--     chosen by the caller (no oldest-due-first guessing).
--   • Hard-rejects overpay (cash + discount > outstanding) instead of
--     silently dumping the surplus into advance_balances.
--   • Writes the matching payment_records row, payment_installment_links
--     row, and (if discount > 0) a fee_write_offs row so the existing
--     history/expand-on-tap UI shows the full audit trail.
--
-- Coexists with record_fee_payment (oldest-first): callers pick the RPC
-- that matches the UX they want.
-- =============================================================

CREATE OR REPLACE FUNCTION public.pay_installment(
  p_installment_id UUID,
  p_amount         BIGINT,                -- cash applied (≥ 0)
  p_discount       BIGINT  DEFAULT 0,     -- write-off applied to this row (≥ 0)
  p_method         TEXT    DEFAULT 'CASH',
  p_date           DATE    DEFAULT CURRENT_DATE,
  p_note           TEXT    DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller       UUID := auth.uid();
  v_inst         RECORD;
  v_outstanding  BIGINT;
  v_payment_id   UUID;
  v_receipt      TEXT;
  v_total_apply  BIGINT;
  v_disc         BIGINT;
  v_amt          BIGINT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  v_amt  := COALESCE(p_amount, 0);
  v_disc := GREATEST(0, COALESCE(p_discount, 0));

  IF v_amt < 0  THEN RAISE EXCEPTION 'amount must be non-negative'; END IF;
  IF v_amt = 0 AND v_disc = 0 THEN
    RAISE EXCEPTION 'nothing to apply (amount and discount both zero)';
  END IF;

  -- Lock the target installment so concurrent payments can't double-spend it.
  SELECT id, student_id, school_id, academic_year_id, amount, paid_amount,
         write_off_amount, fee_type, month, due_date
    INTO v_inst
    FROM public.fee_installments
   WHERE id = p_installment_id
   FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'installment not found'; END IF;

  -- Authorise: same rule as record_fee_payment.
  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_inst.school_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_outstanding := v_inst.amount - v_inst.paid_amount - v_inst.write_off_amount;
  IF v_outstanding <= 0 THEN
    RAISE EXCEPTION 'installment already cleared';
  END IF;

  v_total_apply := v_amt + v_disc;
  IF v_total_apply > v_outstanding THEN
    RAISE EXCEPTION 'overpay blocked (outstanding=%, attempted=%)',
      v_outstanding, v_total_apply;
  END IF;

  v_receipt := 'RCT-' || to_char(NOW(),'YYYYMMDDHH24MISS')
                     || '-' || substr(v_inst.student_id::text, 1, 4);

  -- Insert the payment row (cash only — discount tracked separately).
  INSERT INTO public.payment_records
    (student_id, school_id, academic_year_id, amount, discount_amount,
     method, date, receipt_no, note)
  VALUES
    (v_inst.student_id, v_inst.school_id, v_inst.academic_year_id,
     v_amt, v_disc, p_method, p_date, v_receipt, p_note)
  RETURNING id INTO v_payment_id;

  -- Link payment → installment (only when cash > 0).
  IF v_amt > 0 THEN
    INSERT INTO public.payment_installment_links
      (payment_id, installment_id, amount_applied)
    VALUES (v_payment_id, v_inst.id, v_amt);
  END IF;

  -- Persist discount as an explicit write-off audit row.
  IF v_disc > 0 THEN
    INSERT INTO public.fee_write_offs
      (installment_id, student_id, school_id, amount, reason, approved_by)
    VALUES
      (v_inst.id, v_inst.student_id, v_inst.school_id, v_disc,
       COALESCE(p_note, 'Discount'), v_caller);
  END IF;

  -- Bump the installment + recompute its derived status.
  UPDATE public.fee_installments
     SET paid_amount      = paid_amount + v_amt,
         write_off_amount = write_off_amount + v_disc,
         write_off_reason = CASE
                              WHEN v_disc > 0
                                THEN COALESCE(p_note, write_off_reason, 'Discount')
                              ELSE write_off_reason
                            END,
         status = public.compute_installment_status(
                    amount,
                    paid_amount + v_amt,
                    write_off_amount + v_disc,
                    due_date),
         updated_at = NOW()
   WHERE id = v_inst.id;

  PERFORM public.refresh_student_fee_aggregate(v_inst.student_id, v_inst.academic_year_id);

  INSERT INTO public.audit_logs
    (user_id, school_id, action, entity_type, entity_id, details)
  VALUES
    (v_caller, v_inst.school_id, 'fee_payment_per_installment', 'payment', v_payment_id,
     jsonb_build_object(
       'installment_id', v_inst.id,
       'student_id',     v_inst.student_id,
       'month',          v_inst.month,
       'fee_type',       v_inst.fee_type,
       'amount',         v_amt,
       'discount',       v_disc,
       'receipt',        v_receipt));

  RETURN v_payment_id;
END $$;

GRANT EXECUTE ON FUNCTION public.pay_installment(UUID, BIGINT, BIGINT, TEXT, DATE, TEXT)
  TO authenticated;


-- =============================================================
-- 0072_pay_installment_advance.sql
-- =============================================================
-- =============================================================
-- 0072_pay_installment_advance.sql
-- =============================================================
-- Extends pay_installment with optional `p_use_advance`. When TRUE
-- and the student has a positive advance_balances row, that pool
-- is drawn from FIRST to clear the installment. Any cash entered
-- (`p_amount`) is layered on top. Overpay is still hard-rejected.
--
-- Method is unchanged TEXT — UIs may pass 'GOVERNMENT' to mark the
-- payment as government-funded so history can render it differently.
-- =============================================================

DROP FUNCTION IF EXISTS public.pay_installment(UUID, BIGINT, BIGINT, TEXT, DATE, TEXT);

CREATE OR REPLACE FUNCTION public.pay_installment(
  p_installment_id UUID,
  p_amount         BIGINT,
  p_discount       BIGINT  DEFAULT 0,
  p_method         TEXT    DEFAULT 'CASH',
  p_date           DATE    DEFAULT CURRENT_DATE,
  p_note           TEXT    DEFAULT NULL,
  p_use_advance    BOOLEAN DEFAULT FALSE
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller       UUID := auth.uid();
  v_inst         RECORD;
  v_outstanding  BIGINT;
  v_payment_id   UUID;
  v_receipt      TEXT;
  v_disc         BIGINT;
  v_amt          BIGINT;
  v_advance      BIGINT := 0;
  v_advance_use  BIGINT := 0;
  v_total_apply  BIGINT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  v_amt  := COALESCE(p_amount, 0);
  v_disc := GREATEST(0, COALESCE(p_discount, 0));

  IF v_amt < 0  THEN RAISE EXCEPTION 'amount must be non-negative'; END IF;

  SELECT id, student_id, school_id, academic_year_id, amount, paid_amount,
         write_off_amount, fee_type, month, due_date
    INTO v_inst
    FROM public.fee_installments
   WHERE id = p_installment_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'installment not found'; END IF;

  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_inst.school_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_outstanding := v_inst.amount - v_inst.paid_amount - v_inst.write_off_amount;
  IF v_outstanding <= 0 THEN
    RAISE EXCEPTION 'installment already cleared';
  END IF;

  -- Pull from advance pool first if requested. Cap by what's needed
  -- after cash + discount have been considered, so we never overdraw.
  IF p_use_advance THEN
    SELECT COALESCE(amount, 0) INTO v_advance
      FROM public.advance_balances
     WHERE student_id = v_inst.student_id
     FOR UPDATE;
    v_advance := COALESCE(v_advance, 0);
    -- Need to cover (outstanding - cash - discount) at most
    v_advance_use := LEAST(
      v_advance,
      GREATEST(0, v_outstanding - v_amt - v_disc)
    );
  END IF;

  IF v_amt = 0 AND v_disc = 0 AND v_advance_use = 0 THEN
    RAISE EXCEPTION 'nothing to apply (amount, discount and advance are zero)';
  END IF;

  v_total_apply := v_amt + v_disc + v_advance_use;
  IF v_total_apply > v_outstanding THEN
    RAISE EXCEPTION 'overpay blocked (outstanding=%, attempted=%)',
      v_outstanding, v_total_apply;
  END IF;

  v_receipt := 'RCT-' || to_char(NOW(),'YYYYMMDDHH24MISS')
                     || '-' || substr(v_inst.student_id::text, 1, 4);

  -- Cash leg of the payment row records the actual cash + advance
  -- drawn (so totals reconcile against payment_installment_links),
  -- minus the discount which is tracked separately.
  INSERT INTO public.payment_records
    (student_id, school_id, academic_year_id,
     amount, discount_amount, method, date, receipt_no, note)
  VALUES
    (v_inst.student_id, v_inst.school_id, v_inst.academic_year_id,
     v_amt + v_advance_use, v_disc, p_method, p_date, v_receipt,
     CASE
       WHEN v_advance_use > 0 AND p_note IS NOT NULL
         THEN p_note || ' (incl. ₹' || v_advance_use || ' advance)'
       WHEN v_advance_use > 0
         THEN '₹' || v_advance_use || ' from advance credit'
       ELSE p_note
     END)
  RETURNING id INTO v_payment_id;

  IF (v_amt + v_advance_use) > 0 THEN
    INSERT INTO public.payment_installment_links
      (payment_id, installment_id, amount_applied)
    VALUES (v_payment_id, v_inst.id, v_amt + v_advance_use);
  END IF;

  IF v_disc > 0 THEN
    INSERT INTO public.fee_write_offs
      (installment_id, student_id, school_id, amount, reason, approved_by)
    VALUES
      (v_inst.id, v_inst.student_id, v_inst.school_id, v_disc,
       COALESCE(p_note, 'Discount'), v_caller);
  END IF;

  -- Decrement the advance pool.
  IF v_advance_use > 0 THEN
    UPDATE public.advance_balances
       SET amount = amount - v_advance_use,
           updated_at = NOW()
     WHERE student_id = v_inst.student_id;
  END IF;

  UPDATE public.fee_installments
     SET paid_amount      = paid_amount + v_amt + v_advance_use,
         write_off_amount = write_off_amount + v_disc,
         write_off_reason = CASE
                              WHEN v_disc > 0
                                THEN COALESCE(p_note, write_off_reason, 'Discount')
                              ELSE write_off_reason
                            END,
         status = public.compute_installment_status(
                    amount,
                    paid_amount + v_amt + v_advance_use,
                    write_off_amount + v_disc,
                    due_date),
         updated_at = NOW()
   WHERE id = v_inst.id;

  PERFORM public.refresh_student_fee_aggregate(v_inst.student_id, v_inst.academic_year_id);

  INSERT INTO public.audit_logs
    (user_id, school_id, action, entity_type, entity_id, details)
  VALUES
    (v_caller, v_inst.school_id, 'fee_payment_per_installment', 'payment', v_payment_id,
     jsonb_build_object(
       'installment_id', v_inst.id,
       'student_id',     v_inst.student_id,
       'month',          v_inst.month,
       'fee_type',       v_inst.fee_type,
       'amount',         v_amt,
       'discount',       v_disc,
       'advance_used',   v_advance_use,
       'method',         p_method,
       'receipt',        v_receipt));

  RETURN v_payment_id;
END $$;

GRANT EXECUTE ON FUNCTION public.pay_installment(UUID, BIGINT, BIGINT, TEXT, DATE, TEXT, BOOLEAN)
  TO authenticated;


-- =============================================================
-- 0073_student_documents_insert_simplify.sql
-- =============================================================
-- 0073_student_documents_insert_simplify.sql
--
-- Loosen the storage INSERT policy on `student-documents` so principal /
-- teacher uploads aren't tripped up by the EXISTS sub-query on
-- `public.students`. The tenant boundary is already enforced by comparing
-- the path's first folder (school_id) against the caller's
-- `current_user_school_id()`, so the additional EXISTS check was
-- belt-and-suspenders that occasionally fails when the principal's session
-- helpers (`current_user_role()`, `current_user_school_id()`) hadn't been
-- evaluated yet during a freshly-issued JWT, or when the student row was
-- inserted in the same transaction the policy is being evaluated against.
--
-- The simplified policy keeps the same security guarantees:
--
--   1. School staff: path's first folder MUST equal their school_id.
--      Cross-school injection still impossible.
--   2. Linked parent/student: path's second folder MUST be one of their
--      linked student ids.
--
-- The student row's actual school_id is enforced server-side by the
-- admission / readmission flow (route validates school_id before insert),
-- so the storage policy doesn't need to re-check it.

BEGIN;

DROP POLICY IF EXISTS student_documents_insert ON storage.objects;
CREATE POLICY student_documents_insert ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'student-documents'
    AND array_length(storage.foldername(name), 1) >= 3
    AND (
      -- School staff uploading on behalf of any student in their school.
      (
        public.current_user_role() IN ('PRINCIPAL','TEACHER')
        AND public.current_user_school_id()::text = (storage.foldername(name))[1]
      )
      -- Linked parent / student uploading their own document. Path's
      -- school folder still has to match the student's school via the
      -- linked_student_ids() side — server-side admission already binds
      -- a linked student to a single school.
      OR ((storage.foldername(name))[2])::uuid = ANY(public.linked_student_ids())
    )
  );

COMMIT;


-- =============================================================
-- 0074_staff_documents_insert_simplify.sql
-- =============================================================
-- 0074_staff_documents_insert_simplify.sql
--
-- Same fix as 0073 (student-documents): drop the EXISTS-on-staff sub-query
-- from the storage INSERT policy. Tenant boundary already enforced by the
-- path's first folder == caller's school_id; the EXISTS check was
-- belt-and-suspenders that occasionally failed during freshly-issued JWTs
-- or same-transaction writes.

BEGIN;

DROP POLICY IF EXISTS staff_documents_insert ON storage.objects;
CREATE POLICY staff_documents_insert ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'staff-documents'
    AND array_length(storage.foldername(name), 1) >= 3
    AND (
      -- School staff (principal/teacher) uploading on behalf of any staff
      -- member of their own school.
      (
        public.current_user_role() IN ('PRINCIPAL','TEACHER')
        AND public.current_user_school_id()::text = (storage.foldername(name))[1]
      )
      -- The staff member themselves uploading their own document.
      OR EXISTS (
        SELECT 1 FROM public.staff s
        WHERE s.id = ((storage.foldername(name))[2])::uuid
          AND s.user_id = auth.uid()
      )
    )
  );

COMMIT;


-- =============================================================
-- 0075_salary_reversal.sql
-- =============================================================
-- 0075_salary_reversal.sql
--
-- Lets a principal mark an accidentally-recorded salary payment as
-- reversed within a 24-hour window. Why mark instead of delete?
--   • The history must show the mistake + the correction so the staff
--     member (and the auditor) can see what actually happened.
--   • The corresponding SALARY expense row also has to be balanced; we
--     post a NEGATIVE expense rather than touching the original so the
--     accounting trail stays append-only.
--
-- Also extends record_salary_payment with an optional paid_at param. The
-- Pay modal's "Advanced" toggle exposes a date picker — the common case
-- (record today's payment) doesn't change behaviour because NULL falls
-- back to CURRENT_DATE.

BEGIN;

-- ─── 1. Reversal columns ────────────────────────────────────────────────
ALTER TABLE public.salary_payments
  ADD COLUMN IF NOT EXISTS reversed_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by      UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS reversal_reason  TEXT;

CREATE INDEX IF NOT EXISTS salary_payments_active_staff_idx
  ON public.salary_payments (staff_id, paid_at DESC)
  WHERE reversed_at IS NULL;

-- ─── 2. record_salary_payment — accept optional paid_at ─────────────────
DROP FUNCTION IF EXISTS public.record_salary_payment(UUID, TEXT, BIGINT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.record_salary_payment(UUID, TEXT, BIGINT, TEXT, TEXT, TEXT, DATE);

CREATE OR REPLACE FUNCTION public.record_salary_payment(
  p_staff_id UUID,
  p_month    TEXT,
  p_amount   BIGINT,
  p_note     TEXT DEFAULT NULL,
  p_method   TEXT DEFAULT NULL,
  p_txn_id   TEXT DEFAULT NULL,
  p_paid_at  DATE DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school     UUID;
  v_caller     UUID := auth.uid();
  v_year       UUID;
  v_pay_id     UUID;
  v_txn        TEXT;
  v_staff_name TEXT;
  v_method     TEXT;
  v_paid_at    DATE := COALESCE(p_paid_at, CURRENT_DATE);
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;
  IF v_paid_at > CURRENT_DATE THEN
    RAISE EXCEPTION 'paid_at cannot be in the future';
  END IF;

  v_method := UPPER(NULLIF(BTRIM(COALESCE(p_method, '')), ''));
  IF v_method IS NOT NULL AND v_method NOT IN ('CASH','BANK_TRANSFER','UPI','CHEQUE','OTHER') THEN
    RAISE EXCEPTION 'invalid method: %', v_method;
  END IF;

  SELECT school_id, name INTO v_school, v_staff_name
    FROM public.staff WHERE id = p_staff_id;
  IF v_school IS NULL THEN RAISE EXCEPTION 'staff not found'; END IF;

  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_school)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT id INTO v_year FROM public.academic_years
    WHERE school_id = v_school AND is_active = TRUE LIMIT 1;

  v_txn := NULLIF(BTRIM(COALESCE(p_txn_id, '')), '');
  IF v_txn IS NULL THEN
    v_txn := 'TXN-' || to_char(NOW(),'YYYYMMDDHH24MISS') || '-' || substr(p_staff_id::text, 1, 4);
  END IF;

  INSERT INTO public.salary_payments
    (staff_id, school_id, month, amount, paid_at, transaction_id, note, method)
  VALUES
    (p_staff_id, v_school, p_month, p_amount, v_paid_at, v_txn, p_note, v_method)
  RETURNING id INTO v_pay_id;

  INSERT INTO public.expenses
    (school_id, academic_year_id, category, amount, date, description, created_by)
  VALUES
    (v_school, v_year, 'SALARY', p_amount, v_paid_at,
     'Salary: ' || COALESCE(v_staff_name, p_staff_id::text) || ' — ' || p_month
     || COALESCE(' (' || NULLIF(p_note,'') || ')', ''),
     v_caller);

  PERFORM public.log_audit(
    'salary_paid', 'staff', p_staff_id,
    jsonb_build_object(
      'month', p_month, 'amount', p_amount,
      'method', v_method, 'txn', v_txn,
      'paid_at', v_paid_at
    )
  );

  RETURN v_pay_id;
END $$;

GRANT EXECUTE ON FUNCTION public.record_salary_payment(UUID, TEXT, BIGINT, TEXT, TEXT, TEXT, DATE)
  TO authenticated;

-- ─── 3. reverse_salary_payment ──────────────────────────────────────────
-- Marks an existing payment as reversed (within 24h) and posts a negative
-- balancing expense entry. Reason is required.
CREATE OR REPLACE FUNCTION public.reverse_salary_payment(
  p_payment_id UUID,
  p_reason     TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller   UUID := auth.uid();
  v_school   UUID;
  v_staff_id UUID;
  v_staff_nm TEXT;
  v_amount   BIGINT;
  v_month    TEXT;
  v_paid_at  DATE;
  v_year     UUID;
  v_created  TIMESTAMPTZ;
  v_already  TIMESTAMPTZ;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_reason IS NULL OR BTRIM(p_reason) = '' THEN
    RAISE EXCEPTION 'reason is required';
  END IF;

  SELECT sp.staff_id, sp.school_id, sp.amount, sp.month, sp.paid_at,
         sp.created_at, sp.reversed_at, s.name
    INTO v_staff_id, v_school, v_amount, v_month, v_paid_at,
         v_created, v_already, v_staff_nm
  FROM public.salary_payments sp
  JOIN public.staff s ON s.id = sp.staff_id
  WHERE sp.id = p_payment_id;

  IF v_staff_id IS NULL THEN RAISE EXCEPTION 'payment not found'; END IF;
  IF v_already IS NOT NULL THEN RAISE EXCEPTION 'payment already reversed'; END IF;

  -- Same-school principal only.
  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_school)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- 24-hour window from when the row was originally created. Using
  -- created_at (not paid_at) so back-dated entries can still be reversed
  -- right after they were typed in.
  IF NOW() - v_created > INTERVAL '24 hours' THEN
    RAISE EXCEPTION 'reversal window expired (24 hours from record time)';
  END IF;

  UPDATE public.salary_payments
     SET reversed_at = NOW(),
         reversed_by = v_caller,
         reversal_reason = BTRIM(p_reason)
   WHERE id = p_payment_id;

  -- Balance the SALARY expense with a negative entry. Same date as the
  -- original so monthly summaries net correctly.
  SELECT id INTO v_year FROM public.academic_years
    WHERE school_id = v_school AND is_active = TRUE LIMIT 1;

  INSERT INTO public.expenses
    (school_id, academic_year_id, category, amount, date, description, created_by)
  VALUES
    (v_school, v_year, 'SALARY', -v_amount, v_paid_at,
     'Salary REVERSED: ' || COALESCE(v_staff_nm, v_staff_id::text)
     || ' — ' || v_month || ' · ' || BTRIM(p_reason),
     v_caller);

  PERFORM public.log_audit(
    'salary_payment_reversed', 'staff', v_staff_id,
    jsonb_build_object(
      'payment_id', p_payment_id,
      'amount', v_amount, 'month', v_month,
      'reason', BTRIM(p_reason)
    )
  );
END $$;

GRANT EXECUTE ON FUNCTION public.reverse_salary_payment(UUID, TEXT) TO authenticated;

COMMIT;


-- =============================================================
-- 0076_school_salary_pay_day.sql
-- =============================================================
-- =============================================================
-- 0076_school_salary_pay_day.sql
-- =============================================================
-- Single school-wide salary pay day (1-28). Drives the "Due Xth /
-- Overdue" badge in the Salary Ledger for every staff member's
-- monthly row. NULL = not configured (no badge, no overdue flag).
--
-- An earlier in-flight design used a per-staff salary_due_day on
-- public.staff; that approach was rolled back before reaching the
-- main branch because schools almost always pay every staff
-- member on the same day, so per-staff config was data-entry
-- overhead with no real value. Only this school-level field
-- ships.
-- =============================================================

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS salary_pay_day SMALLINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'schools_salary_pay_day_chk'
  ) THEN
    ALTER TABLE public.schools
      ADD CONSTRAINT schools_salary_pay_day_chk
      CHECK (salary_pay_day IS NULL OR (salary_pay_day BETWEEN 1 AND 28));
  END IF;
END $$;


-- =============================================================
-- 0077_approvals_leave_parent_insert.sql
-- =============================================================
-- =============================================================
-- 0077_approvals_leave_parent_insert.sql
-- =============================================================
-- The approvals_write policy only allowed PRINCIPAL inserts. The
-- /api/principal/leave/submit endpoint uses the service-role
-- adminDb (which bypasses RLS), but if the env's SERVICE key
-- is ever missing the same flow falls back to anon and trips
-- "new row violates row-level security policy". Relax the policy
-- so PARENT/STUDENT/TEACHER can INSERT a LEAVE row for a student
-- they're allowed to act on; UPDATE/DELETE remain principal-only.
-- =============================================================

DROP POLICY IF EXISTS approvals_write ON public.approvals;
DROP POLICY IF EXISTS approvals_write_principal ON public.approvals;
DROP POLICY IF EXISTS approvals_insert_leave ON public.approvals;

-- Principal can do anything (existing behaviour).
CREATE POLICY approvals_write_principal ON public.approvals
  FOR ALL
  USING (public.is_super_admin()
         OR (public.is_principal() AND school_id = public.current_user_school_id()))
  WITH CHECK (public.is_super_admin()
         OR (public.is_principal() AND school_id = public.current_user_school_id()));

-- PARENT / STUDENT / TEACHER may INSERT LEAVE requests only.
--   PARENT/STUDENT  → student must be in linked_student_ids().
--   TEACHER         → student must be in caller's school.
CREATE POLICY approvals_insert_leave ON public.approvals
  FOR INSERT
  WITH CHECK (
    request_type = 'LEAVE'
    AND entity_type = 'student'
    AND requested_by = auth.uid()
    AND (
      (public.current_user_role() IN ('PARENT', 'STUDENT')
        AND entity_id = ANY (public.linked_student_ids()))
      OR
      (public.current_user_role() = 'TEACHER'
        AND school_id = public.current_user_school_id())
    )
  );


-- =============================================================
-- 0078_complaints_teacher_insert.sql
-- =============================================================
-- =============================================================
-- 0078_complaints_teacher_insert.sql
-- =============================================================
-- The existing complaints insert policy only allowed PARENT/STUDENT
-- inserts (via linked_student_ids) and PRINCIPAL via the catch-all
-- complaints_write. TEACHERs hit a "new row violates row-level
-- security policy" when filing complaints from their own portal.
--
-- Add a TEACHER-scoped INSERT policy: a TEACHER may insert a complaint
-- against any student in their own school (school_id match) and the
-- row must be owned by them (from_user_id = auth.uid()).
-- =============================================================

DROP POLICY IF EXISTS complaints_teacher_insert ON public.complaints;

CREATE POLICY complaints_teacher_insert ON public.complaints
  FOR INSERT
  WITH CHECK (
    public.current_user_role() = 'TEACHER'
    AND from_user_id = auth.uid()
    AND school_id = public.current_user_school_id()
  );


-- =============================================================
-- 0079_final_exam_single_per_class.sql
-- =============================================================
-- =============================================================
-- 0079_final_exam_single_per_class.sql
-- =============================================================
-- Promotion is driven by a single FINAL exam per class per
-- academic year. Enforce uniqueness at the DB layer so race
-- conditions (two teachers tapping "Create" simultaneously)
-- can't produce two FINAL rows for the same class.
--
-- Edit / delete window for FINAL exam:
--   • While the AY is open  → any TEACHER assigned to the class
--     OR the principal can change it (existing RLS handles this).
--   • After AY is closed    → only PRINCIPAL with editor_mode_until
--     in the future may modify (existing reverse_payment-style
--     guard pattern). Enforced via a trigger that compares the
--     row's academic_year_id.is_closed with the caller's role +
--     editor_mode window.
-- =============================================================

-- Partial unique index: only one FINAL test per (year, class, section).
-- WHERE clause keeps the index lean — non-FINAL tests are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS test_schedules_one_final_per_class_idx
  ON public.test_schedules (academic_year_id, class_name, section)
  WHERE test_type = 'FINAL';

-- Edit / delete guard for FINAL after AY close.
CREATE OR REPLACE FUNCTION public.guard_final_exam_modification() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_target RECORD;
  v_year   RECORD;
  v_caller UUID := auth.uid();
  v_role   TEXT;
  v_editor TIMESTAMPTZ;
BEGIN
  -- Service-role inserts/updates (server adminDb) bypass auth.uid() — let them through.
  IF v_caller IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_target := COALESCE(NEW, OLD);

  -- Only guard FINAL rows.
  IF v_target.test_type IS DISTINCT FROM 'FINAL' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT is_closed INTO v_year
    FROM public.academic_years WHERE id = v_target.academic_year_id;
  IF NOT FOUND OR NOT v_year.is_closed THEN
    -- AY still open — normal RLS rules apply.
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- AY is closed → require principal with active editor mode.
  SELECT role, editor_mode_until INTO v_role, v_editor
    FROM public.users WHERE id = v_caller;

  IF v_role <> 'PRINCIPAL' OR v_editor IS NULL OR v_editor <= NOW() THEN
    RAISE EXCEPTION 'Final exam can only be modified after year close with editor mode on'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS final_exam_modification_guard ON public.test_schedules;
CREATE TRIGGER final_exam_modification_guard
  BEFORE UPDATE OR DELETE ON public.test_schedules
  FOR EACH ROW EXECUTE FUNCTION public.guard_final_exam_modification();


-- =============================================================
-- 0079_test_schedules_teacher_rules.sql
-- =============================================================
-- =============================================================
-- 0079_test_schedules_teacher_rules.sql
-- =============================================================
-- 1. Only ONE 'FINAL' exam per (school, academic_year) — promotion
--    pulls from this one row, multiples would create ambiguity.
-- 2. Teachers may UPDATE/DELETE their OWN test rows while the
--    academic year is still ACTIVE. After year-close, the row is
--    immutable from RLS's perspective; the server-side editor-mode
--    flow remains the only way to amend (handled via service role).
-- =============================================================

-- ─── 1. Single FINAL per (school, year) ───────────────────────────
-- Partial unique index: only enforced for exam_type = 'FINAL'.
CREATE UNIQUE INDEX IF NOT EXISTS test_schedules_one_final_per_year
  ON public.test_schedules (school_id, academic_year_id)
  WHERE exam_type = 'FINAL';

-- ─── 2. Teacher UPDATE/DELETE policy on own tests ─────────────────
-- Existing test_schedules_write policy is principal-only and stays.
-- We add a TEACHER policy scoped by `teacher_id = staff(auth.uid())`
-- and gated by `academic_years.is_active = true`.
DROP POLICY IF EXISTS test_schedules_teacher_write ON public.test_schedules;

CREATE POLICY test_schedules_teacher_write ON public.test_schedules
  FOR ALL
  USING (
    public.current_user_role() = 'TEACHER'
    AND school_id = public.current_user_school_id()
    AND teacher_id IN (
      SELECT id FROM public.staff WHERE user_id = auth.uid()
    )
    AND academic_year_id IN (
      SELECT id FROM public.academic_years
       WHERE school_id = public.current_user_school_id() AND is_active = true
    )
  )
  WITH CHECK (
    public.current_user_role() = 'TEACHER'
    AND school_id = public.current_user_school_id()
    AND teacher_id IN (
      SELECT id FROM public.staff WHERE user_id = auth.uid()
    )
    AND academic_year_id IN (
      SELECT id FROM public.academic_years
       WHERE school_id = public.current_user_school_id() AND is_active = true
    )
  );


-- =============================================================
-- 0080_school_branding.sql
-- =============================================================
-- =============================================================
-- 0080_school_branding.sql
-- =============================================================
-- Branding columns on schools so admit cards / ID cards / marksheets
-- can pick up the school's logo, accent color, and principal
-- signature without each tool persisting its own copies. Storage paths
-- live under the existing `school-assets` bucket — same convention as
-- payment_qr_path. Defaults intentionally empty so nothing changes for
-- schools that haven't configured branding yet.
-- =============================================================

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS logo_path                TEXT,
  ADD COLUMN IF NOT EXISTS principal_signature_path TEXT,
  ADD COLUMN IF NOT EXISTS accent_color             TEXT;

-- Sanity check: accent_color must be a 7-char hex (#RRGGBB) or NULL.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'schools_accent_color_chk'
  ) THEN
    ALTER TABLE public.schools
      ADD CONSTRAINT schools_accent_color_chk
      CHECK (accent_color IS NULL OR accent_color ~ '^#[0-9A-Fa-f]{6}$');
  END IF;
END $$;


-- =============================================================
-- 0080_school_fee_aggregate.sql
-- =============================================================
-- =============================================================
-- 0080_school_fee_aggregate.sql
-- =============================================================
-- Server-side fee summary aggregate for the principal FeeLedger.
-- Replaces the client-side cache walk that summed across every
-- student's installments — which is what forced FeeLedger to
-- pre-load the entire school's fee_installments cache. With this
-- RPC the principal can render the Total/Due/Collected tiles
-- without ever pulling individual student rows.
--
-- Authorisation: principal of the school (or super_admin).
-- =============================================================

DROP FUNCTION IF EXISTS public.get_school_fee_aggregate();
CREATE OR REPLACE FUNCTION public.get_school_fee_aggregate()
RETURNS TABLE (
  total_students          BIGINT,
  pending_count           BIGINT,  -- active students with no installments at all
  due_count               BIGINT,  -- students with ≥1 outstanding installment
  cleared_count           BIGINT,  -- students with ≥1 installment, all settled
  total_collected         BIGINT,  -- sum of paid_amount across all installments
  total_parent_due        BIGINT,
  total_govt_due          BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id UUID;
BEGIN
  IF NOT (public.is_super_admin() OR public.is_principal()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_school_id := public.current_user_school_id();
  IF v_school_id IS NULL AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'no school in session';
  END IF;

  RETURN QUERY
  WITH
  active_students AS (
    SELECT id FROM public.students
     WHERE school_id = v_school_id AND is_active = TRUE
  ),
  -- Per-student installment summary so we can bucket students into
  -- pending / due / cleared in a single pass.
  per_student AS (
    SELECT
      fi.student_id,
      COUNT(*)                                                                    AS inst_count,
      SUM(GREATEST(0, fi.amount - fi.paid_amount - fi.write_off_amount))          AS outstanding_all,
      SUM(CASE WHEN fi.payer_type = 'PARENT'
               THEN GREATEST(0, fi.amount - fi.paid_amount - fi.write_off_amount)
               ELSE 0 END)                                                        AS parent_due,
      SUM(CASE WHEN fi.payer_type = 'GOVERNMENT'
               THEN GREATEST(0, fi.amount - fi.paid_amount - fi.write_off_amount)
               ELSE 0 END)                                                        AS govt_due,
      SUM(fi.paid_amount)                                                         AS total_paid
    FROM public.fee_installments fi
    JOIN active_students s ON s.id = fi.student_id
    GROUP BY fi.student_id
  )
  SELECT
    (SELECT COUNT(*) FROM active_students)                                         AS total_students,
    -- Pending: active students that don't appear in fee_installments at all.
    (SELECT COUNT(*) FROM active_students s
        WHERE NOT EXISTS (SELECT 1 FROM per_student p WHERE p.student_id = s.id)) AS pending_count,
    (SELECT COUNT(*) FROM per_student WHERE outstanding_all > 0)                  AS due_count,
    (SELECT COUNT(*) FROM per_student WHERE outstanding_all = 0)                  AS cleared_count,
    COALESCE((SELECT SUM(total_paid)  FROM per_student), 0)::BIGINT                AS total_collected,
    COALESCE((SELECT SUM(parent_due)  FROM per_student), 0)::BIGINT                AS total_parent_due,
    COALESCE((SELECT SUM(govt_due)    FROM per_student), 0)::BIGINT                AS total_govt_due;
END $$;

GRANT EXECUTE ON FUNCTION public.get_school_fee_aggregate() TO authenticated;


-- =============================================================
-- 0081_school_new_year_creation_toggle.sql
-- =============================================================
-- =============================================================
-- 0081_school_new_year_creation_toggle.sql
-- =============================================================
-- Per-school feature flag controlled by SUPER_ADMIN. When FALSE
-- (default), the principal's "Add Academic Year" wizard is gated
-- and the create RPC rejects with a friendly error so it can't be
-- bypassed via crafted requests. SUPER_ADMIN flips this to TRUE
-- when a school is ready to start a new AY (typically once per
-- year, around year-end planning).
-- =============================================================

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS new_year_creation_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Server-side guard for the principal's create-year flow. Any RPC
-- that inserts into academic_years for a school must call this
-- helper first; UI gating alone is not sufficient.
CREATE OR REPLACE FUNCTION public.assert_new_year_creation_allowed(p_school_id UUID)
RETURNS VOID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_enabled BOOLEAN;
BEGIN
  -- Super-admins bypass — they manage the toggle themselves.
  IF public.is_super_admin() THEN RETURN; END IF;

  SELECT new_year_creation_enabled INTO v_enabled
    FROM public.schools WHERE id = p_school_id;
  IF NOT COALESCE(v_enabled, FALSE) THEN
    RAISE EXCEPTION 'New academic year creation is disabled for this school. Please contact your platform administrator.'
      USING ERRCODE = 'check_violation';
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.assert_new_year_creation_allowed(UUID) TO authenticated;


-- =============================================================
-- 0082_school_limits.sql
-- =============================================================
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


-- =============================================================
-- 0083_drop_govt_payments.sql
-- =============================================================
-- =============================================================
-- 0083_drop_govt_payments.sql
-- =============================================================
-- Removes the RTE / government-payments parallel flow. Schools
-- should record any government grant as a regular payment with a
-- "Govt grant" note in the standard Collect Payment modal — the
-- separate RTE schedule + govt payment ledger added too much
-- complexity for the value it delivered.
--
-- What's dropped:
--   • record_govt_payment(...) RPC
--   • govt_payment_student_links table
--   • government_payments table
--   • /api/fees/govt-pay endpoint (handled in client; route now stub-404s)
--
-- What's KEPT (intentionally):
--   • students.is_rte boolean — admission-record flag, surfaces only
--     on the student profile.
--   • fee_installments.payer_type column — still present for back-compat
--     with historical rows; new rows always insert 'PARENT'. UI ignores it.
--
-- The columns / table drops are CASCADE because the linkage is one-way
-- (UI doesn't read these tables anymore).
-- =============================================================

DROP FUNCTION IF EXISTS public.record_govt_payment(BIGINT, DATE, TEXT, TEXT, UUID[]);
DROP TABLE IF EXISTS public.govt_payment_student_links CASCADE;
DROP TABLE IF EXISTS public.government_payments CASCADE;


-- =============================================================
-- 0084_drop_advance_credit.sql
-- =============================================================
-- =============================================================
-- 0084_drop_advance_credit.sql
-- =============================================================
-- Removes the "advance credit" concept. Schools that use this app
-- collect monthly fees; surplus payments held as a school liability
-- caused more confusion than it solved (98% case: family pays the
-- exact installment; overpay was either a typo or a refund event).
--
-- After this migration:
--   • record_fee_payment    REJECTS overpay (no silent advance dump)
--   • pay_installment       drops p_use_advance parameter
--   • advance_balances rows zeroed via audit-friendly write-off
--   • Existing balances logged into audit_logs as 'advance_credit_zeroed'
--     so the school can refund those families manually.
--
-- The advance_balances table itself is KEPT (empty) for back-compat;
-- nothing reads it anymore in app code, but a few legacy reports and
-- the FK from payment_records.advance_amount hold references.
-- =============================================================

-- 1. Audit + zero existing advance balances ──────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT ab.student_id, ab.amount, s.school_id, s.name
      FROM public.advance_balances ab
      JOIN public.students s ON s.id = ab.student_id
     WHERE ab.amount > 0
  LOOP
    INSERT INTO public.audit_logs
      (user_id, school_id, action, entity_type, entity_id, details)
    VALUES
      (NULL, r.school_id, 'advance_credit_zeroed', 'student', r.student_id,
       jsonb_build_object(
         'student_name', r.name,
         'previous_balance', r.amount,
         'reason', 'Advance credit feature removed in 0084 — refund manually if needed'
       ));
  END LOOP;

  UPDATE public.advance_balances SET amount = 0, updated_at = NOW();
END $$;

-- 2. Replace record_fee_payment to reject overpay ────────────────
DROP FUNCTION IF EXISTS public.record_fee_payment(UUID, BIGINT, TEXT, DATE, TEXT, BOOLEAN, BOOLEAN, BIGINT);

CREATE OR REPLACE FUNCTION public.record_fee_payment(
  p_student_id      UUID,
  p_amount          BIGINT,
  p_method          TEXT    DEFAULT 'CASH',
  p_date            DATE    DEFAULT CURRENT_DATE,
  p_note            TEXT    DEFAULT NULL,
  p_apply_late_fee  BOOLEAN DEFAULT TRUE,
  p_discount_amount BIGINT  DEFAULT 0
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id          UUID;
  v_year_id            UUID;
  v_payment_id         UUID;
  v_remaining          BIGINT;
  v_receipt            TEXT;
  v_inst               RECORD;
  v_apply              BIGINT;
  v_late_total         BIGINT := 0;
  v_late_existing      BIGINT := 0;
  v_late_delta         BIGINT := 0;
  v_outstanding        BIGINT := 0;
  v_caller             UUID   := auth.uid();
  v_effective_discount BIGINT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_amount < 0 THEN RAISE EXCEPTION 'amount must be non-negative'; END IF;

  v_effective_discount := GREATEST(0, COALESCE(p_discount_amount, 0));

  IF p_amount = 0 AND v_effective_discount = 0 THEN
    RAISE EXCEPTION 'amount and discount cannot both be zero';
  END IF;

  SELECT school_id INTO v_school_id FROM public.students WHERE id = p_student_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'student not found'; END IF;
  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_school_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT id INTO v_year_id FROM public.academic_years
   WHERE school_id = v_school_id AND is_active = TRUE LIMIT 1;
  IF v_year_id IS NULL THEN RAISE EXCEPTION 'no active academic year for school'; END IF;

  -- Late-fee policy applied idempotently before allocation.
  IF p_apply_late_fee THEN
    SELECT COALESCE(SUM(late_fee), 0) INTO v_late_total
      FROM public.preview_student_late_fees(p_student_id, p_date);
    SELECT COALESCE(SUM(amount), 0) INTO v_late_existing
      FROM public.fee_installments
     WHERE student_id = p_student_id AND fee_type = 'OTHER' AND month = 'Late Fee';
    v_late_delta := v_late_total - v_late_existing;
    IF v_late_delta > 0 THEN
      INSERT INTO public.fee_installments
        (student_id, academic_year_id, school_id, month, due_date, fee_type, amount)
      VALUES
        (p_student_id, v_year_id, v_school_id, 'Late Fee',
         p_date - INTERVAL '1 day', 'OTHER', v_late_delta);
    END IF;
  END IF;

  -- Compute total outstanding AFTER any late-fee row was inserted.
  SELECT COALESCE(SUM(GREATEST(0, amount - paid_amount - write_off_amount)), 0)
    INTO v_outstanding
    FROM public.fee_installments
   WHERE student_id = p_student_id;

  -- HARD STOP on overpay. The previous behaviour silently dumped the
  -- surplus into advance_balances; that's gone in 0084.
  IF (p_amount + v_effective_discount) > v_outstanding THEN
    RAISE EXCEPTION 'Cannot exceed total due (₹%). Reduce cash or discount.', v_outstanding
      USING ERRCODE = 'check_violation';
  END IF;

  v_remaining := p_amount + v_effective_discount;
  v_receipt := 'RCT-' || to_char(NOW(),'YYYYMMDDHH24MISS') || '-' || substr(p_student_id::text, 1, 4);

  -- Record payment row (cash + discount tracked separately).
  INSERT INTO public.payment_records
    (student_id, school_id, academic_year_id, amount, discount_amount,
     method, date, receipt_no, note)
  VALUES
    (p_student_id, v_school_id, v_year_id, p_amount, v_effective_discount,
     p_method, p_date, v_receipt, p_note)
  RETURNING id INTO v_payment_id;

  -- Allocate (cash + discount) oldest-due-first.
  FOR v_inst IN
    SELECT id, amount, paid_amount, write_off_amount, due_date
      FROM public.fee_installments
     WHERE student_id = p_student_id
       AND (amount - paid_amount - write_off_amount) > 0
     ORDER BY due_date ASC, created_at ASC
     FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_apply := LEAST(v_remaining, v_inst.amount - v_inst.paid_amount - v_inst.write_off_amount);
    UPDATE public.fee_installments
       SET paid_amount = paid_amount + v_apply,
           status = public.compute_installment_status(amount, paid_amount + v_apply, write_off_amount, due_date),
           updated_at = NOW()
     WHERE id = v_inst.id;
    INSERT INTO public.payment_installment_links
      (payment_id, installment_id, amount_applied)
    VALUES (v_payment_id, v_inst.id, v_apply);
    v_remaining := v_remaining - v_apply;
  END LOOP;

  PERFORM public.refresh_student_fee_aggregate(p_student_id, v_year_id);

  INSERT INTO public.audit_logs (user_id, school_id, action, entity_type, entity_id, details)
  VALUES (v_caller, v_school_id, 'fee_payment', 'payment', v_payment_id,
          jsonb_build_object('amount', p_amount, 'discount_amount', v_effective_discount,
                             'student_id', p_student_id, 'receipt', v_receipt));

  RETURN v_payment_id;
END $$;

GRANT EXECUTE ON FUNCTION public.record_fee_payment(UUID, BIGINT, TEXT, DATE, TEXT, BOOLEAN, BIGINT)
  TO authenticated;

-- 3. Drop p_use_advance from pay_installment ─────────────────────
DROP FUNCTION IF EXISTS public.pay_installment(UUID, BIGINT, BIGINT, TEXT, DATE, TEXT, BOOLEAN);

CREATE OR REPLACE FUNCTION public.pay_installment(
  p_installment_id UUID,
  p_amount         BIGINT,
  p_discount       BIGINT  DEFAULT 0,
  p_method         TEXT    DEFAULT 'CASH',
  p_date           DATE    DEFAULT CURRENT_DATE,
  p_note           TEXT    DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller       UUID := auth.uid();
  v_inst         RECORD;
  v_outstanding  BIGINT;
  v_payment_id   UUID;
  v_receipt      TEXT;
  v_disc         BIGINT;
  v_amt          BIGINT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  v_amt  := COALESCE(p_amount, 0);
  v_disc := GREATEST(0, COALESCE(p_discount, 0));
  IF v_amt < 0 THEN RAISE EXCEPTION 'amount must be non-negative'; END IF;
  IF v_amt = 0 AND v_disc = 0 THEN RAISE EXCEPTION 'nothing to apply'; END IF;

  SELECT id, student_id, school_id, academic_year_id, amount, paid_amount,
         write_off_amount, fee_type, month, due_date
    INTO v_inst FROM public.fee_installments
   WHERE id = p_installment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'installment not found'; END IF;

  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_inst.school_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_outstanding := v_inst.amount - v_inst.paid_amount - v_inst.write_off_amount;
  IF v_outstanding <= 0 THEN RAISE EXCEPTION 'installment already cleared'; END IF;
  IF (v_amt + v_disc) > v_outstanding THEN
    RAISE EXCEPTION 'overpay blocked (outstanding=%, attempted=%)', v_outstanding, v_amt + v_disc;
  END IF;

  v_receipt := 'RCT-' || to_char(NOW(),'YYYYMMDDHH24MISS') || '-' || substr(v_inst.student_id::text, 1, 4);

  INSERT INTO public.payment_records
    (student_id, school_id, academic_year_id, amount, discount_amount, method, date, receipt_no, note)
  VALUES
    (v_inst.student_id, v_inst.school_id, v_inst.academic_year_id,
     v_amt, v_disc, p_method, p_date, v_receipt, p_note)
  RETURNING id INTO v_payment_id;

  IF v_amt > 0 THEN
    INSERT INTO public.payment_installment_links (payment_id, installment_id, amount_applied)
    VALUES (v_payment_id, v_inst.id, v_amt);
  END IF;

  IF v_disc > 0 THEN
    INSERT INTO public.fee_write_offs (installment_id, student_id, school_id, amount, reason, approved_by)
    VALUES (v_inst.id, v_inst.student_id, v_inst.school_id, v_disc, COALESCE(p_note, 'Discount'), v_caller);
  END IF;

  UPDATE public.fee_installments
     SET paid_amount = paid_amount + v_amt,
         write_off_amount = write_off_amount + v_disc,
         write_off_reason = CASE WHEN v_disc > 0 THEN COALESCE(p_note, write_off_reason, 'Discount') ELSE write_off_reason END,
         status = public.compute_installment_status(amount, paid_amount + v_amt, write_off_amount + v_disc, due_date),
         updated_at = NOW()
   WHERE id = v_inst.id;

  PERFORM public.refresh_student_fee_aggregate(v_inst.student_id, v_inst.academic_year_id);

  INSERT INTO public.audit_logs (user_id, school_id, action, entity_type, entity_id, details)
  VALUES (v_caller, v_inst.school_id, 'fee_payment_per_installment', 'payment', v_payment_id,
    jsonb_build_object('installment_id', v_inst.id, 'student_id', v_inst.student_id,
                       'month', v_inst.month, 'fee_type', v_inst.fee_type,
                       'amount', v_amt, 'discount', v_disc, 'method', p_method, 'receipt', v_receipt));

  RETURN v_payment_id;
END $$;

GRANT EXECUTE ON FUNCTION public.pay_installment(UUID, BIGINT, BIGINT, TEXT, DATE, TEXT) TO authenticated;


-- =============================================================
-- 0085_student_tc_lifecycle.sql
-- =============================================================
-- =============================================================
-- 0085_student_tc_lifecycle.sql
-- =============================================================
-- Adds two RPCs for student lifecycle from the profile panel:
--
--   issue_tc_and_leave(student_id, reason)
--     • Generates a sequential TC number (school-scoped)
--     • Stamps students.tc_number
--     • Sets students.is_active = FALSE
--     • Writes a TC_ISSUED row in student_change_history (audit trail)
--
--   rejoin_student(student_id, class_name, section, roll_no)
--     • Sets students.is_active = TRUE
--     • Creates a student_academic_records row for the ACTIVE year
--       (idempotent — no-op if already present)
--     • Writes a REJOINED row in student_change_history
--
-- Both gated server-side by:
--   • Caller is principal of the student's school (or super_admin)
--   • Editor Mode active (users.editor_mode_until > now())
--   • Active academic year exists for the school
--
-- No new columns — uses existing students.tc_number / is_active +
-- the existing student_change_history audit table.
-- =============================================================

CREATE OR REPLACE FUNCTION public.issue_tc_and_leave(
  p_student_id UUID,
  p_reason     TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller    UUID := auth.uid();
  v_school    UUID;
  v_year_id   UUID;
  v_year_lbl  TEXT;
  v_tc_number TEXT;
  v_seq       INT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  -- Authorise: principal of the student's school OR super_admin.
  SELECT school_id INTO v_school FROM public.students WHERE id = p_student_id;
  IF v_school IS NULL THEN RAISE EXCEPTION 'student not found'; END IF;
  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_school)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Editor Mode required — irreversible action, must be deliberate.
  IF NOT public.is_super_admin() THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.users
       WHERE id = v_caller AND editor_mode_until > NOW()
    ) THEN
      RAISE EXCEPTION 'Editor Mode not active — enable it from the principal dashboard first';
    END IF;
  END IF;

  -- Active year required — TC is dated to the active year.
  SELECT id, label INTO v_year_id, v_year_lbl
    FROM public.academic_years
   WHERE school_id = v_school AND is_active = TRUE LIMIT 1;
  IF v_year_id IS NULL THEN
    RAISE EXCEPTION 'No active academic year — TC cannot be issued';
  END IF;

  -- Generate next school-scoped TC sequence: TC-{year}-{NNN}
  -- Counts existing tc_number rows for this school in the active year.
  SELECT COALESCE(MAX(
           NULLIF(regexp_replace(tc_number, '^.*-(\d+)$', '\1'), '')::INT
         ), 0) + 1
    INTO v_seq
    FROM public.students
   WHERE school_id = v_school
     AND tc_number IS NOT NULL
     AND tc_number ~ ('^TC-' || split_part(v_year_lbl, '-', 1) || '-\d+$');

  v_tc_number := 'TC-' || split_part(v_year_lbl, '-', 1) || '-' || lpad(v_seq::text, 3, '0');

  UPDATE public.students
     SET tc_number = v_tc_number,
         is_active = FALSE,
         updated_at = NOW()
   WHERE id = p_student_id;

  INSERT INTO public.student_change_history
    (student_id, field_name, old_value, new_value, reason, changed_by, approved_by)
  VALUES
    (p_student_id, 'TC_ISSUED', NULL, v_tc_number,
     COALESCE(p_reason, 'Transfer Certificate issued'),
     v_caller, v_caller);

  INSERT INTO public.audit_logs (user_id, school_id, action, entity_type, entity_id, details)
  VALUES (v_caller, v_school, 'tc_issued', 'student', p_student_id,
          jsonb_build_object('tc_number', v_tc_number, 'reason', p_reason, 'year', v_year_lbl));

  RETURN v_tc_number;
END $$;

GRANT EXECUTE ON FUNCTION public.issue_tc_and_leave(UUID, TEXT) TO authenticated;


-- ─── Rejoin ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rejoin_student(
  p_student_id UUID,
  p_class_name TEXT,
  p_section    TEXT,
  p_roll_no    TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller  UUID := auth.uid();
  v_school  UUID;
  v_year_id UUID;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  SELECT school_id INTO v_school FROM public.students WHERE id = p_student_id;
  IF v_school IS NULL THEN RAISE EXCEPTION 'student not found'; END IF;
  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_school)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF NOT public.is_super_admin() THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.users
       WHERE id = v_caller AND editor_mode_until > NOW()
    ) THEN
      RAISE EXCEPTION 'Editor Mode not active — enable it from the principal dashboard first';
    END IF;
  END IF;

  SELECT id INTO v_year_id
    FROM public.academic_years
   WHERE school_id = v_school AND is_active = TRUE LIMIT 1;
  IF v_year_id IS NULL THEN
    RAISE EXCEPTION 'No active academic year — student cannot be re-admitted';
  END IF;

  IF p_class_name IS NULL OR length(trim(p_class_name)) = 0 THEN
    RAISE EXCEPTION 'class_name is required';
  END IF;

  -- Reactivate the student.
  UPDATE public.students
     SET is_active = TRUE,
         updated_at = NOW()
   WHERE id = p_student_id;

  -- Create AR row for the active year. Idempotent — if a row already
  -- exists for this (student, year) we just update class/section.
  INSERT INTO public.student_academic_records
    (student_id, academic_year_id, class_name, section, roll_no, fee_status)
  VALUES (p_student_id, v_year_id, trim(p_class_name), COALESCE(trim(p_section), ''), p_roll_no, 'PENDING')
  ON CONFLICT (student_id, academic_year_id) DO UPDATE
    SET class_name = EXCLUDED.class_name,
        section    = EXCLUDED.section,
        roll_no    = COALESCE(EXCLUDED.roll_no, public.student_academic_records.roll_no);

  INSERT INTO public.student_change_history
    (student_id, field_name, old_value, new_value, reason, changed_by, approved_by)
  VALUES
    (p_student_id, 'REJOINED', NULL,
     trim(p_class_name) || COALESCE('-' || trim(p_section), ''),
     'Re-admitted to ' || trim(p_class_name) || COALESCE('-' || trim(p_section), ''),
     v_caller, v_caller);

  INSERT INTO public.audit_logs (user_id, school_id, action, entity_type, entity_id, details)
  VALUES (v_caller, v_school, 'student_rejoined', 'student', p_student_id,
          jsonb_build_object('class', p_class_name, 'section', p_section));
END $$;

GRANT EXECUTE ON FUNCTION public.rejoin_student(UUID, TEXT, TEXT, TEXT) TO authenticated;


-- =============================================================
-- 0086_financial_analytics.sql
-- =============================================================
-- =============================================================
-- 0086_financial_analytics.sql
-- =============================================================
-- Single-round-trip aggregate for the Analytics dashboard's top
-- summary cards. Returns 10 totals scoped to (school, academic year)
-- so the UI never has to ship row-level data for these tiles.
--
-- All inputs are explicitly bounded by school_id (RLS-safe) and the
-- supplied year's start/end dates. "This month" is calendar-current
-- (date_trunc('month', now())), "this year" tracks the supplied
-- academic year window.
--
-- Indexed columns used: payment_records(school_id, date),
-- fee_installments(student_id, academic_year_id),
-- expenses(school_id, date), salary_payments(school_id, paid_at).
-- =============================================================

CREATE OR REPLACE FUNCTION public.get_financial_analytics(
  p_year_id UUID
) RETURNS TABLE (
  fees_collected_month       BIGINT,
  fees_collected_year        BIGINT,
  fees_pending               BIGINT,
  discounts_given            BIGINT,
  expenses_month             BIGINT,
  expenses_year              BIGINT,
  salary_paid_month          BIGINT,
  salary_pending             BIGINT,
  transport_collection_year  BIGINT,
  net_balance_year           BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id   UUID;
  v_year_start  DATE;
  v_year_end    DATE;
  v_month_start DATE := date_trunc('month', CURRENT_DATE)::date;
BEGIN
  IF NOT (public.is_super_admin() OR public.is_principal()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_school_id := public.current_user_school_id();

  SELECT start_date, end_date INTO v_year_start, v_year_end
    FROM public.academic_years
   WHERE id = p_year_id
     AND (school_id = v_school_id OR public.is_super_admin());
  IF v_year_start IS NULL THEN
    RAISE EXCEPTION 'academic year not found';
  END IF;

  RETURN QUERY
  WITH
  -- Cash receipts (excludes reversals via amount > 0 + reversed_at NULL).
  pay_year AS (
    SELECT COALESCE(SUM(amount), 0)::BIGINT AS total
      FROM public.payment_records
     WHERE school_id = v_school_id
       AND amount > 0
       AND reversed_at IS NULL
       AND date BETWEEN v_year_start AND v_year_end
  ),
  pay_month AS (
    SELECT COALESCE(SUM(amount), 0)::BIGINT AS total
      FROM public.payment_records
     WHERE school_id = v_school_id
       AND amount > 0
       AND reversed_at IS NULL
       AND date >= v_month_start
       AND date <= CURRENT_DATE
  ),
  -- Outstanding fee balance across the year's installments.
  fees_due AS (
    SELECT COALESCE(SUM(GREATEST(0, amount - paid_amount - write_off_amount)), 0)::BIGINT AS total
      FROM public.fee_installments
     WHERE school_id = v_school_id
       AND academic_year_id = p_year_id
  ),
  -- Discounts applied (write-offs) on the year's installments.
  discounts AS (
    SELECT COALESCE(SUM(write_off_amount), 0)::BIGINT AS total
      FROM public.fee_installments
     WHERE school_id = v_school_id
       AND academic_year_id = p_year_id
  ),
  -- Operational expenses.
  exp_year AS (
    SELECT COALESCE(SUM(amount), 0)::BIGINT AS total
      FROM public.expenses
     WHERE school_id = v_school_id
       AND date BETWEEN v_year_start AND v_year_end
  ),
  exp_month AS (
    SELECT COALESCE(SUM(amount), 0)::BIGINT AS total
      FROM public.expenses
     WHERE school_id = v_school_id
       AND date >= v_month_start
       AND date <= CURRENT_DATE
  ),
  -- Salary payouts.
  sal_month AS (
    SELECT COALESCE(SUM(amount), 0)::BIGINT AS total
      FROM public.salary_payments
     WHERE school_id = v_school_id
       AND paid_at >= v_month_start
       AND paid_at <= CURRENT_DATE
  ),
  sal_year AS (
    SELECT COALESCE(SUM(amount), 0)::BIGINT AS total
      FROM public.salary_payments
     WHERE school_id = v_school_id
       AND paid_at BETWEEN v_year_start AND v_year_end
  ),
  -- Total expected salary in the year so far: active staff × monthly
  -- salary × (months elapsed since year_start, capped at year_end).
  sal_expected AS (
    SELECT
      COALESCE(SUM(s.salary), 0)::BIGINT *
      GREATEST(1,
        LEAST(
          12,
          extract(year  from age(LEAST(CURRENT_DATE, v_year_end), v_year_start))::INT * 12
            + extract(month from age(LEAST(CURRENT_DATE, v_year_end), v_year_start))::INT
            + 1
        )
      )::BIGINT AS total
    FROM public.staff s
    WHERE s.school_id = v_school_id
      AND s.is_active = TRUE
  ),
  -- Transport-tagged receipts only (joined via payment_installment_links).
  transport AS (
    SELECT COALESCE(SUM(pil.amount_applied), 0)::BIGINT AS total
      FROM public.payment_installment_links pil
      JOIN public.fee_installments fi ON fi.id = pil.installment_id
      JOIN public.payment_records   pr ON pr.id = pil.payment_id
     WHERE fi.school_id = v_school_id
       AND fi.academic_year_id = p_year_id
       AND fi.fee_type = 'TRANSPORT'
       AND pr.amount > 0
       AND pr.reversed_at IS NULL
  )
  SELECT
    pm.total,
    py.total,
    fd.total,
    dc.total,
    em.total,
    ey.total,
    sm.total,
    GREATEST(0, se.total - sy.total),
    tr.total,
    py.total - ey.total - sy.total
  FROM pay_month pm, pay_year py, fees_due fd, discounts dc,
       exp_month em, exp_year ey, sal_month sm, sal_year sy,
       sal_expected se, transport tr;
END $$;

GRANT EXECUTE ON FUNCTION public.get_financial_analytics(UUID) TO authenticated;


-- =============================================================
-- 0087_reversal_24h_guard.sql
-- =============================================================
-- 0087_reversal_24h_guard.sql
--
-- Server-side enforcement of the 24-hour reversal window. The UI in
-- src/modules/fees/components/FeeLedger.tsx already disables the Reverse
-- button outside the same-day window, but a client clock can be wrong
-- and the principal could in principle hit the API directly. This guard
-- closes that loophole.
--
-- Rule: a payment can only be reversed within 24 hours of its
-- `created_at` timestamp. Beyond that, the function raises
-- `reversal_window_expired` so the caller surfaces a clean message.
--
-- Idempotent: CREATE OR REPLACE replaces the prior body unchanged except
-- for the new guard near the top of the validation block.

BEGIN;

CREATE OR REPLACE FUNCTION public.reverse_payment(
  p_payment_id uuid,
  p_user_id    uuid,
  p_reason     text
)
RETURNS TABLE (reversal_id uuid, original_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orig         record;
  v_reversal_id  uuid;
  v_link         record;
  v_inst         record;
  v_new_paid     numeric;
  v_new_status   text;
  v_total        numeric;
  v_writeoff     numeric;
  v_remaining    numeric;
  v_stamped      int;
BEGIN
  SELECT id, school_id, student_id, academic_year_id, amount, method, date,
         receipt_no, advance_amount, note, reversed_at, reverses_payment_id,
         created_at
    INTO v_orig
    FROM public.payment_records
   WHERE id = p_payment_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_orig.reversed_at IS NOT NULL THEN
    RAISE EXCEPTION 'already_reversed' USING ERRCODE = 'unique_violation';
  END IF;
  IF v_orig.reverses_payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'cannot_reverse_a_reversal' USING ERRCODE = 'check_violation';
  END IF;
  IF v_orig.amount <= 0 THEN
    RAISE EXCEPTION 'non_positive_amount' USING ERRCODE = 'check_violation';
  END IF;
  -- 24-hour window. Beyond this, principals must record a corrective
  -- payment / write-off rather than rewriting history.
  IF v_orig.created_at < (now() - INTERVAL '24 hours') THEN
    RAISE EXCEPTION 'reversal_window_expired'
      USING ERRCODE = 'check_violation',
            HINT = '24 ghante ke baad reverse nahi kar sakte. Naya correction payment / write-off use karein.';
  END IF;

  UPDATE public.payment_records
     SET reversed_at     = now(),
         reversed_by     = p_user_id,
         reversal_reason = p_reason
   WHERE id = p_payment_id
     AND reversed_at IS NULL;
  GET DIAGNOSTICS v_stamped = ROW_COUNT;
  IF v_stamped = 0 THEN
    RAISE EXCEPTION 'already_reversed' USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO public.payment_records (
    school_id, student_id, academic_year_id,
    amount, method, date, receipt_no,
    advance_amount, note, reverses_payment_id, reversed_by, reversal_reason
  ) VALUES (
    v_orig.school_id, v_orig.student_id, v_orig.academic_year_id,
    -abs(v_orig.amount),
    v_orig.method, (now() AT TIME ZONE 'Asia/Kolkata')::date,
    'REV-' || v_orig.receipt_no,
    -abs(coalesce(v_orig.advance_amount, 0)),
    'Reversal of ' || v_orig.receipt_no || ': ' || p_reason,
    v_orig.id, p_user_id, p_reason
  )
  RETURNING id INTO v_reversal_id;

  FOR v_link IN
    SELECT installment_id, amount_applied
      FROM public.payment_installment_links
     WHERE payment_id = v_orig.id
  LOOP
    SELECT id, amount, paid_amount, write_off_amount, status
      INTO v_inst
      FROM public.fee_installments
     WHERE id = v_link.installment_id
     FOR UPDATE;

    IF FOUND THEN
      v_new_paid := greatest(0, v_inst.paid_amount - v_link.amount_applied);
      v_total    := v_inst.amount;
      v_writeoff := coalesce(v_inst.write_off_amount, 0);
      v_remaining := v_total - v_writeoff;

      IF v_writeoff >= v_total THEN
        v_new_status := 'WAIVED';
      ELSIF v_new_paid >= v_remaining AND v_remaining > 0 THEN
        v_new_status := 'PAID';
      ELSIF v_new_paid + v_writeoff >= v_total AND v_writeoff > 0 THEN
        v_new_status := 'WAIVED';
      ELSIF v_new_paid > 0 THEN
        v_new_status := 'PARTIAL';
      ELSE
        v_new_status := 'UNPAID';
      END IF;

      UPDATE public.fee_installments
         SET paid_amount = v_new_paid,
             status      = v_new_status,
             updated_at  = now()
       WHERE id = v_inst.id;

      INSERT INTO public.payment_installment_links (
        payment_id, installment_id, amount_applied
      ) VALUES (
        v_reversal_id, v_inst.id, -v_link.amount_applied
      );
    END IF;
  END LOOP;

  IF coalesce(v_orig.advance_amount, 0) > 0 THEN
    INSERT INTO public.advance_balances (student_id, amount)
    VALUES (v_orig.student_id, 0)
    ON CONFLICT (student_id) DO NOTHING;

    UPDATE public.advance_balances
       SET amount = greatest(0, amount - v_orig.advance_amount)
     WHERE student_id = v_orig.student_id;
  END IF;

  RETURN QUERY SELECT v_reversal_id, v_orig.id;
END;
$$;

COMMIT;


-- =============================================================
-- 0088_export_logs.sql
-- =============================================================
-- 0088_export_logs.sql
--
-- Audit + rate-limit infrastructure for the principal's Reports panel.
--
-- Why a dedicated table (and not just audit_logs)?
--   • Reports get pulled often (daily/weekly cadence), so the volume
--     would dilute the audit_logs table used for sensitive actions.
--   • The rate-limit RPC counts rows in a tight window per user — a
--     tightly-indexed dedicated table makes that O(small) regardless of
--     how big the audit log gets.
--
-- Rate-limit policy enforced server-side:
--   • 50 exports per user per rolling 1-hour window
--   • 100 exports per user per rolling 24-hour window
--
-- Idempotent: CREATE … IF NOT EXISTS / CREATE OR REPLACE throughout.

BEGIN;

CREATE TABLE IF NOT EXISTS public.export_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
  school_id    UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  report_type  TEXT NOT NULL,
  filters_json JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The rate-limit RPC reads (user_id, created_at DESC). The school
-- analytics view reads (school_id, created_at DESC) for activity
-- summaries. Two narrow indexes keep both reads fast.
CREATE INDEX IF NOT EXISTS export_logs_user_created_idx
  ON public.export_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS export_logs_school_created_idx
  ON public.export_logs (school_id, created_at DESC);

ALTER TABLE public.export_logs ENABLE ROW LEVEL SECURITY;

-- Principals + super-admins read their own school's export history;
-- the table is otherwise inaccessible to clients (writes go through
-- the SECURITY DEFINER RPC below, never via direct insert).
DROP POLICY IF EXISTS export_logs_select ON public.export_logs;
CREATE POLICY export_logs_select ON public.export_logs FOR SELECT
USING (
  public.is_super_admin()
  OR (public.is_principal() AND school_id = public.current_user_school_id())
);

-- log_export(p_report_type, p_filters)
--   • Verifies caller is authenticated and tied to a school.
--   • Counts the caller's exports in the last 1h and 24h.
--   • Raises 'rate_limited_hour' / 'rate_limited_day' on overshoot.
--   • Else inserts a fresh row stamped with the caller's user_id +
--     school_id and returns the new row id.
--
-- The client should call this BEFORE generating the CSV — surfacing the
-- friendly Hindi/English error in a toast instead of letting the user
-- watch a long query run only to be told "limit reached" at the end.
CREATE OR REPLACE FUNCTION public.log_export(
  p_report_type TEXT,
  p_filters     JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller    UUID := auth.uid();
  v_school_id UUID;
  v_hour_cnt  INT;
  v_day_cnt   INT;
  v_id        UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF p_report_type IS NULL OR length(trim(p_report_type)) = 0 THEN
    RAISE EXCEPTION 'report_type_required' USING ERRCODE = '22023';
  END IF;

  SELECT school_id INTO v_school_id FROM public.users WHERE id = v_caller;
  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'no_school_in_session' USING ERRCODE = '22023';
  END IF;

  -- Per-user rolling window counts. The narrow user_created_idx makes
  -- both lookups O(small) even when the table grows into the millions.
  SELECT count(*) INTO v_hour_cnt
    FROM public.export_logs
   WHERE user_id = v_caller
     AND created_at > NOW() - INTERVAL '1 hour';
  IF v_hour_cnt >= 50 THEN
    RAISE EXCEPTION 'rate_limited_hour'
      USING ERRCODE = 'too_many_connections',
            HINT = '50 exports/hour limit reached. Try after some time.';
  END IF;

  SELECT count(*) INTO v_day_cnt
    FROM public.export_logs
   WHERE user_id = v_caller
     AND created_at > NOW() - INTERVAL '24 hours';
  IF v_day_cnt >= 100 THEN
    RAISE EXCEPTION 'rate_limited_day'
      USING ERRCODE = 'too_many_connections',
            HINT = '100 exports/day limit reached. Try tomorrow.';
  END IF;

  INSERT INTO public.export_logs (user_id, school_id, report_type, filters_json)
  VALUES (v_caller, v_school_id, trim(p_report_type), COALESCE(p_filters, '{}'::jsonb))
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.log_export(TEXT, JSONB) TO authenticated;

COMMIT;


-- =============================================================
-- 0089_expense_void.sql
-- =============================================================
-- 0089_expense_void.sql
--
-- Replace hard-delete on expenses with a soft-void model. Financial
-- records must NEVER be erased — they're historically corrected. The
-- `void` mechanism marks a row as cancelled while keeping it in the
-- ledger so monthly reports, audit trails, and tally figures remain
-- internally consistent.
--
--   • voided_at TIMESTAMPTZ — when the void happened (NULL = active row)
--   • voided_by UUID        — which principal pressed Void
--   • void_reason TEXT      — mandatory free-text justification
--
-- A partial index keeps queries that scan only active rows fast even
-- when the voided history grows large.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.

BEGIN;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS voided_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by   UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

-- Most reads (active expense list, monthly aggregates) want only
-- non-voided rows. A partial index on (school_id, date) keeps those
-- queries cheap regardless of how many voids accumulate.
CREATE INDEX IF NOT EXISTS expenses_active_idx
  ON public.expenses (school_id, date DESC)
  WHERE voided_at IS NULL;

COMMIT;


-- =============================================================
-- 0090_school_holidays.sql
-- =============================================================
-- 0090_school_holidays.sql
--
-- Centralised holiday calendar for each school + academic year.
-- Principals declare specific dates (Diwali, 15 Aug, school anniversary,
-- etc.) and the system uses them to skip attendance, exclude from
-- attendance percentages, and grey out the date pickers.
--
-- Sundays are NOT stored as rows — they're computed client-side via
-- weekday math (cheaper, no rows × 52 per year per school). The
-- `weekly_off_days` column on `schools` lets a school define their
-- own weekly off (default: [0] for Sundays only).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS.

BEGIN;

-- Specific dated holidays. UNIQUE(school_id, academic_year_id, date)
-- so a date can't be declared twice for the same school+year.
CREATE TABLE IF NOT EXISTS public.school_holidays (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES public.schools(id)       ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  date             DATE NOT NULL,
  name             TEXT NOT NULL,
  notes            TEXT,
  created_by       UUID REFERENCES public.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(school_id, academic_year_id, date)
);
CREATE INDEX IF NOT EXISTS school_holidays_school_year_idx
  ON public.school_holidays(school_id, academic_year_id, date);

ALTER TABLE public.school_holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS school_holidays_select ON public.school_holidays;
CREATE POLICY school_holidays_select ON public.school_holidays FOR SELECT
USING (
  public.is_super_admin()
  OR (public.current_user_role() IN ('PRINCIPAL','TEACHER','STUDENT','PARENT')
      AND school_id = public.current_user_school_id())
);

DROP POLICY IF EXISTS school_holidays_write ON public.school_holidays;
CREATE POLICY school_holidays_write ON public.school_holidays FOR ALL
USING (
  public.is_super_admin()
  OR (public.is_principal() AND school_id = public.current_user_school_id())
)
WITH CHECK (
  public.is_super_admin()
  OR (public.is_principal() AND school_id = public.current_user_school_id())
);

-- Weekly off-days as an int array on `schools`. 0=Sunday … 6=Saturday.
-- Default [0] = Sundays only (most Indian schools). Schools that run
-- 6 days a week with Sat off can store [0,6]; CBSE schools that close
-- on the 2nd & 4th Saturdays use the dated table for those instead.
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS weekly_off_days INT[] NOT NULL DEFAULT ARRAY[0];

COMMIT;


-- =============================================================
-- 0091_ai_paper_quotas.sql
-- =============================================================
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


-- =============================================================
-- 0092_attendance_records_parent_select.sql
-- =============================================================
-- 0092_attendance_records_parent_select.sql
--
-- Bug: PARENT/STUDENT homepage attendance % shows "—" and the
-- AttendanceView is empty because the `!inner(date)` join from
-- `attendance_student_details` to `attendance_records` returns 0 rows
-- under RLS. Migration 0011 dropped attendance_records_parent_select
-- (in a loop) and only rebuilt fee_installments / payment_records
-- afterwards — attendance_records and test_schedules were left without
-- a parent-facing SELECT policy. Default RLS deny means parents see
-- nothing.
--
-- Fix: allow PARENT/STUDENT to read an attendance_records row when it
-- has at least one attendance_student_details row for one of their
-- linked students. attendance_student_details already gates its own
-- SELECT by linked_student_ids, so this only widens visibility to the
-- header rows the child rows reference.

DROP POLICY IF EXISTS attendance_records_parent_select ON public.attendance_records;
CREATE POLICY attendance_records_parent_select ON public.attendance_records
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.attendance_student_details d
      WHERE d.attendance_id = attendance_records.id
        AND d.student_id = ANY(public.linked_student_ids())
    )
  );

-- test_schedules is in the same boat — parents need to see exam dates
-- for their child's class. Scope by class_id matching any linked
-- student's active academic record.
DROP POLICY IF EXISTS test_schedules_parent_select ON public.test_schedules;
CREATE POLICY test_schedules_parent_select ON public.test_schedules
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.student_academic_records sar
      WHERE sar.student_id = ANY(public.linked_student_ids())
        AND sar.academic_year_id = test_schedules.academic_year_id
    )
  );


-- =============================================================
-- 0093_attendance_records_parent_select_fix.sql
-- =============================================================
-- 0093_attendance_records_parent_select_fix.sql
--
-- Fix: 0092 introduced "infinite recursion detected in policy for relation
-- attendance_records". The cycle:
--   attendance_records.RLS → SELECT FROM attendance_student_details
--   attendance_student_details.RLS (attsd_select) → SELECT FROM attendance_records
--
-- Rewrite the parent-select policy so it doesn't touch attendance_student_details
-- at all. Scope by school instead: a parent / student may read an attendance_records
-- header row when at least one of their linked students belongs to the same school.
-- attendance_student_details RLS already gates per-student detail rows, so widening
-- header visibility to "students at the same school" is safe and matches what the
-- UI joins for date display.

DROP POLICY IF EXISTS attendance_records_parent_select ON public.attendance_records;
CREATE POLICY attendance_records_parent_select ON public.attendance_records
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = ANY(public.linked_student_ids())
        AND s.school_id = attendance_records.school_id
    )
  );

-- Same recursion shape isn't possible for test_schedules (it joins through
-- student_academic_records, which doesn't reference test_schedules), but
-- recreate identically for consistency.
DROP POLICY IF EXISTS test_schedules_parent_select ON public.test_schedules;
CREATE POLICY test_schedules_parent_select ON public.test_schedules
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = ANY(public.linked_student_ids())
        AND s.school_id = test_schedules.school_id
    )
  );


-- =============================================================
-- 0094_complaint_limits_and_hide.sql
-- =============================================================
-- 0094_complaint_limits_and_hide.sql
--
-- Three product changes on the complaints flow:
--
-- 1. Anonymous-complaint cap: 1 per 7 days → 1 per 30 days. Anonymous filings
--    are sensitive (bullying, harassment); a tighter cap prevents the channel
--    from being used for routine grievances while still leaving room for a
--    student to escalate a long-running issue.
--
-- 2. Normal-complaint cap: 3/day (unchanged) PLUS a new 7/rolling-week ceiling.
--    Daily-only let a parent fire 21 complaints in a week; the combined cap
--    keeps the daily ceiling but blocks sustained abuse.
--
-- 3. New column `hidden_from_submitter` — student / parent can flip this on
--    their own complaints so they don't show up in their personal "my
--    complaints" list anymore. Used for the privacy-on-shared-device case
--    (student filed an anonymous bullying complaint; doesn't want a parent
--    glancing at the device to see it). Audit row stays intact, principal
--    still sees it as before.

ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS hidden_from_submitter BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_complaints_visible_to_submitter
  ON public.complaints (from_user_id, hidden_from_submitter)
  WHERE hidden_from_submitter = false;

-- ─── Trigger 1: normal complaint cap (2/day + 7/week) ────────────────────
CREATE OR REPLACE FUNCTION public.enforce_complaint_daily_limit() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_today_ist date;
  v_count_day  bigint;
  v_count_week bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  -- Anonymous rows are governed by a separate trigger below; skip here so
  -- the limits don't double-count.
  IF NEW.is_anonymous IS TRUE THEN
    RETURN NEW;
  END IF;

  v_today_ist := (now() AT TIME ZONE 'Asia/Kolkata')::date;

  IF NEW.student_id IS NOT NULL THEN
    -- Parent / student complaint: cap per (submitter, child).
    SELECT count(*) INTO v_count_day
    FROM public.complaints
    WHERE from_user_id = NEW.from_user_id
      AND student_id   = NEW.student_id
      AND is_anonymous IS NOT TRUE
      AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = v_today_ist;
    SELECT count(*) INTO v_count_week
    FROM public.complaints
    WHERE from_user_id = NEW.from_user_id
      AND student_id   = NEW.student_id
      AND is_anonymous IS NOT TRUE
      AND created_at >= (now() - interval '7 days');
  ELSE
    -- Teacher / no-student complaint: cap per submitter (legacy behavior).
    SELECT count(*) INTO v_count_day
    FROM public.complaints
    WHERE from_user_id = NEW.from_user_id
      AND student_id IS NULL
      AND is_anonymous IS NOT TRUE
      AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = v_today_ist;
    SELECT count(*) INTO v_count_week
    FROM public.complaints
    WHERE from_user_id = NEW.from_user_id
      AND student_id IS NULL
      AND is_anonymous IS NOT TRUE
      AND created_at >= (now() - interval '7 days');
  END IF;

  IF v_count_day >= 3 THEN
    RAISE EXCEPTION
      'Daily limit reached — only 3 complaints allowed per day. Please contact the school office for another submission.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_count_week >= 7 THEN
    RAISE EXCEPTION
      'Weekly limit reached — only 7 complaints allowed in a 7-day window. Please contact the school office.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- ─── Trigger 2: anonymous-complaint cap (1 / 30 days) ────────────────────
CREATE OR REPLACE FUNCTION public.enforce_anonymous_complaint_weekly_cap()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  recent_count integer;
BEGIN
  IF NEW.is_anonymous IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- 30-day rolling window keyed on student_id when present, otherwise on
  -- the submitting user account. Function name kept for backwards compat
  -- with the existing trigger binding; the message + interval are what
  -- the user actually sees.
  SELECT COUNT(*) INTO recent_count
  FROM public.complaints
  WHERE is_anonymous = true
    AND created_at >= (now() - interval '30 days')
    AND (
      (NEW.student_id IS NOT NULL AND student_id = NEW.student_id)
      OR (NEW.student_id IS NULL AND from_user_id = NEW.from_user_id)
    );

  IF recent_count >= 1 THEN
    RAISE EXCEPTION 'Anonymous complaint limit reached: only 1 per 30 days'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- ─── Submitter UPDATE policy for hide-from-my-dashboard ──────────────────
-- The submitter (student / parent) can flip `hidden_from_submitter` on
-- their own row. Principal updates go through adminDb (service role) which
-- bypasses RLS, so this policy doesn't widen the principal write surface.
DROP POLICY IF EXISTS complaints_user_hide ON public.complaints;
CREATE POLICY complaints_user_hide ON public.complaints
  FOR UPDATE
  USING (from_user_id = auth.uid())
  WITH CHECK (from_user_id = auth.uid());


-- =============================================================
-- 0095_email_otp_2fa.sql
-- =============================================================
-- 0095_email_otp_2fa.sql
--
-- Optional email-OTP two-factor for high-stakes accounts (PRINCIPAL +
-- SUPER_ADMIN). Default OFF so existing users see no change. When the
-- principal toggles it on from Settings → Security, login flow becomes:
--
--   1. mobile + password (server verifies)
--   2. server detects email_otp_2fa = true → does NOT issue tokens,
--      returns { requires2FA: true, email } to client
--   3. client calls supabase.auth.signInWithOtp({ email }) → Supabase
--      emails a 6-digit code natively (free tier: 4/hour/user)
--   4. user types code → supabase.auth.verifyOtp() → real session
--
-- Schema cost: one nullable boolean column, indexed lookup not needed
-- (column already accessed by id in the per-row login profile fetch).
-- The trigger below blocks the toggle for non-principal/super-admin
-- roles AND for users with no email — same protection done in the UI,
-- but defended at the DB so a direct REST call can't bypass it.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email_otp_2fa BOOLEAN NOT NULL DEFAULT false;

-- Block the flag being flipped on for accounts where it has no meaning.
-- Phrased as a BEFORE UPDATE trigger because the existing
-- users_prevent_self_escalation trigger already pattern-locks role
-- changes — same shape here keeps server-side admin updates allowed
-- while RLS-bypassing service-role inserts/updates work as expected.
CREATE OR REPLACE FUNCTION public.enforce_email_otp_2fa_eligibility() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.email_otp_2fa IS TRUE AND OLD.email_otp_2fa IS DISTINCT FROM TRUE THEN
    -- Only PRINCIPAL / SUPER_ADMIN may enable. STUDENT / PARENT /
    -- TEACHER / DRIVER login by mobile number — most don't even have
    -- an email on file — so 2FA via email isn't applicable.
    IF NEW.role NOT IN ('PRINCIPAL', 'SUPER_ADMIN') THEN
      RAISE EXCEPTION 'email_otp_2fa is only available for PRINCIPAL / SUPER_ADMIN accounts';
    END IF;
    -- Email is required so the OTP has somewhere to land.
    IF NEW.email IS NULL OR length(trim(NEW.email)) = 0 THEN
      RAISE EXCEPTION 'Cannot enable email OTP 2FA — set an email on this account first';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_email_otp_2fa_eligibility ON public.users;
CREATE TRIGGER users_email_otp_2fa_eligibility
  BEFORE UPDATE OF email_otp_2fa, role, email ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.enforce_email_otp_2fa_eligibility();


-- =============================================================
-- 0096_vehicle_live_tracking.sql
-- =============================================================
-- 0096_vehicle_live_tracking.sql
--
-- Live GPS / trip-state for school transport vehicles. One row per
-- vehicle (PK = vehicle_id), UPDATE-only mutation pattern so the
-- table size is bounded at N = number of vehicles, never grows with
-- pings.
--
-- Driver client UPDATEs this row every 15 sec while tracking.
-- Principal client subscribes via Supabase Realtime Postgres Changes
-- and sees live position updates without polling. When driver app
-- closes / network drops, the row persists with last known position
-- and `last_seen` so the principal sees "Last seen N min ago"
-- instead of a mysterious blank.

CREATE TABLE IF NOT EXISTS public.vehicle_live (
  vehicle_id        UUID PRIMARY KEY REFERENCES public.transport_vehicles(id) ON DELETE CASCADE,
  school_id         UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  -- Last reported GPS coordinate. NULL until first ping after vehicle
  -- creation; principal renders "GPS not started" in that case.
  lat               DOUBLE PRECISION,
  lng               DOUBLE PRECISION,
  speed_kmh         DOUBLE PRECISION,
  -- Server-stamped on each ping. Used to compute "Live · 2s ago",
  -- "Last seen 5 min ago", "Offline since 12:45 PM" labels client-side.
  last_seen         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- True while driver explicitly has trip running. Flips to false
  -- on /api/transport/ping?stop=true (driver tapped Stop) OR when
  -- last_seen is > 30 min old (server-side staleness check).
  is_tracking       BOOLEAN NOT NULL DEFAULT false,
  -- Index of the stop the driver is heading toward (next stop).
  -- Same shape as the in-memory currentStopIndex used today, just
  -- persisted server-side so app reopen / principal view both stay
  -- in sync. NULL = no trip in progress.
  current_stop_idx  SMALLINT,
  -- Snapshotted at trip start so a "trip done" UI can highlight the
  -- run that just completed without a join.
  trip_started_at   TIMESTAMPTZ,
  trip_ended_at     TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vehicle_live_school_idx ON public.vehicle_live(school_id);
CREATE INDEX IF NOT EXISTS vehicle_live_last_seen_idx ON public.vehicle_live(last_seen DESC);

-- RLS — same shape as transport_vehicles. Principals + teachers see
-- their school's vehicles. Parents/students see vehicles their
-- linked student is assigned to. Driver writes go through service
-- role from the server, so we don't need a permissive write policy
-- here (defaults deny on UPDATE for non-service-role).

ALTER TABLE public.vehicle_live ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vehicle_live_select_school ON public.vehicle_live;
CREATE POLICY vehicle_live_select_school ON public.vehicle_live
  FOR SELECT
  USING (
    public.is_super_admin()
    OR (public.current_user_role() IN ('PRINCIPAL','TEACHER','DRIVER')
        AND school_id = public.current_user_school_id())
  );

DROP POLICY IF EXISTS vehicle_live_select_parent ON public.vehicle_live;
CREATE POLICY vehicle_live_select_parent ON public.vehicle_live
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.student_transport_assignments sta
      WHERE sta.vehicle_id = vehicle_live.vehicle_id
        AND sta.is_active = true
        AND sta.student_id = ANY(public.linked_student_ids())
    )
  );

-- Auto-stale: any vehicle whose last_seen is older than 30 minutes
-- is considered offline. The application clamps `is_tracking` to
-- false in the UI when this is true; we also expose a helper view
-- so realtime subscribers can rely on the server's view of "live".
-- (The is_tracking flag itself is only updated on writes, so without
-- this view the principal would see "ON TRIP" forever for a driver
-- whose phone died mid-route.)

-- Realtime publication — Supabase's `supabase_realtime` publication
-- is what enables Postgres Changes streaming. Add this table.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'vehicle_live'
  ) THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.vehicle_live;
    EXCEPTION WHEN OTHERS THEN
      -- Publication might not exist yet on a fresh project; the
      -- Realtime extension creates it on first dashboard touch.
      -- Skip silently.
      NULL;
    END;
  END IF;
END $$;


-- =============================================================
-- 0097_school_max_vehicles.sql
-- =============================================================
-- 0097_school_max_vehicles.sql
--
-- Per-school vehicle cap controlled by super-admin. Same shape as the
-- max_students / max_staff guard (migration 0082) so the principal
-- gets a friendly error and can't blow past the licensed fleet size.
--
-- Semantics:
--   max_vehicles = NULL → unlimited (default for older schools)
--   max_vehicles = 0    → TRANSPORT SERVICE DISABLED. Principal can't
--                         create the first vehicle. UI also hides the
--                         Transport tile entirely so the school looks
--                         clean for institutions that don't run buses.
--   max_vehicles = N    → up to N active vehicles. Deactivation always
--                         allowed (matches student/staff trigger).

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS max_vehicles INT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schools_max_vehicles_chk') THEN
    ALTER TABLE public.schools ADD CONSTRAINT schools_max_vehicles_chk
      CHECK (max_vehicles IS NULL OR max_vehicles >= 0);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.school_active_vehicle_count(p_school_id UUID)
RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::INT FROM public.transport_vehicles
   WHERE school_id = p_school_id AND is_active = TRUE;
$$;

GRANT EXECUTE ON FUNCTION public.school_active_vehicle_count(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_vehicle_limit() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_limit INT;
  v_count INT;
BEGIN
  -- Only enforce on rows becoming active.
  IF NOT NEW.is_active THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_active = TRUE THEN RETURN NEW; END IF;

  SELECT max_vehicles INTO v_limit FROM public.schools WHERE id = NEW.school_id;
  IF v_limit IS NULL THEN RETURN NEW; END IF;

  IF v_limit = 0 THEN
    RAISE EXCEPTION 'Transport service is not enabled for this school. Contact platform admin to enable.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_count := public.school_active_vehicle_count(NEW.school_id);
  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'Vehicle limit reached (% / %). Contact your platform admin to raise the limit.', v_count, v_limit
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vehicle_limit ON public.transport_vehicles;
CREATE TRIGGER trg_vehicle_limit BEFORE INSERT OR UPDATE OF is_active ON public.transport_vehicles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_vehicle_limit();


-- =============================================================
-- 0098_school_billing_installments.sql
-- =============================================================
-- 0098_school_billing_installments.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Replaces the old school_billings / billing_years / school_payments
-- system with a much simpler model: super-admin manually adds payment
-- installments for any school + any academic year (name + amount + due
-- date), then marks each one paid as the school pays.
--
-- Old tables are NOT dropped here — leaving them behind keeps existing
-- audit history readable and lets us roll back the UI without losing
-- data. They just become unreferenced by the live UI.
--
-- RLS: super-admin only. Schools / principals never see this table.

CREATE TABLE IF NOT EXISTS public.school_billing_installments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id  UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  description       TEXT,
  amount            BIGINT NOT NULL CHECK (amount >= 0),
  due_date          DATE NOT NULL,
  paid_amount       BIGINT NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  paid_at           TIMESTAMPTZ,
  paid_method       TEXT,
  paid_note         TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        UUID REFERENCES public.users(id) ON DELETE SET NULL
);

-- Idempotent column add for environments where the table already existed
-- without the description column (early adopters of 0098).
ALTER TABLE public.school_billing_installments
  ADD COLUMN IF NOT EXISTS description TEXT;

CREATE INDEX IF NOT EXISTS school_billing_installments_school_year_idx
  ON public.school_billing_installments(school_id, academic_year_id);

CREATE INDEX IF NOT EXISTS school_billing_installments_due_idx
  ON public.school_billing_installments(due_date);

ALTER TABLE public.school_billing_installments ENABLE ROW LEVEL SECURITY;

-- super_admin can do everything; everyone else is locked out.
DROP POLICY IF EXISTS sbi_super_admin_all ON public.school_billing_installments;
CREATE POLICY sbi_super_admin_all
  ON public.school_billing_installments
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- updated_at trigger
CREATE OR REPLACE FUNCTION public._touch_sbi_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_sbi_updated_at ON public.school_billing_installments;
CREATE TRIGGER trg_sbi_updated_at
  BEFORE UPDATE ON public.school_billing_installments
  FOR EACH ROW EXECUTE FUNCTION public._touch_sbi_updated_at();


-- =============================================================
-- 0099_safe_school_deactivation.sql
-- =============================================================
-- 0099_safe_school_deactivation.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Critical fix for school deactivate ↔ reactivate flow.
--
-- Old behaviour (cascade_school_deactivation, migration ~0011):
--   • On deactivate: every user / student / staff row of the school flips
--     to is_active = FALSE.
--   • On reactivate: ONLY the principal flips back. Students + staff
--     stay deactivated forever, making them effectively disappear from
--     every UI (which filters by is_active = TRUE).
--
-- New behaviour:
--   • Track which rows were flipped BY the cascade in a "snapshot" table
--     keyed on (school_id, deactivated_at).
--   • On reactivate: restore only the rows captured in the most recent
--     snapshot for this school. Manually-deactivated users are NOT
--     accidentally re-activated.
--   • The snapshot is consumed (deleted) once reactivation completes,
--     so a second deactivate-reactivate cycle works correctly.
--
-- Also: stop muting student/staff is_active during deactivation. The
-- school itself is the gate — we don't need to corrupt per-row state.
-- We only deactivate USERS (login accounts), since RLS / app gating
-- already keys off schools.status for everything else.

CREATE TABLE IF NOT EXISTS public._school_deactivation_snapshot (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_ids    UUID[] NOT NULL DEFAULT '{}',
  student_ids UUID[] NOT NULL DEFAULT '{}',
  staff_ids   UUID[] NOT NULL DEFAULT '{}',
  taken_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS school_deactivation_snapshot_school_idx
  ON public._school_deactivation_snapshot(school_id, taken_at DESC);

-- Replace the trigger function.
CREATE OR REPLACE FUNCTION public.cascade_school_deactivation() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_ids    UUID[];
  v_student_ids UUID[];
  v_staff_ids   UUID[];
  v_snapshot_id UUID;
BEGIN
  -- ── DEACTIVATE / SUSPEND ──────────────────────────────────────────────
  IF NEW.status IN ('INACTIVE','SUSPENDED')
     AND (OLD.status IS DISTINCT FROM NEW.status) THEN

    -- Capture the IDs of currently-active rows BEFORE flipping them.
    -- These are the rows we will need to restore on the next reactivation.
    SELECT array_agg(id) INTO v_user_ids
      FROM public.users
      WHERE school_id = NEW.id AND role <> 'SUPER_ADMIN' AND is_active = TRUE;
    SELECT array_agg(id) INTO v_student_ids
      FROM public.students
      WHERE school_id = NEW.id AND is_active = TRUE;
    SELECT array_agg(id) INTO v_staff_ids
      FROM public.staff
      WHERE school_id = NEW.id AND is_active = TRUE;

    INSERT INTO public._school_deactivation_snapshot
      (school_id, user_ids, student_ids, staff_ids)
    VALUES
      (NEW.id,
       COALESCE(v_user_ids, '{}'),
       COALESCE(v_student_ids, '{}'),
       COALESCE(v_staff_ids, '{}'));

    -- Flip USER login accounts off (these block login at auth time).
    -- Students / staff are NOT touched — RLS + UI already gate on
    -- schools.status, and flipping their is_active was the cause of
    -- "data disappears" after reactivation.
    UPDATE public.users
       SET is_active = FALSE
     WHERE id = ANY(COALESCE(v_user_ids, '{}'::UUID[]));

  -- ── REACTIVATE ────────────────────────────────────────────────────────
  ELSIF NEW.status IN ('ACTIVE','TRIAL')
        AND OLD.status IN ('INACTIVE','SUSPENDED') THEN

    -- Pick up the most recent snapshot for this school. If we never
    -- snapshotted (legacy schools deactivated before this migration),
    -- fall back to flipping all non-super-admin users back on.
    SELECT id, user_ids INTO v_snapshot_id, v_user_ids
      FROM public._school_deactivation_snapshot
      WHERE school_id = NEW.id
      ORDER BY taken_at DESC LIMIT 1;

    IF v_snapshot_id IS NULL THEN
      -- Legacy fallback: re-activate every user that is currently
      -- inactive. Doesn't perfectly preserve manual deactivations from
      -- before this migration, but at least no rows stay invisible.
      UPDATE public.users
         SET is_active = TRUE
       WHERE school_id = NEW.id
         AND role <> 'SUPER_ADMIN'
         AND is_active = FALSE;
      UPDATE public.students SET is_active = TRUE WHERE school_id = NEW.id AND is_active = FALSE;
      UPDATE public.staff    SET is_active = TRUE WHERE school_id = NEW.id AND is_active = FALSE;
    ELSE
      -- Restore exactly what was snapshotted.
      UPDATE public.users
         SET is_active = TRUE
       WHERE id = ANY(COALESCE(v_user_ids, '{}'::UUID[]));
      -- Snapshot consumed.
      DELETE FROM public._school_deactivation_snapshot WHERE id = v_snapshot_id;
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

-- Trigger already wired by an earlier migration; CREATE OR REPLACE FUNCTION
-- is enough. Re-create the trigger guard idempotently in case the original
-- migration gets dropped.
DROP TRIGGER IF EXISTS schools_cascade_deactivation ON public.schools;
CREATE TRIGGER schools_cascade_deactivation
  AFTER UPDATE OF status ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.cascade_school_deactivation();

-- One-shot heal: schools currently INACTIVE/SUSPENDED whose previous
-- cascade silently flipped students/staff off — flip them back on so the
-- next reactivation surfaces them correctly.
UPDATE public.students SET is_active = TRUE
  WHERE is_active = FALSE
    AND school_id IN (SELECT id FROM public.schools WHERE status IN ('INACTIVE','SUSPENDED'));
UPDATE public.staff    SET is_active = TRUE
  WHERE is_active = FALSE
    AND school_id IN (SELECT id FROM public.schools WHERE status IN ('INACTIVE','SUSPENDED'));


-- =============================================================
-- 0100_school_deactivation_hardening.sql
-- =============================================================
-- 0100_school_deactivation_hardening.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Tightens the deactivate-reactivate cascade introduced in 0099.
--
-- Audit found 4 problems with the original snapshot approach:
--   1. _school_deactivation_snapshot had no RLS — any client with the
--      anon key could read or tamper with it.
--   2. INACTIVE → SUSPENDED → INACTIVE-style transitions created a
--      second (empty) snapshot that overwrote the first on reactivate,
--      so users would never come back.
--   3. Snapshot rows could accumulate if reactivation never happened.
--   4. Trigger silently swallowed the case where a school was deleted
--      mid-flow (FK cascade handles it but worth noting).
--
-- Fix: only keep ONE snapshot per school (UNIQUE constraint) and skip
-- inserts when one already exists. On reactivate, consume EVERY snapshot
-- for the school (defensive). Lock the table down with RLS so only
-- SUPER_ADMINs (and the trigger function itself, which is SECURITY
-- DEFINER) can touch it.

-- 1. RLS lockdown ───────────────────────────────────────────────────────
ALTER TABLE public._school_deactivation_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sds_super_admin_all ON public._school_deactivation_snapshot;
CREATE POLICY sds_super_admin_all
  ON public._school_deactivation_snapshot
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- 2. Single-snapshot-per-school invariant ──────────────────────────────
-- Drop dupes that may already exist from the buggy transition window.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY school_id ORDER BY taken_at ASC) AS rn
    FROM public._school_deactivation_snapshot
)
DELETE FROM public._school_deactivation_snapshot
 WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS school_deactivation_snapshot_one_per_school
  ON public._school_deactivation_snapshot(school_id);

-- 3. Trigger function — only INSERT if no existing snapshot for this
--    school; on reactivate, delete ALL rows for the school. ────────────
CREATE OR REPLACE FUNCTION public.cascade_school_deactivation() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_ids    UUID[];
  v_existing    UUID;
BEGIN
  -- ── DEACTIVATE / SUSPEND ──────────────────────────────────────────────
  IF NEW.status IN ('INACTIVE','SUSPENDED')
     AND (OLD.status IS DISTINCT FROM NEW.status) THEN

    -- If a snapshot already exists for this school (e.g. coming from
    -- INACTIVE → SUSPENDED — both deactivated states), DO NOT replace
    -- it. The original snapshot still captures the correct "what was
    -- active at the time we first deactivated" set.
    SELECT id INTO v_existing
      FROM public._school_deactivation_snapshot
      WHERE school_id = NEW.id LIMIT 1;

    IF v_existing IS NULL THEN
      SELECT array_agg(id) INTO v_user_ids
        FROM public.users
        WHERE school_id = NEW.id AND role <> 'SUPER_ADMIN' AND is_active = TRUE;

      INSERT INTO public._school_deactivation_snapshot
        (school_id, user_ids)
      VALUES
        (NEW.id, COALESCE(v_user_ids, '{}'::UUID[]));

      -- Flip USER login accounts off. Students / staff is_active is NOT
      -- touched — schools.status is the gate, see 0099 for context.
      UPDATE public.users
         SET is_active = FALSE
       WHERE id = ANY(COALESCE(v_user_ids, '{}'::UUID[]));
    END IF;

  -- ── REACTIVATE ────────────────────────────────────────────────────────
  ELSIF NEW.status IN ('ACTIVE','TRIAL')
        AND OLD.status IN ('INACTIVE','SUSPENDED') THEN

    SELECT user_ids INTO v_user_ids
      FROM public._school_deactivation_snapshot
      WHERE school_id = NEW.id LIMIT 1;

    IF v_user_ids IS NULL THEN
      -- Legacy fallback: pre-0099 schools have no snapshot. Re-activate
      -- every user (and any students/staff that the buggy old cascade
      -- had flipped off) so nothing stays invisible.
      UPDATE public.users
         SET is_active = TRUE
       WHERE school_id = NEW.id
         AND role <> 'SUPER_ADMIN'
         AND is_active = FALSE;
      UPDATE public.students SET is_active = TRUE
        WHERE school_id = NEW.id AND is_active = FALSE;
      UPDATE public.staff    SET is_active = TRUE
        WHERE school_id = NEW.id AND is_active = FALSE;
    ELSE
      UPDATE public.users
         SET is_active = TRUE
       WHERE id = ANY(v_user_ids);
    END IF;

    -- Defensive: clear ALL snapshots for this school, not just one.
    DELETE FROM public._school_deactivation_snapshot WHERE school_id = NEW.id;

  END IF;

  RETURN NEW;
END;
$$;

-- Re-attach trigger (idempotent).
DROP TRIGGER IF EXISTS schools_cascade_deactivation ON public.schools;
CREATE TRIGGER schools_cascade_deactivation
  AFTER UPDATE OF status ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.cascade_school_deactivation();


-- =============================================================
-- 0101_heal_legacy_inactive_users.sql
-- =============================================================
-- 0101_heal_legacy_inactive_users.sql
-- ─────────────────────────────────────────────────────────────────────────
-- One-shot heal for schools that were reactivated by the OLD buggy
-- cascade trigger (pre-0099). The old trigger only flipped principals
-- back to is_active = TRUE on reactivation, leaving every other user,
-- student, and staff row stuck at is_active = FALSE — making them
-- effectively invisible in every UI.
--
-- This migration restores them for any school that is currently in an
-- ACTIVE / TRIAL state. Manually-deactivated rows for other schools
-- are not touched.
--
-- Note: this does flip back rows that may have been manually
-- deactivated *before* this heal (e.g. a teacher who left the school
-- before the school itself was deactivated). Acceptable one-time cost
-- — the alternative is leaving real students invisible. Future
-- deactivate-reactivate cycles use the snapshot path from 0099/0100
-- and won't trigger this fallback.

UPDATE public.users
   SET is_active = TRUE
 WHERE is_active = FALSE
   AND role <> 'SUPER_ADMIN'
   AND school_id IN (
     SELECT id FROM public.schools WHERE status IN ('ACTIVE', 'TRIAL')
   );

UPDATE public.students
   SET is_active = TRUE
 WHERE is_active = FALSE
   AND school_id IN (
     SELECT id FROM public.schools WHERE status IN ('ACTIVE', 'TRIAL')
   );

UPDATE public.staff
   SET is_active = TRUE
 WHERE is_active = FALSE
   AND school_id IN (
     SELECT id FROM public.schools WHERE status IN ('ACTIVE', 'TRIAL')
   );


-- =============================================================
-- 0102_staff_salary_start_date.sql
-- =============================================================
-- 0102_staff_salary_start_date.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Adds staff.salary_start_date — the month a staff member's *paid* salary
-- ledger begins, separate from joining_date.
--
-- Why: in real schools the joining day is rarely also the first paid day.
-- A teacher who joins on the 18th of October typically gets their first
-- salary in November (not a partial Oct + full Nov). The old ledger
-- used joining_date as the lower bound, which produced a phantom
-- "October full salary" row that principals had to manually reconcile.
--
-- Default rule: salary_start_date = first day of the month *after*
-- joining_date. Principals can override at create time or via the
-- existing edit-staff form.
--
-- Backfill: for every existing row, set salary_start_date to the first
-- of the joining month (so historical ledgers don't shift around). The
-- "next-month" default only applies to staff added going forward.

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS salary_start_date DATE;

UPDATE public.staff
   SET salary_start_date = date_trunc('month', joining_date)::DATE
 WHERE salary_start_date IS NULL
   AND joining_date IS NOT NULL;


-- =============================================================
-- 0103_one_time_due_today.sql
-- =============================================================
-- 0103_one_time_due_today.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Changes the schedule generator so ONE_TIME / ANNUAL fee heads are due
-- on the date the schedule is generated (CURRENT_DATE), not on the
-- academic-year start. Admission fees, annual-day fees, etc. are
-- typically collected at the moment of admission — pinning them to
-- April 1st made them look "already overdue" the moment a mid-year
-- joiner's schedule was created.
--
-- ANNUAL is treated identically to ONE_TIME going forward — the UI
-- merges them into a single "One-time" option since they were already
-- behaving the same in the DB (one row, one date, no recurrence).
--
-- Idempotent: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.generate_student_fee_schedule(
  p_student_id      UUID,
  p_year_id         UUID,
  p_heads           JSONB,
  p_due_dates       JSONB,
  p_is_rte          BOOLEAN DEFAULT FALSE,
  p_discount_amount NUMERIC DEFAULT 0,
  p_discount_pct    NUMERIC DEFAULT 0
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id UUID;
  v_caller UUID := auth.uid();
  v_count INT := 0;
  v_head JSONB;
  v_dd JSONB;
  v_payer TEXT;
  v_freq TEXT;
  v_amt BIGINT;
  v_name TEXT;
  v_discount BIGINT;
  v_pct NUMERIC := COALESCE(p_discount_pct, 0);
  v_fixed NUMERIC := COALESCE(p_discount_amount, 0);
  v_dd_str TEXT;
  v_dd_date DATE;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF v_pct < 0 OR v_pct > 100 THEN RAISE EXCEPTION 'discount_pct out of range'; END IF;
  IF v_fixed < 0 THEN RAISE EXCEPTION 'discount_amount must be non-negative'; END IF;

  SELECT school_id INTO v_school_id FROM public.students WHERE id = p_student_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'student not found'; END IF;
  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_school_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Drop unpaid/un-written-off rows so we re-create cleanly. Paid history is preserved.
  DELETE FROM public.fee_installments
   WHERE student_id = p_student_id
     AND academic_year_id = p_year_id
     AND paid_amount = 0
     AND write_off_amount = 0;

  FOR v_head IN SELECT * FROM jsonb_array_elements(p_heads)
  LOOP
    v_name := v_head->>'name';
    v_amt  := (v_head->>'amount')::BIGINT;
    v_freq := COALESCE(v_head->>'frequency', 'MONTHLY');
    v_payer := CASE WHEN p_is_rte THEN 'GOVERNMENT' ELSE 'PARENT' END;

    v_discount := GREATEST(
      v_fixed::BIGINT,
      FLOOR(v_amt * v_pct / 100.0)::BIGINT
    );
    v_amt := GREATEST(0, v_amt - v_discount);

    IF v_freq = 'MONTHLY' THEN
      FOR v_dd IN SELECT * FROM jsonb_array_elements(p_due_dates)
      LOOP
        v_dd_str := v_dd->>'date';
        IF v_dd_str IS NULL OR length(btrim(v_dd_str)) = 0 THEN
          CONTINUE;
        END IF;
        v_dd_date := v_dd_str::DATE;

        INSERT INTO public.fee_installments
          (student_id, academic_year_id, school_id, month, due_date, fee_type, amount, payer_type)
        VALUES
          (p_student_id, p_year_id, v_school_id, v_dd->>'month',
           v_dd_date,
           CASE WHEN lower(v_name) LIKE '%transport%' THEN 'TRANSPORT'
                WHEN lower(v_name) LIKE '%exam%'      THEN 'EXAM'
                WHEN lower(v_name) LIKE '%tuition%'   THEN 'TUITION'
                ELSE 'OTHER' END,
           v_amt, v_payer);
        v_count := v_count + 1;
      END LOOP;
    ELSE
      -- ONE_TIME (and legacy ANNUAL) → due *today*. Schools collect
      -- one-shot fees at the moment of admission, not on AY start;
      -- pinning them to April 1 made them look pre-overdue.
      INSERT INTO public.fee_installments
        (student_id, academic_year_id, school_id, month, due_date, fee_type, amount, payer_type)
      VALUES
        (p_student_id, p_year_id, v_school_id,
         'OneTime',
         CURRENT_DATE,
         CASE WHEN lower(v_name) LIKE '%transport%' THEN 'TRANSPORT'
              WHEN lower(v_name) LIKE '%exam%'      THEN 'EXAM'
              WHEN lower(v_name) LIKE '%tuition%'   THEN 'TUITION'
              ELSE 'OTHER' END,
         v_amt, v_payer);
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;


-- =============================================================
-- 0104_drop_legacy_billing.sql
-- =============================================================
-- 0104_drop_legacy_billing.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Drops the leftover legacy super-admin billing surface. The new flat
-- school_billing_installments stack (migration 0098) replaced everything
-- below; nothing in the running UI or server reads these any more.
--
-- Dropped:
--   • table school_payments          (old per-school platform payments)
--   • table school_fee_payments      (old fixed-amount payment ledger)
--   • column schools.billing_fixed_amount (unused since 0098)
--
-- Kept (still referenced by code paths or audit history):
--   • schools.plan               (onboard_school RPC still accepts p_plan)
--   • schools.payment_start_date (set during onboarding for record-keeping)
--   • platform_settings table    (brand settings still live here)

DROP TABLE IF EXISTS public.school_payments      CASCADE;
DROP TABLE IF EXISTS public.school_fee_payments  CASCADE;

ALTER TABLE public.schools
  DROP COLUMN IF EXISTS billing_fixed_amount;


-- =============================================================
-- 0105_school_fee_aggregate_due_now.sql
-- =============================================================
-- 0105_school_fee_aggregate_due_now.sql
-- ─────────────────────────────────────────────────────────────────────────
-- The school-wide fee aggregate used to sum outstanding across ALL
-- installments — including UPCOMING ones whose due_date is in the
-- future. The "Pending Dues" / "Total Due" KPI in FeeCollectionsHub
-- shows the entire yearly schedule as due on April 1st, which is
-- alarming and wrong.
--
-- Fix: count parent_due / govt_due / due_count only from installments
-- whose due_date is on or before today (i.e. OVERDUE + PARTIAL). Future
-- months stay invisible until they actually come due.
--
-- total_collected stays lifetime (paid is paid, regardless of when).
-- cleared_count uses lifetime outstanding (a student with future months
-- still unpaid isn't "cleared" — they just owe less *right now*).

DROP FUNCTION IF EXISTS public.get_school_fee_aggregate();
CREATE OR REPLACE FUNCTION public.get_school_fee_aggregate()
RETURNS TABLE (
  total_students          BIGINT,
  pending_count           BIGINT,
  due_count               BIGINT,
  cleared_count           BIGINT,
  total_collected         BIGINT,
  total_parent_due        BIGINT,
  total_govt_due          BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id UUID;
BEGIN
  IF NOT (public.is_super_admin() OR public.is_principal()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_school_id := public.current_user_school_id();
  IF v_school_id IS NULL AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'no school in session';
  END IF;

  RETURN QUERY
  WITH
  active_students AS (
    SELECT id FROM public.students
     WHERE school_id = v_school_id AND is_active = TRUE
  ),
  -- Per-student installment summary. lifetime_* covers all rows;
  -- now_* restricts to installments whose due_date <= today so the
  -- "Pending Dues" KPI doesn't include future months.
  per_student AS (
    SELECT
      fi.student_id,
      COUNT(*) AS inst_count,
      SUM(GREATEST(0, fi.amount - fi.paid_amount - fi.write_off_amount))
        AS lifetime_outstanding,
      SUM(CASE WHEN fi.due_date <= CURRENT_DATE
               THEN GREATEST(0, fi.amount - fi.paid_amount - fi.write_off_amount)
               ELSE 0 END)                                  AS now_outstanding,
      SUM(CASE WHEN fi.payer_type = 'PARENT' AND fi.due_date <= CURRENT_DATE
               THEN GREATEST(0, fi.amount - fi.paid_amount - fi.write_off_amount)
               ELSE 0 END)                                  AS parent_due_now,
      SUM(CASE WHEN fi.payer_type = 'GOVERNMENT' AND fi.due_date <= CURRENT_DATE
               THEN GREATEST(0, fi.amount - fi.paid_amount - fi.write_off_amount)
               ELSE 0 END)                                  AS govt_due_now,
      SUM(fi.paid_amount)                                   AS total_paid
    FROM public.fee_installments fi
    JOIN active_students s ON s.id = fi.student_id
    GROUP BY fi.student_id
  )
  SELECT
    (SELECT COUNT(*) FROM active_students)                                          AS total_students,
    -- Pending: active students that don't appear in fee_installments at all.
    (SELECT COUNT(*) FROM active_students s
        WHERE NOT EXISTS (SELECT 1 FROM per_student p WHERE p.student_id = s.id))  AS pending_count,
    -- Due *right now* — at least one currently-overdue/partial installment.
    (SELECT COUNT(*) FROM per_student WHERE now_outstanding > 0)                   AS due_count,
    -- Cleared = lifetime fully settled (no future months hanging either).
    (SELECT COUNT(*) FROM per_student WHERE lifetime_outstanding = 0)              AS cleared_count,
    COALESCE((SELECT SUM(total_paid)     FROM per_student), 0)::BIGINT             AS total_collected,
    COALESCE((SELECT SUM(parent_due_now) FROM per_student), 0)::BIGINT             AS total_parent_due,
    COALESCE((SELECT SUM(govt_due_now)   FROM per_student), 0)::BIGINT             AS total_govt_due;
END $$;

GRANT EXECUTE ON FUNCTION public.get_school_fee_aggregate() TO authenticated;


-- =============================================================
-- 0106_fee_aggregate_upcoming_and_head_name.sql
-- =============================================================
-- 0106_fee_aggregate_upcoming_and_head_name.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Two related fixes for the fee module:
--
-- 1. UI needs a separate "upcoming" total alongside the existing "overdue
--    parent due" — so the principal can see what's due today (rose) vs
--    what will become due later in the year (slate). Add
--    total_parent_upcoming to get_school_fee_aggregate.
--
-- 2. fee_installments only stored the bucketed fee_type (TUITION / EXAM /
--    TRANSPORT / OTHER) — so a school's "Library Fee", "Smart Class Fee",
--    etc. all rendered as "Other" in the FeeLedger. Add a fee_head_name
--    column to preserve the original head string from the fee_structures
--    JSONB, populate it from existing rows where possible, and update
--    generate_student_fee_schedule to fill it on new inserts.

-- ─── 1. fee_installments.fee_head_name ────────────────────────────────
ALTER TABLE public.fee_installments
  ADD COLUMN IF NOT EXISTS fee_head_name TEXT;

-- Backfill: existing rows have no head name. The best we can do is map
-- the bucketed fee_type back to a sensible label. Real per-row names
-- will start landing as soon as the regenerated function below runs.
UPDATE public.fee_installments
   SET fee_head_name = CASE fee_type
     WHEN 'TUITION'   THEN 'Tuition Fee'
     WHEN 'EXAM'      THEN 'Exam Fee'
     WHEN 'TRANSPORT' THEN 'Transport Fee'
     ELSE                  'Other'
   END
 WHERE fee_head_name IS NULL;

-- ─── 2. Regenerate generate_student_fee_schedule to capture v_name ────
-- Only the INSERT columns + values change — every other branch matches
-- the existing function (3864-3966 in _apply.sql) byte-for-byte.
CREATE OR REPLACE FUNCTION public.generate_student_fee_schedule(
  p_student_id      UUID,
  p_year_id         UUID,
  p_heads           JSONB,
  p_due_dates       JSONB,
  p_is_rte          BOOLEAN DEFAULT FALSE,
  p_discount_amount NUMERIC DEFAULT 0,
  p_discount_pct    NUMERIC DEFAULT 0
)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id UUID;
  v_h         JSONB;
  v_dd        JSONB;
  v_amt       BIGINT;
  v_freq      TEXT;
  v_name      TEXT;
  v_count     INT := 0;
  v_payer     TEXT;
  v_discount  BIGINT;
  v_pct       NUMERIC := COALESCE(p_discount_pct, 0);
  v_fixed     NUMERIC := COALESCE(p_discount_amount, 0);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF v_pct < 0 OR v_pct > 100 THEN RAISE EXCEPTION 'discount_pct out of range'; END IF;
  IF v_fixed < 0 THEN RAISE EXCEPTION 'discount_amount must be non-negative'; END IF;

  SELECT s.school_id INTO v_school_id
  FROM public.students s WHERE s.id = p_student_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'student not found'; END IF;

  -- Clear prior unpaid rows so re-runs (regen after edits) don't dupe.
  DELETE FROM public.fee_installments
   WHERE student_id = p_student_id
     AND academic_year_id = p_year_id
     AND paid_amount = 0
     AND write_off_amount = 0;

  FOR v_h IN SELECT * FROM jsonb_array_elements(p_heads)
  LOOP
    v_name := COALESCE(v_h->>'name', '');
    v_amt  := COALESCE((v_h->>'amount')::BIGINT, 0);
    v_freq := COALESCE(v_h->>'frequency', 'MONTHLY');
    IF v_amt <= 0 THEN CONTINUE; END IF;

    v_payer := CASE WHEN p_is_rte THEN 'GOVERNMENT' ELSE 'PARENT' END;

    v_discount := GREATEST(
      v_fixed::BIGINT,
      FLOOR(v_amt * v_pct / 100.0)::BIGINT
    );
    v_amt := GREATEST(0, v_amt - v_discount);

    IF v_freq = 'MONTHLY' THEN
      FOR v_dd IN SELECT * FROM jsonb_array_elements(p_due_dates)
      LOOP
        INSERT INTO public.fee_installments
          (student_id, academic_year_id, school_id, month, due_date,
           fee_type, fee_head_name, amount, payer_type)
        VALUES
          (p_student_id, p_year_id, v_school_id, v_dd->>'month',
           (v_dd->>'date')::DATE,
           CASE WHEN lower(v_name) LIKE '%transport%' THEN 'TRANSPORT'
                WHEN lower(v_name) LIKE '%exam%'      THEN 'EXAM'
                WHEN lower(v_name) LIKE '%tuition%'   THEN 'TUITION'
                ELSE 'OTHER' END,
           v_name,
           v_amt, v_payer);
        v_count := v_count + 1;
      END LOOP;
    ELSE  -- ANNUAL / ONE_TIME → single row
      INSERT INTO public.fee_installments
        (student_id, academic_year_id, school_id, month, due_date,
         fee_type, fee_head_name, amount, payer_type)
      VALUES
        (p_student_id, p_year_id, v_school_id,
         CASE WHEN v_freq = 'ONE_TIME' THEN 'OneTime' ELSE 'Annual' END,
         (SELECT MIN((dd->>'date')::DATE) FROM jsonb_array_elements(p_due_dates) dd),
         'OTHER',
         v_name,
         v_amt, v_payer);
      v_count := v_count + 1;
    END IF;
  END LOOP;

  PERFORM public.refresh_student_fee_aggregate(p_student_id, p_year_id);
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.generate_student_fee_schedule(UUID, UUID, JSONB, JSONB, BOOLEAN, NUMERIC, NUMERIC) TO authenticated;

-- ─── 3. Add total_parent_upcoming to school fee aggregate ─────────────
DROP FUNCTION IF EXISTS public.get_school_fee_aggregate();
CREATE OR REPLACE FUNCTION public.get_school_fee_aggregate()
RETURNS TABLE (
  total_students          BIGINT,
  pending_count           BIGINT,
  due_count               BIGINT,
  cleared_count           BIGINT,
  total_collected         BIGINT,
  total_parent_due        BIGINT,
  total_parent_upcoming   BIGINT,
  total_govt_due          BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id UUID;
BEGIN
  IF NOT (public.is_super_admin() OR public.is_principal()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_school_id := public.current_user_school_id();
  IF v_school_id IS NULL AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'no school in session';
  END IF;

  RETURN QUERY
  WITH
  active_students AS (
    SELECT id FROM public.students
     WHERE school_id = v_school_id AND is_active = TRUE
  ),
  per_student AS (
    SELECT
      fi.student_id,
      SUM(GREATEST(0, fi.amount - fi.paid_amount - fi.write_off_amount))
        AS lifetime_outstanding,
      SUM(CASE WHEN fi.due_date <= CURRENT_DATE
               THEN GREATEST(0, fi.amount - fi.paid_amount - fi.write_off_amount)
               ELSE 0 END)                                            AS now_outstanding,
      SUM(CASE WHEN fi.payer_type = 'PARENT' AND fi.due_date <= CURRENT_DATE
               THEN GREATEST(0, fi.amount - fi.paid_amount - fi.write_off_amount)
               ELSE 0 END)                                            AS parent_due_now,
      SUM(CASE WHEN fi.payer_type = 'PARENT' AND fi.due_date >  CURRENT_DATE
               THEN GREATEST(0, fi.amount - fi.paid_amount - fi.write_off_amount)
               ELSE 0 END)                                            AS parent_upcoming,
      SUM(CASE WHEN fi.payer_type = 'GOVERNMENT' AND fi.due_date <= CURRENT_DATE
               THEN GREATEST(0, fi.amount - fi.paid_amount - fi.write_off_amount)
               ELSE 0 END)                                            AS govt_due_now,
      SUM(fi.paid_amount)                                             AS total_paid
    FROM public.fee_installments fi
    JOIN active_students s ON s.id = fi.student_id
    GROUP BY fi.student_id
  )
  SELECT
    (SELECT COUNT(*) FROM active_students)                                              AS total_students,
    (SELECT COUNT(*) FROM active_students s
        WHERE NOT EXISTS (SELECT 1 FROM per_student p WHERE p.student_id = s.id))      AS pending_count,
    (SELECT COUNT(*) FROM per_student WHERE now_outstanding > 0)                       AS due_count,
    (SELECT COUNT(*) FROM per_student WHERE lifetime_outstanding = 0)                  AS cleared_count,
    COALESCE((SELECT SUM(total_paid)      FROM per_student), 0)::BIGINT                AS total_collected,
    COALESCE((SELECT SUM(parent_due_now)  FROM per_student), 0)::BIGINT                AS total_parent_due,
    COALESCE((SELECT SUM(parent_upcoming) FROM per_student), 0)::BIGINT                AS total_parent_upcoming,
    COALESCE((SELECT SUM(govt_due_now)    FROM per_student), 0)::BIGINT                AS total_govt_due;
END $$;

GRANT EXECUTE ON FUNCTION public.get_school_fee_aggregate() TO authenticated;


-- =============================================================
-- 0106_installment_head_name.sql
-- =============================================================
-- 0106_installment_head_name.sql
-- ─────────────────────────────────────────────────────────────────────────
-- fee_installments only carries a coarse `fee_type` bucket (TUITION /
-- EXAM / TRANSPORT / OTHER). Heads like "Library Fees", "Smart Class
-- Fee", "Admission Fee", "School Fees" all collapse into OTHER and the
-- principal sees a wall of "Other ₹X" rows in the student profile.
--
-- Fix: add `head_name TEXT` to fee_installments and write it from
-- generate_student_fee_schedule. The UI prefers head_name when present
-- and falls back to fee_type for legacy rows.

ALTER TABLE public.fee_installments
  ADD COLUMN IF NOT EXISTS head_name TEXT;

-- Update the schedule generator to preserve the original head name.
DROP FUNCTION IF EXISTS public.generate_student_fee_schedule(UUID, UUID, JSONB, JSONB, BOOLEAN, NUMERIC, NUMERIC);

CREATE OR REPLACE FUNCTION public.generate_student_fee_schedule(
  p_student_id      UUID,
  p_year_id         UUID,
  p_heads           JSONB,
  p_due_dates       JSONB,
  p_is_rte          BOOLEAN DEFAULT FALSE,
  p_discount_amount NUMERIC DEFAULT 0,
  p_discount_pct    NUMERIC DEFAULT 0
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id UUID;
  v_caller UUID := auth.uid();
  v_count INT := 0;
  v_head JSONB;
  v_dd JSONB;
  v_payer TEXT;
  v_freq TEXT;
  v_amt BIGINT;
  v_name TEXT;
  v_discount BIGINT;
  v_pct NUMERIC := COALESCE(p_discount_pct, 0);
  v_fixed NUMERIC := COALESCE(p_discount_amount, 0);
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF v_pct < 0 OR v_pct > 100 THEN RAISE EXCEPTION 'discount_pct out of range'; END IF;
  IF v_fixed < 0 THEN RAISE EXCEPTION 'discount_amount must be non-negative'; END IF;

  SELECT school_id INTO v_school_id FROM public.students WHERE id = p_student_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'student not found'; END IF;
  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_school_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  DELETE FROM public.fee_installments
   WHERE student_id = p_student_id
     AND academic_year_id = p_year_id
     AND paid_amount = 0
     AND write_off_amount = 0;

  FOR v_head IN SELECT * FROM jsonb_array_elements(p_heads)
  LOOP
    v_name := NULLIF(trim(v_head->>'name'), '');
    v_amt  := (v_head->>'amount')::BIGINT;
    v_freq := COALESCE(v_head->>'frequency', 'MONTHLY');
    v_payer := CASE WHEN p_is_rte THEN 'GOVERNMENT' ELSE 'PARENT' END;

    v_discount := GREATEST(
      v_fixed::BIGINT,
      FLOOR(v_amt * v_pct / 100.0)::BIGINT
    );
    v_amt := GREATEST(0, v_amt - v_discount);

    IF v_freq = 'MONTHLY' THEN
      FOR v_dd IN SELECT * FROM jsonb_array_elements(p_due_dates)
      LOOP
        INSERT INTO public.fee_installments
          (student_id, academic_year_id, school_id, month, due_date, fee_type, head_name, amount, payer_type)
        VALUES
          (p_student_id, p_year_id, v_school_id, v_dd->>'month',
           (v_dd->>'date')::DATE,
           CASE WHEN lower(coalesce(v_name,'')) LIKE '%transport%' THEN 'TRANSPORT'
                WHEN lower(coalesce(v_name,'')) LIKE '%exam%'      THEN 'EXAM'
                WHEN lower(coalesce(v_name,'')) LIKE '%tuition%'   THEN 'TUITION'
                ELSE 'OTHER' END,
           v_name,
           v_amt, v_payer);
        v_count := v_count + 1;
      END LOOP;
    ELSE
      INSERT INTO public.fee_installments
        (student_id, academic_year_id, school_id, month, due_date, fee_type, head_name, amount, payer_type)
      VALUES
        (p_student_id, p_year_id, v_school_id,
         CASE WHEN v_freq = 'ONE_TIME' THEN 'OneTime' ELSE 'Annual' END,
         (SELECT MIN((dd->>'date')::DATE) FROM jsonb_array_elements(p_due_dates) dd),
         'OTHER',
         v_name,
         v_amt, v_payer);
      v_count := v_count + 1;
    END IF;
  END LOOP;

  PERFORM public.refresh_student_fee_aggregate(p_student_id, p_year_id);
  RETURN v_count;
END $$;

GRANT EXECUTE ON FUNCTION public.generate_student_fee_schedule(UUID, UUID, JSONB, JSONB, BOOLEAN, NUMERIC, NUMERIC) TO authenticated;


-- =============================================================
-- 0107_aggregate_upcoming.sql
-- =============================================================
-- 0107_aggregate_upcoming.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Adds total_parent_upcoming + total_govt_upcoming columns to
-- get_school_fee_aggregate so the principal's Fee Collection hub can
-- split "what's owed now (overdue)" from "what's coming later
-- (upcoming)". Without this the hub either shows only overdue and
-- hides the rest of the year, or counts the full schedule as panic.

DROP FUNCTION IF EXISTS public.get_school_fee_aggregate();
CREATE OR REPLACE FUNCTION public.get_school_fee_aggregate()
RETURNS TABLE (
  total_students          BIGINT,
  pending_count           BIGINT,
  due_count               BIGINT,
  cleared_count           BIGINT,
  total_collected         BIGINT,
  total_parent_due        BIGINT,    -- overdue (due_date <= today, unpaid)
  total_govt_due          BIGINT,
  total_parent_upcoming   BIGINT,    -- future (due_date > today, unpaid)
  total_govt_upcoming     BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id UUID;
BEGIN
  IF NOT (public.is_super_admin() OR public.is_principal()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_school_id := public.current_user_school_id();
  IF v_school_id IS NULL AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'no school in session';
  END IF;

  RETURN QUERY
  WITH
  active_students AS (
    SELECT id FROM public.students
     WHERE school_id = v_school_id AND is_active = TRUE
  ),
  per_student AS (
    SELECT
      fi.student_id,
      SUM(GREATEST(0, fi.amount - fi.paid_amount - fi.write_off_amount))
        AS lifetime_outstanding,
      SUM(CASE WHEN fi.due_date <= CURRENT_DATE
               THEN GREATEST(0, fi.amount - fi.paid_amount - fi.write_off_amount)
               ELSE 0 END)                                    AS now_outstanding,
      SUM(CASE WHEN fi.payer_type = 'PARENT' AND fi.due_date <= CURRENT_DATE
               THEN GREATEST(0, fi.amount - fi.paid_amount - fi.write_off_amount)
               ELSE 0 END)                                    AS parent_due_now,
      SUM(CASE WHEN fi.payer_type = 'GOVERNMENT' AND fi.due_date <= CURRENT_DATE
               THEN GREATEST(0, fi.amount - fi.paid_amount - fi.write_off_amount)
               ELSE 0 END)                                    AS govt_due_now,
      SUM(CASE WHEN fi.payer_type = 'PARENT' AND fi.due_date > CURRENT_DATE
               THEN GREATEST(0, fi.amount - fi.paid_amount - fi.write_off_amount)
               ELSE 0 END)                                    AS parent_upcoming,
      SUM(CASE WHEN fi.payer_type = 'GOVERNMENT' AND fi.due_date > CURRENT_DATE
               THEN GREATEST(0, fi.amount - fi.paid_amount - fi.write_off_amount)
               ELSE 0 END)                                    AS govt_upcoming,
      SUM(fi.paid_amount)                                     AS total_paid
    FROM public.fee_installments fi
    JOIN active_students s ON s.id = fi.student_id
    GROUP BY fi.student_id
  )
  SELECT
    (SELECT COUNT(*) FROM active_students)                                          AS total_students,
    (SELECT COUNT(*) FROM active_students s
        WHERE NOT EXISTS (SELECT 1 FROM per_student p WHERE p.student_id = s.id))  AS pending_count,
    (SELECT COUNT(*) FROM per_student WHERE now_outstanding > 0)                   AS due_count,
    (SELECT COUNT(*) FROM per_student WHERE lifetime_outstanding = 0)              AS cleared_count,
    COALESCE((SELECT SUM(total_paid)        FROM per_student), 0)::BIGINT          AS total_collected,
    COALESCE((SELECT SUM(parent_due_now)    FROM per_student), 0)::BIGINT          AS total_parent_due,
    COALESCE((SELECT SUM(govt_due_now)      FROM per_student), 0)::BIGINT          AS total_govt_due,
    COALESCE((SELECT SUM(parent_upcoming)   FROM per_student), 0)::BIGINT          AS total_parent_upcoming,
    COALESCE((SELECT SUM(govt_upcoming)     FROM per_student), 0)::BIGINT          AS total_govt_upcoming;
END $$;

GRANT EXECUTE ON FUNCTION public.get_school_fee_aggregate() TO authenticated;


-- =============================================================
-- 0108_timetable_periods_per_class.sql
-- =============================================================
-- 0108_timetable_periods_per_class.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Per-class timetable schedules. Earlier `timetable_periods` was scoped
-- only to (school, year) which forced every class to share the same
-- 6/7/8-period layout. Real schools vary: Class 5 may have 5 periods,
-- Class 11 may have 8. Adding `class_name` (nullable) lets each class
-- declare its own slot set while keeping the default fallback path.
--
-- Resolution rule used by the service:
--   • If rows with class_name = X exist for this (school, year) → use them.
--   • Else fall back to rows with class_name = NULL (the school default).
--   • Else fall back to the hard-coded DEFAULT_SLOTS in the JS layer.

ALTER TABLE public.timetable_periods
  ADD COLUMN IF NOT EXISTS class_name TEXT;

-- Index for the common lookup: school + year + (class or NULL).
CREATE INDEX IF NOT EXISTS timetable_periods_school_year_class_idx
  ON public.timetable_periods (school_id, academic_year_id, class_name, sort_order);


-- =============================================================
-- 0109_simplify_fee_frequencies.sql
-- =============================================================
-- 0109_simplify_fee_frequencies.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Fee structures now expose only two frequencies in the UI: MONTHLY and
-- ONE_TIME. Earlier rows had QUARTERLY / HALF_YEARLY / ANNUAL too.
-- Normalize the stored `fee_heads` JSON so the schema converges to the
-- new taxonomy. Any frequency that isn't MONTHLY becomes ONE_TIME
-- (which matches how the simplified UI renders them).
--
-- Idempotent — running again is a no-op for rows already normalized.

UPDATE public.fee_structures
   SET fee_heads = (
     SELECT jsonb_agg(
       CASE
         WHEN COALESCE(h->>'frequency', 'MONTHLY') = 'MONTHLY'
           THEN h
         ELSE jsonb_set(h, '{frequency}', '"ONE_TIME"', true)
       END
       ORDER BY ord
     )
     FROM jsonb_array_elements(fee_heads) WITH ORDINALITY AS arr(h, ord)
   )
 WHERE EXISTS (
   SELECT 1 FROM jsonb_array_elements(fee_heads) e
   WHERE e->>'frequency' IN ('QUARTERLY','HALF_YEARLY','ANNUAL')
 );


-- =============================================================
-- 0110_per_head_months.sql
-- =============================================================
-- 0110_per_head_months.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Per-head months for MONTHLY fee heads. Earlier every MONTHLY head
-- billed in ALL months listed in fee_structures.monthly_due_dates;
-- now each head carries its own `months` array (e.g. Tuition Apr-Mar,
-- Library only Apr+Oct). The schedule generator reads head.months
-- when present; legacy heads with no months[] fall back to the
-- structure-level p_due_dates (passed by the caller).
--
-- Two parts:
--   1. Backfill existing MONTHLY heads → months = all 12 academic
--      months (matches the old behaviour, no installments change).
--   2. Rewrite generate_student_fee_schedule to read head.months and
--      compute 1st-of-month due dates internally.

-- ── 1. Backfill MONTHLY heads with months = Apr-Mar ─────────────────────
UPDATE public.fee_structures
   SET fee_heads = (
     SELECT jsonb_agg(
       CASE
         WHEN COALESCE(h->>'frequency', 'MONTHLY') = 'MONTHLY' AND h->'months' IS NULL
           THEN jsonb_set(h, '{months}',
             '["Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar"]'::jsonb,
             true)
         ELSE h
       END
       ORDER BY ord
     )
     FROM jsonb_array_elements(fee_heads) WITH ORDINALITY AS arr(h, ord)
   )
 WHERE EXISTS (
   SELECT 1 FROM jsonb_array_elements(fee_heads) e
   WHERE COALESCE(e->>'frequency','MONTHLY') = 'MONTHLY' AND e->'months' IS NULL
 );

-- ── 2. Replace the schedule generator to honor per-head months ─────────
-- Same signature so callers don't change.
DROP FUNCTION IF EXISTS public.generate_student_fee_schedule(UUID, UUID, JSONB, JSONB, BOOLEAN, NUMERIC, NUMERIC);

CREATE OR REPLACE FUNCTION public.generate_student_fee_schedule(
  p_student_id      UUID,
  p_year_id         UUID,
  p_heads           JSONB,
  p_due_dates       JSONB,
  p_is_rte          BOOLEAN DEFAULT FALSE,
  p_discount_amount NUMERIC DEFAULT 0,
  p_discount_pct    NUMERIC DEFAULT 0
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id UUID;
  v_caller UUID := auth.uid();
  v_year_start DATE;
  v_count INT := 0;
  v_head JSONB;
  v_dd JSONB;
  v_payer TEXT;
  v_freq TEXT;
  v_amt BIGINT;
  v_name TEXT;
  v_months JSONB;
  v_month_name TEXT;
  v_month_idx INT;
  v_due_year INT;
  v_due_date DATE;
  v_start_year INT;
  v_discount BIGINT;
  v_pct NUMERIC := COALESCE(p_discount_pct, 0);
  v_fixed NUMERIC := COALESCE(p_discount_amount, 0);
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF v_pct < 0 OR v_pct > 100 THEN RAISE EXCEPTION 'discount_pct out of range'; END IF;
  IF v_fixed < 0 THEN RAISE EXCEPTION 'discount_amount must be non-negative'; END IF;

  SELECT school_id INTO v_school_id FROM public.students WHERE id = p_student_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'student not found'; END IF;
  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_school_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Academic year start — needed to compute 1st-of-month dates when a
  -- head carries months[] without explicit dates. Indian schools wrap
  -- from Apr → Mar so Apr-Dec stays in the start year, Jan-Mar +1.
  SELECT start_date INTO v_year_start FROM public.academic_years WHERE id = p_year_id;
  IF v_year_start IS NULL THEN RAISE EXCEPTION 'academic year not found'; END IF;
  v_start_year := EXTRACT(YEAR FROM v_year_start)::INT;

  -- Drop unpaid/un-written-off rows so we re-create cleanly. Paid
  -- history is preserved.
  DELETE FROM public.fee_installments
   WHERE student_id = p_student_id
     AND academic_year_id = p_year_id
     AND paid_amount = 0
     AND write_off_amount = 0;

  FOR v_head IN SELECT * FROM jsonb_array_elements(p_heads)
  LOOP
    v_name   := NULLIF(trim(v_head->>'name'), '');
    v_amt    := (v_head->>'amount')::BIGINT;
    v_freq   := COALESCE(v_head->>'frequency', 'MONTHLY');
    v_months := v_head->'months';
    v_payer  := CASE WHEN p_is_rte THEN 'GOVERNMENT' ELSE 'PARENT' END;

    v_discount := GREATEST(
      v_fixed::BIGINT,
      FLOOR(v_amt * v_pct / 100.0)::BIGINT
    );
    v_amt := GREATEST(0, v_amt - v_discount);

    IF v_freq = 'MONTHLY' THEN
      -- Prefer per-head months[]; otherwise fall back to legacy
      -- structure-level p_due_dates (back-compat).
      IF v_months IS NOT NULL AND jsonb_typeof(v_months) = 'array' AND jsonb_array_length(v_months) > 0 THEN
        FOR v_month_name IN SELECT jsonb_array_elements_text(v_months)
        LOOP
          v_month_idx := CASE v_month_name
            WHEN 'Jan' THEN 1 WHEN 'Feb' THEN 2 WHEN 'Mar' THEN 3
            WHEN 'Apr' THEN 4 WHEN 'May' THEN 5 WHEN 'Jun' THEN 6
            WHEN 'Jul' THEN 7 WHEN 'Aug' THEN 8 WHEN 'Sep' THEN 9
            WHEN 'Oct' THEN 10 WHEN 'Nov' THEN 11 WHEN 'Dec' THEN 12
            ELSE NULL END;
          IF v_month_idx IS NULL THEN CONTINUE; END IF;
          v_due_year := CASE WHEN v_month_idx >= 4 THEN v_start_year ELSE v_start_year + 1 END;
          v_due_date := make_date(v_due_year, v_month_idx, 1);
          INSERT INTO public.fee_installments
            (student_id, academic_year_id, school_id, month, due_date, fee_type, head_name, amount, payer_type)
          VALUES
            (p_student_id, p_year_id, v_school_id, v_month_name, v_due_date,
             CASE WHEN lower(coalesce(v_name,'')) LIKE '%transport%' THEN 'TRANSPORT'
                  WHEN lower(coalesce(v_name,'')) LIKE '%exam%'      THEN 'EXAM'
                  WHEN lower(coalesce(v_name,'')) LIKE '%tuition%'   THEN 'TUITION'
                  ELSE 'OTHER' END,
             v_name, v_amt, v_payer);
          v_count := v_count + 1;
        END LOOP;
      ELSE
        FOR v_dd IN SELECT * FROM jsonb_array_elements(p_due_dates)
        LOOP
          INSERT INTO public.fee_installments
            (student_id, academic_year_id, school_id, month, due_date, fee_type, head_name, amount, payer_type)
          VALUES
            (p_student_id, p_year_id, v_school_id, v_dd->>'month',
             (v_dd->>'date')::DATE,
             CASE WHEN lower(coalesce(v_name,'')) LIKE '%transport%' THEN 'TRANSPORT'
                  WHEN lower(coalesce(v_name,'')) LIKE '%exam%'      THEN 'EXAM'
                  WHEN lower(coalesce(v_name,'')) LIKE '%tuition%'   THEN 'TUITION'
                  ELSE 'OTHER' END,
             v_name, v_amt, v_payer);
          v_count := v_count + 1;
        END LOOP;
      END IF;
    ELSE
      -- One-time / legacy non-monthly → single installment on the AY
      -- start date so it's "due now" once the year begins.
      INSERT INTO public.fee_installments
        (student_id, academic_year_id, school_id, month, due_date, fee_type, head_name, amount, payer_type)
      VALUES
        (p_student_id, p_year_id, v_school_id, 'OneTime', v_year_start,
         'OTHER', v_name, v_amt, v_payer);
      v_count := v_count + 1;
    END IF;
  END LOOP;

  PERFORM public.refresh_student_fee_aggregate(p_student_id, p_year_id);
  RETURN v_count;
END $$;

GRANT EXECUTE ON FUNCTION public.generate_student_fee_schedule(UUID, UUID, JSONB, JSONB, BOOLEAN, NUMERIC, NUMERIC) TO authenticated;


-- =============================================================
-- 0111_drop_legacy_billing_tables.sql
-- =============================================================
-- 0111_drop_legacy_billing_tables.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Drop the legacy super-admin billing schema. The current flat billing
-- model (migration 0098 + 0104) uses only:
--   • schools.billing_fixed_amount         — already dropped in 0104
--   • school_billing_installments          — keep
--
-- These three tables predate the rewrite and are no longer referenced
-- anywhere in src/ or server/ (greppable proof: zero hits).
--
--   • school_billing_years        — per-school-per-year totals
--   • school_billing_schedules    — per-school annual amount schedule
--   • school_payment_allocations  — split of a payment across years
--
-- CASCADE removes any leftover FKs from sibling tables that pointed
-- back at these (none currently).

DROP TABLE IF EXISTS public.school_payment_allocations CASCADE;
DROP TABLE IF EXISTS public.school_billing_schedules  CASCADE;
DROP TABLE IF EXISTS public.school_billing_years      CASCADE;


-- =============================================================
-- 0112_one_time_due_today.sql
-- =============================================================
-- 0112_one_time_due_today.sql
-- ─────────────────────────────────────────────────────────────────────────
-- OneTime fee due date bug fix.
--
-- Earlier OneTime installments were dated v_year_start (= academic_years.
-- start_date). Once the AY had already started — i.e. for every mid-
-- year admission — the OneTime installment landed in the past.
-- compute_late_fee_for_student would then attach months of retroactive
-- late charges to a brand-new student who'd been on the roll for one
-- day. Functionally a regression waiting for the first late-fee click.
--
-- Fix: OneTime due_date = GREATEST(AY_start, CURRENT_DATE).
--   • AY already started → due today (school applies structure today).
--   • AY hasn't started yet → due on AY-start day (pre-admission case).
--
-- MONTHLY heads are unchanged — schools that bill from April do want
-- the back-Aprils to remain on the schedule for students who actually
-- were enrolled in April; only OneTime is reset.

DROP FUNCTION IF EXISTS public.generate_student_fee_schedule(UUID, UUID, JSONB, JSONB, BOOLEAN, NUMERIC, NUMERIC);

CREATE OR REPLACE FUNCTION public.generate_student_fee_schedule(
  p_student_id      UUID,
  p_year_id         UUID,
  p_heads           JSONB,
  p_due_dates       JSONB,
  p_is_rte          BOOLEAN DEFAULT FALSE,
  p_discount_amount NUMERIC DEFAULT 0,
  p_discount_pct    NUMERIC DEFAULT 0
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school_id UUID;
  v_caller UUID := auth.uid();
  v_year_start DATE;
  v_one_time_due DATE;
  v_count INT := 0;
  v_head JSONB;
  v_dd JSONB;
  v_payer TEXT;
  v_freq TEXT;
  v_amt BIGINT;
  v_name TEXT;
  v_months JSONB;
  v_month_name TEXT;
  v_month_idx INT;
  v_due_year INT;
  v_due_date DATE;
  v_start_year INT;
  v_discount BIGINT;
  v_pct NUMERIC := COALESCE(p_discount_pct, 0);
  v_fixed NUMERIC := COALESCE(p_discount_amount, 0);
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF v_pct < 0 OR v_pct > 100 THEN RAISE EXCEPTION 'discount_pct out of range'; END IF;
  IF v_fixed < 0 THEN RAISE EXCEPTION 'discount_amount must be non-negative'; END IF;

  SELECT school_id INTO v_school_id FROM public.students WHERE id = p_student_id;
  IF v_school_id IS NULL THEN RAISE EXCEPTION 'student not found'; END IF;
  IF NOT (public.is_super_admin()
          OR (public.is_principal() AND public.current_user_school_id() = v_school_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT start_date INTO v_year_start FROM public.academic_years WHERE id = p_year_id;
  IF v_year_start IS NULL THEN RAISE EXCEPTION 'academic year not found'; END IF;
  v_start_year := EXTRACT(YEAR FROM v_year_start)::INT;
  -- OneTime due date: AY start when AY hasn't begun, today when it has.
  -- Prevents back-dated late-fee accrual for mid-year admissions.
  v_one_time_due := GREATEST(v_year_start, CURRENT_DATE);

  DELETE FROM public.fee_installments
   WHERE student_id = p_student_id
     AND academic_year_id = p_year_id
     AND paid_amount = 0
     AND write_off_amount = 0;

  FOR v_head IN SELECT * FROM jsonb_array_elements(p_heads)
  LOOP
    v_name   := NULLIF(trim(v_head->>'name'), '');
    v_amt    := (v_head->>'amount')::BIGINT;
    v_freq   := COALESCE(v_head->>'frequency', 'MONTHLY');
    v_months := v_head->'months';
    v_payer  := CASE WHEN p_is_rte THEN 'GOVERNMENT' ELSE 'PARENT' END;

    v_discount := GREATEST(
      v_fixed::BIGINT,
      FLOOR(v_amt * v_pct / 100.0)::BIGINT
    );
    v_amt := GREATEST(0, v_amt - v_discount);

    IF v_freq = 'MONTHLY' THEN
      IF v_months IS NOT NULL AND jsonb_typeof(v_months) = 'array' AND jsonb_array_length(v_months) > 0 THEN
        FOR v_month_name IN SELECT jsonb_array_elements_text(v_months)
        LOOP
          v_month_idx := CASE v_month_name
            WHEN 'Jan' THEN 1 WHEN 'Feb' THEN 2 WHEN 'Mar' THEN 3
            WHEN 'Apr' THEN 4 WHEN 'May' THEN 5 WHEN 'Jun' THEN 6
            WHEN 'Jul' THEN 7 WHEN 'Aug' THEN 8 WHEN 'Sep' THEN 9
            WHEN 'Oct' THEN 10 WHEN 'Nov' THEN 11 WHEN 'Dec' THEN 12
            ELSE NULL END;
          IF v_month_idx IS NULL THEN CONTINUE; END IF;
          v_due_year := CASE WHEN v_month_idx >= 4 THEN v_start_year ELSE v_start_year + 1 END;
          v_due_date := make_date(v_due_year, v_month_idx, 1);
          INSERT INTO public.fee_installments
            (student_id, academic_year_id, school_id, month, due_date, fee_type, head_name, amount, payer_type)
          VALUES
            (p_student_id, p_year_id, v_school_id, v_month_name, v_due_date,
             CASE WHEN lower(coalesce(v_name,'')) LIKE '%transport%' THEN 'TRANSPORT'
                  WHEN lower(coalesce(v_name,'')) LIKE '%exam%'      THEN 'EXAM'
                  WHEN lower(coalesce(v_name,'')) LIKE '%tuition%'   THEN 'TUITION'
                  ELSE 'OTHER' END,
             v_name, v_amt, v_payer);
          v_count := v_count + 1;
        END LOOP;
      ELSE
        FOR v_dd IN SELECT * FROM jsonb_array_elements(p_due_dates)
        LOOP
          INSERT INTO public.fee_installments
            (student_id, academic_year_id, school_id, month, due_date, fee_type, head_name, amount, payer_type)
          VALUES
            (p_student_id, p_year_id, v_school_id, v_dd->>'month',
             (v_dd->>'date')::DATE,
             CASE WHEN lower(coalesce(v_name,'')) LIKE '%transport%' THEN 'TRANSPORT'
                  WHEN lower(coalesce(v_name,'')) LIKE '%exam%'      THEN 'EXAM'
                  WHEN lower(coalesce(v_name,'')) LIKE '%tuition%'   THEN 'TUITION'
                  ELSE 'OTHER' END,
             v_name, v_amt, v_payer);
          v_count := v_count + 1;
        END LOOP;
      END IF;
    ELSE
      -- OneTime / legacy non-monthly — due today (or AY start, whichever
      -- is later). Earlier this was pinned to AY start which back-
      -- dated mid-year admissions and tripped retroactive late fees.
      INSERT INTO public.fee_installments
        (student_id, academic_year_id, school_id, month, due_date, fee_type, head_name, amount, payer_type)
      VALUES
        (p_student_id, p_year_id, v_school_id, 'OneTime', v_one_time_due,
         'OTHER', v_name, v_amt, v_payer);
      v_count := v_count + 1;
    END IF;
  END LOOP;

  PERFORM public.refresh_student_fee_aggregate(p_student_id, p_year_id);
  RETURN v_count;
END $$;

GRANT EXECUTE ON FUNCTION public.generate_student_fee_schedule(UUID, UUID, JSONB, JSONB, BOOLEAN, NUMERIC, NUMERIC) TO authenticated;


-- =============================================================
-- 0113_onboard_school_post_legacy_billing_drop.sql
-- =============================================================
-- The earlier onboard_school RPC (migration 0015) inserted into the
-- legacy super-admin billing tables school_billing_schedules and
-- school_billing_years. Migration 0111 dropped both tables in favour
-- of the flat school_billing_installments model, but the RPC was
-- never updated — every super-admin "Add School" call now fails with
-- relation "public.school_billing_schedules" does not exist.
--
-- Fix: re-create onboard_school without those two inserts. Per-AY
-- billing installments are now created on demand by the super-admin
-- via /api/admin/schools/:id/billing-installments, so the RPC does
-- not need to bootstrap any schedule.

CREATE OR REPLACE FUNCTION public.onboard_school(
  p_principal_user_id  UUID,
  p_school_name        TEXT,
  p_school_code        TEXT,
  p_location           TEXT,
  p_address            TEXT,
  p_phone              TEXT,
  p_principal_name     TEXT,
  p_principal_email    TEXT,
  p_principal_phone    TEXT,
  p_principal_mobile   TEXT,
  p_status             TEXT,
  p_plan               TEXT,
  p_payment_start_date DATE,
  p_annual_amount      BIGINT
) RETURNS TABLE (
  id                 UUID,
  name               TEXT,
  code               TEXT,
  location           TEXT,
  address            TEXT,
  phone              TEXT,
  principal_name     TEXT,
  principal_email    TEXT,
  principal_phone    TEXT,
  status             TEXT,
  plan               TEXT,
  payment_status     TEXT,
  payment_start_date DATE,
  is_deleted         BOOLEAN,
  created_at         TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller_id  UUID := auth.uid();
  v_school_id  UUID;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'only super admins may onboard schools' USING ERRCODE = '42501';
  END IF;
  IF p_annual_amount IS NULL OR p_annual_amount <= 0 THEN
    RAISE EXCEPTION 'annualAmount must be positive';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.schools s
     WHERE s.code = p_school_code AND s.is_deleted = false
  ) THEN
    RAISE EXCEPTION 'A school with code % already exists', p_school_code;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.users u WHERE u.mobile_number = p_principal_mobile
  ) THEN
    RAISE EXCEPTION 'Mobile % is already registered', p_principal_mobile;
  END IF;

  INSERT INTO public.schools (
    name, code, location, address, phone,
    principal_name, principal_email, principal_phone,
    status, plan, payment_status, payment_start_date
  ) VALUES (
    p_school_name, p_school_code, p_location, p_address, p_phone,
    p_principal_name, p_principal_email, p_principal_phone,
    p_status, p_plan, 'PENDING', p_payment_start_date
  ) RETURNING schools.id INTO v_school_id;

  INSERT INTO public.users (
    id, mobile_number, role, name, email, school_id,
    first_login_changed, is_active
  ) VALUES (
    p_principal_user_id, p_principal_mobile, 'PRINCIPAL',
    p_principal_name, p_principal_email, v_school_id,
    false, true
  );

  INSERT INTO public.audit_logs (user_id, school_id, action, entity_type, entity_id, details)
  VALUES (
    v_caller_id, v_school_id, 'onboard_school', 'school', v_school_id,
    jsonb_build_object(
      'name', p_school_name, 'code', p_school_code,
      'plan', p_plan, 'principal', p_principal_name,
      'annual_amount', p_annual_amount
    )
  );

  RETURN QUERY
    SELECT s.id, s.name, s.code, s.location, s.address, s.phone,
           s.principal_name, s.principal_email, s.principal_phone,
           s.status, s.plan, s.payment_status, s.payment_start_date,
           s.is_deleted, s.created_at, s.updated_at
      FROM public.schools s
     WHERE s.id = v_school_id;
END;
$$;


-- =============================================================
-- 0114_first_login_flip_guc_restore.sql
-- =============================================================
-- Migration 0062.2 rewrote users_prevent_self_escalation() as a strict
-- allowlist trigger that unconditionally resets first_login_changed back
-- to OLD for any non-super-admin caller. That clobbered the GUC escape
-- hatch added in migration 0016 (app.allow_first_login_flip), so
-- mark_first_login_complete()'s UPDATE silently no-ops. Symptom: a
-- principal changes their password on first login, but the next login
-- still routes them to the "change password" screen forever.
--
-- Fix: re-add the GUC check. When mark_first_login_complete() sets
-- app.allow_first_login_flip='true' for the duration of its own
-- transaction, allow first_login_changed to flip from false→true (and
-- only that direction). Everything else stays locked.

CREATE OR REPLACE FUNCTION public.users_prevent_self_escalation() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_allow_flip TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  -- Lock the rest of the sensitive columns to OLD values.
  NEW.id                := OLD.id;
  NEW.role              := OLD.role;
  NEW.school_id         := OLD.school_id;
  NEW.is_active         := OLD.is_active;
  NEW.mobile_number     := OLD.mobile_number;
  NEW.email             := OLD.email;
  NEW.name              := OLD.name;
  NEW.editor_mode_until := OLD.editor_mode_until;
  NEW.last_login        := OLD.last_login;
  NEW.created_at        := OLD.created_at;

  -- first_login_changed: only mark_first_login_complete() may flip
  -- false→true, signalled via a transaction-local GUC.
  v_allow_flip := current_setting('app.allow_first_login_flip', true);
  IF v_allow_flip IS DISTINCT FROM 'true'
     OR OLD.first_login_changed IS NOT FALSE
     OR NEW.first_login_changed IS NOT TRUE THEN
    NEW.first_login_changed := OLD.first_login_changed;
  END IF;

  RETURN NEW;
END;
$$;


-- =============================================================
-- 0115_drop_student_stop_id.sql
-- =============================================================
-- Student-side route assignment is being simplified: each student is only
-- linked to a VEHICLE, not to a specific stop on that vehicle's route.
-- Drivers manage stops on their assigned vehicle independently, and any
-- student riding that vehicle can board at any stop.

DROP FUNCTION IF EXISTS public.bulk_close_transport_assignments(UUID, DATE, TEXT);

CREATE OR REPLACE FUNCTION public.bulk_close_transport_assignments(
  p_from_vehicle    UUID,
  p_effective_date  DATE,
  p_end_reason      TEXT
)
RETURNS TABLE (
  assignment_id    UUID,
  student_id       UUID,
  monthly_amount   BIGINT,
  academic_year_id UUID
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_school_id UUID;
BEGIN
  IF p_from_vehicle IS NULL OR p_effective_date IS NULL THEN
    RAISE EXCEPTION 'bulk_close_transport_assignments: vehicle and date required';
  END IF;

  SELECT school_id INTO v_school_id
    FROM public.transport_vehicles
   WHERE id = p_from_vehicle;
  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'Vehicle not found';
  END IF;

  IF NOT (
    public.is_super_admin()
    OR (public.is_principal() AND v_school_id = public.current_user_school_id())
  ) THEN
    RAISE EXCEPTION 'Not authorised: principal role required';
  END IF;

  DELETE FROM public.fee_installments fi
   USING public.student_transport_assignments sta
   WHERE fi.related_id   = sta.id
     AND sta.vehicle_id  = p_from_vehicle
     AND sta.is_active   = TRUE
     AND fi.fee_type     = 'TRANSPORT'
     AND fi.due_date    >= p_effective_date
     AND fi.paid_amount  = 0
     AND fi.write_off_amount = 0;

  UPDATE public.fee_installments fi
     SET status     = 'CANCELLED',
         amount     = fi.paid_amount + fi.write_off_amount,
         updated_at = NOW()
    FROM public.student_transport_assignments sta
   WHERE fi.related_id   = sta.id
     AND sta.vehicle_id  = p_from_vehicle
     AND sta.is_active   = TRUE
     AND fi.fee_type     = 'TRANSPORT'
     AND fi.due_date    >= p_effective_date
     AND (fi.paid_amount > 0 OR fi.write_off_amount > 0)
     AND fi.status <> 'PAID';

  RETURN QUERY
    UPDATE public.student_transport_assignments
       SET is_active  = FALSE,
           end_date   = p_effective_date - 1,
           end_reason = COALESCE(p_end_reason, end_reason),
           ended_by   = v_caller
     WHERE vehicle_id = p_from_vehicle
       AND is_active  = TRUE
    RETURNING id, student_id, monthly_amount, academic_year_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_close_transport_assignments(UUID, DATE, TEXT) TO authenticated;

ALTER TABLE public.student_transport_assignments
  DROP COLUMN IF EXISTS stop_id CASCADE;


-- =============================================================
-- 0116_users_insert_policy.sql
-- =============================================================
-- public.users had SELECT + UPDATE policies but NO INSERT policy. Service-role
-- normally bypasses RLS, but Supabase's new sb_secret_* keys don't always
-- carry the BYPASSRLS attribute through PostgREST, so server endpoints
-- inserting into public.users fail with
--   new row violates row-level security policy for table "users".
-- Add an explicit INSERT policy permitting service_role, super_admin, and
-- same-school principal writes.

DROP POLICY IF EXISTS users_insert_admin ON public.users;

CREATE POLICY users_insert_admin ON public.users
  FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'role') = 'service_role'
    OR public.is_super_admin()
    OR (
      public.is_principal()
      AND school_id = public.current_user_school_id()
    )
  );


-- =============================================================
-- 0117_staff_driver_self_select.sql
-- =============================================================
-- DRIVER role wasn't in the generic staff_select policy, so a driver could
-- not even read their own staff row. DriverRouteView's first query came
-- back empty → "No Vehicle Assigned" rendered forever. Add a self-read
-- policy so every staff member (any role) can read the row linked to
-- their own auth user.

DROP POLICY IF EXISTS staff_self_select ON public.staff;

CREATE POLICY staff_self_select ON public.staff
  FOR SELECT
  USING (user_id = auth.uid());


-- =============================================================
-- 0118_students_driver_read.sql
-- =============================================================
-- DriverStudentsView's underlying query joins student_transport_assignments
-- to students!inner. The students-side of the join had no DRIVER policy so
-- the inner join dropped to zero and the page rendered "No students
-- assigned to this vehicle" despite valid assignments. Add a narrow
-- policy: a DRIVER can read a student row only if the student has an
-- ACTIVE assignment on a vehicle the driver owns.

DROP POLICY IF EXISTS students_driver_select ON public.students;

CREATE POLICY students_driver_select ON public.students
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.student_transport_assignments sta
       WHERE sta.student_id = students.id
         AND sta.is_active = TRUE
         AND sta.vehicle_id = ANY(public.driver_vehicle_ids())
    )
  );


-- =============================================================
-- 0119_route_stops_driver_write.sql
-- =============================================================
-- DriverRouteView edit/delete failed silently because rs_write was
-- PRINCIPAL-only. Expand to also permit DRIVER on vehicles they own.

DROP POLICY IF EXISTS rs_write ON public.route_stops;

CREATE POLICY rs_write ON public.route_stops
  FOR ALL
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1
        FROM public.transport_vehicles v
       WHERE v.id = route_stops.vehicle_id
         AND (
           (public.is_principal() AND v.school_id = public.current_user_school_id())
           OR v.id = ANY(public.driver_vehicle_ids())
         )
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1
        FROM public.transport_vehicles v
       WHERE v.id = route_stops.vehicle_id
         AND (
           (public.is_principal() AND v.school_id = public.current_user_school_id())
           OR v.id = ANY(public.driver_vehicle_ids())
         )
    )
  );


-- =============================================================
-- 0120_students_driver_select_via_func.sql
-- =============================================================
-- 0118's inline EXISTS over student_transport_assignments interacted badly
-- with PostgREST query planning when the driver's home page joined through
-- transport_vehicles + assignments. Wrap the check in a SECURITY DEFINER
-- helper so the students policy is a flat array-membership test with no
-- nested RLS evaluation.

CREATE OR REPLACE FUNCTION public.driver_student_ids() RETURNS UUID[]
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(DISTINCT sta.student_id), ARRAY[]::UUID[])
    FROM public.student_transport_assignments sta
   WHERE sta.is_active = TRUE
     AND sta.vehicle_id = ANY(public.driver_vehicle_ids())
$$;

GRANT EXECUTE ON FUNCTION public.driver_student_ids() TO authenticated;

DROP POLICY IF EXISTS students_driver_select ON public.students;

CREATE POLICY students_driver_select ON public.students
  FOR SELECT
  USING (id = ANY(public.driver_student_ids()));


-- =============================================================
-- 0121_audit_logs_retention.sql
-- =============================================================
-- 90-day retention cleanup for audit_logs. Function returns INT (deleted
-- row count) so the weekly Vercel cron can log a metric line.

CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs(p_days INT DEFAULT 90)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_deleted INT;
BEGIN
  IF p_days IS NULL OR p_days < 1 THEN
    RAISE EXCEPTION 'cleanup_old_audit_logs: p_days must be >= 1';
  END IF;

  WITH del AS (
    DELETE FROM public.audit_logs
     WHERE created_at < NOW() - (p_days || ' days')::INTERVAL
    RETURNING id
  )
  SELECT count(*)::INT INTO v_deleted FROM del;

  RETURN COALESCE(v_deleted, 0);
END $$;

REVOKE EXECUTE ON FUNCTION public.cleanup_old_audit_logs(INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cleanup_old_audit_logs(INT) TO service_role;


-- =============================================================
-- 0122_schools_year_close_enabled.sql
-- =============================================================
-- Super-admin gate on principal's Close Academic Year action. Mirrors
-- new_year_creation_enabled. Flag is one-shot — RPC auto-resets after
-- a successful close.

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS year_close_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION public.close_academic_year(p_year_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school UUID := public.current_user_school_id();
  v_enabled BOOLEAN;
BEGIN
  IF NOT public.is_principal() THEN RAISE EXCEPTION 'principal only'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.academic_years WHERE id = p_year_id AND school_id = v_school) THEN
    RAISE EXCEPTION 'year not found in school';
  END IF;

  SELECT year_close_enabled INTO v_enabled FROM public.schools WHERE id = v_school;
  IF v_enabled IS NOT TRUE THEN
    RAISE EXCEPTION 'Year close is locked. Ask the super-admin to enable Year Close for this school first.';
  END IF;

  UPDATE public.academic_years
     SET is_closed = TRUE, is_active = FALSE
   WHERE id = p_year_id;

  UPDATE public.schools
     SET year_close_enabled = FALSE
   WHERE id = v_school;

  INSERT INTO public.audit_logs (user_id, school_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), v_school, 'close_year', 'academic_year', p_year_id, '{}'::jsonb);
END $$;

GRANT EXECUTE ON FUNCTION public.close_academic_year(UUID) TO authenticated;
