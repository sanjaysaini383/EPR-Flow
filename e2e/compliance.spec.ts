import { expect, test } from "@playwright/test";
import { DEMO_ORG, login } from "./helpers";

const BASE = `/o/${DEMO_ORG}`;

test.describe("targets and dashboard", () => {
  test("targets page shows obligations, statuses and the placeholder-rule warning", async ({ page }) => {
    await login(page, "compliance@demo.eprflow.in");
    await page.goto(`${BASE}/targets`);
    await expect(page.getByRole("heading", { name: "EPR targets" })).toBeVisible();
    await expect(page.getByText("Placeholder regulation values")).toBeVisible();
    const details = page.getByRole("table").filter({ hasText: "Recycling min." });
    for (const cat of ["Category I", "Category II", "Category III"]) {
      await expect(details.getByRole("cell", { name: cat, exact: true })).toBeVisible();
    }
    await expect(page.getByText("Rules applied")).toBeVisible();

    // Previous year is closed: statuses are final.
    await page.getByRole("combobox", { name: "Financial year" }).click();
    await page.getByRole("option", { name: "FY 2025-26" }).click();
    await expect(page).toHaveURL(/fy=2025-26/);
    await expect(page.getByText(/^(Met|Shortfall)$/).first()).toBeVisible();
  });

  test("dashboard shows score, category progress, alerts and a chart with a table view", async ({ page }) => {
    await login(page, "compliance@demo.eprflow.in");
    await expect(page.getByText("Compliance score")).toBeVisible();
    await expect(page.getByText("Progress by category")).toBeVisible();
    await expect(page.getByText("Placed on market — last 12 months")).toBeVisible();
    await page.getByRole("button", { name: "Table" }).click();
    await expect(page.getByRole("columnheader", { name: "Total" })).toBeVisible();

    // Alerts are generated after the dashboard renders; reload to read them.
    await page.reload();
    await expect(page.getByText(/behind on Cat (II|III) target/).first()).toBeVisible();
  });

  test("alerts can be marked as read and the bell count clears", async ({ page }) => {
    await login(page, "compliance@demo.eprflow.in");
    await page.reload(); // ensure alerts exist
    await page.goto(`${BASE}/alerts`);
    await expect(page.getByRole("heading", { name: "Alerts" })).toBeVisible();
    const markAll = page.getByRole("button", { name: "Mark all as read" });
    if (await markAll.isVisible()) await markAll.click();
    await expect(page.getByRole("link", { name: "Alerts", exact: true }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Alerts, \d+ unread/ })).toHaveCount(0);
  });
});

test.describe("budgets and roles", () => {
  test("admin sets a budget; viewers cannot see costs", async ({ page }) => {
    await login(page, "admin@demo.eprflow.in");
    await page.goto(`${BASE}/settings/budgets`);
    await page.getByLabel("Budget (₹)").fill("abc");
    await page.getByRole("button", { name: "Save budget" }).click();
    await expect(page.getByText("Enter an amount in rupees, e.g. 1200000")).toBeVisible();
    await page.getByLabel("Budget (₹)").fill("4500000");
    await page.getByRole("button", { name: "Save budget" }).click();
    await expect(page.getByText(/Budget for FY .* saved/)).toBeVisible();

    await page.context().clearCookies();
    await login(page, "viewer@demo.eprflow.in");
    await page.goto(`${BASE}/settings/budgets`);
    await expect(page.getByText("Your role does not have access to cost information.")).toBeVisible();
  });
});

test.describe("platform admin", () => {
  test("rules can only be edited by platform admins, and edits create a new version", async ({ page }) => {
    await login(page, "admin@demo.eprflow.in");
    const res = await page.goto("/admin/rules");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    expect(res?.status()).toBe(404);

    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel("Work email").fill("ops@eprflow.in");
    await page.getByLabel("Password", { exact: true }).fill("Demo@12345");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/admin\/rules/);
    await expect(page.getByText(/rule\(s\) in force are unverified/)).toBeVisible();

    // A far-future rule, so the edit cannot change today's demo targets.
    const row = () => page.getByRole("row", { name: /Minimum recycling Category I FY 2028-29/ });
    await row().first().getByRole("button", { name: "Edit" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/Value/).fill("150");
    await dialog.getByRole("button", { name: /Save v\d+/ }).click();
    await expect(dialog.getByText("A percentage must be between 0 and 100")).toBeVisible();

    await dialog.getByLabel(/Value/).fill("80");
    await dialog.getByLabel("Notes").fill("e2e-test");
    await dialog.getByRole("button", { name: /Save v\d+/ }).click();
    await expect(row().filter({ hasText: "superseded" }).first()).toBeVisible();
  });
});

test.describe("cron endpoint", () => {
  test("rejects requests without the secret", async ({ request }) => {
    expect((await request.get("/api/cron/compliance")).status()).toBe(401);
    expect((await request.get("/api/cron/compliance", { headers: { authorization: "Bearer wrong" } })).status()).toBe(401);
  });
});
