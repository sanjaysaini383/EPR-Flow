import { expect, test, type Page } from "@playwright/test";
import { DEMO_ORG, login } from "./helpers";

// The dev server runs with AI_PROVIDER=fake (playwright.config.ts): a deterministic
// stand-in for Claude, so these tests never call the paid API.
const BASE = `/o/${DEMO_ORG}`;
const pdf = (name: string) => ({ name, mimeType: "application/pdf", buffer: Buffer.from(`%PDF-1.4\n% ${name} ${Date.now()}\n%%EOF`) });

async function upload(page: Page, kind: "EPR certificate" | "Invoice", file: ReturnType<typeof pdf>) {
  await page.goto(`${BASE}/extractions`);
  await expect(page.getByRole("heading", { name: "AI extraction" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.getByText(kind, { exact: true }).click();
  await page.locator("#extract-file").setInputFiles(file);
  await page.getByRole("button", { name: "Read with AI" }).click();
  await expect(page).toHaveURL(/\/extractions\/[a-z0-9]{10,}$/, { timeout: 60_000 });
}

test.describe("AI extraction", () => {
  test("a certificate is read, checked side by side and saved as a draft with its file", async ({ page }) => {
    test.setTimeout(180_000);
    await login(page, "compliance@demo.eprflow.in");
    await upload(page, "EPR certificate", pdf("e2e-certificate.pdf"));

    await expect(page.getByText("Check before saving")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Low confidence: Transfer date \(30% sure\), Quantity \(62% sure\)/)).toBeVisible();
    await expect(page.getByText(/overwritten by hand/)).toBeVisible();
    await expect(page.locator("iframe[title^='Preview of']")).toBeVisible();
    await expect(page.getByLabel("Certificate number")).toHaveValue("EPR/KA-0177/2026/000519");
    await expect(page.getByRole("combobox", { name: "Recycler / processor" })).toHaveText(/GreenLoop Plastics LLP/);
    await expect(page.locator("#quantity")).toHaveValue("18500");

    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page).toHaveURL(/\/certificates\/[a-z0-9]{10,}$/, { timeout: 60_000 });
    await expect(page.getByRole("heading", { name: "EPR/KA-0177/2026/000519" })).toBeVisible();
    await expect(page.getByText("e2e-certificate.pdf")).toBeVisible();

    await page.goto(`${BASE}/extractions`);
    await expect(page.getByRole("row").filter({ hasText: "e2e-certificate.pdf" }).first().getByText("Approved")).toBeVisible();
  });

  test("invoice lines are reviewed and imported as material entries", async ({ page }) => {
    test.setTimeout(180_000);
    await login(page, "compliance@demo.eprflow.in");
    await upload(page, "Invoice", pdf("e2e-invoice.pdf"));

    await expect(page.getByText("Invoice PK/2026/0917 to Metro Retail Distributors")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByLabel("Plastic weight in kg for line 1")).toHaveValue("540");
    await expect(page.getByLabel("Plastic weight in kg for line 3")).toHaveValue("350");

    // A line without a category cannot be imported.
    await page.getByLabel("Plastic weight in kg for line 2").fill("");
    await page.getByRole("button", { name: "Import to materials" }).click();
    await expect(page.getByText("Enter the weight in kg")).toBeVisible();
    await page.getByLabel("Include line 2").click();
    await page.getByRole("button", { name: "Import to materials" }).click();

    await expect(page).toHaveURL(/\/materials\?source=AI_EXTRACTION/, { timeout: 60_000 });
    await expect(page.getByText("AI", { exact: true }).first()).toBeVisible();
  });

  test("viewers can see documents but not upload", async ({ page }) => {
    await login(page, "viewer@demo.eprflow.in");
    await page.goto(`${BASE}/extractions`);
    await expect(page.getByRole("heading", { name: "AI extraction" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Read with AI" })).toHaveCount(0);
  });
});
