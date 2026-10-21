import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("marketing pages", () => {
  test("landing page explains the product and shows the three plans", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/EPR compliance without the spreadsheets/);
    await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();
    for (const plan of ["Starter", "Growth", "Enterprise"]) {
      await expect(page.locator("#pricing").getByRole("heading", { name: plan, exact: true })).toBeVisible();
    }
    await expect(page.getByText("Most popular")).toBeVisible();
    await page.getByText("Is our data visible to other companies?").click();
    await expect(page.getByText(/never reveal who/)).toBeVisible();
  });

  test("pricing page compares plans", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByRole("heading", { name: "Pricing", level: 1 })).toBeVisible();
    const row = page.getByRole("row").filter({ hasText: "Consultant view across client companies" });
    await expect(row.getByLabel("Included", { exact: true })).toHaveCount(1);
    await expect(row.getByLabel("Not included", { exact: true })).toHaveCount(2);
    await expect(page).toHaveTitle("Pricing · EPRFlow");
  });
});

test.describe("consultant view", () => {
  test("a consultant sees every client, worst first, and can open one", async ({ page }) => {
    test.setTimeout(150_000);
    await login(page, "consultant@demo.eprflow.in");
    await page.locator("[data-sidebar=header] button").first().click();
    await page.getByRole("menuitem", { name: "All clients overview" }).click();
    await expect(page).toHaveURL(/\/consultant$/);
    await expect(page.getByRole("heading", { name: "All clients" })).toBeVisible({ timeout: 60_000 });
    const rows = page.getByRole("row").filter({ has: page.getByRole("link", { name: /Demo Consumer Goods|GreenPack Industries/ }) });
    await expect(rows).toHaveCount(2);
    await expect(page.getByText("Client companies")).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "Demo Consumer Goods" }).getByText(/to approve/)).toBeVisible();

    await page.getByRole("link", { name: "Open GreenPack Industries" }).click();
    await expect(page).toHaveURL(/\/o\/greenpack-industries\/dashboard/);
  });

  test("a single-company viewer sees only their company and no cost figures", async ({ page }) => {
    await login(page, "viewer@demo.eprflow.in");
    await page.goto("/consultant");
    await expect(page.getByRole("heading", { name: "All clients" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("link", { name: "Demo Consumer Goods", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "GreenPack Industries", exact: true })).toHaveCount(0);
    await expect(page.getByRole("cell", { name: "Hidden" })).toBeVisible();
  });

  test("signed-out visitors are sent to log in", async ({ page }) => {
    await page.goto("/consultant");
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fconsultant/);
  });
});
