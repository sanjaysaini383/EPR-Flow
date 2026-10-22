# EPRFlow

B2B SaaS for managing Extended Producer Responsibility (EPR) compliance in India under the Plastic Waste Management, E-Waste and Battery Waste Management Rules.

> **Regulatory values in seed data are placeholders.** Verify them against the latest CPCB notification before relying on any calculation.

**Status:** Phases 1–6 complete (foundation, data entry, targets, certificates & fraud checks, AI extraction, reports & reminders). See [docs/PHASE-0-PLAN.md](docs/PHASE-0-PLAN.md) for the full plan.

## Demo

- **Video:** [docs/eprflow-demo.mp4](docs/eprflow-demo.mp4) — a 2-minute captioned product pitch (problem, live features, roadmap).
- **Slides:** [docs/EPRFlow-Product-Overview.pptx](docs/EPRFlow-Product-Overview.pptx) — product overview deck (15 slides, with speaker notes).
- **Demo data:** `npm run db:seed` creates *Demo Consumer Goods* (4 users, 3 GSTINs, 3 brands, 3 plants, 18 months of material data, audit history, a pending invite) and *GreenPack Industries* (a second client for the consultant account).
- **Re-record the video:** start the app (`npm run build && npx next start`), then `node scripts/record-demo.mjs`. Loading pauses are logged to `demo/cuts.txt`; produce the final cut with `ffmpeg -i demo/eprflow-demo.webm -vf "$(cat demo/cuts.txt)" -r 25 -c:v libx264 -pix_fmt yuv420p docs/eprflow-demo.mp4`. Output goes to `demo/` (git-ignored).

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
| ops@eprflow.in | Platform admin (edits regulation rules at `/admin/rules`) |

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

### EPR targets & regulation rules

Obligations are computed by a pure engine ([src/lib/domain/obligations/calculate.ts](src/lib/domain/obligations/calculate.ts), unit-tested) from the organisation's material data, approved certificates and the `RegulationRule` table:

- **Base** = average of the previous two FYs placed on market (pre-consumer excluded) — the method and look-back come from the rule's `parameters`.
- **Target** = base × EPR %; **minimum recycling** = target × recycling %; end-of-life certificates count only toward the rest.
- **EC risk** = remaining obligation × the category's EC rate; **recycled content** = this FY's quantity × the mandated %.

No regulatory number is hard-coded. Rules are versioned: a platform admin's edit creates a new version, and obligation snapshots store the rule ids they used. **Seeded values are placeholders** (`isVerified = false`, "VERIFY WITH LATEST CPCB NOTIFICATION") and every screen that uses them shows a warning until an admin verifies them.

Alerts ("You are 40% behind on Cat II target with 3 months left") are rebuilt after each dashboard view and daily by Vercel Cron (`/api/cron/compliance`, protected by `CRON_SECRET` — set it in Vercel's env vars).

### Certificates & fraud checks

Certificates move through **Draft → Awaiting approval → Approved / Rejected**; only Admins approve, and only approved certificates count towards targets. Every save, submit and approval runs the checks in [src/lib/domain/fraud/checks.ts](src/lib/domain/fraud/checks.ts) (pure, unit-tested):

| Check | Severity |
|---|---|
| Same number already claimed by another organisation on EPRFlow (never says which) | High |
| Identical file (SHA-256) already attached elsewhere | High |
| Recycler suspended, or registration expired before the issue date | High |
| Recycler's certificates for the category/FY, across all buyers, exceed its registered capacity | High |
| Recycler unverified / not registered for the category | Medium |
| Issue date in the future or outside the FY, before the recycler's registration, transfer before issue | Medium |
| Price per kg more than 50% from the platform median (≥ 5 samples) | Low |

Approval is blocked while a **high** flag is open; flags can be dismissed with a note (kept in the audit log), and resolve themselves when the condition goes away. Cross-tenant checks read only aggregates. The daily cron re-checks open certificates.

**Files** (certificate PDFs, invoices) are checked by their bytes, not their name (PDF/PNG/JPEG/WebP, 4 MB — Vercel's request limit is 4.5 MB), fingerprinted, and stored privately: Vercel Blob with `access: "private"` in production, Postgres (`STORAGE_DRIVER=database`) locally. They are streamed only to members of the owning organisation via `/o/[org]/files/[id]`.

The **recycler directory** shows verification, capacity use across EPRFlow, ratings and your price history; teams can add private (unverified) recyclers, and platform admins verify recyclers and set capacity at `/admin/recyclers`.

### AI extraction

`/o/[org]/extractions`: upload an EPR certificate or an invoice; the AI reads it after the upload responds (`after()`), and the reviewer checks every value next to the document. Low-confidence fields and the model's warnings are listed; nothing is saved until the reviewer approves — certificates become drafts (then the normal approval and fraud checks), invoice lines become material entries (source "AI").

- Providers: **Google Gemini** (`GEMINI_API_KEY`, free tier, model `GEMINI_MODEL`, default `gemini-2.5-flash`) or **Anthropic Claude** (`ANTHROPIC_API_KEY`, model `ANTHROPIC_MODEL`, default `claude-opus-5-5`, with server-side refusal fallback). Claude is used when both keys are set; `AI_PROVIDER=gemini|claude` forces one. Both get the same prompt and JSON schema, and every reply is validated with Zod; token usage is stored per document.
- Gemini's free tier has daily request limits, and Google may use free-tier content to improve its products — use a paid key for confidential customer documents in production.
- Without any key the upload still works and the values are entered by hand.
- `AI_PROVIDER=fake` (development only) returns fixed sample data; the e2e tests use it.
- Uploads are rate-limited (100 per organisation per hour) because each one is a paid API call.

### Reports

`/o/[org]/reports` builds files from live data — nothing is stored, so a report always reflects the current numbers:

| Report | Formats | Contents |
|---|---|---|
| CPCB annual return | XLSX, PDF | Entity details, state-wise quantities introduced, obligation and fulfilment, certificates used, recycled content — laid out like the CPCB EPR portal return |
| Obligation summary | PDF, XLSX | Score, target, fulfilment, remaining and EC exposure by category |
| Material register | XLSX, CSV | Every entry for the FY with brand, plant, GSTIN and source |
| Certificate register | XLSX, CSV | Every certificate; cost columns only for roles that can see costs |
| Audit log export | CSV, XLSX | From the audit log page, with its filters (record type, person, date range) |

Builders are pure functions ([src/lib/domain/reports/build.ts](src/lib/domain/reports/build.ts)) feeding three renderers in [src/lib/reports/](src/lib/reports/) (ExcelJS, pdf-lib, formula-safe CSV). Each download is recorded in report history and the audit log with a SHA-256 fingerprint, and is rate-limited per user.

### Compliance calendar & reminders

- **Statutory deadlines** (annual return, EPR fulfilment) are generated per waste stream from versioned `FILING_DEADLINE` rules — e.g. `{"deadlines":[{"key":"annual-return","title":"Annual return","month":6,"day":30,"yearOffset":1}]}` = "30 June after the FY ends". Seeded dates are placeholders like every other rule. Editing the rule moves open deadlines and their reminders.
- **Internal deadlines** can be added, edited, completed and deleted by Admins, Compliance Managers and Consultants.
- **Email reminders** go to every Admin and Compliance Manager on the chosen days (default 30, 7 and 1 days before) at 6 AM IST, sent by the same daily cron. Each reminder is claimed before sending, so overlapping runs never double-send; reminders for completed deadlines or former members are cancelled. **Set the SMTP variables in production** — without `SMTP_HOST`, reminders are logged and marked "not delivered".
- **WhatsApp:** every deadline has a share button with ready-to-send text (`wa.me` link); automatic WhatsApp sending is a later integration.
- Deadlines due within 7 days or overdue raise alerts and appear on the dashboard.

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
| Password reset | One-time link valid 1 hour, token stored hashed, same response for unknown emails, rate-limited; a reset signs the account out of every other session |

## Deploying (Vercel + Neon)

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for the full guide: Neon branches, Vercel Blob, environment variables, migrations on deploy, reference-data seed (`npm run db:seed:reference` — never the demo seed in production), creating the first platform admin (`node scripts/make-platform-admin.mjs <email>`), verifying regulation rules, cron, Google sign-in and a security checklist.

## Consultant view and pricing

- `/consultant` lists every company a user belongs to — status, remaining obligation, EC risk, alerts, approvals waiting and the next deadline — worst first. It is linked from the organisation switcher for users in more than one company.
- `/pricing` and the landing page show the Starter / Growth / Enterprise plans from [src/lib/pricing.ts](src/lib/pricing.ts). Prices are indicative and limits are informational; billing is not connected.
