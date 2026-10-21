import "dotenv/config";
import { expect, test } from "@playwright/test";
import { DEMO_ORG, login } from "./helpers";

const BASE = `/o/${DEMO_ORG}`;

function previousFy() {
  const now = new Date();
  const start = now.getUTCMonth() >= 3 ? now.getUTCFullYear() - 1 : now.getUTCFullYear() - 2;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

test.describe("reports", () => {
  test("annual return downloads as Excel and PDF and is recorded in the history", async ({ page }) => {
    await login(page, "compliance@demo.eprflow.in");
    await page.goto(`${BASE}/reports`);
    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
    const fy = previousFy();

    const card = page.locator("[data-slot=card]").filter({ hasText: "CPCB annual return" }).first();
    const downloadPromise = page.waitForEvent("download");
    await card.getByRole("button", { name: `XLSX · FY ${fy}` }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(new RegExp(`^${DEMO_ORG}-annual-return-fy${fy}-\\d{4}-\\d{2}-\\d{2}\\.xlsx$`));
    await expect(page.getByText(/^Downloaded /)).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "CPCB annual return" }).first()).toBeVisible();

    const pdf = await page.request.get(`${BASE}/reports/download?kind=annual-return&fy=${fy}&format=pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.headers()["x-report-sha256"]).toMatch(/^[0-9a-f]{64}$/);

    const bad = await page.request.get(`${BASE}/reports/download?kind=annual-return&fy=${fy}&format=csv`);
    expect(bad.status()).toBe(400);
    expect((await bad.json()).error).toBe("CPCB annual return is available as XLSX or PDF.");
  });

  test("certificate costs are left out for viewers", async ({ page }) => {
    const fy = previousFy();
    await login(page, "admin@demo.eprflow.in");
    const asAdmin = await (await page.request.get(`${BASE}/reports/download?kind=certificate-register&fy=${fy}&format=csv`)).text();
    expect(asAdmin.split("\n")[0]).toContain("Cost");

    await page.context().clearCookies();
    await login(page, "viewer@demo.eprflow.in");
    const res = await page.request.get(`${BASE}/reports/download?kind=certificate-register&fy=${fy}&format=csv`);
    expect(res.status()).toBe(200);
    const header = (await res.text()).split("\n")[0];
    expect(header).toContain("Certificate no.");
    expect(header).not.toContain("Cost");
  });

  test("reports of another organisation are not reachable", async ({ page }) => {
    await login(page, "viewer@demo.eprflow.in");
    const res = await page.request.get(`/o/greenpack-industries/reports/download?kind=annual-return&fy=${previousFy()}&format=pdf`);
    expect(res.status()).toBe(404);
  });
});

test.describe("compliance calendar", () => {
  test("statutory dates are generated; custom deadlines can be added, completed and deleted", async ({ page }) => {
    await login(page, "compliance@demo.eprflow.in");
    await page.goto(`${BASE}/calendar`);
    await expect(page.getByRole("heading", { name: "Compliance calendar" })).toBeVisible();
    await expect(page.getByText(/^Annual return — Plastic packaging, FY/).first()).toBeVisible();
    await expect(page.getByText("Placeholder filing dates")).toBeVisible();

    await page.getByRole("button", { name: "Add deadline" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Title").fill("");
    await dialog.getByRole("button", { name: "Add deadline" }).click();
    await expect(dialog.getByText("Title is required")).toBeVisible();

    const title = `E2E filing check ${Date.now()}`;
    const due = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    await dialog.getByLabel("Title").fill(title);
    await dialog.getByLabel("Due date").fill(due);
    await dialog.getByRole("button", { name: "Add deadline" }).click();
    await expect(page.getByText(`“${title}” added to the calendar.`)).toBeVisible();

    const item = page.getByRole("listitem").filter({ hasText: title });
    await expect(item.getByText(/Due soon · (9|10) days left/)).toBeVisible();
    await expect(item.getByText(/Next reminder .* to \d+ recipients?/)).toBeVisible();
    await expect(item.getByRole("link", { name: "Share on WhatsApp" })).toHaveAttribute("href", /^https:\/\/wa\.me\/\?text=/);

    await item.getByRole("button", { name: "Mark done" }).click();
    await expect(page.getByText(`“${title}” marked as done.`)).toBeVisible();
    const done = page.getByRole("listitem").filter({ hasText: title });
    await expect(done.getByRole("button", { name: "Reopen" })).toBeVisible();

    page.once("dialog", (d) => d.accept());
    await done.getByRole("button", { name: "Delete deadline" }).click();
    await expect(page.getByText("Deadline deleted.")).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: title })).toHaveCount(0);
  });

  test("viewers see the calendar but cannot change it", async ({ page }) => {
    await login(page, "viewer@demo.eprflow.in");
    await page.goto(`${BASE}/calendar`);
    await expect(page.getByRole("heading", { name: "Compliance calendar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add deadline" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Mark done" })).toHaveCount(0);
  });
});

test.describe("audit log", () => {
  test("filters by record type and exports the filtered view", async ({ page }) => {
    await login(page, "admin@demo.eprflow.in");
    await page.goto(`${BASE}/audit-log`);
    await page.getByRole("combobox", { name: "Record type" }).click();
    await page.getByRole("option", { name: "Membership" }).click();
    await expect(page).toHaveURL(/entity=Membership/);
    await expect(page.getByRole("cell", { name: "member.role_change" }).first()).toBeVisible();
    await expect(page.getByRole("cell", { name: "brand.create" })).toHaveCount(0);

    await page.getByText(/^\d+ fields?$/).first().click();
    await expect(page.locator("details[open] dt").first()).toBeVisible();

    const csv = await (await page.request.get(`${BASE}/audit-log/export?format=csv&entity=Membership`)).text();
    const lines = csv.trim().split("\n");
    expect(lines[0]).toContain("When (IST)");
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.slice(1).every((l) => l.includes("Membership"))).toBe(true);
  });

  test("is not available to viewers", async ({ page }) => {
    await login(page, "viewer@demo.eprflow.in");
    expect((await page.request.get(`${BASE}/audit-log/export?format=csv`)).status()).toBe(403);
  });
});

test.describe("daily job", () => {
  test("runs compliance, calendar and reminders with the cron secret", async ({ request }) => {
    test.skip(!process.env.CRON_SECRET, "CRON_SECRET is not set");
    test.setTimeout(180_000);
    const res = await request.get("/api/cron/compliance", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, timeout: 170_000 });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.failed).toEqual([]);
    expect(body.reminders).toMatchObject({ due: expect.any(Number), sent: expect.any(Number), cancelled: expect.any(Number) });
  });
});
