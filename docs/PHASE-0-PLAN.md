# EPRFlow — Phase 0 Plan

Status: **proposal, awaiting sign-off**. The Prisma schema draft is in [`prisma/schema.prisma`](../prisma/schema.prisma).

## 1. Stack decisions

| Concern | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 (App Router) + TypeScript strict | Server Components by default; Server Actions for mutations |
| UI | Tailwind CSS v4 + shadcn/ui, Recharts for charts | lucide-react icons |
| DB | PostgreSQL 17 + Prisma 7 | `prisma.config.ts`, generated client in `src/generated/prisma` |
| Auth | Auth.js v5: Credentials (argon2 hash) + Google | JWT session strategy (required for Credentials); org membership resolved per request |
| Validation | Zod v4 | Shared schemas in `src/lib/validation` used by forms and server |
| Files | `StorageAdapter` interface → `LocalFsStorage` (dev) / `S3Storage` (MinIO/S3) | Selected by `STORAGE_DRIVER` env |
| AI | `@anthropic-ai/sdk`, model from `ANTHROPIC_MODEL` | Structured output validated with Zod before it is stored |
| Jobs | pg-boss (Postgres-backed queue + cron) | No Redis needed; one `worker` process in Docker Compose |
| Email | Nodemailer (SMTP); Mailpit in Docker for dev | WhatsApp: generate ready-to-send text + `wa.me` link (no API integration yet) |
| Excel/CSV | ExcelJS (read + write), papaparse for CSV | |
| PDF | `@react-pdf/renderer` for reports | |
| Tests | Vitest (domain logic), Playwright (key flows) | |
| Package manager | npm | |

I picked **pg-boss over BullMQ** because it removes the need for Redis while giving us retries, cron and a persistent queue. This can be swapped later.

## 2. Folder structure

```
eprflow/
├─ docker-compose.yml          # postgres, mailpit, minio, app, worker
├─ Dockerfile
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed.ts                  # categories, placeholder rules, demo company
├─ prisma.config.ts
├─ e2e/                        # Playwright specs
├─ docs/
└─ src/
   ├─ app/
   │  ├─ (marketing)/          # landing, pricing (Phase 7)
   │  ├─ (auth)/               # login, signup, forgot/reset, invite accept
   │  ├─ onboarding/           # org creation wizard
   │  ├─ o/[orgSlug]/          # tenant app — layout with sidebar, resolves membership
   │  │  ├─ dashboard/
   │  │  ├─ materials/  (new, import, [id])
   │  │  ├─ brands/  plants/  gst/
   │  │  ├─ targets/           # obligation calculator + progress
   │  │  ├─ certificates/ (new, [id])
   │  │  ├─ recyclers/ ([id])
   │  │  ├─ extractions/ ([id] = review screen)
   │  │  ├─ reports/  calendar/  alerts/  audit-log/
   │  │  └─ settings/ (organization, members, budgets, billing)
   │  ├─ consultant/           # multi-client overview (Phase 7)
   │  ├─ admin/                # platform admin: regulation rules, recycler verification
   │  └─ api/
   │     ├─ auth/[...nextauth]/
   │     ├─ files/[id]/        # authorised file download (tenant-checked)
   │     └─ exports/[type]/    # streamed Excel/PDF downloads
   ├─ components/
   │  ├─ ui/                   # shadcn primitives
   │  └─ app/                  # sidebar, data-table, page-header, charts…
   ├─ features/                # per-feature server actions, queries, form components
   │  ├─ materials/ certificates/ recyclers/ targets/ …
   │  │   ├─ actions.ts        # 'use server' — Zod-parse → authorise → tenantDb → audit
   │  │   ├─ queries.ts
   │  │   └─ components/
   ├─ lib/
   │  ├─ domain/               # PURE business logic, no Prisma/Next imports, unit-tested
   │  │  ├─ financial-year.ts
   │  │  ├─ units.ts
   │  │  ├─ gstin.ts
   │  │  ├─ rules/resolve.ts   # pick applicable rule by date/category/version
   │  │  ├─ obligations/calculate.ts
   │  │  ├─ obligations/environmental-compensation.ts
   │  │  ├─ fraud/checks.ts
   │  │  ├─ alerts/progress-alerts.ts
   │  │  └─ __tests__/
   │  ├─ db/
   │  │  ├─ client.ts          # base Prisma client (only imported by tenant.ts & admin code)
   │  │  └─ tenant.ts          # getTenantDb(orgId) — Prisma extension enforcing org scope
   │  ├─ auth/                 # Auth.js config, requireUser(), requireOrgRole()
   │  ├─ storage/              # StorageAdapter + local/S3 drivers
   │  ├─ ai/                   # Claude client + extraction prompts/schemas
   │  ├─ jobs/                 # pg-boss setup + job handlers
   │  ├─ email/
   │  ├─ audit.ts
   │  └─ validation/           # shared Zod schemas
   ├─ generated/prisma/        # (gitignored)
   └─ worker.ts                # job worker entrypoint
```

## 3. Data model summary

The full schema is in `prisma/schema.prisma`. Key design points:

- **Tenancy:** `Organization` ← `Membership(role)` → `User`. A consultant is a user with `CONSULTANT` memberships in several orgs. `User.isPlatformAdmin` is reserved for us (rules, recycler verification).
- **Organization structure:** `Brand`, `Plant`, `GstRegistration` (Plant optionally linked to a GSTIN; state derived from the GSTIN).
- **Categories are a table, not an enum:** `MaterialCategory(code, stream)` covers Plastic Cat I–IV now and e-waste/battery categories through seed rows, without migrations.
- **`MaterialEntry`:** one row per month × category × entity type × state (+ optional brand/plant/GSTIN). It records its source (manual / import / AI) for traceability.
- **`RegulationRule`:** global and versioned, with `effectiveFrom/To`, `version`, `isVerified`, `sourceReference` and `parameters` JSON (e.g. base-year lookback). Seeds ship with `isVerified=false` and the note **"VERIFY WITH LATEST CPCB NOTIFICATION"**, and the UI shows a warning banner while any rule in use is unverified.
- **`ObligationSnapshot`:** persisted calculator output, including the `ruleIds` used, so past reports stay reproducible after rules change.
- **`Recycler`:** platform-wide (`organizationId = null`, curated) plus org-private entries. Each has `RecyclerCapacity` per category and FY, and `RecyclerRating`. Pricing history is derived from certificates.
- **`Certificate`:** has a `certificateNumberNormalized` field (unique within an org, indexed globally for cross-tenant duplicate checks), an approval workflow (`DRAFT → PENDING_APPROVAL → APPROVED/REJECTED`), and `CertificateFlag` rows from the fraud checks.
- **`StoredFile`:** stores a `sha256` hash, which lets us detect an identical certificate PDF uploaded twice.
- **`Extraction`:** keeps Claude's raw output, the human-reviewed values, per-field confidence and token usage. On approval it creates `MaterialEntry` or `Certificate` rows that link back to it.
- **Supporting models:** `Deadline` + `Reminder`, `Alert` (deduplicated by `dedupeKey`), `Budget`, `Report`, and an append-only `AuditLog`.
- **Units:** kg as `Decimal(18,3)` and INR as `Decimal(14,2)`. The FY is stored as `"2025-26"`, and states as 2-letter codes.

## 4. Tenant isolation strategy

1. `src/lib/db/tenant.ts` exports `getTenantDb(orgId)`, a Prisma client extension that:
   - injects `organizationId` into the `where` of every find/update/delete/count/aggregate on tenant models;
   - injects it into the `data` of every create/upsert;
   - throws on models that are not on its allow-list.
2. Every server action and route handler starts with `const { org, role } = await requireOrgRole(orgSlug, [...roles])`, then uses only `getTenantDb(org.id)`.
3. An ESLint `no-restricted-imports` rule blocks importing `lib/db/client` outside `lib/db`, `lib/auth`, admin code and seed.
4. A Vitest suite checks that the extension scopes each tenant model, and a Playwright test confirms that user A gets a 404 on org B's URLs and file IDs.
5. Optional hardening later: Postgres row-level security (RLS) as defence in depth.

Global reference reads (categories, rules, platform recyclers) go through explicit read-only helpers.

## 5. Calculator approach (Phase 3)

The core is a pure function:

`calculateObligations({ entries, rules, certificates, fy }) → ObligationLine[]`

- **Base quantity:** derived from `parameters.baseYearsLookback` and the method stored on the rule, for example the average of the previous N FYs or the current FY quantity. The method is configured in the rule, not the code.
- **Targets:** each line multiplies the base quantity by the target % for every applicable rule type (recycling, EoL, reuse, recycled content, collection).
- **Fulfilled:** the sum of APPROVED certificates for that FY, category and type.
- **Shortfall and EC:** `shortfall = max(0, target − fulfilled)` and `EC = shortfall × EC_RATE`.
- **Output:** includes the rule IDs used. Alerts compare % fulfilled with % of the FY elapsed.

## 6. Fraud checks (Phase 4)

Each check is a pure function in `lib/domain/fraud/checks.ts` that takes a certificate plus context and returns flags:

| Check | Severity |
|---|---|
| Duplicate number within the org (blocked by the unique constraint, but also checked so the user sees a friendly message) | HIGH |
| Duplicate number in another org (anonymised: "already claimed elsewhere on EPRFlow") | HIGH |
| Duplicate file (same sha256) | HIGH |
| Recycler unverified or suspended, or registration expired at the issue date | MEDIUM/HIGH |
| Recycler not registered for the category | MEDIUM |
| Recycler's FY total issued (across all tenants) exceeds `RecyclerCapacity` | HIGH |
| Suspicious date: in the future, outside the FY, before the recycler's registration, or a transfer date before the issue date | MEDIUM |
| Price per kg more than X% from the median (threshold configurable) | LOW |

## 7. Pages and routes

| Route | Purpose | Phase |
|---|---|---|
| `/` , `/pricing` | Landing + Starter/Growth/Enterprise | 7 |
| `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/invite/[token]` | Auth | 1 |
| `/onboarding` | Wizard: company → entity types & streams → GSTINs/plants → brands → invite team | 1 |
| `/o` | Org picker (redirects to last active org) | 1 |
| `/o/[org]/dashboard` | Score, category progress, spend vs budget, alerts, upcoming deadlines | 1 (shell) → 3 |
| `/o/[org]/materials` (+ `/new`, `/import`, `/[id]`) | Placed-on-market data, CSV/Excel import with error rows | 2 |
| `/o/[org]/brands`, `/plants`, `/gst` | Org structure | 2 |
| `/o/[org]/targets` | Obligation per FY/category/state, shortfall & EC risk | 3 |
| `/o/[org]/certificates` (+ `/new`, `/[id]`) | Certificates, approval, flags | 4 |
| `/o/[org]/recyclers` (+ `/[id]`) | Directory, capacity, ratings, price history | 4 |
| `/o/[org]/extractions` (+ `/[id]`) | AI upload queue + side-by-side review | 5 |
| `/o/[org]/reports` | CPCB-format Excel/PDF exports | 6 |
| `/o/[org]/calendar` | Deadlines + reminders | 6 |
| `/o/[org]/alerts` | Alert inbox | 3 |
| `/o/[org]/audit-log` | Filterable audit trail | 6 |
| `/o/[org]/settings/*` | Organization, members & roles, budgets, billing | 1 / 3 / 7 |
| `/consultant` | All client orgs at a glance | 7 |
| `/admin/rules`, `/admin/recyclers` | Platform admin: edit rules, verify recyclers | 3 / 4 |
| `/api/auth/[...nextauth]`, `/api/files/[id]`, `/api/exports/[type]` | Route handlers | 1 / 4 / 6 |

## 8. Role matrix

| Action | Admin | Compliance Mgr | Consultant | Viewer |
|---|---|---|---|---|
| View everything in org | ✓ | ✓ | ✓ | ✓ |
| Enter/import material data, upload docs | ✓ | ✓ | ✓ | – |
| Create certificates (draft / submit) | ✓ | ✓ | ✓ | – |
| **Approve** certificate purchases | ✓ | – | – | – |
| Budgets, cost visibility | ✓ | ✓ (view) | ✓ (view) | – |
| Members, roles, billing, org settings | ✓ | – | – | – |
| Dismiss fraud flags | ✓ | ✓ (with note) | ✓ (with note) | – |
