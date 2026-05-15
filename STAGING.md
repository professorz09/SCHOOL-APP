# STAGING — Pre-production verification environment

This file is the setup recipe for a **staging environment** that mirrors production without sharing its DB. Right now there is only one Supabase project and one Vercel project — every deploy goes straight to prod. That's the gap this doc closes.

The goal is **free**: no paid Supabase or Vercel plan is required. The whole setup uses free tiers.

---

## Why staging matters

A migration like [`0136`](supabase/migrations/0136_reverse_payment_writeoff_partial.sql) (changed `reverse_payment` status logic) is impossible to safely test in prod — if the new branch logic has a bug, real installments get wrong statuses. Staging lets you:

1. Apply migrations + run smoke flows before touching prod
2. Test risky route changes against realistic data
3. Demo new features without exposing real parents' data
4. Run E2E / load tests without polluting prod audit trail

---

## Architecture

```
                ┌──────────────────────┐                ┌──────────────────────┐
                │  PRODUCTION          │                │  STAGING             │
                │                      │                │                      │
                │  Vercel project      │                │  Vercel project      │
                │  edugrow.app         │                │  staging.edugrow.app │
                │      │               │                │      │               │
                │      ▼               │                │      ▼               │
                │  Supabase project    │                │  Supabase project    │
                │  edugrow-prod        │                │  edugrow-staging     │
                │      │               │                │      │               │
                └──────┼───────────────┘                └──────┼───────────────┘
                       │                                       │
                       └─ Real schools, real parents ─┐    ┌─ Anonymised copy of
                                                     │    │   prod, or seeded
                                                     ▼    ▼
                                              (NEVER share data between the two)
```

---

## One-time setup

### A. Create the staging Supabase project (free)

1. Go to [supabase.com](https://supabase.com/dashboard) → New project
2. Name: `edugrow-staging`
3. Region: same as prod (so latency tests match)
4. Strong DB password — save in your password manager
5. Wait ~2 min for provisioning

**Copy** these values from `Project Settings → API`:
- `Project URL` → becomes `SUPABASE_URL` in staging env
- `service_role` key → becomes `SUPABASE_SERVICE_ROLE_KEY`
- `anon` key → becomes `VITE_SUPABASE_ANON_KEY`

### B. Apply the schema

In the staging project's `SQL Editor`:

1. Run every migration in [`supabase/migrations/`](supabase/migrations/) in order. Paste each file's contents and click Run.
   - There are 142 migrations as of this writing
   - Alternative: install Supabase CLI and run `supabase db push --linked` (you'll need to `supabase link --project-ref <staging-ref>` first)
2. Confirm RLS is enabled — `Database → Tables` → every table should show 🛡

### C. Seed initial data

Two options:

**Option 1 — Fresh demo data.** Create one staging school manually via super-admin onboarding flow, then add ~3 dummy classes / 10 students / 1 fee structure.

**Option 2 — Anonymised prod copy.** ⚠ **Risky — only if you must test against realistic shapes.**

1. Export the relevant tables from prod (Supabase Dashboard → SQL Editor → `COPY (SELECT …) TO STDOUT`)
2. **Strip PII** before importing:
   - `UPDATE students SET name = 'Demo ' || left(id::text, 4), phone = '9' || right(id::text, 9), aadhaar_no = NULL`
   - `UPDATE staff SET name = 'Demo Staff ' || left(id::text, 4), phone = '9' || right(id::text, 9)`
   - `UPDATE users SET mobile_number = '9' || right(id::text, 9), email = NULL`
   - Drop `audit_logs` entirely (contains real IPs and user actions)
   - Drop `fee_screenshots` and `student_documents` storage objects
3. Import the cleaned dump into staging

### D. Create the staging Vercel project (free)

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard) → Import project
2. Connect the same GitHub repo
3. **Important:** set Production Branch to `staging` (not `main`)
4. Project name: `edugrow-staging`
5. Set env vars (Project Settings → Environment Variables):

   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | Staging project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | Staging service-role key |
   | `VITE_SUPABASE_URL` | Same as `SUPABASE_URL` |
   | `VITE_SUPABASE_ANON_KEY` | Staging anon key |
   | `NODE_ENV` | `production` (Vercel default; do NOT set to "staging") |

6. Trigger first deploy → it should serve at `<project>.vercel.app`

### E. (Optional) Custom staging domain

Add `staging.<yourdomain>.com` in Vercel → Domains. Free with any registrar.

---

## Branch strategy

```
main           ← prod-only. Pushes deploy to prod
  │
  ▼
staging        ← staging-only. Pushes deploy to staging
  │
  ▼
feature/*      ← work branches. Open PR to staging, NOT to main
```

Recommended flow:
1. Open PR `feature/x → staging` — CI runs, deploys to a Vercel preview
2. Merge to `staging` → deploys to `staging.edugrow.app`
3. Smoke-test for a day or two
4. Open PR `staging → main` — also runs CI
5. Merge to `main` → production deploy

Vercel previews on the `staging` PR run against the **staging** env vars by default if you configure environment-per-branch.

---

## What to test on staging before promoting

A minimum smoke checklist for each release:

- [ ] Super-admin can log in
- [ ] Onboard a fresh school (auth user + schools row + AY all created)
- [ ] Principal can log in, change first password
- [ ] Add a class, a fee structure, admit one student
- [ ] Record a payment, see receipt
- [ ] Reverse the payment within 24h, verify reversal in audit trail
- [ ] Submit attendance for the class
- [ ] Issue a TC, verify `students.status='TC_ISSUED'`
- [ ] Logout → log in as that parent → see fee + attendance
- [ ] Run a CSV export from Analytics — open in Excel, check names + reversal handling

Anything in [RUNBOOK §5–§7](RUNBOOK.md) is worth a dry-run on staging.

---

## Costs (all free tier)

| Service | Free tier limit | Likely staging usage |
|---|---|---|
| Supabase Postgres | 500 MB DB, 2 GB storage, 50k MAU | A few demo schools + your team → well under |
| Supabase Auth | 50k MAU | Stays at 5-10 demo users |
| Supabase Realtime | 200 concurrent | Your team uses 2-3 connections |
| Vercel | 100 GB bandwidth, 100 GB-hours functions / mo | Staging traffic is just smoke tests |
| GitHub Actions | 2000 minutes / mo (private), unlimited (public) | CI passes in ~3 min, ~600 min / mo for typical activity |

Total cost: **₹0/month** if usage stays in free tier.

---

## Rotation discipline

- Refresh staging from prod (anonymised) at least once a quarter, otherwise schema drift creeps in
- After any production hotfix that uses a manual SQL command, document it in [RUNBOOK.md](RUNBOOK.md) and **re-test the hotfix on staging** to confirm the playbook still works

---

## When staging is missing

If staging hasn't been set up yet, the next-best practice for risky changes:

1. **Take a Supabase snapshot** in the prod dashboard immediately before deploy ([RUNBOOK §1](RUNBOOK.md#1-backups))
2. Deploy off-peak hours (after 10 PM IST — school staff are offline)
3. Have the rollback Vercel deployment ID ready to "Promote to Production"
4. Watch logs for 30 min after deploy
5. Document what you did in `audit_logs` so the team has a trail

But this is a *workaround*, not a substitute for staging. Set it up.
