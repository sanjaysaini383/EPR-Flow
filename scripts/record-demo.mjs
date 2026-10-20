/**
 * Records a narrated walkthrough of EPRFlow with Playwright.
 *
 *   1. npm run dev            (in another terminal; database seeded with `npm run db:seed`)
 *   2. node scripts/record-demo.mjs
 *
 * Output: demo/eprflow-demo.webm (+ screenshots in demo/screens/ used by the slide deck).
 * The run creates one throw-away signup ("Priya Sharma") and removes it at the end.
 */
import "dotenv/config";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { chromium } from "playwright";

const BASE = process.env.DEMO_URL ?? "http://localhost:3000";
const OUT = path.resolve("demo");
const SCREENS = path.join(OUT, "screens");
const SIZE = { width: 1440, height: 900 };
const PASSWORD = "Demo@12345";
const STAMP = Date.now();
const NEW_USER = { name: "Priya Sharma", email: `priya.sharma.${STAMP}@example.com`, password: "Sunrise2026Pack" };

// ── Overlay: caption bar + visible cursor, injected on every page load ──────────────
// Runs through the DevTools protocol, so the app's CSP does not apply to it.
const OVERLAY = () => {
  const install = () => {
    if (document.getElementById("__demo_caption")) return;
    const style = document.createElement("style");
    style.textContent = `
      #__demo_caption{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483647;
        max-width:880px;padding:14px 22px;border-radius:14px;background:rgba(10,30,18,.88);color:#fff;
        font:500 17px/1.45 system-ui,Segoe UI,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.25);
        backdrop-filter:blur(6px);transition:opacity .25s;pointer-events:none}
      #__demo_caption b{display:block;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#7ee2a0;margin-bottom:2px}
      #__demo_caption:empty{opacity:0}
      #__demo_cursor{position:fixed;z-index:2147483647;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;
        background:rgba(34,197,94,.35);border:2px solid #16a34a;pointer-events:none;transition:transform .12s, left .05s, top .05s}
      #__demo_cursor.down{transform:scale(.7);background:rgba(34,197,94,.7)}
      #__demo_card{position:fixed;inset:0;z-index:2147483646;display:flex;flex-direction:column;align-items:center;
        justify-content:center;gap:14px;background:radial-gradient(circle at 30% 20%,#1f6f43,#0b2416 70%);color:#fff;
        font-family:system-ui,Segoe UI,sans-serif;text-align:center;transition:opacity .4s}
      #__demo_card h1{font-size:54px;margin:0;font-weight:700;letter-spacing:-.02em}
      #__demo_card p{font-size:22px;margin:0;opacity:.85;max-width:820px}
      #__demo_card small{font-size:14px;opacity:.6;letter-spacing:.12em;text-transform:uppercase}`;
    document.head.appendChild(style);
    const cap = document.createElement("div");
    cap.id = "__demo_caption";
    const saved = sessionStorage.getItem("__demo_caption");
    if (saved) cap.innerHTML = saved;
    document.body.appendChild(cap);
    const cur = document.createElement("div");
    cur.id = "__demo_cursor";
    const pos = sessionStorage.getItem("__demo_cursor")?.split(",");
    if (pos) Object.assign(cur.style, { left: pos[0] + "px", top: pos[1] + "px" });
    document.body.appendChild(cur);
    addEventListener("mousemove", (e) => {
      cur.style.left = e.clientX + "px";
      cur.style.top = e.clientY + "px";
      sessionStorage.setItem("__demo_cursor", `${e.clientX},${e.clientY}`);
    });
    addEventListener("mousedown", () => cur.classList.add("down"));
    addEventListener("mouseup", () => cur.classList.remove("down"));
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", install);
  else install();
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function caption(page, title, text, holdMs = 2600) {
  const html = title ? `<b>${title}</b>${text}` : "";
  await page.evaluate((h) => {
    sessionStorage.setItem("__demo_caption", h);
    const el = document.getElementById("__demo_caption");
    if (el) el.innerHTML = h;
  }, html);
  await wait(holdMs);
}

async function titleCard(page, kicker, heading, sub, holdMs = 3200) {
  await page.evaluate(
    ([k, h, s]) => {
      const card = document.createElement("div");
      card.id = "__demo_card";
      card.innerHTML = `<small>${k}</small><h1>${h}</h1><p>${s}</p>`;
      document.body.appendChild(card);
    },
    [kicker, heading, sub],
  );
  await wait(holdMs);
  await page.evaluate(() => {
    const c = document.getElementById("__demo_card");
    if (c) c.style.opacity = "0";
  });
  await wait(450);
  await page.evaluate(() => document.getElementById("__demo_card")?.remove());
}

/** Moves the visible cursor to an element, then clicks it. */
async function click(page, locator, pause = 500) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
  await wait(250);
  await locator.click();
  await settle(page);
  await wait(pause);
}

/** Waits until the page has finished loading data (no loading skeleton on screen). */
async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.locator('[aria-label="Loading"]').waitFor({ state: "detached", timeout: 20_000 }).catch(() => {});
}

async function type(page, locator, text, delay = 55) {
  await click(page, locator, 150);
  await locator.pressSequentially(text, { delay });
  await wait(250);
}

async function shot(page, name) {
  await page.evaluate(() => {
    for (const id of ["__demo_caption", "__demo_cursor"]) {
      const el = document.getElementById(id);
      if (el) el.style.visibility = "hidden";
    }
  });
  await page.screenshot({ path: path.join(SCREENS, `${name}.png`) });
  await page.evaluate(() => {
    for (const id of ["__demo_caption", "__demo_cursor"]) {
      const el = document.getElementById(id);
      if (el) el.style.visibility = "";
    }
  });
}

async function login(page, email) {
  await page.goto(`${BASE}/login`);
  await type(page, page.getByLabel("Work email"), email, 35);
  await type(page, page.getByLabel("Password", { exact: true }), PASSWORD, 35);
  await click(page, page.getByRole("button", { name: "Log in" }));
  await page.waitForURL(/\/dashboard/, { timeout: 90_000 });
  await page.getByText("Compliance score").first().waitFor({ timeout: 90_000 });
}

async function logout(page) {
  await caption(page, "", "", 0);
  await click(page, page.locator("[data-sidebar=footer] button").first(), 400);
  await click(page, page.getByRole("menuitem", { name: "Log out" }));
  await page.waitForURL(/\/login/);
}

async function setTheme(page, name) {
  await click(page, page.getByRole("button", { name: "Change theme" }).first(), 300);
  await click(page, page.getByRole("menuitem", { name }), 700);
}

async function warmUp() {
  // Compile every route once so the recording has no dev-server pauses.
  const routes = ["/", "/login", "/signup", "/onboarding", "/o", "/o/demo-consumer-goods/dashboard",
    "/o/demo-consumer-goods/settings", "/o/demo-consumer-goods/settings/members", "/o/demo-consumer-goods/audit-log",
    "/o/demo-consumer-goods/certificates", "/missing-page"];
  for (const r of routes) await fetch(BASE + r, { redirect: "manual" }).catch(() => {});
}

async function cleanup() {
  const client = new pg.Client({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL });
  await client.connect();
  await client.query(
    `DELETE FROM "Organization" WHERE id IN (SELECT m."organizationId" FROM "Membership" m JOIN "User" u ON u.id = m."userId" WHERE u.email = $1)`,
    [NEW_USER.email],
  );
  await client.query(`DELETE FROM "User" WHERE email = $1`, [NEW_USER.email]);
  await client.query(`DELETE FROM "Invitation" WHERE email LIKE 'procurement.%@demo.eprflow.in'`);
  await client.query(`DELETE FROM "AuditLog" WHERE "after"->>'email' LIKE 'procurement.%@demo.eprflow.in'`);
  await client.query(`DELETE FROM "RateLimit" WHERE key LIKE 'login:%' OR key LIKE 'signup:%' OR key LIKE 'invite%'`);
  await client.end();
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(SCREENS, { recursive: true });
  await cleanup();
  console.log("Warming up routes…");
  await warmUp();

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: SIZE,
    colorScheme: "light",
    recordVideo: { dir: OUT, size: SIZE },
  });
  await context.addInitScript(OVERLAY);
  const page = await context.newPage();

  try {
    // ── 1. Intro & landing ────────────────────────────────────────────────
    await page.goto(BASE);
    await titleCard(page, "Product demo", "EPRFlow", "EPR compliance for Indian producers, importers and brand owners", 3600);
    await caption(page, "The problem", "Plastic, E-Waste and Battery EPR rules are managed in Excel and email — wrong maths, missed deadlines, fake certificates.", 4200);
    await shot(page, "01-landing");
    await page.mouse.wheel(0, 760);
    await caption(page, "The platform", "Targets, certificate fraud checks, AI invoice extraction, reminders and CPCB-ready reports — in one workspace.", 4200);
    await page.mouse.wheel(0, -760);
    await wait(600);
    await caption(page, "Dark & light mode", "Every screen supports light, dark and system themes.", 1200);
    await setTheme(page, "Dark");
    await wait(1200);
    await shot(page, "02-landing-dark");
    await setTheme(page, "Light");

    // ── 2. Sign-up with clear validation ──────────────────────────────────
    await click(page, page.getByRole("link", { name: "Get started" }).first());
    await page.waitForURL(/\/signup/);
    await caption(page, "Sign up", "Creating an account takes seconds. Every field is validated with clear, specific messages.", 2600);
    await click(page, page.getByRole("button", { name: "Create account" }), 1200);
    await caption(page, "Clear errors", "Missing or invalid fields are outlined in red with the reason right below.", 2600);
    await shot(page, "03-signup-errors");
    await type(page, page.getByLabel("Full name"), NEW_USER.name);
    await type(page, page.getByLabel("Work email"), NEW_USER.email, 30);
    await caption(page, "Strong passwords", "A live checklist shows the password rules as you type; common passwords are rejected.", 600);
    await type(page, page.getByLabel("Password", { exact: true }), NEW_USER.password, 90);
    await wait(1200);
    await click(page, page.getByRole("button", { name: "Create account" }));
    await page.waitForURL(/\/onboarding/, { timeout: 90_000 });

    // ── 3. Onboarding wizard ──────────────────────────────────────────────
    await caption(page, "Onboarding wizard", "Step 1 — company details: entity type, waste streams, head office, PAN and CPCB registration.", 1800);
    await type(page, page.getByLabel("Company name"), "Sunrise Foods");
    await type(page, page.getByLabel("Legal name"), "Sunrise Foods Private Limited", 30);
    await click(page, page.getByRole("combobox", { name: "Head office state" }), 500);
    await click(page, page.getByRole("option", { name: "Maharashtra" }), 400);
    await click(page, page.getByRole("checkbox", { name: /Producer/ }), 250);
    await click(page, page.getByRole("checkbox", { name: /Brand Owner/ }), 250);
    await type(page, page.getByLabel("PAN", { exact: true }), "AAECS4321K", 60);
    await shot(page, "04-onboarding-company");
    await click(page, page.getByRole("button", { name: "Continue" }), 900);

    await caption(page, "GSTIN validation", "Step 2 — GSTINs are checked with the official checksum and the state is detected automatically.", 1500);
    await type(page, page.getByLabel("GSTIN"), "27AAECS4321K1Z1", 60);
    await click(page, page.getByRole("button", { name: "Add", exact: true }), 1400);
    await page.getByLabel("GSTIN").fill("");
    const gstin = await page.evaluate(() => {
      const cs = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const f = "27AAECS4321K1Z";
      let sum = 0;
      for (let i = 0; i < 14; i++) {
        const p = cs.indexOf(f[i]) * (i % 2 === 0 ? 1 : 2);
        sum += Math.floor(p / 36) + (p % 36);
      }
      return f + cs[(36 - (sum % 36)) % 36];
    });
    await type(page, page.getByLabel("GSTIN"), gstin, 60);
    await click(page, page.getByRole("button", { name: "Add", exact: true }), 1200);
    await shot(page, "05-onboarding-gstin");
    await click(page, page.getByRole("button", { name: "Continue" }), 800);

    await caption(page, "Brands", "Step 3 — the brands you sell under. Data and reports can be split by brand.", 1200);
    for (const b of ["Sunrise Snacks", "Morning Oats"]) {
      await type(page, page.getByLabel("Brand name"), b, 45);
      await page.keyboard.press("Enter");
      await wait(400);
    }
    await click(page, page.getByRole("button", { name: "Create company" }));
    await page.waitForURL(/\/dashboard/, { timeout: 90_000 });
    await page.getByText("Compliance score").first().waitFor();
    await caption(page, "Your workspace", "The company is created and you are its Admin. The dashboard tracks the financial year and setup progress.", 3800);

    await click(page, page.getByRole("link", { name: "Audit log" }), 1200);
    await caption(page, "Audit trail from day one", "Every change is recorded with who made it, when, and from which IP.", 3200);

    await logout(page);

    // ── 4. Established company (Admin) ────────────────────────────────────
    await caption(page, "An established company", "Now the demo company: 3 GSTINs across states, 3 brands and a team of 4.", 800);
    await login(page, "admin@demo.eprflow.in");
    await caption(page, "Dashboard", "FY progress, GST registrations, brands and team at a glance — plus the next steps to complete.", 4000);
    await shot(page, "06-dashboard-light");

    await click(page, page.getByRole("link", { name: "Members", exact: true }), 1200);
    await caption(page, "Team & roles", "Admin, Compliance Manager, Consultant and Viewer — each with clearly defined permissions.", 3000);
    await type(page, page.getByLabel("Email", { exact: true }), `procurement.${STAMP}@demo.eprflow.in`, 30);
    await click(page, page.getByRole("button", { name: "Send invite" }), 1800);
    await caption(page, "Invitations", "Invites go by email, or as a secure one-time link. Tokens are stored hashed and expire in 7 days.", 3200);
    await shot(page, "07-members");

    await click(page, page.getByRole("link", { name: "Organization", exact: true }), 1200);
    await caption(page, "Company profile", "Entity types, waste streams, PAN, CIN and CPCB number — validated and used across reports.", 3200);
    await shot(page, "08-organization");

    await click(page, page.getByRole("link", { name: "Audit log" }), 1200);
    await caption(page, "Full history", "Invites, joins, role changes and profile edits — nothing changes without a record.", 3400);
    await shot(page, "09-audit-log");

    await click(page, page.getByRole("link", { name: "Certificates" }), 1200);
    await caption(page, "Roadmap", "Materials, targets, certificates, AI extraction and reports are being built next, phase by phase.", 3400);
    await logout(page);

    // ── 5. Consultant: multiple clients ───────────────────────────────────
    await caption(page, "Consultants", "One login, many client companies.", 600);
    await login(page, "consultant@demo.eprflow.in");
    await click(page, page.locator("[data-sidebar=header] button").first(), 1600);
    await caption(page, "Switch between clients", "Consultants jump between client organizations — each one's data stays fully isolated.", 2400);
    await shot(page, "10-consultant-switcher");
    await click(page, page.getByRole("menuitem", { name: "GreenPack Industries" }));
    await page.waitForURL(/greenpack-industries/);
    await caption(page, "GreenPack Industries", "A different client: Producer & Importer, Plastic and E-Waste streams, Gujarat head office.", 3400);
    await logout(page);

    // ── 6. Viewer: read-only ──────────────────────────────────────────────
    await login(page, "viewer@demo.eprflow.in");
    await click(page, page.getByRole("link", { name: "Organization", exact: true }), 1000);
    await caption(page, "Read-only access", "Viewers can see everything relevant but cannot edit — enforced on the server, not just hidden in the UI.", 3600);
    await click(page, page.getByRole("link", { name: "Audit log" }), 1000);
    await caption(page, "Role-based access", "Sensitive areas like the audit log are restricted by role.", 2600);
    await logout(page);

    // ── 7. Security ───────────────────────────────────────────────────────
    await caption(page, "Security built in", "Wrong passwords get a clear, non-revealing message; repeated attempts are rate-limited.", 400);
    await type(page, page.getByLabel("Work email"), "admin@demo.eprflow.in", 30);
    await type(page, page.getByLabel("Password", { exact: true }), "WrongPass123", 40);
    await click(page, page.getByRole("button", { name: "Log in" }), 1800);
    await shot(page, "11-login-error");
    await wait(1600);
    await page.goto(`${BASE}/o/demo-consumer-goods/settings/members`);
    await page.waitForURL(/\/login/);
    await caption(page, "Protected routes", "Signed-out visitors are sent to login — then returned to the page they asked for.", 3200);
    await page.goto(`${BASE}/missing-page`);
    await page.getByRole("heading", { name: "Page not found" }).waitFor();
    await caption(page, "Friendly errors", "Unknown pages and unexpected errors show helpful screens — never stack traces.", 3000);

    // ── 8. Dark mode tour & close ─────────────────────────────────────────
    await caption(page, "Dark mode", "Finally, the full app in dark mode.", 300);
    await login(page, "admin@demo.eprflow.in");
    await setTheme(page, "Dark");
    await caption(page, "Dark mode", "The whole app — dashboard, forms and tables — in dark mode.", 3000);
    await shot(page, "12-dashboard-dark");
    await click(page, page.getByRole("link", { name: "Members", exact: true }), 1500);
    await setTheme(page, "Light");
    await caption(page, "", "", 300);
    await titleCard(page, "Built on Next.js · PostgreSQL (Neon) · Vercel", "EPRFlow", "Know your obligation. Trust every certificate. Never miss a deadline.", 4200);
  } finally {
    const video = page.video();
    await context.close();
    await browser.close();
    if (video) await rename(await video.path(), path.join(OUT, "eprflow-demo.webm"));
    await cleanup();
  }
  console.log(`Saved ${path.join(OUT, "eprflow-demo.webm")} and screenshots in ${SCREENS}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
