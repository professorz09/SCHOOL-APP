# School Management App — Complete Audit Report
> Generated: 2026-05-03 | Branch: claude/feature-based-folder-structure-GACU0

---

## 1. FILE STRUCTURE (COMPLETE)

```
SCHOOL-APP/
├── server/
│   ├── app.ts                          ✅ Express app + all route registration
│   ├── db.ts
│   ├── lib/
│   │   ├── db.ts                       adminDb (service role) + userDb (JWT)
│   │   └── helpers.ts                  ok / fail / ApiError / requireBody
│   ├── middleware/
│   │   └── auth.ts                     requireAuth + requireRole
│   └── routes/
│       ├── academic-year.ts            ✅ Full CRUD + sections + close + commit
│       ├── admin-schools.ts            ✅ Billing management
│       ├── attendance.ts               ✅ Submit + approve + grid + Excel export
│       ├── auth.ts                     ✅ Login / logout / me / change-password
│       ├── exams.ts                    ✅ CRUD + results + lock/unlock + marksheet + pass-marks
│       ├── fees.ts                     ✅ Structures + schedule + pay + govt-pay + writeoff
│       ├── principal.ts                ✅ Notice + complaint + expense + approval + library + permissions
│       ├── promotion.ts                ✅ Preview + execute (with fee-schedule auto-gen) + previous-year-data
│       ├── settings.ts                 ✅ GET + PUT school settings
│       ├── staff.ts                    ✅ Create + update + salary + relieve + deactivate
│       ├── students.ts                 ✅ Full lifecycle (admit → assign → fail/TC → readmit)
│       ├── teacher.ts                  ✅ Check-in / check-out / attendance
│       ├── timetable.ts                ✅ Save + delete
│       └── transport.ts                ✅ Vehicles + stops + assign + remove
│
├── supabase/
│   └── migrations/ (41 files)
│       ├── 0001_init.sql               Core schema
│       ├── 0002_super_admin.sql
│       ├── 0003_onboard_school_rpc.sql
│       ├── 0004_onboard_school_authz.sql
│       ├── 0005_principal_rpcs.sql
│       ├── 0006_asset_atomic.sql
│       ├── 0007_year_closing_atomic.sql
│       ├── 0008_year_closing_dues_handling.sql
│       ├── 0009_principal_persistence.sql
│       ├── 0010_asset_history_meta.sql
│       ├── 0011_fee_payment_uploads.sql
│       ├── 0012_fee_screenshots_storage.sql
│       ├── 0013_fee_upload_auto_record.sql
│       ├── 0014_fee_screenshots_cleanup.sql
│       ├── 0015_onboard_school_fix_ambiguous_code.sql
│       ├── 0016_fix_first_login_flag_persist.sql
│       ├── 0017_full_flow_fixes.sql
│       ├── 0018_create_ay_with_sections.sql
│       ├── 0019_student_documents_storage.sql
│       ├── 0020_late_fee_compute.sql
│       ├── 0021_staff_salary_lifecycle.sql
│       ├── 0022_staff_salary_lifecycle_fixes.sql
│       ├── 0023_staff_salary_effective_amount.sql
│       ├── 0024_salary_reminders_future_relieving.sql
│       ├── 0025_transport_assignment_history.sql
│       ├── 0026_transport_authz_hardening.sql
│       ├── 0027_salary_reminders_fix_ambiguous_name.sql
│       ├── 0028_sections_student_count_trigger.sql
│       ├── 0029_fee_structure_billing_cycle.sql
│       ├── 0030_enable_realtime.sql
│       ├── 0031_fee_structure_types.sql
│       ├── 0032_payment_qr_settings.sql
│       ├── 0033_complaint_statuses.sql
│       ├── 0034_transport_fee_structure.sql
│       ├── 0035_school_settings_teacher_checkin.sql
│       ├── 0036_school_simple_billing.sql
│       ├── 0037_promotion_phase8.sql
│       ├── 0038_attendance_status_column.sql
│       ├── 0039_attendance_approvals.sql
│       ├── 0040_streams_schema_verify.sql
│       └── 0041_exam_enhancements.sql
│
└── src/
    ├── App.tsx                         ✅ Root router — all 5 role layouts
    ├── main.tsx
    ├── lib/
    │   ├── adminApi.ts                 Direct Supabase admin calls
    │   ├── apiClient.ts                ✅ All 100+ endpoint definitions
    │   ├── audit.ts                    Audit log helper
    │   ├── cacheBus.ts                 Cache invalidation bus
    │   ├── gemini.ts                   Gemini AI integration (exam paper gen)
    │   └── supabase.ts                 Supabase client init
    │
    ├── store/
    │   ├── authStore.ts                Session + selectedStudentId
    │   ├── correctionStore.ts          Closed-year correction mode
    │   ├── editingYearStore.ts         Year-switching override
    │   ├── editorModeStore.ts          30-min sensitive edit window
    │   └── uiStore.ts                  Toasts + subView navigation
    │
    ├── shared/
    │   ├── components/
    │   │   ├── AdmissionFormPrint.tsx  Printable admission form
    │   │   ├── ErrorBoundary.tsx
    │   │   ├── FirstLoginPasswordChange.tsx
    │   │   ├── LoginPage.tsx
    │   │   ├── Navigation.tsx          BottomNav + SidebarNav + Header
    │   │   ├── ProfileView.tsx
    │   │   └── ui/Toast.tsx
    │   ├── config/constants.ts
    │   ├── context/AcademicYearContext.tsx
    │   ├── hooks/useRealtimeTable.ts
    │   ├── types/index.ts              AppRole + NavTab + ActionItem only
    │   └── utils/
    │       ├── audit.service.ts
    │       ├── school.service.ts
    │       ├── schoolInfo.service.ts
    │       └── storage.service.ts
    │
    ├── modules/
    │   ├── academic-year/
    │   │   ├── academicYear.api.ts     ✅
    │   │   ├── academicYear.service.ts ✅
    │   │   ├── yearClosing.service.ts  ✅
    │   │   ├── yearClosing.types.ts    ✅
    │   │   └── components/
    │   │       ├── AcademicYearManager.tsx    ✅ Year list + close workflow
    │   │       ├── AcademicYearWizard.tsx     ✅ New year creation wizard
    │   │       ├── ClassManagementManager.tsx ✅ Class + section CRUD
    │   │       └── PromotionWizard.tsx        ✅ Promote/Retain/TC + stream + fee
    │   │
    │   ├── attendance/
    │   │   ├── attendance.api.ts       ✅
    │   │   ├── attendance.service.ts   ✅
    │   │   └── components/
    │   │       ├── AttendanceHub.tsx           ✅ Principal attendance hub
    │   │       ├── StaffAttendanceManager.tsx  ✅ Staff P/A/H/HD grid
    │   │       ├── StudentAttendanceManager.tsx ✅ Student attendance grid
    │   │       ├── StudentAttendanceTab.tsx    ✅ Profile attendance tab
    │   │       └── TeacherAttendanceManager.tsx ✅ Teacher marks own class
    │   │
    │   ├── auth/
    │   │   ├── auth.api.ts             ✅
    │   │   └── auth.service.ts         ✅
    │   │
    │   ├── exams/
    │   │   ├── exam.api.ts             ✅ (re-exports from apiClient)
    │   │   ├── exam.service.ts         ❌ MISSING — logic scattered in components
    │   │   └── components/
    │   │       ├── ExamPaperGenerator.tsx  ✅ AI-powered via Gemini
    │   │       ├── Marksheet.tsx           ✅ Final exam marksheet + print
    │   │       ├── PrincipalExamsManager.tsx ✅ Exam CRUD + lock/unlock
    │   │       └── TestsManager.tsx        ✅ Teacher exam scheduling
    │   │
    │   ├── fees/
    │   │   ├── fee.api.ts              ✅
    │   │   ├── fee.service.ts          ✅ Full service with cache
    │   │   ├── fees.types.ts           ✅
    │   │   └── components/
    │   │       ├── FeeLedger.tsx               ✅ Full principal ledger
    │   │       ├── FeePaymentSubmissionsQueue.tsx ✅ Upload queue
    │   │       ├── FeeStructureForm.tsx        ✅ Structure creation
    │   │       └── PreviousYearDues.tsx        ✅ Cross-year dues widget
    │   │
    │   ├── notices/
    │   │   ├── notice.api.ts           ❌ MISSING — uses apiPrincipal instead
    │   │   ├── notice.service.ts       ❌ MISSING — no abstraction layer
    │   │   └── components/
    │   │       ├── NoticesManager.tsx      ✅ Principal CRUD
    │   │       ├── StudentNoticesView.tsx  ✅ Student read-only view
    │   │       └── TeacherNoticesView.tsx  ✅ Teacher read-only view
    │   │
    │   ├── staff/
    │   │   ├── staff.api.ts            ✅
    │   │   ├── staff.service.ts        ✅
    │   │   ├── staff.types.ts          ✅
    │   │   ├── staffStorage.service.ts ✅ Document upload
    │   │   └── components/
    │   │       └── StaffManager.tsx    ✅ Full staff lifecycle
    │   │
    │   ├── students/
    │   │   ├── student.api.ts          ✅
    │   │   ├── student.service.ts      ✅
    │   │   ├── student.types.ts        ✅
    │   │   ├── studentDashboard.service.ts ✅
    │   │   └── components/
    │   │       ├── StudentClassAssignmentModal.tsx ✅
    │   │       └── StudentsManager.tsx             ✅ 2000+ line full profile
    │   │
    │   ├── timetable/
    │   │   ├── timetable.api.ts        ✅
    │   │   ├── timetable.service.ts    ✅
    │   │   └── components/
    │   │       ├── TeacherTimetableView.tsx ✅
    │   │       └── TimetableManager.tsx    ✅
    │   │
    │   └── transport/
    │       ├── transport.api.ts        ✅
    │       ├── transport.service.ts    ✅
    │       └── components/
    │           └── TransportManager.tsx ✅
    │
    └── roles/
        ├── driver/
        │   ├── DriverLayout.tsx        ✅
        │   ├── DriverRouteView.tsx     ✅
        │   └── DriverStudentsView.tsx  ✅
        │
        ├── principal/
        │   ├── pages/PrincipalLayout.tsx ✅ 20+ module navigation
        │   ├── principal.api.ts          ✅
        │   ├── principal.service.ts      ✅
        │   ├── principal.types.ts        ✅
        │   └── components/
        │       ├── ApprovalsManager.tsx    ✅
        │       ├── AssetsManager.tsx       ✅ Books + equipment
        │       ├── AuditLogsViewer.tsx     ✅
        │       ├── ComplaintsManager.tsx   ✅
        │       ├── ExpensesManager.tsx     ✅
        │       ├── PrincipalDashboard.tsx  ✅
        │       ├── SalaryLedger.tsx        ✅
        │       ├── SalaryReminderCard.tsx  ✅
        │       ├── SettingsManager.tsx     ✅
        │       └── ToolsManager.tsx        ✅
        │
        ├── student/
        │   ├── pages/StudentLayout.tsx ✅
        │   ├── student-role.types.ts   ✅
        │   └── components/
        │       ├── AttendanceView.tsx       ✅
        │       ├── FeesView.tsx             ✅
        │       ├── HomeworkView.tsx         ⚠️ UI only — no backend
        │       ├── ResultsView.tsx          ✅
        │       ├── StudentComplaintsView.tsx ✅
        │       ├── StudentLeaveView.tsx     ✅
        │       ├── StudentProfileView.tsx   ✅
        │       ├── TimetableView.tsx        ✅
        │       └── TransportView.tsx        ✅
        │
        ├── super-admin/
        │   ├── pages/SuperAdminLayout.tsx ✅
        │   ├── admin.api.ts               ✅
        │   ├── admin.service.ts           ✅
        │   ├── admin.types.ts             ✅
        │   ├── adminStore.ts              ✅
        │   ├── billing.service.ts         ✅
        │   ├── billing.types.ts           ✅
        │   ├── billingStore.ts            ✅
        │   ├── broadcast.service.ts       ✅
        │   ├── broadcast.types.ts         ✅
        │   ├── broadcastStore.ts          ✅
        │   ├── logs.service.ts            ✅
        │   ├── logs.types.ts              ✅
        │   ├── logsStore.ts               ✅
        │   ├── school.types.ts            ✅
        │   ├── schoolStore.ts             ✅
        │   └── components/
        │       ├── AdminsManager.tsx       ✅
        │       ├── BillingManager.tsx      ✅
        │       ├── BroadcastManager.tsx    ✅
        │       ├── LogsViewer.tsx          ✅
        │       ├── ReportsView.tsx         ✅
        │       └── SchoolsManager.tsx      ✅
        │
        └── teacher/
            ├── pages/TeacherLayout.tsx ✅
            ├── teacher.api.ts          ✅
            ├── teacher.service.ts      ✅
            ├── teacher.types.ts        ✅
            └── components/
                └── TeacherComplaints.tsx ✅
```

---

## 2. MODULE IMPLEMENTATION STATUS

| Module | API File | Service File | Components | Server Route | Navigation | Overall |
|--------|----------|--------------|------------|--------------|------------|---------|
| Academic Year | ✅ | ✅ | ✅ 4 | ✅ | Principal | ✅ Complete |
| Attendance | ✅ | ✅ | ✅ 5 | ✅ | Principal, Teacher | ✅ Complete |
| Auth | ✅ | ✅ | ✅ 2 | ✅ | Login flow | ✅ Complete |
| **Exams** | ✅ | ❌ Missing | ✅ 4 | ✅ | Principal, Teacher | ⚠️ 85% |
| Fees | ✅ | ✅ | ✅ 4 | ✅ | Principal, Student | ✅ Complete |
| **Notices** | ❌ Missing | ❌ Missing | ✅ 3 | ✅ (via /principal) | Principal, Teacher, Student | ⚠️ 70% |
| Staff | ✅ | ✅ | ✅ 1 | ✅ | Principal | ✅ Complete |
| Students | ✅ | ✅ | ✅ 2 | ✅ | Principal | ✅ Complete |
| Timetable | ✅ | ✅ | ✅ 2 | ✅ | All roles | ✅ Complete |
| Transport | ✅ | ✅ | ✅ 1 | ✅ | Principal, Student, Driver | ✅ Complete |
| Principal (misc) | ✅ | ✅ | ✅ 9 | ✅ | Principal | ✅ Complete |
| Super Admin | ✅ | ✅ | ✅ 6 | ✅ | Super Admin | ✅ Complete |
| Driver | — | — | ✅ 3 | — | Driver | ✅ Complete |

---

## 3. KAMIYAAN (GAPS) — DETAILED

### 3A. MISSING FILES (Architecture Gaps)

#### ❌ `src/modules/exams/exam.service.ts`
**Problem:** Exam business logic is directly in components — TestsManager, PrincipalExamsManager, Marksheet all call `apiExams.*` directly. No caching, no shared logic.

**Chahiye:**
```typescript
// exam.service.ts
export const examService = {
  async getExams(yearId: string, className?: string): Promise<Exam[]>
  async createExam(data: CreateExamInput): Promise<Exam>
  async uploadResults(testId: string, results: ExamResult[]): Promise<void>
  async lockResults(testId: string): Promise<void>
  async unlockResults(testId: string): Promise<void>
  async getMarksheet(className: string, yearId: string): Promise<MarksheetData>
  async configurePassMarks(testId: string, passMarks: number, config: Record<string, number>): Promise<void>
  // Pass/fail calculation
  isStudentPassed(student: MarksheetStudent, exams: MarksheetExam[]): boolean
  calculateGrade(pct: number): string
}
```

#### ❌ `src/modules/notices/notice.api.ts`
**Problem:** Notices use `apiPrincipal` (a generic principal API object). No dedicated notice API.

**Chahiye:**
```typescript
// notice.api.ts
export const apiNotices = {
  list: (yearId?: string) => get<Notice[]>('/principal/notice/list'),
  create: (body: CreateNoticeInput) => post<Notice>('/principal/notice/create', body),
  delete: (noticeId: string) => post<void>('/principal/notice/delete', { noticeId }),
}
```

#### ❌ `src/modules/notices/notice.service.ts`
**Problem:** NoticesManager, StudentNoticesView, TeacherNoticesView all fetch directly. No shared cache or state.

**Chahiye:**
```typescript
// notice.service.ts
export const noticeService = {
  async getAll(): Promise<Notice[]>
  async create(data: CreateNoticeInput): Promise<Notice>
  async delete(id: string): Promise<void>
  async refresh(): Promise<void>
}
```

#### ❌ `src/modules/notices/notice.types.ts`
Notice types are currently defined inline or in principal.types.ts.

---

### 3B. HOMEWORK MODULE — UI ONLY, NO BACKEND

**File:** `src/roles/student/components/HomeworkView.tsx`

**Problem:** Homework tab is visible to students but has no backend at all.

**Kya chahiye:**

**Database:**
```sql
CREATE TABLE homework (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  academic_year_id UUID NOT NULL REFERENCES academic_years(id),
  section_id UUID REFERENCES sections(id),
  class_name TEXT NOT NULL,
  subject TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE NOT NULL,
  assigned_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Server route** — `server/routes/homework.ts`:
```
GET  /api/homework?className=&yearId=
POST /api/homework/create
POST /api/homework/delete
```

**Frontend:**
- Teacher: Create/delete homework for their class
- Student: View homework with due date and subject
- Principal: Overview of all pending homework

---

### 3C. STUDENT LEAVE MODULE — INCOMPLETE

**File:** `src/roles/student/components/StudentLeaveView.tsx`

**Problem:** Leave apply UI exists for students, but:
- No backend route in `server/routes/` for leave submission
- Leave is handled via `/api/principal/leave/submit` (principal-side only)
- Students cannot see their leave history
- No leave approval workflow for teachers

**Kya chahiye:**

**Missing routes:**
```
POST /api/leave/apply        (student submits leave)
GET  /api/leave/my-leaves    (student sees own leave history)
GET  /api/leave/pending      (teacher sees class leaves to approve)
POST /api/leave/approve      (teacher approves/rejects)
```

**Missing teacher UI:** Teachers have no way to view or approve student leave requests.

---

### 3D. PARENT ROLE — COMPLETELY MISSING

**Problem:** DB has `PARENT` role in requireRole checks (e.g., `/api/fees/student/:id`), but:
- No `src/roles/parent/` directory
- No ParentLayout.tsx
- No parent navigation in App.tsx
- Parent login leads to nowhere

**Kya chahiye:**
```
src/roles/parent/
├── ParentLayout.tsx          (layout + navigation)
├── parent.service.ts         (fetch children list)
└── components/
    ├── ParentDashboard.tsx   (child selector + overview)
    ├── ParentFeesView.tsx    (fees for selected child)
    ├── ParentAttendanceView.tsx
    └── ParentResultsView.tsx
```

**App.tsx mein add karna hoga:**
```typescript
if (role === 'PARENT') return <ParentLayout />;
```

---

### 3E. REAL-TIME UPDATES — PARTIALLY IMPLEMENTED

**File:** `src/shared/hooks/useRealtimeTable.ts`

**Problem:** Realtime hook exists and migrations enable it, but very few components actually use it. Stale data is common.

**Kya use karna chahiye realtime:**
- Fee payments (when principal marks payment, student's view updates)
- Attendance (when teacher submits, principal sees it immediately)
- Notices (new notice → all students/teachers see instantly)
- Leave requests (student submits → principal/teacher sees)

---

### 3F. EXAM RESULTS — STUDENT VIEW INCOMPLETE

**File:** `src/roles/student/components/ResultsView.tsx`

**Problem:**
- Shows regular exam results ✅
- Does NOT show Final exam marksheet with subject-wise grades
- No pass/fail verdict visible to students
- New `exam_type = FINAL` results not surfaced in student's results view

**Kya chahiye:**
- ResultsView should detect FINAL exams separately
- Show marksheet-style view for final exams
- Show overall grade + pass/fail per year

---

### 3G. TEACHER ROLE — MISSING FEATURES

**Teacher layout has:** Attendance ✅ | Tests ✅ | Exam Paper Gen ✅ | Complaints ✅ | Notices ✅ | Timetable ✅

**Missing from teacher:**
1. **Student fee view** — Teacher cannot see which students have fee dues (useful for fee reminders)
2. **Leave approval** — No UI to approve/reject student leave requests
3. **Homework management** — No homework create/assign UI
4. **Student list for class** — Teacher cannot see list of students in their class
5. **Result submission locking** — Teacher sees no feedback when principal locks their submitted results

---

### 3H. PRINCIPAL DASHBOARD — STAT CARDS INCOMPLETE

**File:** `src/roles/principal/components/PrincipalDashboard.tsx`

**Problem:** Dashboard shows stat cards but several are either:
- Hardcoded/static numbers
- Missing real-time data

**Specific gaps:**
- "Students with fee dues" card: should show actual count from fee_installments
- "Pending leave requests" card: should show count from approvals table
- "Low attendance" card: students below 75% — query not implemented
- "Upcoming salary paydays" — salary reminder not shown prominently

---

### 3I. SETTINGS — SOME FIELDS SAVED BUT NOT USED

**File:** `src/roles/principal/components/SettingsManager.tsx`

**Problem:** Many settings fields are saved to DB but not actually consumed in the app:

| Setting Field | Saved | Used |
|--------------|-------|------|
| School name | ✅ | ✅ (receipts, marksheet) |
| School address | ✅ | ✅ (receipts) |
| QR payment image | ✅ | ✅ (fee modal) |
| Teacher check-in enabled | ✅ | ✅ |
| Late fee config | ✅ | ✅ |
| Academic year dates | ✅ | ✅ |
| Default passing % | ✅ | ❌ NOT used in exam pass/fail logic |
| Notification preferences | ✅ | ❌ No notification system |
| SMS gateway config | ✅ | ❌ No SMS system |

---

### 3J. NOTIFICATIONS / SMS — SETTINGS EXIST, SYSTEM MISSING

**Problem:** Settings has notification preferences, SMS gateway config fields — but there is no notification system at all.

**Kya chahiye (future):**
- SMS on fee due date
- SMS when attendance is low
- Push notification for new notice
- WhatsApp webhook integration

---

### 3K. REPORT GENERATION — SUPER ADMIN ONLY

**File:** `src/roles/super-admin/components/ReportsView.tsx`

**Problem:** Reports exist only for super admin (school-wide stats). Principal has no report generation.

**Principal ke liye chahiye:**
- Monthly fee collection report (PDF/Excel)
- Class-wise attendance summary
- Exam performance report per class
- Staff salary disbursement report

---

### 3L. EXCEL/PDF EXPORT — PARTIAL

| Feature | Export Status |
|---------|--------------|
| Attendance export | ✅ Excel via `/attendance/export-excel` |
| Fee receipts | ✅ PDF via html2canvas + jsPDF |
| Marksheet print | ✅ window.print() |
| Student list | ❌ No export |
| Fee collection report | ❌ No export |
| Staff salary report | ❌ No export |
| Exam results summary | ❌ No export |

---

### 3M. DRIVER ROLE — READ-ONLY, NO LIVE TRACKING

**Problem:** Driver role shows route and student list but:
- No live GPS tracking (complex — needs mobile app)
- No ability to mark attendance on bus
- No parent notification when bus arrives

**Realistic quick win:**
- Driver can mark "Bus departed" / "Bus arrived" per stop
- Parents see live status update

---

## 4. NAVIGATION MAP

### Principal (20+ modules)
```
PrincipalLayout
├── Dashboard (stats + quick actions)
├── Students → StudentsManager (CLASSES view)
│   ├── Class list → Section → Student list → Student Profile
│   │   └── Tabs: Info | Allotment | Family | Results | Fees | Attendance | History | Docs
│   ├── Admission → new student form
│   ├── Archive → TC_ISSUED | ALUMNI | INACTIVE | UNASSIGNED
│   └── Fee view → per student fees
├── Staff → StaffManager
├── Fee Ledger → FeeLedger
│   ├── Student list → per-student detail
│   ├── Pay modal (with discount)
│   ├── Previous Year Dues widget
│   └── Govt Payment modal
├── Exams → PrincipalExamsManager
│   ├── Exam list → Results view (lock/unlock)
│   └── Marksheet → class selector → print per student
├── Attendance → AttendanceHub
│   ├── Student attendance grid
│   └── Staff attendance grid
├── Transport → TransportManager
├── Timetable → TimetableManager
├── Notices → NoticesManager
├── Complaints → ComplaintsManager
├── Approvals → ApprovalsManager (leave + corrections)
├── Expenses → ExpensesManager
├── Salary → SalaryLedger
├── Staff Attendance → StaffAttendanceManager
├── Assets → AssetsManager (books + equipment)
├── Settings → SettingsManager
│   ├── School info
│   ├── Fee structures
│   └── Classes config
├── Tools → ToolsManager
│   ├── AI Exam Paper Generator
│   └── Correction Mode toggle
└── Year Closing → AcademicYearManager
    ├── Academic year CRUD
    ├── Class Management
    └── Promotion Wizard
```

### Teacher
```
TeacherLayout
├── Dashboard (today's classes + check-in/out)
├── Attendance → TeacherAttendanceManager (own classes only)
├── Tests → TestsManager (create exam + upload results)
├── Exam Generator → ExamPaperGenerator (AI)
├── Complaints → TeacherComplaints
├── Notices → TeacherNoticesView
└── Timetable → TeacherTimetableView
```

### Student
```
StudentLayout
├── Dashboard (9-module grid)
├── Timetable → TimetableView
├── Results → ResultsView
├── Fees → FeesView
├── Transport → TransportView
├── Notices → StudentNoticesView
├── Complaints → StudentComplaintsView
├── Attendance → AttendanceView
├── Leave → StudentLeaveView
└── Profile → StudentProfileView
```

### Driver
```
DriverLayout
├── Dashboard
├── Route → DriverRouteView
└── Students → DriverStudentsView
```

### Super Admin
```
SuperAdminLayout
├── Dashboard → SADashboard
├── Schools → SchoolsManager
├── Billing → BillingManager
├── Admins → AdminsManager
├── Broadcast → BroadcastManager
├── Reports → ReportsView
└── Logs → LogsViewer
```

---

## 5. BROKEN IMPORTS
**Result: NONE** — All `@/` path aliases resolve correctly. TypeScript shows zero errors.

---

## 6. PRIORITY ORDER — KYA PEHLE BANANA CHAHIYE

### 🔴 Critical (App breaks for some users)
1. **Parent role** — Parents can login but see blank screen
2. **Student leave backend** — Submit button does nothing

### 🟠 High Priority (Feature incomplete)
3. **Homework module** — UI exists but no data
4. **exam.service.ts** — Code quality + maintainability
5. **notice.api.ts + notice.service.ts** — Architecture consistency
6. **Student ResultsView FINAL exam** — Students can't see marksheet-style results

### 🟡 Medium Priority (Nice to have)
7. **Principal report exports** — PDF/Excel for fee, salary, attendance
8. **Teacher leave approval UI** — Leave workflow is one-sided
9. **Principal dashboard real stats** — Currently shows some static values
10. **Real-time updates** — useRealtimeTable not used widely

### 🟢 Low Priority (Polish)
11. **Settings fields consumed** — Default passing %, SMS config
12. **Driver bus tracking** — Mark stop arrival/departure
13. **Teacher student list** — Teacher can't see their class roster
14. **Notifications system** — SMS/push (requires external service)

---

## 7. DATABASE TABLES (inferred from migrations + routes)

### Core
- `schools` — Multi-tenant root
- `users` — Auth users with role
- `academic_years` — Per-school years with status
- `sections` — Classes within a year (class_name + section + streams)

### Students
- `students` — Permanent profile
- `student_academic_records` — Year-specific record (class, section, fee status, attendance %)
- `tc_records` — TC issuance history
- `promotion_log` — Full audit of every promotion decision

### Staff
- `staff` — Staff permanent profile
- `staff_salary_records` — Salary payment history
- `staff_salary_effective` — Effective salary tracking

### Fees
- `fee_structures` — Templates per class per year
- `fee_installments` — Per-student per-month dues
- `payment_records` — Each payment transaction
- `payment_installment_links` — M:N allocation of payment to installments
- `fee_write_offs` — Waiver audit trail

### Attendance
- `attendance_records` — Per-class per-date header
- `attendance_student_details` — Per-student status (P/A/H/HD)

### Exams
- `test_schedules` — Exam definition (with exam_type, pass_marks, result_status)
- `exam_results` — Per-student per-test marks

### Transport
- `transport_vehicles` — Vehicle master
- `transport_stops` — Route stops
- `student_transport_assignments` — Assignment history

### Principal
- `notices` — School announcements
- `complaints` — Student/parent complaints
- `expenses` — School expenses
- `approvals` — Leave + correction requests
- `library_books` — Book inventory
- `library_equipment` — Equipment inventory

### Super Admin
- `billing_plans` — Subscription plans
- `billing_records` — Payment history
- `audit_logs` — System-wide audit trail
- `broadcast_messages` — Cross-school broadcasts

---

## 8. OVERALL HEALTH SCORE

| Area | Score | Notes |
|------|-------|-------|
| Database Schema | 95/100 | 41 migrations, well-designed, RLS enforced |
| Server API | 92/100 | All routes implemented, good error handling |
| Frontend Architecture | 85/100 | Feature-based, clean — missing 2 service files |
| Authentication | 98/100 | JWT + role-based, first-login flow |
| Fee System | 95/100 | Most complete module |
| Attendance | 90/100 | Grid + approvals + realtime-ready |
| Exam System | 80/100 | Missing service layer, student view incomplete |
| Promotion Wizard | 95/100 | Stream + TC + fee structure all wired |
| Student Role | 75/100 | Homework + leave backend missing |
| Parent Role | 10/100 | Login works, but no UI |
| Teacher Role | 80/100 | Missing leave approval + homework + student list |
| Reports/Exports | 50/100 | Only attendance + receipt PDF, no summary reports |
| Notifications | 5/100 | Settings exist, no system |

**Overall: ~82/100 — Production-ready for core workflows.**
**Main gaps: Parent role, Homework module, Student leave backend, Report exports.**
