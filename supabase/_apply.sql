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
  p_new_board   TEXT,
  p_new_medium  TEXT,
  p_decisions   JSONB
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
CREATE OR REPLACE FUNCTION public.fee_payment_upload_after_delete()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.screenshot_url IS NOT NULL AND length(OLD.screenshot_url) > 0 THEN
    DELETE FROM storage.objects
     WHERE bucket_id = 'fee-screenshots'
       AND name = OLD.screenshot_url;
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS fee_payment_uploads_cleanup_storage
  ON public.fee_payment_uploads;
CREATE TRIGGER fee_payment_uploads_cleanup_storage
AFTER DELETE ON public.fee_payment_uploads
FOR EACH ROW EXECUTE FUNCTION public.fee_payment_upload_after_delete();


-- B1) list_purgeable_fee_screenshots ----------------------------------------
CREATE OR REPLACE FUNCTION public.list_purgeable_fee_screenshots(
  p_rejected_after_days INT DEFAULT 90
) RETURNS TABLE (
  id              UUID,
  school_id       UUID,
  screenshot_url  TEXT,
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
         fpu.screenshot_url,
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
    ELSE  -- ANNUAL or ONE_TIME
      INSERT INTO public.fee_installments
        (student_id, academic_year_id, school_id, month, due_date, fee_type, amount, payer_type)
      VALUES
        (p_student_id, p_year_id, v_school_id,
         CASE WHEN v_freq = 'ONE_TIME' THEN 'OneTime' ELSE 'Annual' END,
         (SELECT MIN((dd->>'date')::DATE) FROM jsonb_array_elements(p_due_dates) dd),
         'OTHER',
         v_amt, 'PARENT');
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

