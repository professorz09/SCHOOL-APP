# School Management App – Master Plan (All Phases)

> **Reference document** — poora system ka blueprint. Ek phase ek time par implement hoga, user ke approve karne par agle phase pe jaenge.
>
> **Source of truth rule:** Agar koi conflict ho, to **Phase sections** (Phase 1–8) authoritative hain — wo latest agreed spec hai. Baaki sections (Fees System, Attendance System, etc.) background context hain jo usi spec ke saath align hoti hain.

---

## Core Rules (Kabhi nahi badlega)

| Entity | Rule |
|--------|------|
| School | Permanent – kabhi delete nahi hoga |
| Student | Permanent – kabhi delete nahi hoga |
| Staff | Permanent – kabhi delete nahi hoga |

**Yearly data sirf Academic Year ke andar rahega:**
Class, Section, Fees, Attendance, Result, Timetable, Transport, Permissions

---

## System Complete hone par "Done" kaisa dikhega

- SuperAdmin fixed fee set kar sakta hai aur unlimited payments record kar sakta hai — ledger style history
- Principal ek step-by-step wizard se naya academic year banata hai (dates → classes → sections → fee structure → staff optional)
- Students permanent archive me rehte hain (academic year se alag) — sirf static details
- Student ko class allot karte time fee structure bhi chunna padta hai + optional transport
- Student profile me class history, vehicle history, fee history, attendance — sab alag tabs me
- Fees me partial payment, discount, remark sab supported hai; due dates pe auto show hoti hain
- Attendance grid view (columns = dates, rows = students), lock/unlock with editor mode, Excel export, teacher marks + principal edits
- Exams me regular aur final exam alag; final exam me pass/fail config per subject + total; marksheet print ready
- Year close pe checklist (attendance, results, fees); ledger system se cross-year dues visible; promotion wizard me auto-promote passed students, manual override, stream selection for 11th/12th, TC for 12th passouts
- New year wizard me previous year ki classes, sections, fee structures pre-fill ho jaati hain (editable)
- Staff bhi students ki tarah academic year se alag permanent entity hai

---

## Out of Scope (Abhi nahi, baad me)

> Note: Ye document me Notices, Complaints, Timetable aur Transport ke legacy sections existing behavior ka record hain — new changes nahi. Inme koi naya development Phase 1–8 me nahi hoga.

- Staff management ka detailed module (optional step, wizard me skip kar sakte hain)
- Timetable module changes
- Driver/Transport live GPS tracking
- Notices aur Complaints module changes
- Mobile app / PWA

---

## Implementation Order

| Phase | Module | Depends On |
|-------|--------|------------|
| 1 | Folder Structure Cleanup | — |
| 2 | SuperAdmin Billing | Phase 1 |
| 3 | Academic Year Wizard | Phase 1 |
| 4 | Student Master Profile | Phase 1 |
| 5 | Class Allotment + Fees | Phase 3 + Phase 4 |
| 6 | Attendance Rework | Phase 3 |
| 7 | Exam System | Phase 3 |
| 8 | Year Close + Promotion | Phase 5 + Phase 6 + Phase 7 |

---

## PHASE 1 — Folder/File Structure Cleanup

**Goal:** Codebase structure ko specified layout se align karna.

```
src/
├── modules/
│   ├── students/          (components/, pages/, student.service.ts)
│   ├── fees/              (components/, fee.service.ts)
│   ├── attendance/        (components/, attendance.service.ts)
│   ├── academic-year/
│   ├── transport/
│   ├── exams/
│   └── staff/
├── roles/
│   ├── super-admin/
│   ├── principal/
│   ├── teacher/
│   └── student/
├── shared/
│   ├── components/
│   └── utils/
├── store/                 (all Zustand stores here)
└── lib/                   (supabase.ts, apiClient.ts, etc.)
```

**Tasks:**
1. `src/` ke andar folder structure reorganize karo
2. Import aliases update karo `@/` se — koi breaking change nahi
3. `store/` folder me saare Zustand stores move karo (`shared/store/` se)
4. `lib/` folder me shared utilities move karo (`shared/lib/` se)

---

## PHASE 2 — SuperAdmin: Fixed Fee + Payment History

**Goal:** SuperAdmin ek fixed fee amount set kare aur phir jitne chahein payments add kar sake; sab payment history me dikhe.

**DB tables (already exist):** `school_billing_schedules`, `school_payments`, `school_payment_allocations`

**Tasks:**
1. SuperAdmin panel me "School Billing" section me fixed amount set karne ka UI — simple input: fee amount + description
2. Amount set hone ke baad payment add karne ka form: date, amount, transaction ID, remark
3. Payment history table: date, amount, transaction ID, status (paid/partial/due), running balance
4. Ledger logic: payment oldest due me pehle adjust ho (RPC `record_school_payment` exist karta hai)
5. SuperAdmin payment history filter by school aur date range

**Relevant files:**
- `src/roles/super-admin/billing.service.ts`
- `src/roles/super-admin/components/BillingManager.tsx`
- `src/shared/store/billingStore.ts`
- `src/shared/types/billing.types.ts`

---

## PHASE 3 — Academic Year Wizard (Principal – New Year Setup)

**Goal:** Principal naya academic year step-by-step wizard se banaye.

### Wizard Steps

**Step 1 – Basic Config**
- Academic year name (e.g. 2026-27)
- Start date / End date
- Board name (CBSE / ICSE / State Board etc.)
- Medium (Hindi / English / Both)

**Step 2 – Classes & Sections**
- Class list multi-select: Nursery, LKG, UKG, 1–10, 11-Science, 11-Maths, 11-Commerce, 11-Arts, 12-Science, 12-Maths, 12-Commerce, 12-Arts
- 11th/12th ke liye stream name visible hoga class name me
- Har selected class me sections add karne ka option — section ka naam custom ho sakta hai (A, B, C ya Geography-History-Polity ya Biology-Chemistry-Physics)
- Sections add/remove karo with a simple tag-input UI

**Step 3 – Fee Structure**
- School fees structure:
  - Fee Header: name + description
  - Fee items: name + amount + transaction fee (optional)
  - Installment type: Monthly (12 kist), Quarterly (4 kist), Yearly (1), Custom
  - Multiple fee structures bana sakte hain
- Transport fees structure (alag section):
  - Same format: header → items → installment type
  - Ye transport assignment ke time select hoga

**Step 4 – Staff (Optional / Skip)**
- Staff add karne ka option — skip karo to baad me add kar sakte hain

**Step 5 – Review & Create**
- Poori summary dikhao: year name, classes count, sections count, fee structures count
- "Create Academic Year" button

**DB changes needed:**
- `classes` table me stream support
- `sections` table me custom section name
- `fee_structures` table me installment_type column + transport_type flag
- `fee_structure_items` table me items store karna

**Relevant files:**
- `src/modules/academic-year/components/AcademicYearWizard.tsx`
- `src/modules/academic-year/academicYear.service.ts`
- `src/modules/fees/components/FeeStructureForm.tsx`
- `src/modules/fees/fee.service.ts`

---

## PHASE 4 — Student Master (Permanent Archive)

**Goal:** Students academic year se bilkul alag permanent entities hain.

### Student Master Fields (permanent — kabhi delete/change nahi)

- Name, DOB, Aadhaar number, Blood group
- Father name, Mother name, Guardian details, Contact numbers
- Address (permanent)
- Admission date
- Profile photo
- Documents (birth certificate, previous TC, marksheet, Aadhaar, caste certificate)

### Rules

- Koi bhi critical field (name, DOB, Aadhaar) direct edit nahi hoga — change request jaayegi approval me
- Student delete nahi hoga kabhi

### Student Profile Tabs

1. **Basic Info** — Static details (photo, name, DOB, contact)
2. **Documents** — Upload/view documents
3. **Parent Details** — Father, mother, guardian
4. **Class Allotment History** — Har academic year me kis class me tha (allotment date ke saath)
5. **Vehicle Allotment History** — Kab kaunsa vehicle assign/remove hua
6. **Fee History** — Har academic year ki fee dues + payments (ledger view)
7. **Attendance** — Month-wise attendance summary (academic year wise)

**Relevant files:**
- `src/modules/students/student.service.ts`
- `src/modules/students/components/StudentsManager.tsx`
- `src/shared/types/student.types.ts`

---

## PHASE 5 — Student Class Allotment + Fee Assignment

**Goal:** Student ko class allot karo, saath me fee structure aur optional transport bhi assign karo.

### Allotment Flow

1. Student search karo (name / admission number / Aadhaar)
2. Academic year select (current active by default)
3. Class select → Section select
4. Allotment date (year start, ya mid-year admission ke liye alag)
5. Fee Structure select — dropdown me sirf is academic year ke fee structures
6. Transport (optional): checkbox lagao → transport fee structure select karo (vehicle route, stop)
7. Save → automatically:
   - `student_academic_records` me entry bane
   - Fee schedule generate ho (installment dates ke saath)
   - Transport assignment record bane (agar selected)

### Upcoming Dues (automatic)

- Fee schedule me due dates set ho jaayegi installment type ke hisab se
- Jab due date aaye → student profile me aur student dashboard me "due" dikhne lage

### Fee Payment

- Kisi bhi due par click karo → pay karo
- Remark likho (optional)
- Discount do (optional — actual amount - discount = cleared amount, dono record me save hon)
- Partial payment bhi allowed
- Ek payment multiple dues me adjust hogi (oldest first)

**DB tables needed:**
- `student_academic_records` — extend with fee_structure_id
- `fee_schedules` — per-installment rows with due_date, amount, status
- `student_payments` — amount, remark, discount, date
- `student_payment_allocations` — payment to schedule allocation

**Relevant files:**
- `src/modules/students/components/StudentClassAssignmentModal.tsx`
- `src/modules/fees/components/FeeLedger.tsx`
- `src/modules/fees/fee.service.ts`
- `server/routes/fees.ts`
- `server/routes/students.ts`

---

## PHASE 6 — Attendance System (Rework)

**Goal:** Grid-based attendance — columns = dates, rows = students. Lock/unlock with editor mode.

### UI Layout

- Top: date columns (only within academic year start–end dates)
- Left: student names (class-section wise)
- Cell values: P (Present), A (Absent), H (Holiday), Half (Half-day)
- Bulk actions: "Mark all Present", "Mark Holiday for date"

### Lock/Unlock Flow

- Teacher attendance submit kare → status: `submitted`
- Principal approve kare → status: `locked` (read-only for all)
- Locked ke baad edit sirf editor/correction mode on hone par
- Settings me "Editor Mode" toggle — on karne par principal edit kar sakta hai locked attendance bhi
- Edit karne par reason prompt + audit log

### Download

- Settings me "Download Attendance as Excel" — academic year + class + section select karo → Excel generate

### Permissions

- Teacher sirf apni assigned classes ki attendance kar sakta hai
- Principal koi bhi class dekh sakta hai aur edit kar sakta hai (editor mode me)

### Student Profile Integration

- Attendance har month student profile ke Attendance tab me reflect ho

**DB changes:**
- `attendance` table me status column add: `present | absent | holiday | half`
- `attendance_approvals` me per-date lock status

**Relevant files:**
- `src/modules/attendance/components/StudentAttendanceManager.tsx`
- `src/modules/attendance/components/TeacherAttendanceManager.tsx`
- `src/modules/attendance/attendance.service.ts`
- `src/roles/principal/components/SettingsManager.tsx`

---

## PHASE 7 — Exam System

**Goal:** Do type ke exams — regular aur final. Schedule → Result upload → Marksheet.

### Regular Exam

- Exam name, subjects list, date-wise schedule
- Schedule students ko visible ho (upcoming exams)
- Result upload karo exam ke baad: subject-wise marks per student
- Result submit hone ke baad no change by teacher — sirf principal exam section se change kar sakta hai

### Final Exam (Main)

- Same structure + passing configuration:
  - Har subject me minimum passing marks set karo (e.g. 33/100)
  - Total passing marks set karo (e.g. 33%)
- Result submit hone ke baad:
  - Auto calculate pass/fail per student
  - Ye data promotion wizard me use hoga
  - Marksheet print ke liye data ready

### Marksheet Print

- Student select karo + final exam select karo → marksheet generate
- School name, student details, subject-wise marks, total, result (Pass/Fail), grade

**DB tables needed:**
- `exams` — type: `regular | final`, academic_year_id, class_id
- `exam_subjects` — subject name, max_marks, min_passing_marks
- `exam_results` — student_id, exam_id, subject_id, marks_obtained
- `exam_config` — total_min_percentage for final exam

**Relevant files:**
- `src/modules/exams/components/TestsManager.tsx`
- `server/routes/exams.ts`

---

## PHASE 8 — Year Close + Promotion Wizard + New Year Creation

**Goal:** Year close karo checklist ke saath, phir new year banao promotion wizard ke saath.

### Year Close Checklist

- Final exam results uploaded? (warning agar nahi)
- Attendance done for all dates? (warning agar nahi)
- Pending fees kitni hain? (info — amount show karo, blocker nahi)
- TC students cleared?

### Fee Pending — Ledger Approach

- Student ki pending fees academic year se attach rehti hain (delete nahi hoti)
- New year me student ki profile me dono dikhte hain: previous year outstanding + current year dues
- Payment karte time academic year switch ki zaroorat nahi — student ke ledger me cross-year view milta hai
- Payment jo bhi karo uski date + academic year dono save hoti hai automatically

### Year Close Action

- Checklist acknowledgement → year close → `is_closed = TRUE`
- Closed year read-only ho jaata hai (correction mode se edit possible)

### New Academic Year Wizard (Returning Year)

- **Step 1:** Basic config (name, dates, board)
- **Step 2:** Classes — previous year ki classes auto-select, deselect/add/remove allowed; sections bhi edit karo
- **Step 3:** Fee structures — previous year ke structures pre-filled, edit/add/remove allowed
- **Step 4 – Promotion Wizard (main step):**
  - Class-wise list aata hai
  - Final exam result ke hisab se auto-mark:
    - Pass → "Promote" (next class)
    - Fail → "Retain" (same class)
  - Manual override allowed
  - **10th class promote:** next class select karne ke saath section bhi select karo
  - **11th class promote:** stream choose karo (Science/Maths/Commerce/Arts) + section; ya "Not allotting now" option
  - **12th class:** no promotion — only TC issue; date select karo TC ki
  - Dono 11th aur 12th ke liye side me fee structure select option
  - "Promote All Passed" bulk action
  - Individual override for any student
- **Step 5:** Review summary → Create New Year

### Staff in New Year

- Staff permanent entity hai (academic year se alag)
- New year me existing staff automatically continue karta hai
- Salary structure new year me copy hoti hai ya naya set karo

**DB changes:**
- `student_academic_records` me promoted_to_record_id, promotion_date, status: `studying | promoted | failed | tc`
- TC records table: student_id, tc_date, remarks
- `promotion_log` table for audit

**Relevant files:**
- `src/modules/academic-year/components/AcademicYearWizard.tsx`
- `src/modules/academic-year/yearClosing.service.ts`
- `server/routes/promotion.ts`
- `server/routes/academic-year.ts`

---

## App Roles

- Super Admin
- Principal
- Teacher
- Driver
- Student / Parent

---

## Super Admin Panel

### School Management

- School add karega
- **School code fixed rahega** (unique identity)
- Principal ID auto-create hogi
- School deactivate karne par:
  - Principal login inactive
  - Staff inactive
  - Students inactive
  - **Data delete nahi hoga**

### School Billing (Ledger System)

Same ledger logic jo student fees me hai:

| Table | Purpose |
|-------|---------|
| `school_billing_schedules` | Fixed payment schedule |
| `school_payments` | Flexible payments received |
| `school_payment_allocations` | Oldest due me adjust |

**Logic:**
- Schedule fixed rahega
- Payment flexible rahega
- Payment oldest due me adjust hoga
- Paid record locked rahega
- Future unpaid billing plan change se update hogi

**Example:**

| Month | Due | Paid | Balance |
|-------|-----|------|---------|
| Jan | ₹1000 | ₹1000 | ₹0 |
| Feb | ₹1000 | ₹1000 | ₹0 |
| Mar | ₹1000 | ₹500 | ₹500 |

---

## Academic Year Logic

```
School
 └── Academic Year
      ├── Classes
      ├── Sections
      ├── Subjects
      ├── Student Academic Records
      ├── Fees
      ├── Attendance
      ├── Results
      ├── Timetable
      ├── Teacher Permissions
      ├── Transport
      ├── Notices
      └── Complaints
```

### Student Master (Permanent – Alag Rahega)

| Field | Type |
|-------|------|
| Name | Permanent |
| DOB | Permanent |
| Aadhaar | Permanent |
| Parents details | Permanent |
| Address | Permanent |
| Blood group | Permanent |
| Photo | Permanent |
| Documents | Permanent |
| Admission date | Permanent |

### Student Academic Record (Har saal alag)

| Field |
|-------|
| student_id |
| academic_year_id |
| class_id |
| section_id |
| roll_no |
| rte_status |
| medium |
| fee_plan_id |
| transport |
| status: `studying / promoted / failed / tc` |

---

## Student Admission Flow

**Step 1: Existing Student Check**
- Search by: Aadhaar / Mobile / Old admission number
- Already hai toh duplicate create nahi hoga

**Step 2: Student Master Create**
- Permanent profile banegi

**Step 3: Academic Record Create**
- student_id, academic_year_id, class_id, section_id, roll_no, rte_status, fee_plan_id, status

**Step 4: Auto Actions (admission ke baad)**
- Fee schedule generate
- Timetable access
- Attendance eligibility
- Transport assignment (if selected)

---

## Student Profile – Tabs

### Basic Info
- Photo, Name, DOB, Phone, Blood group, Address
- Aadhaar, Caste, Religion, Birth certificate no, PEN number

### Documents
- Birth certificate, TC, Previous marksheet
- Passport photo, Aadhaar, Caste certificate

### Parent Details
- Father name, Mother name, Occupation, Income, Email, Mobile

### Academic Info
- Class, Section, Roll no, RTE, Medium, Academic year

### Extra Tabs
- Results (year-wise)
- Fees (year-wise)
- Attendance (monthly/yearly)
- Complaints timeline
- Notices

---

## Change Management Logic

**Critical fields direct overwrite nahi honge.**

### Name / DOB / Aadhaar Change → History Save

| Field | Saved |
|-------|-------|
| old_value | ✓ |
| new_value | ✓ |
| reason | ✓ |
| proof_document | ✓ |
| changed_by | ✓ |
| changed_at | ✓ |
| approved_by | ✓ |

### Class Change Mid-Year

Overwrite nahi hoga — movement record banega:

| Field |
|-------|
| old_class |
| old_section |
| new_class |
| new_section |
| effective_date |

> Attendance date ke hisab se correct class me dikhegi.

### TC Issue

- Student delete nahi hoga
- `student.status = tc_issued`
- `academic_record.status = transferred`

---

## Fees System

### Tables

| Table | Purpose |
|-------|---------|
| `fee_installments` | Per-student installment schedule (one row per due date) |
| `payment_records` | Flexible payments received |
| `payment_installment_links` | Oldest due me adjust (allocation) |
| `fee_write_offs` | Maafi record |
| `advance_balances` | Overpayment credit per student |

### Fee Schedule Example

| Month | Due | Paid | Balance | Status |
|-------|-----|------|---------|--------|
| April | ₹1000 | ₹1000 | ₹0 | Paid |
| May | ₹1000 | ₹500 | ₹500 | Partial |
| June | ₹1000 | ₹0 | ₹1000 | Unpaid |

### Allocation Logic (Oldest Due First)

```
Pending:
  April  → ₹1000
  May    → ₹1000
  June   → ₹1000

Payment ₹2500:
  April  → ₹1000 ✓ Paid
  May    → ₹1000 ✓ Paid
  June   → ₹500  ~ Partial
```

### Pending Fees – Academic Year Close ke Baad

Student profile me dono saath dikhenge:

```
Previous year pending : ₹4000
Current year pending  : ₹6000
Total outstanding     : ₹10000
```

### Write-Off (Fee Maafi)

- Direct delete nahi
- `fee_write_offs` me entry
- Reason required
- `approved_by` required

---

## Attendance System

### Teacher Flow
1. Class select kare
2. Bulk present mark kare
3. Absent manually mark kare
4. Submit kare → Principal approval me jaye

### Principal Approval
- Review → Approve / Reject
- Approved attendance lock ho jayegi

### Attendance Record Fields

| Field |
|-------|
| student_id |
| academic_year_id |
| class_id |
| section_id |
| date |
| status |
| marked_by |
| approved_by |

---

## Timetable System

### Period Setup Example

| Period | Time | Type |
|--------|------|------|
| Assembly | 08:00–08:20 | Activity |
| Period 1 | 08:20–09:00 | Teaching |
| Break | 09:40–10:00 | Break |

### Conflict Rules
- Same teacher same time par 2 classes me nahi
- Same class same time par 2 subjects nahi
- Inactive teacher assign nahi
- Closed academic year edit nahi

---

## Exam & Result System

### Teacher Panel
- Main exam schedule kare
- Other tests schedule kare
- Marks upload kare

### Result Record Fields

| Field |
|-------|
| student_id |
| academic_year_id |
| exam_id |
| subject_id |
| marks |
| grade |

---

## Teacher Panel

| Module | Kya Kar Sakta Hai |
|--------|------------------|
| Attendance | Assigned classes only, bulk present, submit for approval |
| Tests | Main exams, other tests, result upload |
| Notices | Assigned class ko homework/notice bhejta hai |
| Exam Paper | Manual ya Gemini AI se generate, PDF download |
| Complaint | Principal ko complaint bhej sakta hai |

---

## Staff Management

### Staff Types
- Teacher, Driver, Peon, Other staff

### Staff Salary – Ledger System

| Table | Purpose |
|-------|---------|
| `staff_salary_schedules` | Fixed monthly schedule |
| `staff_salary_payments` | Actual payments |
| `staff_salary_history` | Full history |

---

## Transport System

### Principal Panel
- Vehicles add
- Drivers assign
- Routes + stops create
- Students ko vehicle assign

### Driver Panel

| Feature |
|---------|
| Route dekhe |
| GPS on/off |
| Manual route switch |
| Stop ke paas aate hi → `reached` status |
| Emergency button |

---

## Complaints System

### Status Flow
`pending` → `in review` → `resolved` / `rejected`

---

## Approvals System

Principal ke approval center me aayega:

| Approval Type |
|--------------|
| Attendance approval |
| Fee payment screenshot |
| Leave requests |
| Critical profile changes |
| TC request |
| Write-off request |

---

## Database Safety Rules

| # | Rule |
|---|------|
| 1 | Direct delete mat karo |
| 2 | Status use karo: `active / inactive / deactivated` |
| 3 | Paid record edit mat karo |
| 4 | Old academic year read-only rakho |
| 5 | Har yearly data me `academic_year_id` compulsory |
| 6 | Har query me `school_id` compulsory |
| 7 | Student duplicate mat karo |
| 8 | Critical change ka history save karo |
| 9 | Payment ko ledger me maintain karo |
| 10 | Fee/salary/billing me allocation table zaroor rakho |

---

## Main Database Tables

### School & Billing
```
schools
school_billing_schedules
school_payments
school_payment_allocations
```

### Academic Structure
```
academic_years
classes
sections
subjects
```

### Students
```
students
student_documents
student_academic_records
student_change_history
student_class_movements
```

### Fees
```
fee_structures
fee_structure_items
fee_installments
payment_records
payment_installment_links
fee_write_offs
advance_balances
```

### Staff
```
staff
staff_permissions
staff_attendance
salary_payments
```

### Timetable
```
timetable_periods
timetable_entries
```

### Attendance
```
attendance_records
attendance_student_details
attendance_approvals
```

### Exams & Results
```
exams
exam_subjects
exam_results
exam_config
```

### Promotion
```
student_academic_records  (promoted_to_record_id, promotion_date, status)
promotion_log
tc_records
```

### Communication
```
notices
complaints
expenses
```

### Transport
```
vehicles
route_stops
student_transport_assignments
```

### System
```
approvals
audit_logs
```

---

## Final Golden Structure

```
Super Admin
 └── School
      ├── School Billing Ledger
      ├── Principal
      ├── Staff Master (permanent, year-independent)
      ├── Student Master (permanent, year-independent)
      └── Academic Years
            ├── Classes + Sections
            ├── Student Yearly Records
            ├── Fee Structures + Installments
            ├── Attendance
            ├── Results
            ├── Timetable
            ├── Transport
            ├── Notices
            ├── Complaints
            └── Expenses
```

---

## Final Rule

> **Student aur School permanent identity hain.**
> Baaki saari changing cheezein Academic Year, Ledger aur History ke through chalengi.
> Isse data duplicate bhi nahi hoga aur old records kabhi kharab bhi nahi honge.
