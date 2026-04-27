# EduGrow School Management

A full-stack school management application with React frontend and Express.js/PostgreSQL backend. Supports Super Admin, Principal, Teacher, Student/Parent, and Driver roles.

## Tech Stack

### Frontend
- **Framework:** React 19 + TypeScript
- **Build tool:** Vite 6
- **Styling:** Tailwind CSS v4 (via `@tailwindcss/vite`)
- **Icons:** lucide-react
- **Animation:** motion
- **AI:** `@google/genai` (Gemini), used in views like `ExamPaperGenerator`
- **State:** Zustand

### Backend
- **Server:** Express.js (TypeScript via tsx)
- **Database:** PostgreSQL (Replit built-in)
- **Auth:** JWT (jsonwebtoken + bcryptjs)
- **Port:** 3001

## Project Structure

```
/
├── src/                    # React frontend
│   ├── App.tsx             # Main app shell
│   ├── main.tsx            # Entry point
│   ├── components/         # Shared UI components
│   ├── context/            # React context providers
│   ├── services/           # Frontend service layer (mock data, transitioning to API)
│   ├── views/              # Feature views per role
│   └── types/              # TypeScript type definitions
├── server/                 # Express.js backend
│   ├── index.ts            # Server entry point
│   ├── db/
│   │   ├── pool.ts         # PostgreSQL connection pool
│   │   └── migrate.ts      # DB migrations + seed
│   ├── middleware/
│   │   └── auth.ts         # JWT auth middleware
│   ├── routes/             # API route handlers
│   │   ├── auth.ts         # Login, logout, change-password
│   │   ├── schools.ts      # School CRUD
│   │   ├── academic-years.ts
│   │   ├── sections.ts
│   │   ├── students.ts
│   │   ├── staff.ts
│   │   ├── fees.ts         # Installments, payments (Oldest Due First), govt payments
│   │   ├── attendance.ts
│   │   ├── timetable.ts
│   │   ├── homework.ts
│   │   ├── notices.ts
│   │   ├── exams.ts
│   │   ├── transport.ts
│   │   ├── complaints.ts
│   │   ├── broadcasts.ts
│   │   ├── billing.ts      # School-level billing
│   │   └── users.ts
│   └── utils/
│       └── jwt.ts
├── vite.config.ts          # Vite config with /api proxy to port 3001
└── package.json
```

## API Endpoints

All API routes are at `/api/...` and require `Authorization: Bearer <token>` except `/api/auth/login`.

### Auth
- `POST /api/auth/login` — Login (returns JWT token)
- `POST /api/auth/logout` — Logout
- `POST /api/auth/change-password` — Change password
- `GET /api/auth/me` — Current user info

### Schools (SUPER_ADMIN)
- `GET /api/schools` — List all schools
- `POST /api/schools` — Create school (also creates principal account)
- `GET /api/schools/:id` — Get school with academic years
- `PUT /api/schools/:id` — Update school
- `DELETE /api/schools/:id` — Soft-delete school

### School-Scoped Routes (`/api/schools/:schoolId/...`)
- Academic years, sections, students, staff, fees, attendance, timetable, homework, notices, exams, transport, complaints, users

### Super Admin Only
- `GET/POST/DELETE /api/broadcasts` — Platform-wide broadcasts
- `GET/POST /api/billing` — School billing management

## Database Tables

schools, academic_years, sections, users, parent_student_links, students, student_academic_records, staff, staff_class_assignments, salary_payments, fee_installments, payment_records, payment_installment_links, advance_balances, government_payments, govt_payment_student_links, attendance_records, attendance_student_details, timetable_entries, transport_vehicles, route_stops, student_transport_assignments, homework_assignments, notices, test_schedules, exam_results, complaints, broadcasts, school_billing_schedules, school_billing_years, school_payments, system_logs

## Replit Setup

### Workflows
- `Start application` — `npm run dev` on port **5000** (Vite frontend)
- `API Server` — `npm run server` on port **3001** (Express backend)

Vite proxies `/api/*` requests to port 3001 during development.

### Initial Login
- **Super Admin:** mobile `9999999999`, password `admin@123`
- **Principal:** Created automatically when adding a school via the schools API

## Environment Variables

- `DATABASE_URL`, `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` — Auto-set by Replit PostgreSQL
- `JWT_SECRET` — Optional, defaults to a hardcoded dev secret (should be set in production)
- `API_PORT` — Optional, defaults to 3001
- `GEMINI_API_KEY` — Optional, for AI features in frontend

## Business Logic

- **Oldest Due First:** When a student payment is recorded, it's automatically applied to oldest unpaid installments first
- **Advance balance:** Excess payment is stored as advance and applied to future dues
- **Permanent identity:** Students and staff are never deleted, only deactivated (soft delete)
- **RTE students:** Tuition fee installments created with `payer_type = GOVERNMENT`
- **Academic year isolation:** All data (fees, attendance, results, timetable, transport) is linked to academic year ID
- **Auto admission number:** Generated as `ADM-{year}-{count}` when student is created
- **Auto parent account:** Created when student is admitted with a parent mobile number
- **Auto teacher/driver accounts:** Created when staff with TEACHER/DRIVER role is added
