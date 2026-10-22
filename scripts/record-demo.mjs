/**
 * Records a ~2 minute product pitch video of EPRFlow with Playwright.
 * No login screens: sessions are created off-camera and swapped in as cookies.
 *
 *   1. npm run build && npm start   (database seeded with `npm run db:seed`)
 *   2. node scripts/record-demo.mjs
 *
 * Run the dev server with AI_PROVIDER=fake so the AI step works without an API key.
 * Output: demo/eprflow-demo.webm (trimmed .mp4 is produced with ffmpeg, see README).
 * The sample upload and report download are removed afterwards, so no demo data changes.
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
  if (window !== window.top) return; // not inside the document preview frame
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
      nextjs-portal{display:none!important}
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
  for (const r of ["/dashboard", "/targets", "/alerts", "/extractions", "/certificates", "/reports", "/calendar", "/audit-log"]) {
    await fetch(ORG + r, { headers: header }).catch(() => {});
  }
}

const SAMPLE_FILE = "greenloop-certificate-000519.png";

/** Removes everything the recording created: the sample upload, downloaded-report records and their audit entries. */
async function cleanup(since) {
  const client = new pg.Client({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL });
  await client.connect();
  const files = `SELECT id FROM "StoredFile" WHERE "fileName" = '${SAMPLE_FILE}'`;
  await client.query(`DELETE FROM "Extraction" WHERE "fileId" IN (${files})`);
  await client.query(`DELETE FROM "StoredFileContent" WHERE "fileId" IN (${files})`);
  await client.query(`DELETE FROM "StoredFile" WHERE "fileName" = '${SAMPLE_FILE}'`);
  if (since) {
    const org = `SELECT id FROM "Organization" WHERE slug = 'demo-consumer-goods'`;
    await client.query(`DELETE FROM "Report" WHERE "createdAt" >= $1 AND "organizationId" IN (${org})`, [since]);
    await client.query(`DELETE FROM "AuditLog" WHERE "createdAt" >= $1 AND "organizationId" IN (${org})`, [since]);
  }
  await client.query(`DELETE FROM "RateLimit" WHERE key LIKE 'login:%' OR key LIKE 'extract%' OR key LIKE 'report%'`);
  await client.end();
}

/** A sample certificate image matching what the fake AI provider returns (an image, because headless Chromium cannot preview PDFs). */
async function sampleCertificate(browser, file) {
  const rows = [
    ["Certificate number", "EPR/KA-0177/2026/000519"],
    ["Processor registration", "PWP-KA-0177"],
    ["Category of plastic packaging", "Category II"],
    ["Type", "Recycling"],
    ["Quantity", '<s>18,000 kg</s> <span class="hand">18,500</span>'],
    ["Date of issue", "02-10-2026"],
    ["Date of transfer", "&nbsp;"],
    ["Financial year", "2026-27"],
    ["Transferred to", "Demo Consumer Goods Pvt Ltd"],
  ];
  const html = `<html><body style="margin:0;font-family:Georgia,serif;background:#fff">
    <div style="margin:28px;border:3px double #0f5a33;padding:44px 52px;height:1060px;box-sizing:border-box;position:relative">
      <div style="font:700 34px Georgia;color:#0f5a33">GreenLoop Plastics LLP</div>
      <div style="color:#555;font-size:17px;margin-top:6px">Registered Plastic Waste Processor · Bengaluru, Karnataka</div>
      <div style="font:700 26px Georgia;margin:56px 0 28px;letter-spacing:.04em">EPR CERTIFICATE — RECYCLING</div>
      <table style="width:100%;border-collapse:collapse;font-size:19px">${rows
        .map(([k, v]) => `<tr><td style="color:#555;padding:13px 0;border-bottom:1px solid #dde5df;width:46%">${k}</td><td style="font-weight:700;border-bottom:1px solid #dde5df">${v}</td></tr>`)
        .join("")}</table>
      <div style="position:absolute;bottom:150px;left:52px;border-top:1px solid #555;width:240px;padding-top:8px;color:#555">Authorised signatory</div>
      <div style="position:absolute;bottom:40px;left:52px;color:#b33;font:700 13px Arial">SAMPLE DOCUMENT — FOR PRODUCT DEMONSTRATION ONLY</div>
    </div>
    <style>.hand{font:700 22px "Segoe Print","Comic Sans MS",cursive;color:#1d3fa8;display:inline-block;transform:rotate(-4deg)}</style>
  </body></html>`;
  const page = await browser.newPage({ viewport: { width: 850, height: 1116 } });
  await page.setContent(html);
  await page.screenshot({ path: file });
  await page.close();
}

async function main() {
  // Never hang: give up if a run takes far longer than a normal recording.
  setTimeout(() => {
    console.error("Recording timed out");
    process.exit(1);
  }, 8 * 60_000).unref();
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  const samplePath = path.join(OUT, SAMPLE_FILE);
  await cleanup();

  const browser = await chromium.launch();
  await sampleCertificate(browser, samplePath);
  console.log("Creating sessions…");
  const admin = await sessionCookies(browser, "admin@demo.eprflow.in");
  const consultant = await sessionCookies(browser, "consultant@demo.eprflow.in");
  await warmUp(admin);
  const since = new Date();

  const context = await browser.newContext({ viewport: SIZE, colorScheme: "light", recordVideo: { dir: OUT, size: SIZE }, acceptDownloads: true });
  await context.addInitScript(OVERLAY);
  await switchSession(context, admin);
  const page = await context.newPage();
  recordingStart = Date.now(); // the video timeline starts with the page
  page.on("dialog", (d) => d.accept());

  try {
    console.log("1. The problem", now().toFixed(1));
    // ── 1. The problem (≈14s) ─────────────────────────────────────────────
    await go(page, `${ORG}/dashboard`, "Compliance score");
    await showCard(page, `<small>EPR compliance for India</small><h1>EPRFlow</h1><p>Know your obligation. Trust every certificate. Never miss a deadline.</p>`);
    cuts.unshift([0, now()]);
    await wait(3600);
    await showCard(
      page,
      `<small>The problem</small><h1>Every brand selling in India must<br/>meet EPR targets every year</h1>
       <ul><li>Targets worked out by hand in Excel</li>
       <li>Invoices and certificates typed in one by one</li>
       <li>Fake and double-sold recycling certificates</li>
       <li>CPCB deadlines missed — then Environmental Compensation</li></ul>`,
    );
    await wait(7500);
    await showCard(page, `<small>The solution</small><h1>One workspace for the whole EPR cycle</h1><p>Sales data → targets → certificates → CPCB return — checked, automated and audit-ready.</p>`);
    await wait(3800);
    await hideCard(page);

    console.log("2. Dashboard", now().toFixed(1));
    // ── 2. Dashboard (≈12s) ───────────────────────────────────────────────
    await caption(page, "Know where you stand", "Compliance score, remaining obligation, Environmental Compensation risk and certificate spend — live.", 4300);
    const bars = page.locator(".recharts-bar-rectangle");
    await smoothScroll(page, 420);
    await caption(page, "Progress per category", "Each plastic category against where it should be today, with upcoming deadlines alongside.", 600);
    if ((await bars.count()) > 4) {
      for (const i of [4, 10, 16]) {
        await moveTo(page, bars.nth(Math.min(i, (await bars.count()) - 1)));
        await wait(700);
      }
    }
    await wait(1500);
    await smoothScroll(page, -420);

    console.log("3. Targets", now().toFixed(1));
    // ── 3. Targets (≈8s) ──────────────────────────────────────────────────
    await nav(page, "Targets", "Obligation details");
    await caption(page, "No more Excel maths", "Targets computed from your sales data and the applicable CPCB rule — shortfall and EC risk shown.", 3600);
    await smoothScroll(page, 520);
    await wait(2200);

    console.log("4. AI extraction", now().toFixed(1));
    // ── 4. AI extraction (≈20s) ───────────────────────────────────────────
    await nav(page, "AI extraction", "Read with AI");
    await caption(page, "No more typing", "Upload a certificate or a photo of an invoice — AI reads it for you.", 1500);
    await click(page, page.getByText("EPR certificate", { exact: true }), 300);
    await moveTo(page, page.locator("label[for=extract-file]").first()).catch(() => {});
    await page.locator("#extract-file").setInputFiles(samplePath);
    await wait(900);
    const read = page.getByRole("button", { name: "Read with AI" });
    await moveTo(page, read);
    await read.click();
    await cutWhile(async () => {
      await page.waitForURL(/\/extractions\/[a-z0-9]{10,}$/, { timeout: 90_000 });
      await ready(page, "Check before saving");
    });
    await caption(page, "Side-by-side review", "The document on the left, the values read from it on the right — nothing is saved until a person checks it.", 4500);
    await moveTo(page, page.getByText(/Low confidence/).first());
    await caption(page, "It tells you what to double-check", "Low-confidence fields and hand-written corrections are highlighted first.", 4200);
    await moveTo(page, page.getByRole("button", { name: "Save draft" }));
    await wait(1200);

    console.log("5. Fraud checks", now().toFixed(1));
    // ── 5. Fraud checks (≈14s) ────────────────────────────────────────────
    await nav(page, "Certificates", "EPR certificates");
    await caption(page, "Every certificate checked", "Duplicates, unverified recyclers, capacity breaches, impossible dates and outlier prices.", 3400);
    await caption(page, "", "", 0);
    const flagged = page.getByRole("link", { name: "EPR/MH-0412/2026/000777" }).first();
    await moveTo(page, flagged);
    await flagged.click();
    await cutWhile(() => ready(page, /already been claimed elsewhere on EPRFlow/));
    await moveTo(page, page.getByText(/already been claimed elsewhere on EPRFlow/).first());
    await caption(page, "Double-sold certificate caught", "This number was already claimed by another company — without revealing who.", 4200);
    await moveTo(page, page.getByRole("button", { name: "Approve" }));
    await caption(page, "Approval blocked", "It can't count towards your targets until the flag is resolved — no fake credits, no penalties.", 3800);

    console.log("6. Reports", now().toFixed(1));
    // ── 6. Reports (≈11s) ─────────────────────────────────────────────────
    await nav(page, "Reports", "CPCB annual return");
    await caption(page, "CPCB return in one click", "Annual return, obligation summary and registers — Excel or PDF, straight from your data.", 2000);
    const annual = page.locator("[data-slot=card]").filter({ hasText: "CPCB annual return" }).first();
    const xlsx = annual.getByRole("button", { name: /^XLSX/ }).first();
    await moveTo(page, xlsx);
    const download = page.waitForEvent("download", { timeout: 60_000 }).catch(() => null);
    await xlsx.click();
    await cutWhile(async () => {
      await download;
      await page.getByText(/^Downloaded /).first().waitFor({ timeout: 30_000 }).catch(() => {});
    });
    await wait(2800);

    console.log("7. Calendar", now().toFixed(1));
    // ── 7. Calendar (≈8s) ─────────────────────────────────────────────────
    await nav(page, "Calendar", "Compliance calendar");
    await caption(page, "Never miss a deadline", "Every filing date in one calendar, with email reminders 30, 7 and 1 day before.", 4300);
    await smoothScroll(page, 380);
    await wait(1500);

    console.log("8. Audit log", now().toFixed(1));
    // ── 8. Audit log (≈4s) ────────────────────────────────────────────────
    await nav(page, "Audit log", "Every change in this organization, who made it and when.");
    await caption(page, "Audit-ready", "Every change logged with who, when and from where — exportable for auditors.", 3800);

    console.log("9. Consultants", now().toFixed(1));
    // ── 9. Consultants (≈9s) ──────────────────────────────────────────────
    await caption(page, "", "", 0);
    await switchSession(context, consultant);
    await go(page, `${BASE}/consultant`, "All clients");
    await caption(page, "Built for consultants too", "Every client company's score, risk and next deadline on one screen — riskiest first.", 4500);
    await moveTo(page, page.getByRole("link", { name: /GreenPack/ }).first()).catch(() => {});
    await wait(2500);
    await caption(page, "", "", 0);

    console.log("10. Close", now().toFixed(1));
    // ── 10. Close (≈11s) ──────────────────────────────────────────────────
    await card(
      page,
      `<small>How EPRFlow solves it</small><h1>From spreadsheets to certainty</h1>
       <ul><li>Targets calculated automatically from CPCB rules</li>
       <li>AI reads invoices and certificates — people approve</li>
       <li>Fraud checks on every certificate</li>
       <li>CPCB-ready reports and deadline reminders</li></ul>`,
      6500,
    );
    await showCard(page, `<small>EPRFlow</small><h1>Compliance that pays for itself</h1><p>One avoided Environmental Compensation penalty covers years of subscription.<br/>Let's make EPR compliance effortless for every Indian brand.</p>`);
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
    await cleanup(since);
  }
  const kept = cuts.slice(0, -1).reduce((t, [a, b]) => t - (b - a), cuts.at(-1)[0]);
  console.log(`Saved ${path.join(OUT, "eprflow-demo.webm")} — about ${kept.toFixed(0)}s after cutting ${cuts.length} loading gaps`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
