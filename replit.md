# EduGrow School Management

A clean, mobile-first school management React application with a professional UI inspired by modern fintech apps. Supports Super Admin, Principal, Teacher, Student, and Driver roles.

## Tech Stack

- **Framework:** React 19 + TypeScript
- **Build tool:** Vite 6
- **Styling:** Tailwind CSS v4 (via `@tailwindcss/vite`)
- **Icons:** lucide-react
- **Animation:** motion
- **AI:** `@google/genai` (Gemini), used in views like `ExamPaperGenerator`

## Project Structure

- `index.html` — Vite entry HTML
- `src/main.tsx` — React entry point, wraps app in `AcademicYearProvider`
- `src/App.tsx` — Mobile shell, role switcher, tab-based navigation
- `src/components/` — Shared UI (`Navigation.tsx`, `SharedUI.tsx`)
- `src/context/AcademicYearContext.tsx` — Academic year state
- `src/views/` — Feature views/dashboards per role
- `vite.config.ts` — Vite config with Tailwind, React, alias `@/*`
- `tsconfig.json` — TypeScript config (ESNext, JSX react-jsx)

## Replit Setup

- Workflow `Start application` runs `npm run dev` on port **5000** with host `0.0.0.0`.
- `vite.config.ts` sets `server.host = '0.0.0.0'`, `server.port = 5000`, and `server.allowedHosts = true` so the Replit proxy iframe can load the dev preview.
- Deployment is configured as **static**: builds with `npm run build` and publishes the `dist/` directory.

## Environment Variables

- `GEMINI_API_KEY` — Optional, required only for Gemini-powered views (e.g. exam paper generator). Injected at build/dev time via `define` in `vite.config.ts`.
