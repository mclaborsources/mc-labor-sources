# MC Labor Sources — Workforce Management Platform

Supabase-first workforce management: web and mobile talk directly to **Supabase** (Auth, Postgres with RLS, Storage). No Prisma. No NestJS API.

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Web Portal** | Next.js 15, Supabase JS, TanStack Query, Tailwind |
| **Database** | Supabase Postgres + SQL migrations + RLS |
| **Auth** | Supabase Auth |
| **Storage** | Supabase Storage |
| **Mobile** | Expo, Supabase JS |
| **Edge Functions** | `create-app-user`, `bulk-create-workers`, `send-transactional-email`, `send-test-email`, `send-push-notification` |

## Prerequisites

- Node.js 20+
- pnpm 9+
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- Supabase cloud project (client invites you)

## Setup

### 1. Install

```bash
cd mc-labor-sources
cp .env.example .env
pnpm install
```

Fill `.env` with values from **Supabase Dashboard → Settings → API**.

### 2. Link Supabase project

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

### 3. Apply schema + seed

```bash
supabase db push          # runs migrations in supabase/migrations/
# seed.sql runs via config if using db reset locally; for remote:
psql $DATABASE_URL -f supabase/seed.sql   # or Supabase SQL editor

pnpm setup:check
pnpm seed:auth            # creates demo Auth users + links profiles
```

In Supabase dashboard:
- **Auth → Email** → disable **Confirm email** (demo)
- **Storage** → create buckets: `documents`, `signatures`, `safety-bulletins`
- Deploy edge functions: `supabase functions deploy create-app-user bulk-create-workers send-transactional-email send-test-email send-push-notification`

### 4. Run web app

```bash
pnpm dev
```

Open http://localhost:3000

### 5. Mobile (optional)

```bash
cd apps/mobile
pnpm start
```

## Demo Logins

Password for all: **`Password123!`**

| Role | Email |
|------|-------|
| Super Admin | superadmin@mclabor.demo |
| Admin | admin@mclabor.demo |
| Customer | customer@mclabor.demo |
| Supervisor | supervisor@mclabor.demo |
| Worker | worker@mclabor.demo |

Supervisors can sign timesheets from the **web portal** (`/supervisor/timesheets`) or the **mobile app** (Timesheets tab after login).

## Milestones 1–4 — Feature summary

| Milestone | Delivered |
|-----------|-----------|
| **M1** | Admin CRUD, customer portal, auth, RLS, user provisioning |
| **M2** | Worker mobile (clock, assignments, job orders, timesheets), admin ops modules, in-app notifications |
| **M3** | Supervisor web/mobile signing, customer signed views, reports + CSV, supervisor management |
| **M4** | SMTP email delivery, Expo push notifications, admin notification settings, production deploy docs |

Full acceptance checklist: **[docs/M1-M4-ACCEPTANCE.md](docs/M1-M4-ACCEPTANCE.md)**

Production deployment: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**

Master-system data import: **[docs/DATA-IMPORT.md](docs/DATA-IMPORT.md)** · staging samples: **[docs/DATA-IMPORT-SAMPLES.md](docs/DATA-IMPORT-SAMPLES.md)**

Legacy M1–M3 checklist: **[docs/M1-M3-ACCEPTANCE.md](docs/M1-M3-ACCEPTANCE.md)**

Quick M3 reference:

| Feature | Location |
|---------|----------|
| Supervisor dashboard, job sites, attendance, timesheets + sign | Web `/supervisor/*` |
| Admin supervisor provisioning + site assignment | Web `/supervisors`, job site edit modal |
| Customer signed timesheet detail + signature image | Web `/customer/timesheets` |
| Hours / attendance reports + CSV export | Admin `/reports`; supervisor `/supervisor/reports`; CSV on attendance & timesheets |
| Mobile supervisor signing | Expo app — login as `supervisor@mclabor.demo` |
| Safety bulletins (all / site / specific workers) | Admin `/safety-bulletins` |

### Setup verification

```bash
pnpm setup:check    # validate .env
pnpm verify         # typecheck + build
pnpm smoke:rpc        # RPC health (requires seed:auth)
```

### Remote seed (no Docker)

If you use Supabase cloud without local Docker, apply incremental demo data after migrations:

```bash
# Supabase SQL Editor, or:
psql $DATABASE_URL -f supabase/seed-incremental.sql
```

### Manual test checklist

See **[docs/M1-M4-ACCEPTANCE.md](docs/M1-M4-ACCEPTANCE.md)** for the full acceptance checklist.

## Architecture

```
Web/Mobile → Supabase Auth (signInWithPassword)
Web/Mobile → Supabase Postgres (RLS enforces roles)
Admin creates users → Edge Function create-app-user (service role)
```

RLS helper functions: `is_admin()`, `get_my_role()`, `get_my_customer_id()`, etc.

## Project Structure

```
mc-labor-sources/
├── apps/
│   ├── admin-web/       # Next.js portal
│   └── mobile/          # Expo app
├── packages/shared/     # Enums, Zod schemas
├── supabase/
│   ├── migrations/      # SQL schema + RLS + RPC
│   ├── seed.sql         # Demo business data
│   └── functions/       # Edge functions
└── scripts/
    ├── check-supabase-env.mjs
    └── seed-auth-users.mjs
```

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start web portal |
| `pnpm build` | Production build |
| `pnpm setup:check` | Validate `.env` |
| `pnpm seed:auth` | Link demo users in Supabase Auth |
| `pnpm verify` | Typecheck + production build |
| `pnpm smoke:rpc` | Smoke-test admin/supervisor RPCs |
| `supabase db push` | Apply migrations to linked project |

## License

Proprietary — MC Labor Sources, Inc.
