# EduGrow School Management

A school management application with React frontend and Supabase (Postgres + Auth + RLS) backend. Supports Super Admin, Principal, Teacher, Student/Parent, and Driver roles.

## Replit Environment Setup

**Stack:** React 19 + Vite 6, Zustand, Tailwind CSS v4, TypeScript. Backend is Supabase (PostgreSQL + GoTrue Auth + Storage + RLS + RPCs).

**Run command:** `npm run dev` (starts Vite on port 5000)

**Required secrets (set in Replit Secrets):**
- `SUPABASE_URL` — your Supabase project URL
- `SUPABASE_ANON_KEY` — Supabase public anon key (used by the React frontend)
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (used server-side by `vite-plugins/admin-api.ts` for admin operations)
- `GEMINI_API_KEY` — Google Gemini API key for AI features (optional)

**Architecture notes:**
- All database access goes through `@supabase/supabase-js` — do not replace with Drizzle/pg
- **API Server layer** (Express, mounted inside Vite middleware via `vite-plugins/api-server.ts`):
  - All **writes** go through `/api/*` — no business logic in frontend
  - All **reads** still use Supabase direct from frontend (RLS enforces access)
  - `vite-plugins/admin-api.ts` → `/api/admin/*` (Super Admin only, unchanged)
  - `vite-plugins/api-server.ts` → `/api/*` (all other modules, mounts `server/app.ts`)
- **Server structure** (`server/`):
  - `server/app.ts` — Express app, all routers mounted
  - `server/lib/db.ts` — `adminDb` (service role), `anonDb`, `userDb(jwt)` (per-request JWT for RPCs that need `auth.uid()`)
  - `server/lib/helpers.ts` — `ok()`, `fail()`, `ApiError`, `requireBody()`
  - `server/middleware/auth.ts` — `requireAuth` (JWT → `req.user` + `req.jwt`), `requireRole(...roles)`
  - `server/routes/auth.ts` — POST /api/auth/login, logout, me, change-password
  - `server/routes/academic-year.ts` — GET/POST /api/academic-year/{create,set-active,close}
  - `server/routes/students.ts` — GET/POST /api/students/{create,assign,deactivate,update,change-request,class-movement,fail,issue-tc,readmit}
  - `server/routes/fees.ts` — GET/POST /api/fees/{structure/create,schedule/generate,pay,govt-pay,writeoff,student/:id}
  - `server/routes/transport.ts` — POST /api/transport/{assign,remove,vehicles/add,vehicles/update,vehicles/deactivate,stops/add,stops/update,stops/remove}
  - `server/routes/staff.ts` — POST /api/staff/{create,update,deactivate,salary/pay,salary/update,relieve}
  - `server/routes/timetable.ts` — POST /api/timetable/{save,delete}
  - `server/routes/attendance.ts` — GET/POST /api/attendance/{submit,approve}
  - `server/routes/exams.ts` — GET/POST /api/exam/{create,result/upload}
  - `server/routes/promotion.ts` — GET/POST /api/promotion/{preview,execute}
  - `server/routes/teacher.ts` — GET/POST /api/teacher/{check-in,check-out,attendance}
  - `server/routes/settings.ts` — GET/PUT /api/settings
- **Frontend API client** (`src/shared/lib/apiClient.ts`):
  - `apiAuth` — login (unauthenticated fetch → `supabase.auth.setSession()`), logout, me, changePassword
  - `apiStudents` — list, getById, create, assign, deactivate, update, changeRequest, classMovement, fail, issueTC, readmit, getAcademicHistory
  - `apiFees` — pay, govtPay, writeoff, createStructure, generateSchedule, getStudentFees, getStructures
  - `apiTransport` — assign, remove, getVehicles, getStudentAssignments, addVehicle, updateVehicle, deactivateVehicle, addStop, updateStop, removeStop
  - `apiStaff` — create, update, deactivate, paySalary, updateSalary, relieve
  - `apiTimetable` — save, deleteEntry
  - `apiAttendance` — get, submit, approve
  - `apiExams` — list, create, uploadResults, getResults
  - `apiPromotion` — preview, execute
  - `apiTeacher` — checkIn, checkOut, attendance
  - `apiSettings` — get, update
  - `apiAcademicYear` — list, active, create, setActive, close, getSections, createSections
- `src/lib/supabase.ts` gracefully degrades if env vars are missing (logs a warning, uses placeholder values)
- Schema lives in Supabase (35 migrations in `supabase/migrations/`); apply with `npm run db:apply` after setting `SUPABASE_DB_PASSWORD`
- Migration 0035 adds: `school_settings` table, `check_in_time`/`check_out_time` on `staff_attendance`, `end_reason` on `student_transport_assignments`

**Key write flows through API:**
- Login → `POST /api/auth/login` → tokens → `supabase.auth.setSession()` → profile fetch
- Fee payment → `POST /api/fees/pay` → `record_fee_payment` RPC via `userDb(jwt)` (auth.uid() required)
- Govt payment → `POST /api/fees/govt-pay` → `record_govt_payment` RPC via `userDb(jwt)`
- Fee schedule generation → `POST /api/fees/schedule/generate` → `generate_student_fee_schedule` RPC

**API Security Rules (enforced server-side):**
- No token → 401 `Authorization token required`
- Wrong role → 403 `Role 'X' not allowed`
- Missing body field → 400 `Field 'X' is required`
- Fee payments → immutable ledger, oldest-due-first allocation
- Attendance → locked records cannot be modified
- Promotion → always creates NEW record, marks old as PROMOTED (no overwrite)
- Academic year close → irreversible, requires PRINCIPAL role

## Task #8 — Year closing without auto-promote + Correction Mode

The "close academic year" flow no longer auto-promotes students,
no longer creates the next year, and no longer treats unpaid salary
as a hard blocker. Closing a year is now an explicit, surgical
read-only switch — promotion is handled separately by the existing
Student Archive flow (Failed / Unassigned / TC), and the next year
is opened via the existing `AcademicYearWizard`.

Service layer (`src/services/yearClosing.service.ts`):

- **`closeAcademicYear(yearId)`** — calls the existing
  `close_academic_year` RPC (sets `is_closed = TRUE`, `is_active = FALSE`)
  and writes a `close_academic_year` audit-log row. **No student
  promotion. No next-year creation. No fee carry-forward.** Outstanding
  fees stay attached to the locked year as historical debt.
- **`getPreClosingChecklist`** — salary pending and outstanding fees
  both moved from `blockers[]` → `warnings[]`. The principal
  acknowledges salary explicitly via a checkbox in the close modal;
  there are no hard blockers any more.
- **`getCorrectionCount(yearId)`** — counts `YEAR_CORRECTION` audit-log
  rows for the year, used to hydrate the badge in the year-list card.
- The legacy `commitYearClosing` (auto-promote + new-year + dues
  policy) is kept in place for the wizard's billing-rollover path but
  is no longer surfaced from `AcademicYearManager`.

Correction Mode (`src/store/correctionStore.ts`):

- New zustand store with **per-year** flags (`enabledByYear[yearId]`)
  plus an in-memory corrections counter that hydrates from
  `getCorrectionCount` on mount. Toggling Correction Mode is a
  transient, session-scoped intent — closing the tab snaps the year
  back to read-only, the safe default.
- **`recordCorrection(ctx, reason)`** — writes a `YEAR_CORRECTION`
  audit-log row tagged with `entity_type`, `entity_id`,
  `academic_year_id`, optional `field` / `old_value` / `new_value`
  and the operator's reason; bumps the in-memory counter so the
  badge updates without a refetch.
- **`useEditGuard(activeYearId, isYearClosed)`** — hook returned to
  every editing surface. Exposes `{ canEdit, isCorrectionOn, gate }`
  where `gate(action, ctx)` runs `action` directly when the year is
  open, and when closed prompts for a reason and records a
  correction (returns `undefined` if the operator cancels the prompt).

UI (`src/features/principal/components/AcademicYearManager.tsx`):

- The big "Naya Year + Promote Students" form (~200 lines) is gone.
- Each year card now has its own action: open years get a compact
  "Close Year" CTA; closed years get a Correction Mode toggle plus a
  "N corrections logged" badge and a sticky amber banner whenever the
  toggle is ON, warning that every edit will demand a reason.
- The Close Year modal shows the live pre-close checklist
  (attendance / results / salary / fees), an explicit "I acknowledge"
  checkbox if salary is pending, and an info card reminding the
  principal that promotion + new-year creation happen separately.

Read-only enforcement on edit surfaces:

- `StudentAttendanceManager`, `StaffAttendanceManager`,
  `TimetableManager` (principal) and `TestsManager` (teacher) all use
  `useEditGuard(activeYear?.id, activeYear.status === 'LOCKED')` and
  wrap every save / approve / delete handler in `editGuard.gate(...)`.
- When the active year is closed and Correction Mode is OFF the save
  short-circuits with a Hindi-mix error toast directing the operator
  to enable Correction Mode first; when ON, the operator is prompted
  for a reason and a `YEAR_CORRECTION` audit-log row is written
  alongside the actual mutation. Local in-memory edits remain
  unblocked — only the persistence step is gated, which keeps the UX
  click-light during normal in-year work.

No new migrations were required — `audit_logs`, `close_academic_year`
and `set_active_academic_year` already existed from earlier work.

## Task #7 — Super Admin per-year billing breakdown

The Super Admin Billing module now shows **every** billing year for each
school in a single sortable table, plus the schedule-level advance-credit
balance — replacing the old "latest year only" view that masked
carry-forward dues.

Service additions in `src/services/billing.service.ts`:

- **`SchoolBilling.advanceBalance`** — every `getSchoolBillings()` /
  `setupSchoolBilling()` read now selects `school_billing_schedules.advance_balance`
  (added in migration 0017) and surfaces it on the type. Rolls into the
  list-view "+₹X credit" pill and the detail-view advance card.
- **`getBillingBreakdown(schoolId) → SchoolBillingBreakdown | null`** —
  one round-trip that returns the schedule's advance balance, every
  `school_billing_years` row for the school (sorted oldest-first) and a
  rolled-up `totalOutstanding`. Returns `null` for legacy schools with
  no schedule so the UI can render a setup CTA.
- **`previewAllocation(schoolId, amount) → PaymentAllocationPreview`** —
  read-only mirror of the `record_school_payment` RPC's allocation walk:
  distributes the amount oldest-first across outstanding years, exposing
  per-year `amountApplied` / `outstandingAfter` / `willClose` and the
  `advanceCredit` leftover that would be parked. Powers the live
  "this ₹4,000 will pay 2026-27 in full and apply ₹1,001 to 2027-28"
  hint in the Add Payment screen.
- The store exposes both new methods (`useBillingStore.getBillingBreakdown`,
  `useBillingStore.previewAllocation`) so other consumers can opt in
  without touching the service.

UI rebuild in `src/features/super-admin/components/BillingManager.tsx`:

- **List view** rolls "Outstanding" up across **all** years per school
  (was: latest year only). Parked advance credit is **not** subtracted
  from outstanding — schools with credit get an additional violet
  "+₹X credit" badge alongside the plan pill so the two figures stay
  visually independent.
- **School detail** drops the single "Year Summary" card in favour of a
  Year / Annual / Paid / Outstanding / Status table that highlights the
  latest year, shows carry-forward c/f notes inline, and surfaces the
  schedule's advance balance as a dedicated violet row. A separate
  retry-able error state (vs the legacy no-schedule empty state)
  disambiguates load failures.
- **"Create Next Billing Year"** card sits below the table and is
  enabled whenever a schedule exists — `create_next_billing_year`
  already carries arrears or advance forward via `v_carried`, so
  blocking on `totalOutstanding === 0` would prevent legitimate annual
  rollovers. When the latest year still has a non-zero balance, an
  inline carry-forward heads-up explains what will happen. The
  empty-state branch (no years yet) flips the button to
  "Create First Year".
- **Add Payment** screen runs `previewAllocation` on every amount change
  (debounced 200 ms) and renders the per-year line items above the
  Transaction ID input, including a "parked as advance credit" footer
  when applicable. Confirming reuses `record_school_payment` (oldest-first
  + audit log + advance-balance bump are still RPC-side). The school
  summary now shows the total cross-year outstanding instead of a
  single year's.
- **Payment history** rows now expose the per-payment allocation
  breakdown beneath the amount: each row lists which billing years the
  RPC applied funds to (with year label + amount) and surfaces any
  surplus parked as advance credit, so super admins can audit the
  oldest-first split without consulting the audit log.
- Auditing is unchanged: both `record_school_payment` and
  `create_next_billing_year` already write `log_audit` entries inside
  the RPC, so the UI doesn't double-log.

No migrations were added — every required column / RPC was already in
place from migrations 0002 and 0017.

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
├── src/
│   ├── App.tsx               # Login gate + role router
│   ├── main.tsx              # Entry point (AcademicYearProvider wrapper)
│   │
│   ├── modules/              # Business-domain modules (feature logic, reusable across roles)
│   │   ├── fees/
│   │   │   ├── fee.service.ts
│   │   │   └── components/   # FeeLedger, FeePaymentSubmissionsQueue, FeeStructureForm
│   │   ├── students/
│   │   │   ├── student.service.ts
│   │   │   ├── studentDashboard.service.ts
│   │   │   └── components/   # StudentsManager, StudentClassAssignmentModal
│   │   ├── attendance/
│   │   │   ├── attendance.service.ts
│   │   │   └── components/   # AttendanceHub, StudentAttendanceManager, StaffAttendanceManager, TeacherAttendanceManager
│   │   ├── academic-year/
│   │   │   ├── academicYear.service.ts
│   │   │   ├── yearClosing.service.ts
│   │   │   └── components/   # AcademicYearManager, AcademicYearWizard, ClassManagementManager
│   │   ├── transport/
│   │   │   ├── transport.service.ts
│   │   │   └── components/   # TransportManager
│   │   ├── timetable/
│   │   │   ├── timetable.service.ts
│   │   │   └── components/   # TimetableManager, TeacherTimetableView
│   │   ├── notices/
│   │   │   └── components/   # NoticesManager, TeacherNoticesView, StudentNoticesView
│   │   ├── staff/
│   │   │   ├── staff.service.ts
│   │   │   ├── staffStorage.service.ts
│   │   │   └── components/   # StaffManager
│   │   └── exams/
│   │       └── components/   # TestsManager, ExamPaperGenerator, HomeworkManager
│   │
│   ├── roles/                # Role-specific UI shells and screens
│   │   ├── principal/
│   │   │   ├── pages/        # PrincipalLayout
│   │   │   └── components/   # PrincipalDashboard, SettingsManager, ApprovalsManager,
│   │   │                     # SalaryLedger, ExpensesManager, ToolsManager, ...
│   │   ├── teacher/
│   │   │   ├── pages/        # TeacherLayout
│   │   │   ├── teacher.service.ts
│   │   │   └── components/   # TeacherComplaints
│   │   ├── student/
│   │   │   ├── pages/        # StudentLayout
│   │   │   └── components/   # FeesView, AttendanceView, HomeworkView, ResultsView, ...
│   │   ├── super-admin/
│   │   │   ├── pages/        # SuperAdminLayout
│   │   │   ├── admin.service.ts, billing.service.ts, broadcast.service.ts, logs.service.ts
│   │   │   └── components/   # SADashboard, SchoolsManager, BillingManager, ...
│   │   └── driver/
│   │       # DriverLayout, DriverRouteView, DriverStudentsView
│   │
│   └── shared/               # Cross-cutting concerns (used by all modules & roles)
│       ├── components/       # LoginPage, Navigation, SharedUI, ErrorBoundary, ProfileView, Toast
│       ├── context/          # AcademicYearContext
│       ├── hooks/            # useRealtimeTable
│       ├── lib/              # supabase.ts, gemini.ts, audit.ts, cacheBus.ts, adminApi.ts
│       ├── services/         # auth, school, schoolInfo, storage, audit, principal services
│       ├── store/            # Zustand stores (auth, ui, school, billing, ...)
│       ├── types/            # All TypeScript types
│       └── config/           # constants.ts
│
├── vite-plugins/
│   └── admin-api.ts          # Vite middleware for /api/admin/* (service-role key)
├── supabase/
│   ├── migrations/           # Ordered SQL migrations (0001_init.sql → latest)
│   └── _apply.sql            # Auto-generated combined migration file
└── scripts/
    ├── migrate.ts             # Builds supabase/_apply.sql
    ├── apply-sql.ts           # Applies migrations via pooler
    ├── seed-super-admin.ts    # Creates initial SUPER_ADMIN user
    └── cleanup-fee-screenshots.ts
```

### Import alias
All imports use `@/` which maps to `src/` (configured in `vite.config.ts` + `tsconfig.json`).
Example: `import { feeService } from '@/modules/fees/fee.service'`

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
   unpaid PARENT installment of the student **across ALL academic years**,
   joins each row to the class the student was in for THAT specific year
   (via `student_academic_records`) and the most-recently-updated
   `fee_structures.late_fee` JSONB for that (school, year, class). Computes
   the per-installment late fee (FIXED amount or PERCENTAGE of outstanding,
   capped by `maxCap`, gated by `gracePeriodDays`) using each row's own
   year's policy, so carry-forward dues from prior years still accrue.
   Type values are case-normalised — `'PERCENTAGE'`/`'PERCENT'`/`'percent'`
   all take the percent branch; everything else falls through to fixed.
   The `source` column is canonicalised to exactly `'PERCENTAGE'` or
   `'FIXED'`. Returns `(installment_id, due_date, days_late, late_fee,
   source)` rows. Authorised for staff in the same school OR the linked
   parent/student themselves.
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
  (GOVERNMENT-paid RTE schedule remains hidden from families). The "Total
  Outstanding" header and Fee Breakdown card now aggregate **all** fee
  types (Tuition + Transport + Exam + Other, where Other includes any
  accrued Late Fee rows) **across all academic years** — `getParentDue
  Summary` returns `{ tuition, transport, exam, other, total }` and the
  card renders a line per non-zero type.

After a payment is recorded in `FeeLedger`, the Schedule tab's per-year
accordions are re-loaded immediately (`reloadYearGroups(studentId)` runs
inside `handlePayment`) so totals/status reflect the freshly-allocated
amount without requiring re-selection.

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

## Migration 0021 — Staff salary lifecycle (Task #5)

`supabase/migrations/0021_staff_salary_lifecycle.sql` extends the staff +
salary subsystem in a purely additive way (re-runs are safe — every
DDL uses `IF NOT EXISTS` / `DROP ... IF EXISTS` + `CREATE OR REPLACE`):

1. **`salary_payments.method`** — new TEXT column with a CHECK constraint
   restricting it to `CASH | BANK_TRANSFER | UPI | CHEQUE | OTHER`. Older
   rows have `method = NULL`.
2. **`record_salary_payment(staff, month, amount, note, method, txn_id)`**
   re-created with two new optional params. Caller-supplied `txn_id` wins;
   when omitted the RPC auto-generates `TXN-<yyyymmddHHMMSS>-<staff[0:4]>`
   so legacy 4-arg callers keep working. Records the payment, mirrors a
   matching `expenses` row (`category='SALARY'`), and writes the audit log
   with `{ month, amount, method, txn }`.
3. **`staff_status_history`** — new table `(id, staff_id, school_id,
   old_status, new_status, reason, changed_by, changed_at)` plus a per-row
   AFTER-UPDATE trigger on `staff.status` so every transition is captured
   automatically. Existing rows are seeded with one `Initial` entry so the
   profile Log tab is never blank. RLS mirrors staff: super admin / same-
   school principal+teacher can SELECT; principals can write.
4. **`set_staff_relieving_date(staff, date, reason)`** — flips
   `staff.status` to `'RELIEVED'`, stamps `relieving_date / relieving_reason`,
   and back-fills the latest `staff_status_history` row's `reason` (the
   trigger captures the transition; the RPC adds context). Atomic.
5. **`salary_reminders(school_id, year_month)`** — returns
   `(staff_id, name, role, salary, paid_amount)` for active, non-suspended,
   non-relieved staff (and not past their relieving date) whose total paid
   for `year_month` is less than `staff.salary`. Drives the dashboard
   reminder widget.
6. **`staff_documents`** — new table `(id, staff_id, school_id, doc_type,
   doc_name, doc_url, uploaded_by, uploaded_at)` with RLS letting the staff
   member read their own docs and same-school principal/teacher manage
   them. Mirrors the 0019 student-documents shape exactly.
7. **`staff-documents` private Storage bucket** — 5 MB cap, image/PDF mime
   whitelist, three policies (INSERT / SELECT / DELETE) keyed off the path
   convention `<school_id>/<staff_id>/<doc_type>/<filename>`. Same-school
   principals/teachers can write; the staff member can self-upload (e.g.
   PAN); deletes are principal-only.

## Task #5 — Staff salary system

The staff module gained the following user-facing capabilities:

- **`StaffStatus` adds `'RELIEVED'`** (TS-only union — DB column is free
  TEXT). New `SalaryPaymentMethod` enum mirrors the DB CHECK. New types:
  `StaffSalaryHistoryEntry`, `StaffStatusHistoryEntry`, `StaffDocument`,
  `SalaryReminderRow`. `StaffMember` gains optional `relievingDate` /
  `relievingReason`; `SalaryPayment` gains optional `method`.
- **`staff.service`** picks up:
  - `getSalaryHistory(staffId)` — reads `staff_salary_history` (created in
    migration 0017) most-recent first.
  - `updateSalary(staffId, amount, effectiveFrom, reason)` — calls the
    `update_staff_salary` RPC which atomically bumps `staff.salary` AND
    inserts a history row.
  - `getPaymentHistory(staffId, _academicYearId?)` — pulls
    `salary_payments` joined-flat (year filter is reserved; salary_payments
    has no AY foreign key so filtering happens client-side via the AY date
    window when needed).
  - `recordSalaryPayment(staffId, month, amount, note, method?, txnId?)` —
    extended signature; old 4-arg callers still work because the new
    params default to NULL.
  - `getSalaryReminders(yearMonth)` — calls the new `salary_reminders` RPC
    and returns `{ staffId, name, role, salary, paid, pending }` rows.
  - `setRelievingDate(staffId, date, reason)` and `getStatusHistory()`.
  - `getDocuments(staffId)`, `uploadDocument`, `removeDocument`,
    `getDocumentSignedUrl` — wire through the new
    `services/staffStorage.service.ts` (mirrors student storage.service).
    Upload-then-insert with best-effort orphan cleanup if the metadata
    insert fails.
- **`staff.service.create()` now seeds the initial salary history row** —
  immediately after the staff insert, if the entered salary is > 0 the UI
  calls `updateSalary(id, salary, joiningDate, 'Initial')` so the Salary
  tab is never empty for new staff. Failure is logged but non-fatal.
- **`StaffManager.tsx` PROFILE view is now 6 tabs** — Info / Salary /
  Attendance / Classes / Docs / Log:
  - **Info** — contact, salary/joined/classes summary, relieving banner
    when set, plus "Set Relieving Date" + "Suspend / Reinstate" actions.
  - **Salary** — current salary card with "Edit Salary" + "Pay This
    Month" buttons; salary-amount history (effective-from + reason);
    payment history (date · method · txn id · note · amount). Edit and
    Pay are disabled for RELIEVED staff.
  - **Attendance** — placeholder pointing to the existing Staff
    Attendance screen (salary is fixed monthly per the simple model).
  - **Classes** — chip list of `assignedClasses` for the active year.
  - **Docs** — doc-type select + file picker (image/pdf, 5 MB max);
    list with View (signed URL) + Delete actions.
  - **Log** — `staff_status_history` entries with old → new status,
    reason, and timestamp.
- **`SalaryLedger.tsx` pay modal** picks up Method dropdown + optional
  Txn ID, forwards both to the RPC. The "Record Payment" CTA is also
  hidden for RELIEVED staff.
- **`SalaryReminderCard.tsx`** — new dashboard widget (mounted just above
  the Alert Strip in `PrincipalDashboard.tsx`). Shows `<N> staff pending
  salary for <Month Year>` when at least one row is returned by
  `salary_reminders`. Tapping it opens a bottom-sheet listing each row
  with a one-tap quick-pay (uses the configured method) and a "Open
  Salary Ledger" footer button. Auto-hides when the queue is empty.

## Migration 0022 — Staff salary lifecycle fixes (post-review)

Code-review follow-up to 0021. Purely additive (DROP-then-CREATE on the
specific function / policies it owns):

1. **`salary_reminders(school_id, year_month)` — month-aware filtering.**
   The 0021 version filtered eligibility against `CURRENT_DATE` and forgot
   to exclude staff who join AFTER the requested month. The RPC now parses
   `p_year_month` (`'October 2025'` → `2025-10-01`) with
   `to_date(..., 'FMMonth YYYY')`, derives `v_first` / `v_last`, and gates
   `joining_date <= v_last` and `relieving_date >= v_first`. Unparseable
   labels return zero rows (so the dashboard widget hides instead of
   crashing).
2. **`staff_documents` — split FOR ALL into separate INSERT / UPDATE /
   DELETE policies.** 0021 let any same-school principal OR teacher delete
   metadata, but the storage bucket only allowed principals (or super
   admins) to delete the underlying object — a teacher delete would orphan
   the private file. The DELETE policy is now principal-only, matching the
   bucket. INSERT and UPDATE remain principal+teacher.

## Task #6 — Transport date tracking & assignment history

Problem: `student_transport_assignments` already had `start_date` /
`end_date` / `is_active` columns plus `reason` + `changed_by` from 0017,
but the UI surfaced only the *active* row, mid-year vehicle/stop changes
forgot to clean up future TRANSPORT installments, and there was no
"vehicle out of service → bulk move every student" workflow at all.

### Migration 0025 (additive)

- `student_transport_assignments` gains `end_reason TEXT` (why a row was
  closed — distinct from the existing `reason`, which is "why this row
  was created") and `ended_by UUID REFERENCES users(id)`.
- Indexes: `sta_student_start_idx (student_id, start_date DESC)` for the
  per-student timeline view, and partial `sta_vehicle_active_idx
  (vehicle_id) WHERE is_active` for the bulk-reassign hot path.
- New SECURITY DEFINER RPC
  `bulk_close_transport_assignments(p_from_vehicle, p_effective_date,
  p_end_reason)`:
    - Cancels future-dated TRANSPORT installments for the affected
      assignments — UNPAID rows are DELETEd, partially-paid rows are
      flipped to `status='CANCELLED'` with `amount` frozen at
      `paid_amount + write_off_amount` so they no longer show as
      outstanding but the receipt history stays intact.
    - Updates every active row on the source vehicle to
      `is_active=FALSE, end_date=p_effective_date - 1, end_reason=…,
      ended_by=auth.uid()`.
    - Returns `(assignment_id, student_id, stop_id, monthly_amount,
      academic_year_id)` so the caller can rebuild new rows on the target
      vehicle.
    - Authz: super admin OR same-school staff.

### Service layer

- `transport.service.assignStudent(...)` — backwards-compatible
  positional API, but two new optional trailing args (`endDate?`,
  `reason?`) are now accepted, the close-the-old-row update writes
  `end_reason`, and after insert the service auto-generates monthly
  TRANSPORT installments via `feeService.addTransportFeeSchedule(...)`
  (lazy import, non-fatal on failure).
- `transport.service.removeStudentAssignment(studentId, reason?)` — now
  takes a reason, writes `end_reason`, and cancels future installments
  via the new `feeService.cancelTransportInstallmentsAfter(...)` shim.
- `transport.service.changeStudentTransport({studentId, effectiveDate,
  newVehicleId, newStopId, newMonthlyAmount, reason, endDate?})` — guards
  reason / date / amount, then funnels into `assignStudent` (which
  closes-old + inserts-new + regenerates installments in one path).
- `transport.service.getTransportHistory(studentId, academicYearId?)` —
  full assignment timeline (active + closed) ordered newest-first, with
  vehicle_no + class label resolved.
- `transport.service.bulkReassignVehicle({fromVehicleId, toVehicleId,
  toStopId, effectiveDate, reason})` — calls the
  `bulk_close_transport_assignments` RPC then re-creates each closed
  student's assignment on the target vehicle (preserving their
  `monthly_amount` and academic year), audit-logs the operation, and
  returns `{ moved }`.
- `TRANSPORT_CHANGE_REASONS` exported as a typed list (vehicle
  breakdown / student relocation / stop change / fare revision / cancel
  service / other) so principal/parent UIs share one vocabulary.
- `fee.service.cancelTransportInstallmentsAfter(assignmentId, fromDate)`
  — used by the principal flows above; `removeTransportFeeSchedule()`
  is now a thin shim that delegates to it.
- `fee.service.previewTransportInstallmentDelta(...)` — read-only helper
  the UI can call before showing a confirmation modal (currently unused
  but available for the next round of polish).

### UI

- **`TransportManager` (Vehicles tab)** — every vehicle row with > 0
  active students now has a Shuffle (amber) icon next to Trash. Clicking
  it opens the **Bulk Reassign** modal (target vehicle, target stop,
  effective date, reason dropdown + optional note), which calls
  `bulkReassignVehicle` and surfaces a "Moved N students" confirmation.
- **`StudentsManager` profile DOCS tab** — the static "Transport
  Assignment" panel was replaced with:
    - Active card: vehicle / type / route / stop / driver / phone /
      monthly fee / start date + a rose "Cancel transport service"
      button that opens a Cancel modal (reason required).
    - **Change / Assign** button (top-right) opens a Change Transport
      modal (vehicle, stop, monthly fee, effective date, reason dropdown
      + optional note) backed by `changeStudentTransport`.
    - **Assignment History** timeline (only renders when > 1 row
      exists): each row shows vehicle + stop, date range, amount,
      ACTIVE / CLOSED pill, and the start/end reasons in italic.
- The existing `TransportView` parent/student page already showed the
  active assignment from the cached `getAssignmentForStudent` and
  continues to work unchanged — the new history endpoint will be wired
  into that view in a follow-up if requested.

### Phase 7 — Exam Marksheet Generator (ToolsManager.tsx)

- `MarksheetTool` component replaces the old `GenericDocTool` placeholder for the MARKSHEET view
- Flow: Student picker → Exam picker (fetches exams with `results_uploaded=true` via `apiExams.list({className})`) → Results fetch (via `apiExams.getResults(examId)` filtered to selected student) → Printable marksheet
- Printable marksheet includes: school header (name + address from `schoolInfoService`), student details grid (name, adm. no., class, father, exam, date), results table (subject / max marks / obtained / grade), total row, PASS/FAIL badge with percentage, three-way signature strip
- Preview pane (before print) shows mini result card with progress bar + pass/fail colour
- `window.print()` used for printing; print view has Back + Print buttons in sticky header
- `apiExams` imported into `ToolsManager.tsx`

### Phase 8 — Promotion Wizard (PromotionWizard.tsx + AcademicYearManager.tsx)

- New file: `src/modules/academic-year/components/PromotionWizard.tsx`
- Three-step flow:
  1. **Select Years** — dropdown for source year (from) + destination year (to); warning if source year is not locked
  2. **Per-student Decisions** — calls `apiPromotion.preview(fromYearId, toYearId)`; dark summary banner (Promote / Retain / TC / Already Done counts); quick "All → Promote / All → Retain" buttons; expandable per-student cards with decision toggle (PROMOTE/RETAIN/TC) + editable To Class + Section dropdowns when PROMOTE is selected; class auto-bumped via `bumpClass()` helper (Nursery → LKG → UKG → Class 1 … Class 10 → 11th Science etc.)
  3. **Execute** — calls `apiPromotion.execute()` with only PROMOTE-decision pending students; DONE screen shows promoted / skipped counts
- `AcademicYearManager.tsx` gains `showPromotion` state; when true renders `<PromotionWizard onBack={…} />`; "Add Year" + "Promote Students" dashed-border buttons shown side-by-side in the years-list view
- TypeScript: 0 errors confirmed after both phases

### Migration 0026 — post-review hardening

- `bulk_close_transport_assignments` redefined with a strict role gate:
  super admin OR same-school **PRINCIPAL only** (parents, students,
  teachers, drivers explicitly excluded even if they share school_id).
- `transport.service.assignStudent` now calls
  `feeService.cancelTransportInstallmentsAfter(prior.id, effectiveDate)`
  immediately after closing the prior active row, so a mid-year change
  rewrites the OLD assignment's future TRANSPORT installments instead
  of leaving them duplicated alongside the new ones.
- `transport.service.changeStudentTransport` now emits a distinct
  `transport_changed` audit event with a structured `{from, to}` delta
  payload, separate from the `transport_assigned` event the inner
  `assignStudent` call writes.
- `addTransportFeeSchedule` is idempotent on retry — it deletes any
  unpaid + un-writeoff TRANSPORT rows for the same `assignmentId`
  before re-inserting the full month range.
- `assignStudent` snapshots the soon-to-be-closed prior row and
  re-activates it if the new INSERT fails, so the close + insert pair
  cannot strand a student transport-less.
