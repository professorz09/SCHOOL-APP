# EduGrow — production deployment guide

Total time: ~15 minutes. All free tier.

---

## 1. Create accounts (one-time)

| Service | URL | Purpose |
|---|---|---|
| GitHub | https://github.com | Code hosting |
| Supabase | https://supabase.com | Database + auth + storage |
| Vercel  | https://vercel.com | Frontend + API hosting |

Sign in to all three with the **same Gmail** so SSO connects them.

---

## 2. Push code to GitHub

```bash
git remote set-url origin https://github.com/<your-user>/<repo>.git
git push -u origin main
```

---

## 3. Create the Supabase project

1. Supabase Dashboard → **New project**
2. Choose **region close to your users** (Mumbai / Singapore for India)
3. Strong DB password — save it somewhere
4. Wait ~2 min for provisioning

---

## 4. Apply the database schema

1. Supabase Dashboard → **SQL Editor** → New query
2. Open [`/_apply.supabasesql`](supabase/_apply.sql) in your editor
3. Copy the **entire file** and paste into the SQL editor
4. Click **Run**

You'll see "Success. No rows returned" — that's good. ~60 tables and ~80 functions get created.

### Verify the schema

1. SQL Editor → New query
2. Copy [`scripts/verify.sql`](scripts/verify.sql) and run it
3. Bottom row should say `OK ✓ — schema looks complete.`
4. If `FAIL ✗`, the rows above tell you exactly which tables/functions are missing — re-run `_apply.sql` (it's idempotent).

---

## 5. Grab Supabase credentials

Settings → API. Copy:

- **Project URL** (looks like `https://abcdef.supabase.co`)
- **anon public** key
- **service_role secret** key ⚠️ KEEP THIS PRIVATE

---

## 6. Deploy to Vercel

1. Vercel Dashboard → **Add New** → **Project**
2. Import the GitHub repo
3. Framework preset: **Vite** (auto-detected)
4. **Environment Variables** (paste before clicking Deploy):

```
VITE_SUPABASE_URL          = https://abcdef.supabase.co
VITE_SUPABASE_ANON_KEY     = eyJhbGc...   (anon key)
SUPABASE_URL               = https://abcdef.supabase.co
SUPABASE_ANON_KEY          = eyJhbGc...   (anon key, same as above)
SUPABASE_SERVICE_ROLE_KEY  = eyJhbGc...   (service-role secret)
```

Optional (skip if you don't use AI features):
```
GEMINI_API_KEY             = ...   (https://aistudio.google.com/apikey)
```

5. Click **Deploy** → wait ~2 min for build

---

## 7. Create the super-admin user

After deploy, you need one super-admin to onboard schools.

1. Supabase Dashboard → **Authentication** → Users → **Add user**
2. Enter your **mobile number followed by `@edugrow.local`** as email
   (e.g., `9999999999@edugrow.local`)
3. Set a strong password
4. **Auto Confirm User: ON**
5. Click **Create user**

Now make them super-admin via SQL Editor:

```sql
INSERT INTO public.users (id, mobile_number, role, name, email, school_id, is_active)
VALUES (
  -- copy the UUID from the auth.users row you just made:
  '00000000-0000-0000-0000-000000000000',
  '9999999999',
  'SUPER_ADMIN',
  'Your Name',
  '9999999999@edugrow.local',
  NULL,
  TRUE
)
ON CONFLICT (id) DO UPDATE SET role = 'SUPER_ADMIN', is_active = TRUE;
```

---

## 8. Test login

1. Open your Vercel URL (e.g., `https://your-app.vercel.app`)
2. Login with mobile `9999999999` + the password you set
3. You should land on the super-admin dashboard
4. **First action**: create a school → onboard a principal → done

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| **HTTP 500 on login** | `SUPABASE_SERVICE_ROLE_KEY` missing/wrong in Vercel. Re-check Environment Variables → Redeploy. |
| **"User profile not found"** | Step 7 missed. Insert the `public.users` row. |
| **Blank page** | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` missing — they bake into the build, so Redeploy is mandatory after adding them. |
| **API works, frontend can't reach it** | Check Vercel deployment is on `main` branch and build succeeded. |
| **PWA install button missing** | Visit via HTTPS (Vercel URL is fine). HTTP localhost won't show the prompt. |

---

## Custom domain (optional, ₹600/year for `.in`)

1. Buy domain (Namecheap / Cloudflare / GoDaddy)
2. Vercel → Project → Settings → **Domains** → Add
3. Update DNS records as Vercel instructs
4. HTTPS auto-provisioned within 30 seconds

---

## Cost summary at production

| Tier | Monthly |
|---|---|
| Vercel Free | ₹0 |
| Supabase Free (500 MB DB, 50k MAU) | ₹0 |
| Domain | ~₹85 |
| **Total** | **~₹85/mo** |

Upgrade to Pro tiers when you cross 10 schools or 500 MB DB.
