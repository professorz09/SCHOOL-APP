# School Management App – Final Product Document

---

## 0. Core Rule

| Entity | Rule |
|--------|------|
| School | Permanent – kabhi delete nahi hoga |
| Student | Permanent – kabhi delete nahi hoga |
| Staff | Permanent – kabhi delete nahi hoga |

**Yearly data sirf Academic Year ke andar rahega:**
Class, Section, Fees, Attendance, Result, Timetable, Transport, Permissions

---

## 1. App Roles

- Super Admin
- Principal
- Teacher
- Driver
- Student / Parent

---

## 2. Super Admin Panel

### 2.1 School Management

- School add karega
- **School code fixed rahega** (unique identity)
- Principal ID auto-create hogi
- School deactivate karne par:
  - Principal login inactive
  - Staff inactive
  - Students inactive
  - **Data delete nahi hoga**

### 2.2 School Billing (Ledger System)

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

## 3. Principal Panel – First Setup

Principal ko **sabse pehle Academic Year create karna hoga.**

**Fields:**
- Academic year name (e.g., 2026-27)
- Start date / End date
- Board & Medium
- Classes & Sections
- Fee plans

**Without academic year — kuch nahi hoga:**
- Admission nahi
- Fees nahi
- Attendance nahi
- Timetable nahi
- Result nahi

---

## 4. Academic Year Logic

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

## 5. Student Admission Flow

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

## 6. Student Profile – Tabs

### Basic Info
- Photo, Name, DOB, Phone, Blood group, Address
- Aadhaar, Caste, Religion, Birth certificate no, PEN number

### Documents
- Birth certificate, TC, Previous marksheet
- Passport photo, Aadhaar, Caste certificate
- Parent/guardian photo

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

## 7. Change Management Logic

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

## 8. Fees System

### Tables

| Table | Purpose |
|-------|---------|
| `fee_schedules` | Full year schedule per student |
| `student_payments` | Flexible payments received |
| `student_payment_allocations` | Oldest due me adjust |
| `fee_write_offs` | Maafi record |

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

## 9. Student Payment Flow

```
Student/Parent → Fee due dekhe
      ↓
Pay via UPI / QR
      ↓
Screenshot upload kare
      ↓
Status: Pending Approval
      ↓
Principal verify kare
      ↓
Approved → Amount ledger me adjust
```

---

## 10. Attendance System

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

## 11. Timetable System

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

### Views
| Role | Dikhega |
|------|---------|
| Student | Sirf apni class-section ka timetable |
| Teacher | Sirf apne assigned periods |

---

## 12. Exam & Result System

### Teacher Panel
- Main exam schedule kare
- Other tests schedule kare
- Marks upload kare
- Unscheduled test bhi add kar sake

### Result Record Fields

| Field |
|-------|
| student_id |
| academic_year_id |
| exam_id |
| subject_id |
| marks |
| grade |

### Student Panel Dikhega
- Upcoming tests
- Exam timetable
- Result history
- Scorecard

---

## 13. Teacher Panel

| Module | Kya Kar Sakta Hai |
|--------|------------------|
| Attendance | Assigned classes only, bulk present, submit for approval |
| Tests | Main exams, other tests, result upload |
| Notices | Assigned class ko homework/notice bhejta hai |
| Exam Paper | Manual ya Gemini AI se generate, PDF download |
| Complaint | Principal ko complaint bhej sakta hai |

---

## 14. Staff Management

### Staff Types
- Teacher, Driver, Peon, Other staff

### Staff Salary – Ledger System

| Table | Purpose |
|-------|---------|
| `staff_salary_schedules` | Fixed monthly schedule |
| `staff_salary_payments` | Actual payments |
| `staff_salary_history` | Full history |

### Suspend / Deactivate Rule
- Inactive staff ka us month ka salary auto generate nahi hoga
- Old salary history safe rahegi

---

## 15. Teacher Permissions

Permission **academic year-wise** hogi.

| Teacher | Year | Class | Permission |
|---------|------|-------|------------|
| Rajesh Sir | 2026-27 | 8-A | Attendance |
| Rajesh Sir | 2026-27 | 9-B | Result |

> Teacher ko wahi class dikhegi jiska permission diya gaya hai.

---

## 16. Assets Management

### Library
- Books add / deactivate
- Book search
- Student ko book assign (locked to student)
- Return ke baad unlock

### Lab
- Equipment add / remove
- Quantity & status track

### Vehicle
- Vehicle add
- Driver assign
- Route assign
- Student transport assignment

---

## 17. Transport System

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
| Emergency button → Complaints/Alerts me jaye |

### Student/Parent Panel
- Van location dekhe
- Route status dekhe
- Reached updates dekhe

---

## 18. Complaints System

### Sources
- Student, Parent, Teacher, Staff, Driver

### Complaint Fields

| Field |
|-------|
| complaint_by |
| role |
| student_id (optional) |
| academic_year_id |
| message |
| status |
| created_at |
| resolved_at |

### Status Flow
`pending` → `in review` → `resolved` / `rejected`

---

## 19. Notices System

| Sender | Target |
|--------|--------|
| Principal | Students only / Teachers only / Staff only / All |
| Teacher | Sirf assigned class |

> Student panel me notices timeline ke hisab se dikhenge.

---

## 20. Expenses System

Principal add karega:
- Expense type, Amount, Date, Description, Bill/photo (optional)

**Dashboard me dikhega:**
- Staff salary paid
- Other expenses
- Total expense
- Monthly expense

---

## 21. Approvals System

Principal ke approval center me aayega:

| Approval Type |
|--------------|
| Attendance approval |
| Fee payment screenshot |
| Leave requests |
| Critical profile changes |
| TC request |
| Write-off request |

### Approval Record Fields

| Field |
|-------|
| requested_by |
| request_type |
| old_value |
| new_value |
| proof |
| status |
| approved_by |
| approved_at |

---

## 22. Academic Year Closing Flow

### Step 1: Review Check
- Attendance locked?
- Results uploaded?
- Pending fees?
- TC students?
- Failed students?

### Step 2: Close Year
- Attendance → read-only
- Results → read-only
- Timetable → read-only
- Paid fees → locked
- Pending fees → student ledger me remain

### Step 3: New Academic Year Create

### Step 4: Promotion Wizard

| Student Status | Action |
|---------------|--------|
| Passed | Next class |
| Failed | Same class |
| TC | Exclude |

Confirm: RTE status, Section assign, Fee plan assign

### Step 5: Auto Generate for New Year
- Student academic records
- Fee schedules
- Subjects
- Timetable (optional copy)
- Teacher permissions (optional copy)
- Transport (optional copy)

---

## 23. Student Panel

### Dashboard
- Today timetable
- Upcoming exam
- Pending fee
- Notices
- Transport status

### Fees Tab
- Upcoming fee
- Pending fee
- Previous year due
- Total outstanding
- QR payment
- Screenshot upload

### Other Tabs
- Weekly timetable (today highlight, next period highlight)
- Upcoming exams & previous tests scorecard
- Transport: vehicle location, route status
- Notices: timeline view
- Complaint: submit + status track

---

## 24. Driver Panel

| Feature |
|---------|
| Assigned vehicle |
| Assigned route & stops |
| GPS tracking |
| Reached status per stop |
| Emergency alert |
| Manual route status |

---

## 25. Database Safety Rules

> Developer ke liye most important rules — kabhi mat bhoolna.

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

## 26. Main Database Tables

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
fee_schedules
student_payments
student_payment_allocations
fee_write_offs
```

### Staff
```
staff
staff_permissions
staff_attendance
staff_salary_schedules
staff_salary_payments
```

### Timetable
```
timetable_periods
timetable_entries
timetable_history
```

### Attendance
```
attendance
attendance_approvals
```

### Exams & Results
```
exams
exam_subjects
exam_results
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
routes
route_stops
student_transport_assignments
driver_locations
```

### System
```
approvals
audit_logs
```

---

## 27. Final Golden Structure

```
Super Admin
 └── School
      ├── School Billing Ledger
      ├── Principal
      ├── Staff Master
      ├── Student Master
      └── Academic Years
            ├── Classes
            ├── Sections
            ├── Student Yearly Records
            ├── Fees
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
