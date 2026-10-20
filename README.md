# EPRFlow

B2B SaaS for managing Extended Producer Responsibility (EPR) compliance in India under the Plastic Waste Management, E-Waste and Battery Waste Management Rules.

> **Regulatory values in seed data are placeholders.** Verify them against the latest CPCB notification before relying on any calculation.

**Status:** Phase 2 (data entry) complete. See [docs/PHASE-0-PLAN.md](docs/PHASE-0-PLAN.md) for the full plan.

## Demo

- **Video:** [docs/eprflow-demo.mp4](docs/eprflow-demo.mp4) — a 4-minute captioned walkthrough of everything live today.
- **Slides:** [docs/EPRFlow-Product-Overview.pptx](docs/EPRFlow-Product-Overview.pptx) — product overview deck (15 slides, with speaker notes).
- **Demo data:** `npm run db:seed` creates *Demo Consumer Goods* (4 users, 3 GSTINs, 3 brands, 3 plants, 18 months of material data, audit history, a pending invite) and *GreenPack Industries* (a second client for the consultant account).
- **Re-record the video:** start the app (`npm run build && npx next start`), then `node scripts/record-demo.mjs`. Output goes to `demo/` (git-ignored).

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 + shadcn/ui · PostgreSQL + Prisma 7 · Auth.js v5 · Zod · Vitest · Playwright.
Hosting: **Vercel + Neon Postgres** — no Docker; local development also runs against Neon.

## Local setup

Requirements: Node 20+ (24 recommended) and a free [Neon](https://neon.tech) project.

1. In Neon, create a branch named `dev` (keep `main` for production).
2. Copy `.env.example` to `.env` and paste the `dev` branch's **pooled** URL into `DATABASE_URL` and its **direct** URL into `DIRECT_URL` (Neon → Connect → toggle "Connection pooling").
3. Set `AUTH_SECRET` (`npx auth secret`).

```bash
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

With `SMTP_HOST` empty, emails (e.g. invitations) are printed to the dev server console, and the invite link is also shown in the UI.

### Google login (optional)

Create an OAuth client in Google Cloud Console with redirect URI `http://localhost:3000/api/auth/callback/google`, then set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`. The Google button only appears when both are set.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm test` | Unit tests (Vitest) — domain logic and tenant scoping |
| `npm run test:e2e` | End-to-end tests (Playwright; needs the seeded Neon `dev` branch, `npx playwright install chromium` once) |
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

### Material data import

Upload CSV or Excel (`.xlsx`, up to 5 MB / 5,000 rows) from **Materials → Import**. Files are parsed and validated server-side and nothing is saved until you review the result: every problem is listed with its spreadsheet row, column and value, and the failing rows can be downloaded with an `errors` column to fix and re-upload. Rows that duplicate data already in EPRFlow are rejected so quantities are never double-counted. Validation rules live in [src/lib/domain/materials/import.ts](src/lib/domain/materials/import.ts) and are unit-tested.

### Security measures

| Area | What's in place |
|---|---|
| Tenant isolation | Tenant-scoped Prisma client + membership check on every page/action; non-members get 404 |
| Authorization | Single role/permission table ([permissions.ts](src/lib/domain/permissions.ts)), re-checked inside every server action |
| Authentication | Argon2 password hashing, constant-time login (no email enumeration by timing), 7-day sessions, proxy redirects signed-out users |
| Brute force | Postgres-backed rate limits on login (per IP + per email), signup, invites and invite acceptance |
| Input validation | Zod on every input; text is Unicode-normalised and stripped of control / zero-width / bidi-override characters; strict PAN, CIN, GSTIN (checksum) formats |
| Browser protections | Per-request CSP nonce, `frame-ancestors 'none'`, HSTS, nosniff, strict referrer policy, Permissions-Policy, no `x-powered-by` |
| Redirects | Only same-site relative `callbackUrl`s are honoured (blocks open redirects) |
| Errors | Users see clear messages; unexpected errors show only a reference id — stack traces and SQL never reach the browser |
| Audit trail | Every change logged with actor, IP and user agent; secrets are stripped from logged values |
| Secrets | Invite tokens stored as SHA-256 hashes; env vars validated at startup ([env.ts](src/lib/env.ts)) |

## Deploying (Vercel + Neon)

1. Create a Neon project. Copy the **pooled** connection string (host contains `-pooler`) into `DATABASE_URL` and the **direct** one into `DIRECT_URL`.
2. Import the repo in Vercel and set the env vars from `.env.example` (`AUTH_SECRET`, `APP_URL`, SMTP settings, optional Google keys).
3. The `vercel-build` script runs `prisma migrate deploy` before `next build`, so migrations apply on each deploy.
4. Seed reference data once: `DATABASE_URL=… DIRECT_URL=… npm run db:seed`. **Note:** the seed also creates the demo accounts with a public password — delete them (or use a separate staging database) before real customers sign up.

Background jobs (reminders, alert recalculation) will run as Vercel Cron → `/api/cron/*` route handlers from phase 3 onwards.
