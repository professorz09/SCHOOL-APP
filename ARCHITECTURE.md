# EduGrow — Architecture & Subsystem Reference

A multi-tenant school management app for Indian K-12 schools. Single Express + Supabase backend, role-aware React SPA, deployed as one Node function on Vercel.

This document is the single source of truth for **how the codebase fits together**. Read the section you need; every reference is a clickable path to the actual file.

---

## Contents

1. [Stack & Deployment](#1-stack--deployment)
2. [Repository Layout](#2-repository-layout)
3. [Request Lifecycle — "Record Payment" walkthrough](#3-request-lifecycle--record-payment-walkthrough)
4. [Auth & Multi-Tenancy](#4-auth--multi-tenancy)
5. [Realtime, Caching, State](#5-realtime-caching-state)
6. [Migrations & the Atomic-Write Layer](#6-migrations--the-atomic-write-layer)
7. [Roles & Workflows](#7-roles--workflows)
   - [7.1 Super Admin](#71-super-admin)
   - [7.2 Principal](#72-principal)
   - [7.3 Teacher](#73-teacher)
   - [7.4 Parent / Student](#74-parent--student)
   - [7.5 Driver](#75-driver)
8. [Fee Subsystem — Deep Dive](#8-fee-subsystem--deep-dive)
   - [8.1 Domain Model](#81-domain-model)
   - [8.2 Fee Structure → Installment Generation](#82-fee-structure--installment-generation)
   - [8.3 Recording a Payment](#83-recording-a-payment)
   - [8.4 Write-Off](#84-write-off)
   - [8.5 Payment Reversal](#85-payment-reversal)
   - [8.6 Caching Layers](#86-caching-layers)
   - [8.7 Reports & Analytics](#87-reports--analytics)
   - [8.8 Transport Fees](#88-transport-fees)
   - [8.9 Common Bugs / Gotchas](#89-common-bugs--gotchas)
   - [8.10 Money-Math Conventions](#810-money-math-conventions)
   - [8.11 Worked Examples](#811-worked-examples)
9. [Testing / CI](#9-testing--ci)
10. [Quick-Start Files for a New Maintainer](#10-quick-start-files-for-a-new-maintainer)

---

## 1. Stack & Deployment

### Client
- Vite 6 + React 19 + TypeScript 5.8 + Tailwind v4 + Zustand 5
- Dev server: `vite --port=5000 --host=0.0.0.0` ([package.json](package.json))
- Bundler config: [vite.config.ts](vite.config.ts)
- Direct DB reads + realtime via `@supabase/supabase-js@^2.105.0`
- Print/Export deps: `jspdf`, `html2canvas`, `xlsx` (latter is candidate for removal — only `parseExcelFile` is unused)
- PWA: `vite-plugin-pwa` for installable home-screen build

### Server
- Express 5 + `helmet` + `cors` + `express-rate-limit`
- Entry point: [server/app.ts](server/app.ts) — mounts 17 routers under `/api/*`
- Dev mode is **single-process**: [vite-plugins/api-server.ts](vite-plugins/api-server.ts) dynamically imports `server/app` and proxies every `/api/*` URL through `server.middlewares.use(...)`. One Vite process serves both the SPA on `:5000` and the Express handler in-process. Matches Vercel's single-function topology.

### Backend
- Supabase Postgres + Auth + Storage + Realtime
- RLS is **on for every public table** ([0001_init.sql:729-737](supabase/migrations/0001_init.sql#L729))
- Two server clients in [server/lib/db.ts](server/lib/db.ts):
  - `adminDb` — service-role, bypasses RLS
  - `userDb(jwt)` — per-request client that re-asserts RLS (used when the route wants the DB to do the school-id check inside an RPC)
- On boot, [server/lib/db.ts:23-48](server/lib/db.ts#L23) decodes the service-role JWT payload to refuse the common mistake of pasting the anon key into the SERVICE_ROLE slot

### Deployment
- Vercel, single Node function
- [vercel.json](vercel.json) builds the SPA with `vite build` and bundles the server with `esbuild server/vercel-handler.ts --bundle --platform=node --target=node20 --format=esm` → `api/index.js`
- Every `/api/(.*)` URL is rewritten to that one function; [server/vercel-handler.ts](server/vercel-handler.ts) just calls `app(req, res)`
- Two crons inside the same function — `cleanup-audit-logs` weekly, `post-birthday-notices` daily

---

## 2. Repository Layout

### `src/lib/` — backend transport + cross-cutting infrastructure
| File | What it does |
|---|---|
| [supabase.ts](src/lib/supabase.ts) | Singleton browser client. `mobileToEmail` builds `<mobile>@edugrow.local` |
| [apiClient.ts](src/lib/apiClient.ts) | Typed fetch wrappers for `/api/*`. Attaches the Supabase access token, expects `{ ok, data }` envelopes |
| [adminApi.ts](src/lib/adminApi.ts) | Separate client for super-admin `/api/admin/*` (school onboarding, principal mobile change). **Intentionally flat shape** — see file header |
| [audit.ts](src/lib/audit.ts) | `logAudit()` fire-and-forget around `log_audit` RPC; `logAuditStrict()` throws so callers can abort when compliance audit must succeed |
| [cacheBus.ts](src/lib/cacheBus.ts) | 22-line pub/sub. Service modules register reset callbacks; `AcademicYearContext` fires `resetAllCaches()` after a year switch |
| [gemini.ts](src/lib/gemini.ts) | Proxy to `/api/ai/generate`. The Google key never reaches the bundle |

### `src/shared/`
Cross-role primitives:
- `components/ui/` — UI atoms
- `components/` — `LoginPage`, `Navigation`, `FirstLoginPasswordChange`
- `hooks/useRealtimeTable.ts` — the one realtime hook (see §5)
- `context/AcademicYearContext.tsx` — the one global context
- `utils/` — audit, broadcasts, csv, currency, htmlToPdf, pdfPrint, school info, storage, date (IST helpers)
- `types/index.ts` — aggregated domain types
- `config/constants.ts` — tweak constants

### `src/store/` — Zustand stores (5 stores, no slicing)
| Store | Holds |
|---|---|
| [authStore.ts](src/store/authStore.ts) | `session`, `selectedStudentId` (for parents with multiple kids), `initialize()`, `logout()`. Wired to `supabase.auth.onAuthStateChange` for token refresh + cross-tab sign-out |
| [uiStore.ts](src/store/uiStore.ts) | Toasts, `askReason()` / `askConfirm()` / `askMobileConfirm()` promise gates, `appReady` flag |
| [editorModeStore.ts](src/store/editorModeStore.ts) | 30-min Editor Mode window mirrored from `users.editor_mode_until` |
| [correctionStore.ts](src/store/correctionStore.ts) | Per-closed-year Correction Mode flags + audit count cache |
| [editingYearStore.ts](src/store/editingYearStore.ts) | Which closed year the editing surfaces currently bind to |

`authStore`'s `onAuthStateChange` resets all four sister stores on SIGNED_OUT ([authStore.ts:122-137](src/store/authStore.ts#L122)).

### `src/modules/` — domain modules (cross-role logic)
Each folder is `<domain>.service.ts` + `<domain>.types.ts` + `components/` for views used by multiple roles. The 11 modules:

```
academic-year/  attendance/   auth/      exams/      fees/      notices/
staff/          students/     timetable/ tools/      transport/
```

Example: [`src/modules/fees/fee.service.ts`](src/modules/fees/fee.service.ts) (1262 lines) holds the in-memory caches + all read functions; writes delegate to `apiClient.apiFees.*`. The `tools/` module is the print-format atelier — TC, ID card, marksheet, admit card, fee receipt, salary slip — pure presentational tooling, not tied to one role.

### `src/roles/` — one folder per role
```
super-admin/   principal/   teacher/   student/   driver/
```

Each role has `pages/<Role>Layout.tsx` (entry) + `components/` (role-specific dashboards/managers). The super-admin folder additionally has its **own** `admin.service.ts`, `broadcast.service.ts`, `logs.service.ts`, `platformSettings.service.ts` plus stores `adminStore` / `broadcastStore` / `logsStore` because super-admin pulls cross-tenant data and keeps state isolated from principal flows.

[`src/App.tsx`](src/App.tsx) code-splits each role layout via `React.lazy()` so a parent never downloads the principal bundle.

### `server/routes/` — one Express router per domain
17 routers, names mirror the modules:

```
auth   academic-year   students   fees   transport   attendance   exams   promotion
teacher  settings  staff  timetable  principal  admin-schools  admin  cron  ai
```

- Each file exports a single `<name>Router`
- [`server/middleware/auth.ts:22`](server/middleware/auth.ts#L22) is `requireAuth` — decodes the bearer token via `adminDb.auth.getUser(token)`, then **re-fetches `users`** to pick up role/school_id/editor_mode_until. Keys never read from the JWT itself
- `requireRole(...)` and `requireEditorMode` wrap principal-only routes
- Helpers in [`server/lib/helpers.ts`](server/lib/helpers.ts): `ok()`, `fail()`, `ApiError`, `requireBody()`, `requireText()`

### `supabase/migrations/`
**142 migrations** as of 2026-05-15. Naming is `NNNN_snake_case_description.sql`, monotonically increasing from [`0001_init.sql`](supabase/migrations/0001_init.sql) to [`0140_reverse_payment_daily_cap_lock.sql`](supabase/migrations/0140_reverse_payment_daily_cap_lock.sql).

Style is **idempotent**:
- `BEGIN/COMMIT` around each migration
- `CREATE OR REPLACE` for functions
- `DROP POLICY IF EXISTS` + `CREATE POLICY` for RLS
- `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ADD COLUMN IF NOT EXISTS` for schema

Re-running the same migration on a populated DB is safe.

---

## 3. Request Lifecycle — "Record Payment" walkthrough

When a principal taps "Record Payment" on a student in FeeLedger:

1. **Component.** [`src/modules/fees/components/FeeLedger.tsx`](src/modules/fees/components/FeeLedger.tsx) calls `feeService.recordPayment(studentId, amount, ...)`
2. **Service.** [`fee.service.ts`](src/modules/fees/fee.service.ts) validates rupee-only / non-zero, then forwards to `apiFees.pay(...)`
3. **API client.** [`src/lib/apiClient.ts`](src/lib/apiClient.ts) → `apiFetch('POST', '/fees/pay', body)`. Token attached
4. **Express route.** [`server/routes/fees.ts:122`](server/routes/fees.ts#L122) matches `POST /api/fees/pay`, runs `requireAuth` + `requireRole('PRINCIPAL')`, validates body, BOLA-checks the student belongs to the caller's school, enforces per-transaction cap, then invokes the SECURITY DEFINER RPC via `userDb(req.jwt).rpc('record_fee_payment', ...)`. Uses `userDb` (not `adminDb`) so the RPC runs **as the principal** and RLS double-checks
5. **RPC.** Postgres function does the oldest-due-first allocation, writes `payment_records`, `payment_installment_links`, late-fee bump, audit row — atomically in one transaction
6. **Response.** Route re-selects the payment with `adminDb` (joining `payment_installment_links`) and returns `{ paymentId, payment }`
7. **Client cache.** [`fee.service.ts`](src/modules/fees/fee.service.ts) calls `this.refreshStudent(studentId)` — a single-student differential refresh, **not** a full school re-pull. In-memory `_installmentsCache`, `_paymentHistoryCache`, `_advanceCache` are surgically updated
8. **Realtime nudge.** Any other tab subscribed via `useRealtimeTable('fee_installments', refetch)` receives a `postgres_changes` event filtered by `school_id=eq.<...>` and debounces a refetch by 250 ms
9. **Re-render.** React subscribers to the auth/UI stores re-render; FeeLedger reads the freshly mutated cache

---

## 4. Auth & Multi-Tenancy

### Login
- Mobile-as-email. [`auth.service.ts`](src/modules/auth/auth.service.ts) synthesises `<mobile>@edugrow.local` and calls Supabase Auth
- JWT is treated as **opaque** — neither client nor server reads claims to obtain `role` / `school_id`
- Instead, both fetch the `public.users` row keyed by `auth.uid()`. Client at [`auth.service.ts:49-57`](src/modules/auth/auth.service.ts#L49); server at [`server/middleware/auth.ts:31-37`](server/middleware/auth.ts#L31), reselecting on every request

### RLS helpers
Defined in [`0001_init.sql:649-704`](supabase/migrations/0001_init.sql#L649) as SECURITY DEFINER SQL functions that read from `public.users`, **not** from JWT claims:

```sql
current_user_role()        -- 0001_init.sql:649
current_user_school_id()   -- 0001_init.sql:654
is_super_admin()           -- 0001_init.sql:659
is_principal()             -- 0001_init.sql:667
linked_student_ids()       -- 0001_init.sql:679 (parent's kids ∪ student's own row)
driver_vehicle_ids()       -- 0001_init.sql:692
```

All `STABLE SECURITY DEFINER SET search_path = public`. Reading from a table (vs. JWT claims) means a principal whose `school_id` is corrected by a super-admin sees the new tenant the moment their row changes — no JWT refresh needed.

### Anti-escalation
- `users_prevent_self_escalation` trigger at [`0001_init.sql:767-790`](supabase/migrations/0001_init.sql#L767) forces `OLD` values back into `id`, `role`, `school_id`, `is_active`, `first_login_changed`, `mobile_number`, `created_at` on every `UPDATE` that isn't running as service-role or super-admin
- The dedicated SECURITY DEFINER RPC `mark_first_login_complete()` ([`0001_init.sql:793-799`](supabase/migrations/0001_init.sql#L793)) is the **only** blessed path to flip `first_login_changed`

### Tenant isolation
- Every domain table carries `school_id UUID NOT NULL REFERENCES schools(id)`
- RLS enabled wholesale by the loop at [`0001_init.sql:729-737`](supabase/migrations/0001_init.sql#L729)
- Default policy shape (auto-applied via [`0001_init.sql:863-868`](supabase/migrations/0001_init.sql#L863)):
  - **SELECT:** `is_super_admin() OR (role IN ('PRINCIPAL','TEACHER') AND school_id = current_user_school_id())`
  - **ALL:** `is_super_admin() OR (is_principal() AND school_id = current_user_school_id())`
- PARENT and STUDENT reads scope through `linked_student_ids()` (e.g. [`0001_init.sql:904`](supabase/migrations/0001_init.sql#L904))
- Service-role on the server bypasses RLS by design, **so every Express route re-checks tenancy in app code**. Canonical pattern: `.eq('id', studentId).eq('school_id', req.user.school_id!).maybeSingle()` before any mutation. Treat that as the BOLA fence

### Editor Mode
[`0053_editor_mode_session.sql:20-41`](supabase/migrations/0053_editor_mode_session.sql#L20) — `enable_editor_mode(p_minutes)` RPC, default 30 min, hard-capped at 60. Mirrored client-side to [`editorModeStore`](src/store/editorModeStore.ts). Server middleware `requireEditorMode` blocks destructive routes when off (TC issue, payment reverse, login-phone change, etc.).

---

## 5. Realtime, Caching, State

### Realtime
One hook: [`src/shared/hooks/useRealtimeTable.ts`](src/shared/hooks/useRealtimeTable.ts). Pass a table name and a refetch callback; it opens a Postgres-changes channel with two opinionated defaults:

1. **Server-side filter** `school_id=eq.<currentSchoolId>` so the WebSocket only delivers same-tenant events. Cuts per-tenant noise on busy tables
2. **Debounce** the callback by 250 ms so a bulk attendance UPSERT only triggers one refetch

The hook subscribes to `schoolId` via `useAuthStore(s => s.session?.schoolId ?? null)` and tears down + reopens the channel whenever tenancy changes — fixes the silent bug where a super-admin switching schools kept streaming the old tenant's events.

### State management
Zustand for app state (5 stores listed in §2). Domain services keep their own module-level in-memory caches:

```ts
// fee.service.ts:195-208
let _installmentsCache: FeeInstallment[] = [];
let _paymentHistoryCache: PaymentRecord[] = [];
let _advanceCache: Map<string, number> = new Map();
let _refreshInFlight: Promise<void> | null = null;     // coalesces concurrent refreshes
let _refreshLiteInFlight: Promise<void> | null = null;
```

Each service calls `registerCacheResetter(_resetCache)` so `cacheBus.resetAllCaches()` (from `AcademicYearContext`) wipes them on year switch. The cache-bus event surface is intentionally minimal: just `registerCacheResetter` + `resetAllCaches` ([`src/lib/cacheBus.ts:14,19`](src/lib/cacheBus.ts#L14)) — no per-event name catalog.

---

## 6. Migrations & the Atomic-Write Layer

**142 SQL files** at [`supabase/migrations/`](supabase/migrations/), 4-digit zero-padded prefix.

The architectural pattern: **anything that touches more than one row goes through a `SECURITY DEFINER` PL/pgSQL function with `SET search_path = public`**. The Express route validates and calls the RPC; the RPC owns the multi-row mutation inside a single transaction with row locks where needed. This is the "atomic write layer".

Examples:
- `submit_attendance_atomic` ([`0139`](supabase/migrations/0139_attendance_submit_atomic.sql)) — collapsed three sequential writes that could half-commit
- `record_fee_payment` (latest in [`0084`](supabase/migrations/0084_drop_advance_credit.sql))
- `pay_installment` (latest in [`0084`](supabase/migrations/0084_drop_advance_credit.sql))
- `reverse_payment` (latest in [`0140`](supabase/migrations/0140_reverse_payment_daily_cap_lock.sql))
- `commit_year_closing` ([`0007_year_closing_atomic.sql`](supabase/migrations/0007_year_closing_atomic.sql)) — promotion + arrears + new-year creation in one txn

Apply via `npm run db:migrate` (script at [`scripts/migrate.ts`](scripts/migrate.ts)).

---

## 7. Roles & Workflows

Auth entry point: [`src/shared/components/LoginPage.tsx`](src/shared/components/LoginPage.tsx). On success, [`authService.buildSession()`](src/modules/auth/auth.service.ts) assembles:

```ts
AuthSession { userId, role, schoolId, mobileNumber, name, mustChangePassword, linkedStudentIds }
```

…and mirrors `editor_mode_until` into `editorModeStore`. [`App.tsx`](src/App.tsx) routes by `session.role` to the appropriate lazy-loaded layout. **School-deletion soft-gate runs first:** any non-`SUPER_ADMIN` whose `schools.deleted_at` is set is logged out (migrations [`0127`](supabase/migrations/0127_school_deletion.sql), [`0130`](supabase/migrations/0130_soft_delete_session_kick_and_unused_bucket.sql)).

---

### 7.1 Super Admin

**Login flow.** Same `LoginPage`. `authStore.session.role === 'SUPER_ADMIN'`, `schoolId` is null. Never blocked by the soft-delete gate (the very role that restores schools).

**Landing page.** Internal route `view='dashboard'` → `SADashboard`, owned by [`src/roles/super-admin/pages/SuperAdminLayout.tsx`](src/roles/super-admin/pages/SuperAdminLayout.tsx). Layout flips `appReady` immediately on mount.

**Capabilities**
- **Schools list, billing & onboarding** — [`SchoolsManager.tsx`](src/roles/super-admin/components/SchoolsManager.tsx), [`BillingManager.tsx`](src/roles/super-admin/components/BillingManager.tsx), `admin.service.ts`, `schoolStore.ts`
- **Create super admins, activate/deactivate users, reset principal mobile/password** — `AdminsManager.tsx`; calls `/api/admin/create-super-admin`, `/set-user-active`, `/reset-password`
- **Onboard a school** (atomic principal+school create) — [`server/routes/admin.ts:106`](server/routes/admin.ts#L106) `POST /api/admin/onboard-school`
- **Billing installments** — `/api/admin/schools/:id/billing-installments` ([`admin-schools.ts:261-385`](server/routes/admin-schools.ts#L261))
- **Broadcast messages across schools** — `BroadcastManager.tsx`, `broadcast.service.ts`
- **Cross-tenant audit / logs** — `LogsViewer.tsx`
- **Platform-level settings (AI quotas, etc.)** — `PlatformSettingsManager.tsx`; `/api/admin/schools/:id/ai-limit`
- **School deletion workflow** (request → allow → soft-delete → restore/purge) — `SchoolDeletionManager.tsx`; RPCs in migration [`0127`](supabase/migrations/0127_school_deletion.sql)
- **Per-school encrypted backup** — `/api/admin/schools/:id/backup`
- **Reports** — `ReportsView.tsx`

**Server routes consumed.** All routes mounted at `/api/admin/*` and `/api/admin/schools/*` guarded by `const SA = requireRole('SUPER_ADMIN')`.

**RLS scope.** `is_super_admin()` short-circuits every policy across the codebase. Effectively: read+write on every tenant table.

**Notable workflows**
- **Soft-delete kicks stale JWTs.** [`soft_delete_school`](supabase/migrations/0130_soft_delete_session_kick_and_unused_bucket.sql) flips `schools.deleted_at` AND sets `users.is_active=FALSE` for every user in that tenant. `requireAuth` filters by `is_active=true`, so the stale principal/teacher JWT 401s on the very next request instead of riding out 24 h
- **Onboarding is atomic** inside `/api/admin/onboard-school` — creates school row + principal auth user + principal users-row in one RPC; legacy `authService.createPrincipalAccount` is now a no-op shim

---

### 7.2 Principal

**Login flow.** Session carries `schoolId`. `editor_mode_until` hydrated into `editorModeStore`. `mustChangePassword` true on first login routes through `FirstLoginPasswordChange.tsx`.

**Landing page.** [`PrincipalLayout`](src/roles/principal/pages/PrincipalLayout.tsx). If `academic_years.length === 0`, the whole app is hard-locked behind a "First Academic Year required" screen.

**Capabilities**
- **Dashboard** with hero stats — [`PrincipalDashboard.tsx`](src/roles/principal/components/PrincipalDashboard.tsx); data via `/api/principal/dashboard-stats`
- **Analytics** — [`AnalyticsManager.tsx`](src/roles/principal/components/AnalyticsManager.tsx)
- **Fee Ledger / Collections / structures** — [`FeeLedger.tsx`](src/modules/fees/components/FeeLedger.tsx), [`FeeCollectionsHub.tsx`](src/modules/fees/components/FeeCollectionsHub.tsx); `/api/principal/fee/structure/*`
- **Staff CRUD + Salary Ledger** — [`StaffManager.tsx`](src/modules/staff/components/StaffManager.tsx), [`SalaryLedger.tsx`](src/roles/principal/components/SalaryLedger.tsx)
- **Approvals queue** — `ApprovalsManager.tsx`; `/api/principal/approval/approve|reject`
- **Settings, Tools, Audit Logs, Complaints, Assets, Expenses** — components in [`src/roles/principal/components/`](src/roles/principal/components/)
- **Students manager** (full CRUD, admission, TC, readmit) — [`StudentsManager.tsx`](src/modules/students/components/StudentsManager.tsx); `/api/students/*`
- **Notices** (school-wide) — `NoticesManager.tsx`; `/api/principal/notice/create|delete`
- **Exam manager** — `PrincipalExamsManager.tsx`; `/api/exams/*`
- **Class/Section management, Timetable, Promotion wizard** — `ClassManagementManager.tsx`, `TimetableManager.tsx`, `PromotionWizard.tsx`
- **Staff & Student Attendance review** — `StaffAttendanceManager.tsx`, `StudentAttendanceManager.tsx`; `/api/attendance/mark-by-principal`
- **Transport vehicle/route admin** — `TransportManager.tsx`
- **Year closing** — `AcademicYearManager.tsx`; `commit_year_closing_gated` RPC

**Server routes consumed.** Whole [`principal.ts`](server/routes/principal.ts) router (`PRINCIPAL = requireRole('PRINCIPAL')`), plus principal-gated routes across `students.ts`, `fees.ts`, `exams.ts`, `attendance.ts`, `transport.ts`, `promotion.ts`, `admin.ts`, `staff.ts`.

Notable irreversible writes wrapped in `requireEditorMode`:
- `POST /api/fees/payment/reverse`
- `POST /api/students/update-login-phone`
- `POST /api/students/document/remove`
- `POST /api/exams/:testId/edit-results`
- `POST /api/students/issue-tc` (RPC also checks `editor_mode_until > NOW()` in SQL)

**RLS scope.** `is_principal()` + `school_id = current_user_school_id()` grants read+write on every tenant table for their own school. Cross-school reads are blocked.

**Notable workflows**
- **Promotion flow.** `PromotionWizard.tsx` calls `/api/promotion/preview` then `/api/promotion/execute`. Honours per-test `pass_marks` / `pass_marks_config`; 12th graders auto-route to TC issuance
- **TC issuance.** `/api/students/issue-tc` delegates to `issue_tc_and_leave` RPC — SECURITY DEFINER, requires Editor Mode active, atomic across `students`, `student_academic_records`, `transfer_certificates`, `audit_logs`. Status sync hardened in [`0135`](supabase/migrations/0135_tc_lifecycle_status_sync.sql)
- **Atomic attendance.** `/api/attendance/submit` calls `submit_attendance_atomic` ([migration 0139](supabase/migrations/0139_attendance_submit_atomic.sql)) closing a half-state / TOCTOU bug

---

### 7.3 Teacher

**Login flow.** Same. Session has `schoolId`. Teacher is also a `staff` row keyed on `user_id`.

**Landing page.** [`TeacherLayout`](src/roles/teacher/pages/TeacherLayout.tsx) — hero with `todayClasses / assignedClassCount / pendingTestCount`, "Today's classes" with live-period highlight, "Birthdays" scoped to own students, `todayNotice` banner.

**Capabilities**
- **Attendance grid** (own sections only) — [`TeacherAttendanceManager.tsx`](src/modules/attendance/components/TeacherAttendanceManager.tsx)
- **Marks entry & test create** — [`TestsManager.tsx`](src/modules/exams/components/TestsManager.tsx)
- **Class/section-scoped notices** — [`TeacherNoticesView.tsx`](src/modules/notices/components/TeacherNoticesView.tsx); `/api/teacher/notice/create` with rate limit
- **Timetable read** — `TeacherTimetableView.tsx`
- **Student list of own classes** — `TeacherStudentList.tsx`
- **Helpdesk complaints** — `TeacherComplaints.tsx`
- **Check-in / Check-out attendance** — `/api/teacher/check-in`, `/check-out`
- **Optional admission drafting** — gated by school-wide `CREATE_ADMISSION` permission; UI tile is dimmed without permission

**Server routes consumed.** All [`teacher.ts`](server/routes/teacher.ts) routes. Plus shared routes that include TEACHER in the allow-list: `/api/students` GET, `/api/attendance/grid|submit|export-excel`, `/api/exams/*`, `/api/transport/vehicles|live`.

**RLS scope.** TEACHER reads students/sections/exams/marks of their own school via `current_user_role()='TEACHER'`. Write scope on attendance/marks is class-scoped by joining `staff_class_assignments`. Notices `INSERT`/`SELECT` honour audience tokens — section/class-targeted notices validated by [`0137`](supabase/migrations/0137_notices_class_section_rls.sql) (parent/student branch reads `SECTION:<uuid>` / `CLASS:<name>` via `student_academic_records`).

**Notable workflows**
- **Class-scoped notice posting.** Teacher picks audience `SECTION:<uuid>` or `CLASS:<name>` from `TeacherNoticesView`. Server validates the teacher actually owns that section/class before insert; RLS for read-side validated by migration [`0137`](supabase/migrations/0137_notices_class_section_rls.sql)
- **Admission permission gate.** `principalService.getMySchoolWidePermissions()` runs on every Dashboard re-entry so a revoked permission locks the tile within one navigation

---

### 7.4 Parent / Student

Same user, sees their kid's data.

**Login flow.** Default credentials: `mobile_number` as both email-prefix and password. For PARENT with multiple `parent_student_links` rows, `App.tsx` renders a child picker before any dashboard mounts. `selectedStudentId` is auto-set for single-child parents and for STUDENT users.

**Landing page.** [`StudentLayout`](src/roles/student/pages/StudentLayout.tsx). `key={selectedStudentId}` in `App.tsx` forces a clean remount on child switch so cached fee/notice/attendance data reloads.

**Capabilities**
- **Fees & UPI/cash pay request** — `FeesView.tsx`; upload screenshot via storage bucket policy
- **Attendance** (own) — `AttendanceView.tsx`
- **Results / marks** — `ResultsView.tsx`
- **Notices feed** (own audience) — [`StudentNoticesView.tsx`](src/modules/notices/components/StudentNoticesView.tsx)
- **Complaints** — `StudentComplaintsView.tsx`
- **Leave application** — `StudentLeaveView.tsx`
- **Transport tracking** — `TransportView.tsx`; realtime `vehicle_live`
- **Timetable** — `TimetableView.tsx`
- **Profile** — `StudentProfileView.tsx`

**Server routes consumed.** `/api/students/:id`, `/api/fees/student/:studentId`, `/api/exams/marksheet`, `/api/transport/student/:studentId`, `/api/principal/leave/submit`, `/api/principal/notice/list`, `/api/principal/holidays`. Self-service writes go directly to Supabase (RLS-protected), not through Express.

**RLS scope.** Anchor function is [`linked_student_ids()`](supabase/migrations/0001_init.sql#L679) — returns the array of student UUIDs the auth user is linked to via `parent_student_links` (or own row for STUDENT). Every parent/student read policy uses `id = ANY(linked_student_ids())` or `student_id = ANY(linked_student_ids())`.

**Notable workflows**
- **Complaint submission.** `StudentComplaintsView.tsx` calls `studentDashboardService.submitComplaint(subject, description, isAnonymous)` — direct Supabase insert; subscribed via `useRealtimeTable('complaints', loadComplaints)`
- **Parent multi-child switching.** `App.tsx` shows brand-bar + child cards; `setSelectedStudentId` triggers `StudentLayout` remount
- **Default password = mobile.** Audit recommended hardening (deferred); `mustChangePassword` flag in `users.first_login_changed` enforces a one-time change on first login via `mark_first_login_complete` RPC

---

### 7.5 Driver

**Login flow.** Standard mobile/password. Session role `DRIVER`, has `schoolId` and a corresponding `staff` row.

**Landing page.** [`DriverLayout`](src/roles/driver/DriverLayout.tsx) — hero with vehicle status, current-stop progress, big GPS power button, emergency button. Empty-state if no vehicle is assigned.

**Capabilities**
- **Start/stop trip + live GPS ping every 15 s** — `POST /api/transport/ping`
- **Route stops view & edit** (advance current stop, geofence auto-arrive at ~100 m, Haversine in `DriverLayout.tsx`) — `DriverRouteView.tsx`; `/api/transport/stops/add|update|remove`
- **Students on this vehicle** — `DriverStudentsView.tsx`; reads via [`0118_students_driver_read.sql`](supabase/migrations/0118_students_driver_read.sql), [`0120_students_driver_select_via_func.sql`](supabase/migrations/0120_students_driver_select_via_func.sql)
- **Emergency alert** — `/api/transport/emergency-alert`, in-flight guard
- **Vehicle list & live view** — `/api/transport/vehicles`, `/live`

**Server routes consumed.** All driver-allowed transport routes, behind rate limiters:
- `driverPingLimiter` (1 req / 5 s per driver)
- `emergencyLimiter`
- `stopMutationLimiter`

**RLS scope.** Driver reads its own staff row, reads students on its assigned vehicle via the helper in [`0120`](supabase/migrations/0120_students_driver_select_via_func.sql), writes its own `route_stops` (`0119`), upserts its `vehicle_live` row.

**Notable workflows**
- **Live GPS loop.** While `isTracking`, browser `navigator.geolocation.watchPosition` streams to local state; every 15 s the latest fix POSTs to `/api/transport/ping` which upserts `vehicle_live`. Principal/parent dashboards subscribe via Realtime channel `vehicle_live`
- **Server-side ping rate limit.** Defence-in-depth above the client's 15-s cap — a runaway client gets `429`
- **Auto-arrive geofence.** `haversineMeters` in `DriverLayout.tsx` advances `currentStopIndex` when the device is within ~100 m of the next stop's pinned lat/lng

---

## 8. Fee Subsystem — Deep Dive

> **This is the deepest section of the doc. The fee module is the only subsystem where a silent bug equals real money lost. Read every sub-section before changing any RPC, route, or cache here.**

### 8.1 Domain Model

```
                       ┌──────────────────────┐
                       │   fee_structures     │  (CLASS or VEHICLE template)
                       │  per (school, year)  │
                       └──────────┬───────────┘
                                  │ heads + due dates copied into…
                                  ▼
   students ─┐                ┌──────────────────────┐
             │                │   fee_installments   │  per-student monthly bill rows
             ├───────────────►│  status: UNPAID /    │  (effective status computed in JS)
             │                │  PARTIAL / PAID /    │
             │                │  WAIVED / CANCELLED  │
             │                └──────────┬───────────┘
             │                           │  N–M (amount_applied, signed)
             │                           ▼
             │             ┌───────────────────────────┐
             │             │ payment_installment_links │
             │             │ amount_applied (can be -)│
             │             └──────────┬────────────────┘
             │                        │
             │                ┌───────▼────────────┐
             ├───────────────►│  payment_records   │ cash/UPI receipt or reversal (-ve row)
             │                │ receipt_no UNIQUE  │ reversed_at / reverses_payment_id
             │                │ discount_amount    │ advance_amount
             │                └────────────────────┘
             │
             ├─►  fee_write_offs           — audit row per write-off
             ├─►  advance_balances         — credit pool (effectively dead since 0084)
             ├─►  student_academic_records — total_fee + paid_fee per (student, year)
             └─►  student_transport_assignments — vehicle/stop/monthly_amount; fee_type='TRANSPORT'
```

| Table | Defined at | Notes |
|---|---|---|
| `fee_structures` | [`0005:19-30`](supabase/migrations/0005_principal_rpcs.sql#L19) | `structure_type CHECK IN ('CLASS','VEHICLE')` added in [`0031`](supabase/migrations/0031_fee_structure_types.sql). `fee_heads`, `monthly_due_dates`, `late_fee` are JSONB |
| `fee_installments` | [`0001:274-291`](supabase/migrations/0001_init.sql#L274) | `status` is **advisory** — JS UI re-derives via `computeEffectiveStatus()` ([`fee.service.ts:152-169`](src/modules/fees/fee.service.ts#L152)). `head_name` added in [`0106`](supabase/migrations/0106_installment_head_name.sql). `related_id` ties TRANSPORT rows to a `student_transport_assignments.id` |
| `payment_records` | [`0001:296-308`](supabase/migrations/0001_init.sql#L296) | `receipt_no` is **UNIQUE** (only natural-key invariant on the table). `discount_amount` in [`0042`](supabase/migrations/0042_payment_discount.sql). Reversal columns in [`0049`](supabase/migrations/0049_payment_reversals.sql) |
| `payment_installment_links` | [`0001:312-317`](supabase/migrations/0001_init.sql#L312) | `amount_applied` can be **negative** when created by a reversal. Treat as a signed ledger |
| `fee_write_offs` | [`0001:320-328`](supabase/migrations/0001_init.sql#L320) | Append-only audit table. Each row = one `fee_installments.write_off_amount` delta |
| `advance_balances` | [`0001:331-336`](supabase/migrations/0001_init.sql#L331) | **Effectively dead** since [`0084_drop_advance_credit.sql`](supabase/migrations/0084_drop_advance_credit.sql). Reversal still zero-clamps it. New payments cannot create credit |
| `student_academic_records` | [`0001:162-178`](supabase/migrations/0001_init.sql#L162) | Mirror table: `total_fee` and `paid_fee` refreshed by `refresh_student_fee_aggregate()`. **`paid_fee` includes `write_off_amount`** — beware: it is *not* pure cash |
| `student_transport_assignments` | [`0001:441-452`](supabase/migrations/0001_init.sql#L441) | `monthly_amount BIGINT`, `start_date` / `end_date` define the window. Transport installments carry `fee_type='TRANSPORT'` and `related_id = assignment.id` |

---

### 8.2 Fee Structure → Installment Generation

**Pipeline.** Principal opens a student in FeeLedger → clicks *Regenerate Schedule* → [`fee.service.ts:885-902`](src/modules/fees/fee.service.ts#L885) `feeService.regenerateScheduleFromStructure()` → [`POST /api/fees/schedule/generate`](server/routes/fees.ts#L90) → SECURITY DEFINER RPC `generate_student_fee_schedule()`.

Latest body: [`0103_one_time_due_today.sql:16-115`](supabase/migrations/0103_one_time_due_today.sql#L16).

**Key behaviour:**

1. **Auth gate** — `auth.uid()` must exist; caller must be SUPER_ADMIN, or PRINCIPAL of the student's school
2. **Idempotency primitive** — every "regenerate" call first does:
   ```sql
   DELETE FROM fee_installments
    WHERE student_id = … AND academic_year_id = …
      AND paid_amount = 0 AND write_off_amount = 0;
   ```
   Paid-or-waived history is preserved; the rest is rebuilt from scratch. **Calling it twice produces the same end state — safe to re-run.**
3. **Discount** — per head, the bigger of `p_discount_amount` (₹ fixed) and `floor(amount × p_discount_pct / 100)` is subtracted before insert. Discount applies **once per installment** for MONTHLY heads (so a ₹100 fixed discount on 12 months reduces every monthly bill by ₹100 — not by ₹100 total). This is the common surprise
4. **MONTHLY heads** — one row per entry in `p_due_dates`, each row tagged by name pattern → `fee_type` (`%transport%` → TRANSPORT, `%exam%` → EXAM, `%tuition%` → TUITION, else OTHER). Pattern match is **case-insensitive `LIKE`**, no whole-word boundary — "TransportFund" matches
5. **ONE_TIME / ANNUAL heads** — single row, `due_date = CURRENT_DATE`. Was previously Apr 1, which made admission/annual-day fees show as overdue the moment a mid-year admit's schedule was generated. **Indian-school convention: mid-year admits pay the full year** (see memory `project-indian-fee-full-year`); no proration on ONE_TIME
6. **RTE flag** — flips `payer_type` to `GOVERNMENT` on every row, but since [`0083`](supabase/migrations/0083_drop_govt_payments.sql) RTE money is just a normal payment with a note

---

### 8.3 Recording a Payment

Two RPCs coexist — pick by call site.

#### 8.3a — Oldest-due-first: `record_fee_payment`

Path: FeeLedger *Record Payment* button → [`fee.service.ts:760-786`](src/modules/fees/fee.service.ts#L760) → [`POST /api/fees/pay`](server/routes/fees.ts#L122) → RPC.

Latest RPC body: [`0084_drop_advance_credit.sql:49-166`](supabase/migrations/0084_drop_advance_credit.sql#L49).

Step by step:

1. **Server defence** — amount `Math.max(0, Math.round(body.amount))`, hard cap **₹10 crore per transaction**
2. **RPC auth** — `auth.uid()` present, principal owns the student's school
3. **Active AY lookup** — picks the school's `is_active = TRUE` academic year. If none, raise. Payments are always against the active year
4. **Late-fee idempotency** — when `p_apply_late_fee` is TRUE (default), an aggregated `'Late Fee'` installment is created with the **delta** between the configured late-fee total and any existing `'Late Fee'` row. Repeated payments don't stack late fees
5. **Outstanding compute + overpay hard-stop** — `SUM(amount - paid_amount - write_off_amount)` across all installments. If `cash + discount > outstanding`, raise. Post-0084 behaviour: advance credit is gone, surplus is rejected
6. **Receipt number** —
   ```
   v_receipt := 'RCT-' || to_char(NOW(),'YYYYMMDDHH24MISS') || '-' || substr(p_student_id::text, 1, 4);
   ```
   Per-student timestamp + 4-char id prefix. **NOT sequential.** The UNIQUE constraint on `payment_records.receipt_no` is the safety net. Reversals get `'REV-' || original_receipt`
7. **Insert payment row** — cash in `amount`, discount tracked separately in `discount_amount`
8. **Allocate oldest-first** — iterate installments by `due_date ASC, created_at ASC` with `FOR UPDATE`, apply `LEAST(remaining, installment_balance)`, write `payment_installment_links` row, recompute status via `compute_installment_status()`. **Both `cash` and `discount` flow into the same allocation walk** — discount closes rows the same as cash, just without a `payment_records.amount` contribution
9. **Aggregate refresh** — `refresh_student_fee_aggregate()` writes `total_fee` / `paid_fee` back to `student_academic_records`
10. **Audit** — row in `audit_logs(action='fee_payment')`
11. **No advance row written.** Since 0084 the surplus path is dead

#### 8.3b — Strict per-installment: `pay_installment`

Path: tap a specific installment row → [`fee.service.ts:799-821`](src/modules/fees/fee.service.ts#L799) → [`POST /api/fees/pay-installment`](server/routes/fees.ts#L176) → RPC.

Latest RPC body: [`0084:174-253`](supabase/migrations/0084_drop_advance_credit.sql#L174).

Differences from 8.3a:
- Locks **one specific installment** with `FOR UPDATE`
- Rejects overpay
- Discount writes a `fee_write_offs` audit row AND bumps `write_off_amount`. **This is the only path where a discount is permanently logged in the write-off audit table**
- Audit `action = 'fee_payment_per_installment'`

#### Status transition rules

From `compute_installment_status` ([`0005:113-123`](supabase/migrations/0005_principal_rpcs.sql#L113)):

```
paid + writeoff ≥ amount  → PAID
paid > 0                  → PARTIAL
due_date < today          → OVERDUE  (legacy; UI rewrites to DUE)
else                      → UNPAID   (UI rewrites to UPCOMING)
```

The JS layer further produces UPCOMING / DUE / PARTIAL / PARTIAL_DUE / PAID / WAIVED / WRITTEN_OFF / CANCELLED on read so the user never sees a stale DB status.

---

### 8.4 Write-Off

Route: [`POST /api/fees/writeoff`](server/routes/fees.ts#L216) → [`server/routes/fees.ts:216-290`](server/routes/fees.ts#L216). **No RPC** — plain server-side three-step write.

Steps:

1. **Ownership** — pull `(amount, paid_amount, write_off_amount, school_id)`. Reject cross-school
2. **Cap the write-off** — `writeOff = min(body.amount, amount − paid_amount − write_off_amount)`. The route **silently clamps** — caller asking to write off ₹2000 on a row with only ₹500 remaining will see `writeOffAmount = 500` come back, not an error
3. **Status precedence** —
   ```
   paid ≥ total                  → PAID    (cash alone cleared it)
   paid + newWriteOff ≥ total    → WAIVED  (cash + write-off closes it)
   paid > 0                      → PARTIAL
   else                          → UNPAID
   ```
4. **Audit-first** — insert `fee_write_offs` row **before** mutating the installment. If the update fails, the audit row is harmlessly orphan
5. **Update installment** — `write_off_amount`, `write_off_reason`, `status`, `updated_at`
6. **Central audit log** — `audit_logs(action='fee_write_off', entity_type='fee_installment')` with `balance_after` baked into details

**Caveat:** write-offs are **not** wrapped in a transaction. The two-step ordering is the only safety net.

---

### 8.5 Payment Reversal

Route: [`POST /api/fees/payment/reverse`](server/routes/fees.ts#L310). Requires PRINCIPAL + `requireEditorMode` middleware + same-day IST + reason ≥ 3 chars.

The hard work lives in `reverse_payment()` RPC, latest body at [`0140_reverse_payment_daily_cap_lock.sql:23-173`](supabase/migrations/0140_reverse_payment_daily_cap_lock.sql#L23).

**Pre-flight (Express):**
- Load original; check ownership, not-already-reversed, not-itself-a-reversal, positive amount
- **Same-day IST window** — compares IST calendar dates of `orig.created_at` and `now()`. Accountant-friendlier than a sliding 24-hour window
- **Daily cap pre-check** — count `audit_logs` rows for `(user_id, action='fee_payment_reversed', today IST)`, raise 429 at 3

**RPC:**

1. **`SELECT … FOR UPDATE`** on the original
2. Re-check `reversed_at`, `reverses_payment_id`, `amount > 0`, **24-hour absolute window** — second guard alongside the same-day IST one in the route. Belt + braces
3. **Daily-cap with advisory lock** — this is the 0140 fix:
   ```sql
   PERFORM pg_advisory_xact_lock(
     hashtextextended(p_user_id::text || '|' || v_today_ist::text, 42)
   );
   SELECT COUNT(*) … WHERE action='fee_payment_reversed' AND … IST day = today;
   IF v_today_count >= 3 THEN RAISE 'daily_cap_exceeded';
   ```
   Before 0140 the cap was Express-only count-then-act and two concurrent reverses from the same principal would both see count=2 and both succeed → 4 reversals
4. **Idempotent stamp** — `UPDATE … SET reversed_at = now() WHERE id = … AND reversed_at IS NULL`. The `WHERE` is the race guard
5. **Negative-amount payment row:**
   - `amount = -abs(original.amount)`
   - `receipt_no = 'REV-' || original.receipt_no`
   - `reverses_payment_id = original.id`
   - `advance_amount = -abs(original.advance_amount)`
6. **Roll back installments** — for each link of the original, `FOR UPDATE` the installment, set `paid_amount = greatest(0, paid - link.amount_applied)`, then status:
   ```
   remaining = total − writeoff − new_paid

   remaining ≤ 0 AND writeoff > 0   → WAIVED
   remaining ≤ 0                    → PAID
   new_paid > 0 OR writeoff > 0     → PARTIAL
   else                             → UNPAID
   ```
   This is the **0136 fix**: the pre-0136 branch chain dropped "partial write-off + zero paid after reversal" into UNPAID, hiding the write-off credit
7. Returns `(reversal_id, original_id)`. Express logs `audit_logs(action='fee_payment_reversed')`

**Error mapping:** `payment_not_found` → 404, `already_reversed` / `cannot_reverse_a_reversal` → 409, `non_positive_amount` → 400, `reversal_window_expired` → 403, `daily_cap_exceeded` → 429.

---

### 8.6 Caching Layers

All live in [`src/modules/fees/fee.service.ts`](src/modules/fees/fee.service.ts) as module-level state — single-tab, scoped via `useAuthStore.getState().session.schoolId`. No persistence; reset on login/logout/year switch.

| Cache | Type | Cap | Loaded by | Invalidated on |
|---|---|---|---|---|
| `_installmentsCache` | `FeeInstallment[]` | 50 000 hard cap | `_loadInstallments()` | `_resetCache()` on year switch / logout; per-student replace in `_refreshOneStudent()` after recordPayment / writeOff / generateSchedule. Full reload only via explicit `refreshAll()` |
| `_paymentHistoryCache` | `PaymentRecord[]` | **5000** (`PAYMENT_HISTORY_CAP`). Earlier 500 wrapped after ~3 months for a 200-student school | `_loadPaymentHistory()` | Same. Per-student dedupe in `_refreshOneStudent()`. Reversal calls force `refreshAll()` |
| `_advanceCache` | `Map<studentId, number>` | unbounded but ≤ student count | `_loadAdvances()` | Same. Effectively always empty post-0084. `getAdvanceBalance()` is a stub returning 0 |

Concurrency: `_refreshInFlight` and `_refreshLiteInFlight` coalesce concurrent calls so rapid mount+write sequences don't race. The **lite** path skips the installment blob — used on FeeLedger mount; per-student installments load lazily via `refreshStudent()`.

Cache bus integration: `registerCacheResetter(_resetCache)` wires the reset into the global flush AcademicYearContext fires on year switch.

---

### 8.7 Reports & Analytics

**Two main consumers.**

#### AnalyticsManager ([`src/roles/principal/components/AnalyticsManager.tsx`](src/roles/principal/components/AnalyticsManager.tsx))

The income query:

```ts
supabase.from('payment_records')
  .select('id, date, amount, method, student_id, receipt_no')
  .eq('school_id', schoolId).gte('date', from).lte('date', to)
  .is('reversed_at', null).is('reverses_payment_id', null)
  .order('date'),
```

**Both filters are mandatory:**
- `reversed_at IS NULL` drops the **original** row that was reversed (still carries its positive amount)
- `reverses_payment_id IS NULL` drops the **reversal** row (carries the negative balancing amount)

Filter only one and the dashboard either double-counts the reversal (cancels itself out when original + reversal both kept, but only if same month — different months produces drift), or double-subtracts.

Same shape for `salary_payments` — but there it's only `reversed_at IS NULL` because the salary reversal lives in `expenses` as a balancing `-ve` row, not in `salary_payments` itself.

#### ReportsSection ([`ReportsSection.tsx`](src/roles/principal/components/ReportsSection.tsx))

- Financial summary: only `reversed_at IS NULL` — different query that doesn't sum across reversal pairs
- Receipt list export: keeps reversed rows tagged `status = 'REVERSED'` — principal wants them on the audit export to explain the gap

**Watch out:** `student_academic_records.paid_fee` (refreshed by `refresh_student_fee_aggregate`) sums `paid_amount + write_off_amount`. A "paid" student in the SAR mirror might actually be a write-off. **Reports that distinguish *cash collected* from *fees cleared* should query `payment_records` directly, not the SAR.**

---

### 8.8 Transport Fees

- **Separate fee structure** with `structure_type='VEHICLE'`. Stored alongside CLASS structures in the same table; UI partitions
- **Assignment** in `student_transport_assignments`, keyed by `student_id + academic_year_id + vehicle_id + stop_id`. `monthly_amount BIGINT` is the per-month cost
- **Installment generation** is **not** driven by `generate_student_fee_schedule` — that one only handles class fee heads. Transport installments are created by `feeService.addTransportFeeSchedule()` ([`fee.service.ts:974-1035`](src/modules/fees/fee.service.ts#L974)), which calls the SECURITY DEFINER RPC `transport_replace_unpaid_installments` ([`0068`](supabase/migrations/0068_transport_schedule_atomic.sql))
- **Billing-day rule** — a student boarding **on or before the 10th** is charged the full month; boarding on the 11th onward starts billing from the next month. Rows carry `fee_type='TRANSPORT'`, `related_id = assignment.id`
- **Cancellation** — when assignment is changed or unassigned, `cancelTransportInstallmentsAfter()` calls `transport_cancel_after` RPC: UNPAID future rows are deleted; PARTIAL rows have `amount` frozen at `paid_amount + write_off_amount` and status flipped to `CANCELLED` so historical receipts still tie out

**Open policy question:** the billing-day rule is a **binary cutoff**. No proration. If your school requires it, change `addTransportFeeSchedule()` and `previewTransportInstallmentDelta()` together to keep the preview consistent.

---

### 8.9 Common Bugs / Gotchas

**Fixed (don't reintroduce):**
- **`reversed_at` filter missing on income** — fixed in AnalyticsManager; both `reversed_at` and `reverses_payment_id` must be `IS NULL`
- **Write-off branch unreachable** — fixed in `fees.ts`; pre-fix the first two clauses were equivalent and WAIVED never set
- **Reverse-payment UNPAID-after-writeoff** — [`0136`](supabase/migrations/0136_reverse_payment_writeoff_partial.sql); status logic collapsed into one balance computation
- **Daily cap TOCTOU on reversal** — [`0140`](supabase/migrations/0140_reverse_payment_daily_cap_lock.sql); cap moved into the RPC under `pg_advisory_xact_lock`
- **Payment history cap too tight** — bumped to 5000
- **Receipt collision in same second** — caught by `payment_records.receipt_no UNIQUE`

**Open / known gotchas:**
- **No `opening_balance` carry-forward** — installments scoped to one academic year. A promoted student with unpaid dues keeps last year's rows around (not in active AY but surfaced via `getPreviousYearDues()`). Principal must manually generate a one-time head to carry forward
- **`amount_applied` can be negative** — anything aggregating links by sum must be aware that reversal rows contribute `-ve`. Per-student totals should walk `payment_records.amount`, not links
- **`student_academic_records.paid_fee` mixes cash and write-off** — don't use it for cash-collected reporting (see §8.7)
- **`fee_installments.status` is advisory** — JS always recomputes via `computeEffectiveStatus()`. Any direct SQL report should use the balance arithmetic, not trust `status`
- **Transport proration unresolved** — see §8.8
- **Drift on long histories** — `refresh_student_fee_aggregate` is best-effort. Source of truth = `fee_installments + payment_records`. If you suspect drift, re-run the RPC for the (student, year)
- **No row-level locking on `/api/fees/writeoff`** — two writeoffs racing on the same installment can both pass the cap check; the LATER write uses pre-update `write_off_amount`. Fix would be `FOR UPDATE`

---

### 8.10 Money-Math Conventions

- **All monetary fields are `BIGINT` in whole rupees.** No paise, no decimal scaling factor
- The TS layer enforces this at input: `Number.isInteger(amount)` check and `Math.round(body.amount)` in the route
- **Rounding only happens at one place:** the discount-percent calc in `generate_student_fee_schedule` uses `FLOOR(v_amt * v_pct / 100.0)::BIGINT`. All other math is integer — additions and subtractions never lose precision
- INR formatting in [`src/shared/utils/currency.ts`](src/shared/utils/currency.ts):
  - `fmtINR(n)` — `₹1,23,456` (Indian grouping, `Math.round`, no decimals)
  - `fmtINRCompact(n)` — `₹1.5L`, `₹2.3Cr`, `₹4.5k` for dashboard tiles

---

### 8.11 Worked Examples

#### Example A — Cash + discount + write-off + reversal

Initial state: one installment, `amount=1000, paid_amount=0, write_off_amount=0, status='UNPAID'`.

**Step 1.** Per-installment payment ₹500 cash via `pay_installment`:
- `payment_records` row: `amount=500, receipt_no='RCT-…-xxxx'`
- `payment_installment_links`: `(payment_id, installment_id, amount_applied=500)`
- `fee_installments`: `paid_amount=500, write_off_amount=0, status='PARTIAL'`

**Step 2.** Write-off ₹300 via `/api/fees/writeoff`:
- `fee_write_offs`: `(amount=300, reason='Sibling concession')`
- `fee_installments`: `paid_amount=500, write_off_amount=300, status='PARTIAL'` (paid+writeoff = 800 < 1000)
- `audit_logs(action='fee_write_off', balance_after=200)`

**Step 3.** Reverse step 1's payment within 24 h:
- Original `payment_records` row stamped `reversed_at, reversed_by, reversal_reason`
- New `payment_records` row: `amount=-500, receipt_no='REV-RCT-…-xxxx', reverses_payment_id=<original>`
- New `payment_installment_links`: `(reversal_id, installment_id, amount_applied=-500)`
- `fee_installments`: `paid_amount = greatest(0, 500-500) = 0; write_off_amount=300`. `remaining = 1000 - 300 - 0 = 700 > 0; writeoff>0` → **`status='PARTIAL'`**
- (Pre-0136 this incorrectly produced UNPAID)

**Final ledger:** parent owes ₹700, audit shows one ₹500 receipt + one ₹300 write-off + one ₹-500 reversal. `student_academic_records.paid_fee = 0 + 300 = 300` (SAR `paid_fee` sums paid + write-off).

#### Example B — Full overpay rejected

Outstanding across all installments is ₹1200. Principal types ₹1500 cash + ₹0 discount into Record Payment.
- Route accepts (under cap)
- RPC raises: `Cannot exceed total due (₹1200). Reduce cash or discount.`
- Nothing inserted. No advance balance created (post-0084)

#### Example C — Same-day reversal blocked the next day

Principal P1 records a ₹2000 payment at 23:55 IST. At 00:05 IST next day, P1 tries to reverse:
- IST same-day check: yesterday vs today → **403 "Same-day only…"**
- The 24-hour absolute window in the RPC would still allow it for ~10 more minutes, but the route's stricter IST same-day guard fires first
- **Fix path:** post a write-off equal to the wrongly-collected amount with reason "wrong entry, refunded externally", or contact support to manually adjust

---

## 9. Testing / CI

- **No Jest. No Vitest. No E2E framework.**
- `npm run lint` = `tsc --noEmit` ([package.json](package.json)) — TypeScript is the only static check
- Vite handles dev / build / preview
- No CI workflow file in `.github/`; the build runs on Vercel on push to `main`
- Quality bar held by:
  - TS strictness
  - The SECURITY DEFINER RPC discipline (multi-row writes are atomic)
  - Idempotent migrations

---

## 10. Quick-Start Files for a New Maintainer

If you have 30 minutes to orient yourself before touching anything:

| Goal | Read this |
|---|---|
| **Entry point** | [`src/App.tsx`](src/App.tsx), [`server/app.ts`](server/app.ts) |
| **How auth works** | [`src/modules/auth/auth.service.ts`](src/modules/auth/auth.service.ts), [`server/middleware/auth.ts`](server/middleware/auth.ts) |
| **The DB schema** | [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) (everything else is incremental) |
| **The fee subsystem** | [`src/modules/fees/fee.service.ts`](src/modules/fees/fee.service.ts), [`server/routes/fees.ts`](server/routes/fees.ts), [§8 of this doc](#8-fee-subsystem--deep-dive) |
| **The dashboard / analytics** | [`AnalyticsManager.tsx`](src/roles/principal/components/AnalyticsManager.tsx), [`ReportsSection.tsx`](src/roles/principal/components/ReportsSection.tsx) |
| **Realtime + caches** | [`useRealtimeTable.ts`](src/shared/hooks/useRealtimeTable.ts), [`cacheBus.ts`](src/lib/cacheBus.ts) |
| **Role layouts** | `*Layout.tsx` in [`src/roles/{super-admin,principal,teacher,student,driver}/`](src/roles/) |
| **Latest fixes** | `git log --oneline -30` — every commit references a migration / file:line |

**Golden rules:**
1. Any multi-row write goes through a `SECURITY DEFINER` RPC, not through chained Supabase JS calls
2. Money is `BIGINT` in whole rupees. Never `Number()` an `amount` before validating it's an integer
3. The `students.status` + `is_active` columns must move together — `0135` exists because they didn't
4. Filter `reversed_at IS NULL` AND `reverses_payment_id IS NULL` on every income query
5. Mid-year admits get the **full year's** fee schedule. Don't pro-rate. Use a separate structure or a write-off
