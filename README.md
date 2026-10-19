# EPRFlow

B2B SaaS for managing Extended Producer Responsibility (EPR) compliance in India under the Plastic Waste Management, E-Waste and Battery Waste Management Rules.

> **Regulatory values in seed data are placeholders.** Verify them against the latest CPCB notification before relying on any calculation.

**Status:** Phase 1 (foundation) complete. See [docs/PHASE-0-PLAN.md](docs/PHASE-0-PLAN.md) for the full plan.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 + shadcn/ui · PostgreSQL + Prisma 7 · Auth.js v5 · Zod · Vitest · Playwright.
Production: **Vercel + Neon Postgres**. Docker Compose is only used for local Postgres and Mailpit.

## Local setup

Requirements: Node 20+ (24 recommended), Docker Desktop.

```bash
cp .env.example .env            # then set AUTH_SECRET:  npx auth secret
docker compose up -d            # Postgres on :5433, Mailpit on :8025
npm install                     # also runs `prisma generate`
npm run db:migrate              # apply migrations
npm run db:seed                 # categories + demo company
npm run dev                     # http://localhost:3000
```

### Demo accounts (password `Demo@12345`)

| Email | Role |
|---|---|
| admin@demo.eprflow.in | Admin |
| compliance@demo.eprflow.in | Compliance Manager |
| consultant@demo.eprflow.in | Consultant |
| viewer@demo.eprflow.in | Viewer |

Emails sent in development (invitations) are visible in Mailpit at http://localhost:8025.

### Google login (optional)

Create an OAuth client in Google Cloud Console with redirect URI `http://localhost:3000/api/auth/callback/google`, then set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`. The Google button only appears when both are set.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm test` | Unit tests (Vitest) — domain logic and tenant scoping |
| `npm run test:e2e` | End-to-end tests (Playwright; needs DB running + seeded, `npx playwright install chromium` once) |
| `npm run typecheck` / `npm run lint` | Static checks |
| `npm run db:migrate` | Create/apply migrations in dev |
| `npm run db:seed` | Seed reference data and the demo company |
| `npm run db:studio` | Browse the database |

## Project layout

```
prisma/              schema, migrations, seed
src/app/             routes: (auth), onboarding, o/[orgSlug]/…  (tenant app)
src/features/        server actions per feature (Zod-validated, permission-checked, audited)
src/lib/domain/      pure business logic + unit tests (no Prisma / Next imports)
src/lib/db/          base Prisma client + tenant-scoped client
src/lib/auth/        session + org context (data access layer)
src/components/      ui/ (shadcn) and app/ (shared app components)
e2e/                 Playwright specs
```

### Tenant isolation

Feature code never touches the raw Prisma client. `getOrgContext(orgSlug)` checks membership (non-members get a 404) and returns `db`, a client that injects `organizationId` into every query and rejects writes to other tenants — see [src/lib/db/tenant-scope.ts](src/lib/db/tenant-scope.ts) and its tests. An ESLint rule blocks importing `@/lib/db/client` outside auth/onboarding code.

## Deploying (Vercel + Neon)

1. Create a Neon project. Copy the **pooled** connection string (host contains `-pooler`) into `DATABASE_URL` and the **direct** one into `DIRECT_URL`.
2. Import the repo in Vercel and set the env vars from `.env.example` (`AUTH_SECRET`, `APP_URL`, SMTP settings, optional Google keys).
3. The `vercel-build` script runs `prisma migrate deploy` before `next build`, so migrations apply on each deploy.
4. Seed reference data once: `DATABASE_URL=… DIRECT_URL=… npm run db:seed`. **Note:** the seed also creates the demo accounts with a public password — delete them (or use a separate staging database) before real customers sign up.

Background jobs (reminders, alert recalculation) will run as Vercel Cron → `/api/cron/*` route handlers from phase 3 onwards.
