/**
 * Records a ~2 minute product pitch video of EPRFlow with Playwright.
 * No login screens: sessions are created off-camera and swapped in as cookies.
 *
 *   1. npm run build && npm start   (database seeded with `npm run db:seed`)
 *   2. node scripts/record-demo.mjs
 *
 * Output: demo/eprflow-demo.webm (trimmed .mp4 is produced with ffmpeg, see README).
 * The import step uploads a sample file and discards it, so no data is changed.
 */
import "dotenv/config";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { chromium } from "playwright";

const BASE = process.env.DEMO_URL ?? "http://localhost:3000";
const ORG = `${BASE}/o/demo-consumer-goods`;
const OUT = path.resolve("demo");
const SIZE = { width: 1440, height: 900 };
const PASSWORD = "Demo@12345";

// ── Overlay: caption bar, visible cursor and full-screen title cards ──────────────
const OVERLAY = () => {
  const install = () => {
    if (document.getElementById("__demo_caption")) return;
    const style = document.createElement("style");
    style.textContent = `
      #__demo_caption{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483647;
        max-width:900px;padding:14px 24px;border-radius:14px;background:rgba(10,30,18,.9);color:#fff;
        font:500 18px/1.45 system-ui,Segoe UI,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.25);
        transition:opacity .25s;pointer-events:none}
      #__demo_caption b{display:block;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#7ee2a0;margin-bottom:2px}
      #__demo_caption:empty{opacity:0}
      #__demo_cursor{position:fixed;z-index:2147483647;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;
        background:rgba(34,197,94,.35);border:2px solid #16a34a;pointer-events:none;transition:transform .12s}
      #__demo_cursor.down{transform:scale(.7);background:rgba(34,197,94,.7)}
      #__demo_card{position:fixed;inset:0;z-index:2147483646;display:flex;flex-direction:column;align-items:center;
        justify-content:center;gap:18px;background:radial-gradient(circle at 30% 20%,#1f6f43,#0b2416 70%);color:#fff;
        font-family:system-ui,Segoe UI,sans-serif;text-align:center;transition:opacity .4s;padding:0 80px}
      #__demo_card h1{font-size:60px;margin:0;font-weight:700;letter-spacing:-.02em;line-height:1.1}
      #__demo_card p{font-size:24px;margin:0;opacity:.88;max-width:900px;line-height:1.45}
      #__demo_card small{font-size:15px;opacity:.65;letter-spacing:.14em;text-transform:uppercase}
      #__demo_card ul{list-style:none;padding:0;margin:8px 0 0;display:grid;gap:12px;font-size:22px;text-align:left}
      #__demo_card li::before{content:"→ ";color:#7ee2a0}`;
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

// Loading gaps (seconds from the start of the recording) cut out of the final video.
let recordingStart = 0;
const cuts = [];
const now = () => (Date.now() - recordingStart) / 1000;
async function cutWhile(fn) {
  const from = now() + 0.15;
  await fn();
  const to = now() - 0.1;
  if (to > from) cuts.push([from, to]);
}

async function caption(page, title, text, holdMs = 3000) {
  const html = title ? `<b>${title}</b>${text}` : "";
  await page.evaluate((h) => {
    sessionStorage.setItem("__demo_caption", h);
    const el = document.getElementById("__demo_caption");
    if (el) el.innerHTML = h;
  }, html);
  await wait(holdMs);
}

async function showCard(page, html) {
  await page.evaluate((h) => {
    document.getElementById("__demo_card")?.remove();
    const card = document.createElement("div");
    card.id = "__demo_card";
    card.innerHTML = h;
    document.body.appendChild(card);
    document.getElementById("__demo_cursor")?.style.setProperty("display", "none");
  }, html);
}

async function hideCard(page) {
  await page.evaluate(() => {
    const c = document.getElementById("__demo_card");
    if (c) c.style.opacity = "0";
  });
  await wait(450);
  await page.evaluate(() => {
    document.getElementById("__demo_card")?.remove();
    document.getElementById("__demo_cursor")?.style.removeProperty("display");
  });
}

async function card(page, html, holdMs) {
  await showCard(page, html);
  await wait(holdMs);
  await hideCard(page);
}

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.locator('[aria-label="Loading"]').waitFor({ state: "detached", timeout: 20_000 }).catch(() => {});
}

async function moveTo(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 16 });
  await wait(200);
}

async function click(page, locator, pause = 400) {
  await moveTo(page, locator);
  await locator.click();
  await settle(page);
  await wait(pause);
}

async function go(page, url, readyText) {
  await cutWhile(async () => {
    await page.goto(url);
    await ready(page, readyText);
  });
}

/** Waits for content that only exists once the page has fully streamed in. */
async function ready(page, text) {
  if (text) await page.getByText(text, { exact: typeof text === "string" }).first().waitFor({ timeout: 60_000 });
  await page.waitForFunction(() => !document.querySelector('[aria-label="Loading"]'), null, { timeout: 60_000, polling: 200 });
  await settle(page);
  await wait(250);
}

/** Clicks a sidebar link and waits for the destination page's content. */
async function nav(page, name, readyText) {
  await caption(page, "", "", 0);
  const link = page.getByRole("link", { name, exact: typeof name === "string" }).first();
  await moveTo(page, link);
  await link.click();
  await cutWhile(() => ready(page, readyText));
}

async function smoothScroll(page, dy, steps = 12) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy / steps);
    await wait(40);
  }
  await wait(300);
}

/** Logs in off-camera and returns the session cookies. */
async function sessionCookies(browser, email) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(`${BASE}/login`);
  await p.getByLabel("Work email").fill(email);
  await p.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await p.getByRole("button", { name: "Log in" }).click();
  await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 90_000 });
  const cookies = await ctx.cookies();
  await ctx.close();
  return cookies;
}

async function switchSession(context, cookies) {
  await context.clearCookies();
  await context.addCookies(cookies);
}

async function setTheme(page, name) {
  await click(page, page.getByRole("button", { name: "Change theme" }).first(), 200);
  await click(page, page.getByRole("menuitem", { name }), 500);
}

async function warmUp(cookies) {
  const header = { cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; ") };
  for (const r of ["/dashboard", "/targets", "/alerts", "/materials", "/materials/import", "/gst", "/settings/budgets", "/audit-log"]) {
    await fetch(ORG + r, { headers: header }).catch(() => {});
  }
}

async function cleanup() {
  const client = new pg.Client({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL });
  await client.connect();
  await client.query(`DELETE FROM "ImportBatch" WHERE "fileName" = 'march-dispatch-tamilnadu.csv'`);
  await client.query(`DELETE FROM "RateLimit" WHERE key LIKE 'login:%' OR key LIKE 'import%'`);
  await client.end();
}

const SAMPLE_CSV = [
  "month,category,entity_type,state,quantity,unit,brand,plant,gstin,recycled_content,pre_consumer,notes",
  "2026-03,Cat I,Brand Owner,Tamil Nadu,12.5,t,FreshBite Snacks,,,,no,Distributor dispatch",
  "2026-03,Cat II,Brand Owner,Tamil Nadu,8400,kg,FreshBite Snacks,,,,no,",
  "2026-03,Cat III,Brand Owner,Tamil Nadu,3.2,tonnes,PureGlow Personal Care,,,,no,",
  "2026-03,Cat II,Brand Owner,TN,2.1,t,HomeShine,,,,no,",
  "2026-03,Cat IX,Brand Owner,Tamil Nadu,1.4,t,HomeShine,,,,no,Typo in category",
  "2027-01,Cat I,Brand Owner,Tamil Nadu,5,t,FreshBite Snacks,,,,no,Future month",
  "2026-03,Cat II,Brand Owner,Tamil Nadu,-40,kg,PureGlow Personal Care,,,,no,Negative quantity",
  "2026-03,Cat I,Brand Owner,Tamil Nadu,900,boxes,FreshBite Snacks,,,,no,Unknown unit",
].join("\n");

async function main() {
  // Never hang: give up if a run takes far longer than a normal recording.
  setTimeout(() => {
    console.error("Recording timed out");
    process.exit(1);
  }, 8 * 60_000).unref();
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  const csvPath = path.join(OUT, "march-dispatch-tamilnadu.csv");
  await writeFile(csvPath, SAMPLE_CSV);
  await cleanup();

  const browser = await chromium.launch();
  console.log("Creating sessions…");
  const admin = await sessionCookies(browser, "admin@demo.eprflow.in");
  const consultant = await sessionCookies(browser, "consultant@demo.eprflow.in");
  const ops = await sessionCookies(browser, "ops@eprflow.in");
  await warmUp(admin);

  const context = await browser.newContext({ viewport: SIZE, colorScheme: "light", recordVideo: { dir: OUT, size: SIZE } });
  await context.addInitScript(OVERLAY);
  await switchSession(context, admin);
  const page = await context.newPage();
  recordingStart = Date.now(); // the video timeline starts with the page
  page.on("dialog", (d) => d.accept());

  try {
    console.log("1. The problem", now().toFixed(1));
    // ── 1. The problem (≈12s) ─────────────────────────────────────────────
    await go(page, `${ORG}/dashboard`, "Compliance score");
    await showCard(page, `<small>EPR compliance for India</small><h1>EPRFlow</h1><p>Know your obligation. Trust every certificate. Never miss a deadline.</p>`);
    cuts.unshift([0, now()]);
    await wait(3600);
    await showCard(
      page,
      `<small>The problem</small><h1>Thousands of Indian brands must<br/>meet EPR targets every year</h1>
       <p>Plastic, E-Waste and Battery rules (2022) are tracked in Excel and email today —
       wrong maths, missed CPCB deadlines, fake recycling certificates and crores in Environmental Compensation.</p>`,
    );
    await wait(6500);
    await hideCard(page);

    console.log("2. Dashboard", now().toFixed(1));
    // ── 2. Dashboard (≈16s) ───────────────────────────────────────────────
    await caption(page, "One dashboard", "Compliance score, remaining obligation, Environmental Compensation risk and certificate spend vs budget — live.", 4300);
    const bars = page.locator(".recharts-bar-rectangle");
    await smoothScroll(page, 420);
    await caption(page, "Where you stand", "Progress per plastic category against where you should be today — plus automatic alerts.", 600);
    if ((await bars.count()) > 4) {
      for (const i of [4, 10, 16, 22]) {
        const bar = bars.nth(Math.min(i, (await bars.count()) - 1));
        await moveTo(page, bar);
        await wait(700);
      }
    }
    await wait(1800);
    await smoothScroll(page, -420);

    console.log("3. Targets", now().toFixed(1));
    // ── 3. Targets (≈14s) ─────────────────────────────────────────────────
    await nav(page, "Targets", "Obligation details");
    await caption(page, "Automatic EPR targets", "The engine computes each category's target from 2 years of sales data and the applicable CPCB rule.", 4000);
    await smoothScroll(page, 520);
    await caption(page, "Transparent maths", "Base quantity, target %, minimum recycling, shortfall and EC risk — with the exact rule version applied.", 4300);
    await smoothScroll(page, 700);
    await wait(1500);

    console.log("4. Alerts", now().toFixed(1));
    // ── 4. Alerts (≈5s) ───────────────────────────────────────────────────
    await nav(page, /^Alerts/, "Generated from your targets every day and whenever the dashboard is opened.");
    await caption(page, "Proactive alerts", "“You are 36% behind on Cat II target with 6 months left” — checked daily, before it becomes a penalty.", 4600);

    console.log("5. Data import with validation", now().toFixed(1));
    // ── 5. Data import with validation (≈18s) ─────────────────────────────
    await nav(page, "Materials", "Quantity of packaging and products placed on the market each month.");
    await caption(page, "Sales data in minutes", "Every tonne placed on market — by month, category, state, brand and plant.", 2600);
    await caption(page, "", "", 0);
    await go(page, `${ORG}/materials/import`, "Upload a file");
    await caption(page, "Bulk import from Excel / CSV", "Upload the sheet you already have — columns are matched automatically.", 1200);
    await moveTo(page, page.getByText("Drop a file here or click to browse"));
    await page.locator("#file").setInputFiles(csvPath);
    await wait(900);
    const validate = page.getByRole("button", { name: "Validate file" });
    await moveTo(page, validate);
    await validate.click();
    await cutWhile(async () => {
      await page.waitForURL(/\/materials\/import\/[^/]+$/, { timeout: 60_000 });
      await ready(page, "Problems found");
    });
    await caption(page, "Every problem caught before saving", "Wrong categories, future months, negative quantities and unknown units are flagged row by row.", 3400);
    await smoothScroll(page, 450);
    await wait(1800);
    await smoothScroll(page, -450);
    const discard = page.getByRole("button", { name: "Discard" });
    await moveTo(page, discard);
    await discard.click();
    await cutWhile(() => page.waitForURL(/\/materials\/import$/, { timeout: 30_000 }));

    console.log("6. Compliance structure", now().toFixed(1));
    // ── 6. Compliance structure (≈9s) ─────────────────────────────────────
    await nav(page, "GST registrations", /^Each GSTIN you invoice from/);
    await caption(page, "Multi-state, multi-brand", "GSTINs verified with the official checksum, plus brands and plants across states.", 3500);
    await nav(page, "Budgets", "Set a budget");
    await caption(page, "Budget control", "Plan certificate purchases per financial year and track spend against it.", 3200);

    console.log("7. Trust: roles and audit", now().toFixed(1));
    // ── 7. Trust: roles and audit (≈6s) ───────────────────────────────────
    await nav(page, "Audit log", "Every change in this organization, who made it and when.");
    await caption(page, "Audit-ready", "Every change is logged with who, when and from where. Four roles: Admin, Compliance, Consultant, Viewer.", 4000);

    console.log("8. Consultants", now().toFixed(1));
    // ── 8. Consultants (≈9s) ──────────────────────────────────────────────
    await caption(page, "", "", 0);
    await switchSession(context, consultant);
    await go(page, `${ORG}/dashboard`, "Compliance score");
    await caption(page, "Built for consultants too", "EPR consultants manage many client companies from one login.", 1500);
    await click(page, page.locator("[data-sidebar=header] button").first(), 1600);
    const client = page.getByRole("menuitem", { name: "GreenPack Industries" });
    await moveTo(page, client);
    await wait(300);
    await page.keyboard.press("Escape");
    await go(page, `${BASE}/o/greenpack-industries/dashboard`, "Compliance score");
    await caption(page, "Isolated client workspaces", "Each client's data is strictly separated at the database layer.", 3000);

    console.log("9. Regulation rules", now().toFixed(1));
    // ── 9. Regulation rules (≈8s) ─────────────────────────────────────────
    await caption(page, "", "", 0);
    await switchSession(context, ops);
    await go(page, `${BASE}/admin/rules`, "Regulation rules");
    await caption(page, "Rules change? Update once.", "CPCB targets and EC rates are versioned data, not code — every customer recalculates instantly.", 3500);
    await click(page, page.getByRole("button", { name: "Edit" }).first(), 1800);
    await page.keyboard.press("Escape");
    await wait(500);

    console.log("10. Dark mode", now().toFixed(1));
    // ── 10. Dark mode (≈5s) ───────────────────────────────────────────────
    await caption(page, "", "", 0);
    await switchSession(context, admin);
    await go(page, `${ORG}/dashboard`, "Compliance score");
    await setTheme(page, "Dark");
    await caption(page, "Polished & secure", "Light and dark mode, rate-limited logins, CSP headers and encrypted sessions — on Vercel + Neon Postgres.", 4200);
    await caption(page, "", "", 0);

    console.log("11. Roadmap & close", now().toFixed(1));
    // ── 11. Roadmap & close (≈15s) ────────────────────────────────────────
    await card(
      page,
      `<small>Coming next</small><h1>From tracking to automation</h1>
       <ul><li>Certificate marketplace checks &amp; fraud detection</li>
       <li>AI extraction of invoices and certificates (Claude)</li>
       <li>CPCB-ready annual returns &amp; deadline reminders</li></ul>`,
      6000,
    );
    await showCard(page, `<small>EPRFlow</small><h1>Compliance that pays for itself</h1><p>One avoided EC penalty covers years of subscription.<br/>Let's make EPR compliance effortless for every Indian brand.</p>`);
    await wait(5000);
    cuts.push([now(), 9999]); // nothing after the closing card
  } finally {
    const video = page.video();
    await context.close();
    await browser.close();
    if (video) await rename(await video.path(), path.join(OUT, "eprflow-demo.webm"));
    // ffmpeg filter that drops the loading gaps, e.g. -vf "$(cat demo/cuts.txt)"
    const drop = cuts.map(([a, b]) => `between(t,${a.toFixed(2)},${b.toFixed(2)})`).join("+");
    await writeFile(path.join(OUT, "cuts.txt"), `select='not(${drop})',setpts=N/25/TB`);
    await cleanup();
  }
  const kept = cuts.slice(0, -1).reduce((t, [a, b]) => t - (b - a), cuts.at(-1)[0]);
  console.log(`Saved ${path.join(OUT, "eprflow-demo.webm")} — about ${kept.toFixed(0)}s after cutting ${cuts.length} loading gaps`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
