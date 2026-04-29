# EduGrow School Management

A school management application with React frontend and Supabase (Postgres + Auth + RLS) backend. Supports Super Admin, Principal, Teacher, Student/Parent, and Driver roles.

## Tech Stack

### Frontend
- **Framework:** React 19 + TypeScript
- **Build tool:** Vite 6 (port 5000)
- **Styling:** Tailwind CSS v4 (via `@tailwindcss/vite`)
- **Icons:** lucide-react
- **Animation:** motion
- **AI:** `@google/genai` (Gemini), used in views like `ExamPaperGenerator`
- **State:** Zustand

### Backend
- **Database + Auth:** Supabase (Postgres with Row Level Security)
- **Client:** `@supabase/supabase-js` — frontend talks directly to Supabase
- **No custom server** — security is enforced via RLS policies

## Project Structure

```
/
├── src/                      # React frontend
│   ├── App.tsx               # Login gate + dashboard router
│   ├── main.tsx              # Entry point
│   ├── lib/
│   │   ├── supabase.ts       # Browser Supabase client (anon key, RLS)
│   │   ├── adminApi.ts       # Wrapper for /api/admin/* dev endpoints
│   │   └── audit.ts          # Calls public.log_audit() RPC
│   ├── components/
│   │   ├── LoginPage.tsx
│   │   ├── FirstLoginPasswordChange.tsx
│   │   └── Navigation.tsx
│   ├── services/
│   │   ├── auth.service.ts             # Supabase Auth wrapper
│   │   ├── school.service.ts           # Supabase-backed (Task #2)
│   │   ├── billing.service.ts          # Supabase-backed (Task #2)
│   │   ├── broadcast.service.ts        # Supabase-backed (Task #2)
│   │   ├── admin.service.ts            # Supabase-backed (Task #2)
│   │   ├── logs.service.ts             # Supabase-backed (Task #2)
│   │   ├── yearClosing.service.ts      # Supabase-backed; uses atomic commit_year_closing RPC (migration 0007)
│   │   ├── studentDashboard.service.ts # Supabase-backed (Task #4) — student/parent reads + complaint/fee-screenshot writes
│   │   └── ...                         # Other services migrating in tasks #3 / #5
│   ├── store/                # Zustand stores
│   ├── features/             # Per-role UI (principal, super-admin, teacher, student, driver)
│   ├── views/
│   └── types/
├── vite-plugins/
│   └── admin-api.ts          # Vite middleware exposing /api/admin/* (service-role key, dev+preview)
├── supabase/
│   ├── migrations/
│   │   ├── 0001_init.sql                  # Full schema + RLS helpers + policies
│   │   ├── 0002_super_admin.sql           # Audit, cascade, billing RPCs, broadcast cols
│   │   ├── 0011_fee_payment_uploads.sql   # Parent/student fee-screenshot submissions (Task #4)
│   │   └── 0014_fee_screenshots_cleanup.sql # Storage hygiene for fee screenshots (Task #12)
│   └── _apply.sql            # Auto-generated combined file (run in Dashboard SQL Editor)
└── scripts/
    ├── supabase-admin.ts            # Service-role client for migrate/seed
    ├── migrate.ts                   # Builds supabase/_apply.sql
    ├── apply-sql.ts                 # Applies supabase/_apply.sql via the pooler
    ├── seed-super-admin.ts          # Creates initial Super Admin
    └── cleanup-fee-screenshots.ts   # Cron-style purge of stale fee screenshots
```

## Super Admin module (Task #2)

The five SA services (school / billing / broadcast / admin / logs) are wired to
Supabase. Every operation that needs the service-role key (creating principal
auth accounts, resetting passwords, deactivating users, soft-deleting schools)
goes through `vite-plugins/admin-api.ts`, which:

1. Verifies the caller's JWT (`supabase.auth.getUser(token)`).
2. Confirms the caller is an active `SUPER_ADMIN` in `public.users`.
3. Performs the privileged action with the service role.
4. Writes an entry to `public.audit_logs`.

School onboarding is atomic in `/api/admin/onboard-school`:
school row → principal `auth.users` → `public.users` (PRINCIPAL) → billing
schedule → first billing year → audit log.

Soft-delete: `schools.is_deleted = true` + `status = 'INACTIVE'`. The
`schools_cascade_deactivation` trigger then deactivates non-super users +
students + staff for that school.

Billing payments call the `record_school_payment(school_id, amount, txn_id,
method, notes)` RPC, which allocates oldest-due-first across billing years and
records leftover as advance credit on the latest year. `schools.payment_status`
is refreshed automatically.

The `log_audit(action, entity_type, entity_id, details)` RPC is `SECURITY
DEFINER` so any authenticated role can record an audit entry without direct
write access to `audit_logs`.

> Production note: the `/api/admin/*` middleware is registered in both `vite`
> dev and `vite preview` modes. For a true production deployment, port the
> handlers in `vite-plugins/admin-api.ts` to a hosted server (Supabase Edge
> Function or any Node host) and point `src/lib/adminApi.ts` at that base URL.

## Student/Parent module (Task #4)

`studentDashboard.service.ts` resolves the active student id via `authStore.selectedStudentId`:
- **STUDENT** users — their own row in `students` (`students.user_id = auth.uid()`).
- **PARENT** users — auto-selected single linked child, or the parent picks one in
  `App.tsx`'s parent header. The selection is persisted in `authStore` and
  cleared on logout.

All reads (school, class, attendance, marks, homework, complaints, fees,
transport) come straight from Supabase under the existing
`linked_student_ids()` RLS. Writes:
- Complaints → `public.complaints` (insert by parent/student).
- Fee screenshots → `public.fee_payment_uploads` (migration 0011, parent/student
  insert; principal/teacher read same-school; principal updates status). The
  image bytes themselves live in the private `fee-screenshots` Supabase
  Storage bucket (migration 0012); the row's `screenshot_url` column stores
  the object path `<school_id>/<student_id>/<filename>`. Both the parent's
  FeesView and the principal's submissions queue mint short-lived signed URLs
  via `studentDashboardService.getFeeScreenshotSignedUrl` /
  `principalService.getFeePaymentScreenshotUrl` to display the original
  image. RLS on `storage.objects` mirrors the table policy (linked
  parent/student to upload + view, same-school staff/super-admin to view).

There are no `MOCK_*` constants or hardcoded student IDs left in
`src/features/student/` or `src/services/studentDashboard.service.ts`.

## Fee-screenshot storage hygiene (Task #12)

Migration `0014_fee_screenshots_cleanup.sql` keeps the private
`fee-screenshots` bucket from growing forever:

- An AFTER-DELETE trigger on `fee_payment_uploads` cascades into
  `storage.objects` so deleting an upload row also drops the matching
  storage metadata.
- Two service-role-only RPCs back the cron-style cleanup:
  - `list_purgeable_fee_screenshots(rejected_after_days)` returns rows
    that are either `REJECTED` and reviewed more than N days ago
    (default 90) **or** were created inside an academic year flagged
    `is_closed = TRUE` for the same school.
  - `delete_fee_payment_uploads(ids[])` deletes the listed rows; the
    trigger fires per row.

`scripts/cleanup-fee-screenshots.ts` (run via
`npm run cleanup:fee-screenshots`, supports `--days N` and `--dry-run`)
calls the list RPC, removes the underlying files via the Storage API
(real S3 cleanup), then calls the delete RPC. Schedule it from any
host cron / Replit scheduled deployment.

## Authentication model

Mobile numbers are mapped to a virtual email `<mobile>@edugrow.local` so we can use Supabase Auth's `signInWithPassword({ email, password })` without needing an SMS provider. The `public.users` table extends `auth.users` (1:1 by `id`) with `mobile_number`, `role`, `name`, `school_id`, and a `first_login_changed` flag that drives the forced password-change screen.

Roles: `SUPER_ADMIN`, `PRINCIPAL`, `TEACHER`, `STUDENT`, `PARENT`, `DRIVER`.

## RLS pattern

`public.is_super_admin()`, `public.is_principal()`, `public.current_user_school_id()`, `public.linked_student_ids()`, and `public.driver_vehicle_ids()` (all SECURITY DEFINER) drive the policies:
- **SUPER_ADMIN** — sees all rows in every table.
- **PRINCIPAL/TEACHER/staff** — limited to rows where `school_id = current_user_school_id()`.
- **STUDENT/PARENT** — limited to rows tied to one of the linked student IDs.
- **DRIVER** — limited to rows tied to a vehicle they're assigned to.

## Replit Setup (completed)

All secrets are stored as Replit Secrets (not in code):
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_ANON_KEY` — Public anon key (safe for browser)
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key (used server-side only in `vite-plugins/admin-api.ts`)
- `GEMINI_API_KEY` — (optional) Add via Secrets to enable AI exam paper generation

If setting up a fresh Supabase project:
1. Apply the schema: `npm run db:migrate` then `npm run db:apply` (requires `SUPABASE_DB_PASSWORD`)
2. Seed super admin: `npm run db:seed` → Mobile: `9999999999`, Password: `admin@123`

## Workflows
- `Start application` — `npm run dev` on port 5000

## First-login password change persists (migration 0016)

`mark_first_login_complete()` was being silently no-op'd by the
`users_prevent_self_escalation` BEFORE-UPDATE trigger on `public.users`. The
trigger forces a list of locked columns (including `first_login_changed`)
back to OLD values for any non–super-admin caller. Since the RPC runs as
the principal (SECURITY DEFINER does not change `auth.uid()`), the trigger
nullified its own RPC's write. Symptom: every login asked the principal to
change the password again, even after they did.

Fix in `supabase/migrations/0016_fix_first_login_flag_persist.sql`:
- The RPC now sets a transaction-local GUC
  `app.allow_first_login_flip = 'true'` immediately before the UPDATE.
- The trigger honours that GUC as a one-way escape hatch, allowing
  `first_login_changed` to flip from FALSE → TRUE only. All other locked
  columns remain locked, and the GUC resets at the end of the RPC's
  transaction so it cannot be reused.

Existing principals stuck in the loop need to complete the forced-change
screen one more time after this migration is live; the flag will then
persist on every subsequent login.

## Migration 0020 — Late-fee preview + Schedule regeneration (Task #4)

`supabase/migrations/0020_late_fee_compute.sql` is purely additive:

1. **`preview_student_late_fees(student_id) → TABLE`** — for every overdue,
   unpaid PARENT installment of the student, looks up the
   `fee_structures.late_fee` JSONB for the matching class+active year and
   computes the per-installment late fee (FIXED amount or PERCENTAGE of
   outstanding, capped by `maxCap`, gated by `gracePeriodDays`). Returns
   `(installment_id, due_date, days_late, late_fee, source)` rows. Authorised
   for staff in the same school OR the linked parent/student themselves.
2. **`record_fee_payment(...)` extended with `p_apply_late_fee BOOLEAN
   DEFAULT TRUE`** — when TRUE, the RPC computes the total liability via
   `preview_student_late_fees`, subtracts any already-accrued, still-unpaid
   `OTHER`/'Late Fee' rows for that (student, year), and only inserts the
   positive **delta** as a single aggregated installment dated
   `CURRENT_DATE - 1`, BEFORE running the existing oldest-due-first
   allocation walk. This makes late-fee accrual idempotent across repeated
   payment attempts on unchanged overdues while still picking up new accrual
   when days pass or new installments fall overdue. The new param has a
   default so legacy 6-arg callers keep working.

Migration 0008 was made idempotent in the same pass: the 7-arg
`commit_year_closing` shim now declares the same defaults as the original
0007 definition, so re-running the combined `_apply.sql` no longer trips
"cannot remove parameter defaults from existing function".

## Task #4 — Fee schedule regeneration & per-year student view

The fee module gained the following user-facing capabilities:

- **`fee.service.generateSchedule()` is now 7-arg** — `discountAmount` and
  `discountPct` are forwarded to `generate_student_fee_schedule` (the larger
  of the two wins per installment).
- **`fee.service.regenerateScheduleFromStructure(studentId, yearId,
  structureId, isRte, discountAmt, discountPct)`** — convenience wrapper that
  reads `fee_heads` + `monthly_due_dates` from a `fee_structures` row and
  invokes the same RPC. The RPC DELETEs unpaid/non-written-off rows for the
  (student, year) before reinserting, so already-paid history is preserved.
- **`fee.service.computeLateFeePreview(studentId)`** — calls the new
  `preview_student_late_fees` RPC and returns
  `{ total, perInstallment[] }`.
- **`fee.service.recordPayment(...)` accepts a 7th `applyLateFee` flag**
  (default TRUE) that propagates to the RPC.
- **`fee.service.getStudentInstallmentsByYear(studentId)`** — groups the
  cached installments by `academicYearId` and resolves the year label via a
  Supabase lookup, sorted active-first then most-recent.

UI consumers:

- **Principal `FeeLedger`** — student detail Schedule tab now renders
  per-year accordions (label + ACTIVE badge + paid/due totals). The pay
  modal shows a live late-fee preview with a "Skip late fee for this
  collection" checkbox. A new **Regenerate** button opens a sheet that picks
  a fee structure (auto-suggesting the one matching the student's class),
  optional flat-₹ / % discount, and an RTE toggle, with a warning that
  unpaid rows will be replaced. Receipt modal now offers **Download PDF**
  (lazy-loaded `jspdf` + `html2canvas` capture of the on-screen receipt
  card) alongside the existing Print and Close buttons.
- **Parent/Student `FeesView`** — the flat installment list was replaced
  with a stack of per-year cards, each grouped internally by fee type
  (Tuition / Transport / Exam / Other). The active year card stays
  prominent with the existing big total + UPI CTA at the top; older years
  collapse by default and only the PARENT-payer rows are shown
  (GOVERNMENT-paid RTE schedule remains hidden from families).

## Migration 0019 — Student documents storage + roll-uniqueness RPCs (Task #3)

`supabase/migrations/0019_student_documents_storage.sql` is purely additive:

1. **Private `student-documents` Storage bucket** (5 MB cap, image/* + pdf only)
   with RLS policies mirroring 0012's `fee-screenshots` shape — path is
   `<schoolId>/<studentId>/<docType>/<filename>`. Principals & teachers in the
   same school can read/write; the parent of the student can read; the student
   themselves can read; super-admins can do anything; everyone else is denied.
2. **`next_available_roll(school_id, year_id, class_name, section)`** —
   SECURITY DEFINER. Returns the next roll number string (`'1'`, `'2'`, …)
   that is free for that section in that academic year, ignoring soft-deleted
   and TC-issued rows.
3. **`roll_available(school_id, year_id, class_name, section, roll, exclude_student_id)`** —
   SECURITY DEFINER. Returns boolean; used by the assignment modal for live
   uniqueness feedback while the principal types a roll number.

Both RPCs are GRANTed to `authenticated` and key off the same school-isolation
predicate already enforced everywhere else (`school_id = current_user_school_id()`).

## Task #3 — Student Archive, Class Assignment & Document Uploads

The Students module has been split into three top-level folders accessed from
`StudentsManager`'s MENU view:

- **Admission** — create a student. Class/section/stream/totalFee fields were
  REMOVED from the create form: `student.service.create()` now skips the
  `student_academic_records` insert when `className`/`section` are blank, so
  fresh admissions land in the **UNASSIGNED** bucket. Parent auth account,
  duplicate-check (Aadhaar / father-mobile), and audit log behaviour are
  unchanged. The admission form preview now also has a "Download PDF" button
  that lazy-loads `jspdf` + `html2canvas` and produces a multi-page A4 PDF.
- **Archive** — five sub-tabs: **Active / Inactive / TC Issued / Alumni /
  Unassigned**. Each row exposes per-row actions:
    - *Assign to Class* (Unassigned, Active, Inactive) → opens
      `StudentClassAssignmentModal` which atomically upserts the per-year
      academic record, calls `generate_student_fee_schedule` with discount/RTE
      flags, and optionally assigns transport via `transportService`.
      Roll-number field auto-suggests the next free roll via
      `next_available_roll` and re-validates with `roll_available` while typing.
    - *Mark Failed* (Active) → flips the AR row to `FAILED`.
    - *Issue TC* (Active, Inactive, Unassigned) → records TC number + reason,
      sets `is_active=false`, disables parent portal login.
    - *Re-admit* (TC Issued, Inactive) → reverses TC, then opens the
      assignment modal.
- **Classes** — unchanged class → section → student browser.

Document uploads (Aadhaar, birth cert, transfer cert, mark sheet, photo, etc.)
are now real: the profile DOCS tab uploads straight to the `student-documents`
bucket via `storage.service.uploadStudentDocument`, persists a row in
`student_documents`, and the "Submitted Documents" list shows actual storage
rows with **VIEW** (signed URL) and **trash** buttons. Uploads accept
JPG/PNG/WEBP/HEIC/PDF up to 5 MB.

New / changed files:
- `supabase/migrations/0019_student_documents_storage.sql` (APPLIED)
- `src/services/storage.service.ts` (NEW — student-doc upload + signed URL)
- `src/services/student.service.ts` (added `assignStudentToClass`,
  `bulkAssignStudents`, `markStudentFailed`, `issueTC`, `readmitStudent`,
  `getStudentsByArchiveStatus`, `addDocumentRecord`, `removeDocument`,
  `getNextAvailableRoll`, `isRollAvailable`; `create()` now skips AR insert
  when class/section blank). Exports new `AssignStudentInput` interface.
- `src/features/principal/components/StudentClassAssignmentModal.tsx` (NEW)
- `src/features/principal/components/StudentsManager.tsx` (Archive tab,
  modals, real document uploads/preview/delete)
- `src/components/AdmissionFormPrint.tsx` (Download PDF button)

## Migration 0018 — Atomic Academic Year + Sections RPC

`supabase/migrations/0018_create_ay_with_sections.sql` introduces a single
SECURITY DEFINER RPC, `create_academic_year_with_sections(p_label, p_start,
p_end, p_board, p_medium, p_streams, p_sections)`, that the new Academic
Year Setup Wizard calls. It inserts the AY row plus every section in the
same transaction (or rolls everything back on failure), so a half-set-up
year can never leak into the database. Validation enforces non-blank
label, end-after-start dates, JSON-array shape for streams/sections, and
non-negative capacity. The single-active-year trigger from 0017 takes
care of deactivating the prior active year automatically.

The legacy `create_academic_year(label, start, end, board, medium)` RPC
from 0005 stays in place — `commit_year_closing` still composes its own
behavior, and back-compat callers are unaffected.

### Academic Year Setup Wizard

`src/features/principal/components/AcademicYearWizard.tsx` is a 3-step
modal launched from `AcademicYearManager`:

1. **Basics** — label, start/end dates, board, medium, available streams
   (Science/Commerce/Arts toggleable).
2. **Pick classes** — toggle which classes (Nursery, LKG, UKG, Class 1
   through Class 12) to enable for the year.
3. **Sections & capacity** — per enabled class, add/remove sections (A,
   B, …) with seat capacity. Class 11/12 also require a stream pick from
   step-1's selected streams.

The "Create" button is the only commit; it calls
`academicYearService.createWithSections(...)` which forwards to the
0018 RPC. `AcademicYearManager` now also surfaces a "+ Add Academic Year"
button at the top of the year list (always visible) and a "Make Active"
toggle on inactive non-locked year cards (with a confirmation modal that
calls `useAcademicYear().setActiveYear(id)`).

The legacy "Classes" entry in Settings is removed from the menu — class
and section setup is now wizard-driven. The CLASSES view code remains in
`SettingsManager.tsx` as a fallback while a future task introduces a
dedicated post-wizard section editor.

## Migration 0017 — Full-flow database foundations

`supabase/migrations/0017_full_flow_fixes.sql` lays the schema/RPC base every
"Full School App Flow" feature task depends on. All changes are additive and
re-runnable; the file applies cleanly via `npm run db:apply` (verified end-to-end
against the live project).

What it changes:

- **Staff salary system** — `staff.relieving_date` + `staff.relieving_reason`
  columns; new `staff_salary_history` table (per-effective-date trail); new
  `update_staff_salary(staff_id, new_amount, effective_from, reason)` RPC that
  bumps `staff.salary` and inserts a history row in one transaction.
- **Sections** — added `stream` (nullable) and `capacity` (default 45).
- **Transport history** — `student_transport_assignments` gets `reason` and
  `changed_by` (it already had `start_date`/`end_date`).
- **Academic years** — new `streams` JSONB column (default
  `["Science","Commerce","Arts"]`); BEFORE-INSERT/UPDATE trigger
  `academic_years_single_active` enforces "only one active year per school"
  by deactivating siblings whenever a row flips to `is_active = TRUE`.
- **Roll-number uniqueness** — partial UNIQUE index
  `sar_year_section_roll_uniq` on `student_academic_records (academic_year_id,
  section_id, roll_no)` (where both section_id and roll_no are non-null). A
  one-shot UPDATE NULLs out duplicate roll_nos within the same section before
  the index is built, so existing dirty data never blocks the migration.
- **Class-movement history** — `student_class_movements` gains `old_section_id`,
  `new_section_id`, `old_class_name`, `new_class_name`, and `changed_by` so the
  RPC can record richer context. `record_class_movement` is re-created to
  populate the new columns + write an audit log entry.
- **Fee-schedule discounts + RTE** — `generate_student_fee_schedule` was dropped
  (signature change) and re-created with two extra params:
  `p_discount_amount NUMERIC` (₹ off per installment) and `p_discount_pct
  NUMERIC` (percent off per installment). The larger of the two wins per head.
  `p_is_rte` (existing) keeps forcing `payer_type = 'GOVERNMENT'` for monthly
  heads. EXECUTE re-granted to `authenticated`.
- **Surplus school-payment credit** — `school_billing_schedules.advance_balance`
  added; `record_school_payment` re-created so leftover credit (after paying
  every outstanding year oldest-first) is parked in the schedule's
  `advance_balance` instead of overpaying the latest year. The schools.payment_status
  refresh and audit log behaviour are unchanged.

Verified post-apply: every column / table / index / trigger / RPC exists, the
single-active-year trigger flips other years to inactive in a smoke test, and
the new fee-schedule signature reports exactly 7 named arguments.

## Super Admin "Add School" form fixes

- **`onboard_school` ambiguous-column bug** — migration `0015_onboard_school_fix_ambiguous_code.sql` re-creates the `public.onboard_school(...)` RPC. The `RETURNS TABLE (... code TEXT, is_deleted BOOLEAN ...)` OUT names were shadowing same-named columns in the body, so `WHERE code = p_school_code AND is_deleted = false` raised `column reference "code" is ambiguous` at runtime. The body now aliases `public.schools s` / `public.users u` and qualifies every column reference. The function signature is unchanged so existing GRANTs are preserved.
- **Keyboard closing after every keystroke** — `src/features/super-admin/components/SchoolsManager.tsx` had its small `Field` input wrapper declared INSIDE the parent's render body for both the CREATE and EDIT views. Each keystroke triggered `setForm` → re-render → a new `Field` function identity → React unmounted/remounted the underlying `<input>` → focus lost → mobile keyboard closed. `Field` is now declared at module scope, accepts `form` and `setForm` as props, and supports the EDIT view's `locked` flag. All call sites updated.
