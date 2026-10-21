# Deploying EPRFlow to production (Vercel + Neon)

This guide takes a fresh checkout to a production deployment. Allow about an hour. You need accounts on **Vercel**, **Neon**, an **SMTP provider** (Resend, Amazon SES, Brevo, …) and, for AI document reading, **Anthropic**.

Nothing here uses Docker: the app runs as Vercel functions, data lives in Neon Postgres, files in Vercel Blob.

---

## 1. Database — Neon

1. Create a Neon project in a region close to your users (for India: **AWS ap-southeast-1 Singapore** or **ap-south-1 Mumbai** if available).
2. Keep the default `main` branch for production. Create a separate **`dev`** branch for local development and previews, so test data never touches production.
3. From **Connect**, copy two connection strings for the production branch:
   - **Pooled** (host contains `-pooler`) → `DATABASE_URL` (used by the app at runtime)
   - **Direct** (no `-pooler`) → `DIRECT_URL` (used only by migrations)

   Use `?sslmode=verify-full` on both.
4. Under **Settings → Storage**, set history retention (point-in-time restore) to at least 7 days.

## 2. File storage — Vercel Blob

1. In the Vercel project: **Storage → Create → Blob**, and connect it to the project. This adds `BLOB_READ_WRITE_TOKEN` to the project's environment variables.
2. Leave `STORAGE_DRIVER=blob`. Files are written with `access: "private"` and are only ever served through `/o/[org]/files/[id]` after a membership check; no public URL is handed out.

`STORAGE_DRIVER=database` (files stored in Postgres) also works for a small deployment, but keeps the database growing. Prefer Blob.

## 3. Create the Vercel project

1. **Add New → Project**, import the GitHub repository. The framework is detected as Next.js.
2. Build settings: leave the defaults. `package.json` has a `vercel-build` script — `prisma generate && prisma migrate deploy && next build` — so **every deploy applies pending migrations first**. A failed migration fails the deploy and the previous version keeps serving.
3. Add the environment variables below for **Production** (and, with `dev`-branch values, for **Preview**).

| Variable | Required | Value |
|---|---|---|
| `DATABASE_URL` | yes | Neon **pooled** connection string |
| `DIRECT_URL` | yes | Neon **direct** connection string |
| `AUTH_SECRET` | yes | `npx auth secret` (32+ characters). Different per environment. |
| `APP_URL` | yes | `https://your-domain.in` — used in emails and reminder links |
| `AUTH_URL` | yes | Same as `APP_URL` |
| `CRON_SECRET` | yes | `openssl rand -hex 32`. Vercel sends it to the cron route automatically. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | yes | From your SMTP provider. Without them invitations and reminders are not delivered. |
| `EMAIL_FROM` | yes | e.g. `EPRFlow <no-reply@your-domain.in>` — a sender your provider has verified (SPF/DKIM) |
| `BLOB_READ_WRITE_TOKEN` | yes | Added by the Blob integration |
| `STORAGE_DRIVER` | – | `blob` (default) |
| `ANTHROPIC_API_KEY` | for AI | From console.anthropic.com. Without it, uploads still work with manual entry. |
| `ANTHROPIC_MODEL` | – | Defaults to `claude-opus-5-5` |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | – | Only for "Continue with Google" (step 6) |

Never set `AI_PROVIDER` or `E2E_RATE_LIMIT_MULTIPLIER` in production — both are ignored there anyway, but they have no purpose outside tests.

4. Deploy. The first deploy creates all tables.

## 4. Reference data and the first admin

Run these once from your machine, with the **production** `DIRECT_URL` and `DATABASE_URL` in your shell (not in a committed file):

```bash
# Material categories, placeholder regulation rules and filing deadlines — no demo companies, no demo users.
npm run db:seed:reference
```

Do **not** run `npm run db:seed` against production: it creates demo companies and users with a published password.

Then sign up on the live site with the account that will administer EPRFlow, and grant it platform-admin rights:

```bash
node scripts/make-platform-admin.mjs you@your-domain.in
```

## 5. Verify the regulation rules — before customers rely on the numbers

Every seeded target, recycling share, recycled-content share, EC rate and filing date is a **placeholder** marked "VERIFY WITH LATEST CPCB NOTIFICATION", and the app shows a warning wherever one is used.

As a platform admin, open **/admin/rules**:

1. Check each value against the current CPCB notifications (PWM Rules and EPR Guidelines, E-Waste Rules 2022, Battery Waste Management Rules 2022).
2. Edit the value and add the source, e.g. the gazette or notification reference. Saving creates a new version; past calculations keep pointing at the old one.
3. Tick **Verified**.

Then open **/admin/recyclers**, check each recycler against the CPCB register, set its status and validity dates, and enter its annual capacity per category. The capacity check depends on these figures.

## 6. Optional: Google sign-in

In Google Cloud Console → APIs & Services → Credentials, create an OAuth client of type *Web application*:

- **Authorised JavaScript origin:** `https://your-domain.in`
- **Authorised redirect URI:** `https://your-domain.in/api/auth/callback/google`

Put the client ID and secret in `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`, then redeploy.

## 7. Domain, cron and email checks

1. **Domain:** add it in Vercel → Domains. HTTPS is automatic; the app sends HSTS, so only use a domain you will keep on HTTPS.
2. **Cron:** `vercel.json` schedules `/api/cron/compliance` daily at 01:30 UTC (07:00 IST). The job:
   - recalculates every organisation and refreshes alerts and the deadline calendar;
   - re-checks open certificates;
   - sends due email reminders.

   On the Hobby plan, cron runs once a day — this job needs no more than that. To test it:

   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain.in/api/cron/compliance
   ```

   It returns a JSON summary. Without the secret, it returns 401.
3. **Email:** invite a colleague from Settings → Members and confirm the email arrives (check spam; fix SPF/DKIM if needed).

## 8. Smoke test

With a fresh account on production:

1. Sign up and complete onboarding: company, GSTIN, brand.
2. Import the materials template from **Materials → Import**.
3. Open **Targets**. The placeholder warning disappears once all rules in force are verified.
4. Add a certificate with a PDF. Approve it as Admin and check that it counts on the dashboard.
5. Upload a certificate on **AI extraction**. It should be read within a minute (needs `ANTHROPIC_API_KEY`).
6. Download the annual return as Excel and PDF from **Reports**.

## 9. Operating it

- **Logs:** Vercel → Logs. Server errors show only a reference id to users (`ref 1a2b3c4d`); search the logs for that id.
- **Migrations:** create them locally against the `dev` branch with `npm run db:migrate`, then commit. They apply on the next deploy. Never run `migrate dev` against production.
- **Backups:** Neon's point-in-time restore. For a long-term copy, run `pg_dump "$DIRECT_URL"` on a schedule outside Vercel.
- **Secrets:** rotating `AUTH_SECRET` signs everyone out. Rotating `CRON_SECRET` needs a redeploy.
- **Limits:** documents are capped at 4 MB, because a Vercel function accepts at most 4.5 MB. Spreadsheets are capped at 5 MB and 5,000 rows. AI uploads are limited to 100 per organisation per hour.
- **Costs:** each AI extraction is one Claude API call; the token count is stored on the extraction for monitoring. Report downloads are rate-limited per user.

## 10. Security checklist

- [ ] `AUTH_SECRET`, `CRON_SECRET` are unique per environment and not in git
- [ ] Production and preview use different Neon branches
- [ ] `npm run db:seed` (demo data) has never been run on production — or the demo users have been deleted
- [ ] Platform admins are named people, granted with the script above
- [ ] SMTP sender domain has SPF and DKIM records
- [ ] Every rule in `/admin/rules` that is in force is verified with a source reference
- [ ] Recyclers in `/admin/recyclers` have status, validity and capacity filled in
