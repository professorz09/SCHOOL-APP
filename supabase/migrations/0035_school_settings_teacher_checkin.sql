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
