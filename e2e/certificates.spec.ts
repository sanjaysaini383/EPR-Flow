import { expect, test, type Page } from "@playwright/test";
import { DEMO_ORG, login } from "./helpers";

const BASE = `/o/${DEMO_ORG}`;
const pdf = (text: string) => ({ name: "certificate.pdf", mimeType: "application/pdf", buffer: Buffer.from(`%PDF-1.4\n% ${text}\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF`) });

async function choose(page: Page, label: string | RegExp, option: string | RegExp) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option }).first().click();
}

test.describe("certificates", () => {
  test.describe.configure({ mode: "serial" });
  const number = `E2E-${Date.now()}`;
  let certificateUrl = "";

  test("a compliance manager adds a certificate with its PDF and submits it", async ({ page }) => {
    test.setTimeout(180_000); // first visits compile several routes in dev
    await login(page, "compliance@demo.eprflow.in");
    await page.goto(`${BASE}/certificates/new`);
    await expect(page.getByRole("heading", { name: "Add certificate" })).toBeVisible();
    await page.waitForLoadState("networkidle"); // hydrated, so the form submits through the action

    await page.getByRole("button", { name: "Submit for approval" }).click();
    await expect(page.getByText("Select the recycler")).toBeVisible();
    await expect(page.getByText("Enter the quantity", { exact: true })).toBeVisible();

    await page.getByLabel("Certificate number").fill(number);
    await choose(page, "Recycler / processor", /GreenLoop Plastics LLP/);
    await choose(page, "Category", /Category II/);
    const issued = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
    await page.getByLabel("Issue date").fill(issued);
    await page.locator("#quantity").fill("1");
    await choose(page, "Unit", "tonnes");
    await page.getByLabel("Amount paid (₹)").fill("12000");
    await expect(page.getByText("₹12.00 per kg")).toBeVisible();

    // A disguised file is refused by content, not name.
    await page.getByLabel("Certificate file").setInputFiles({ name: "scan.pdf", mimeType: "application/pdf", buffer: Buffer.from("<html><script>alert(1)</script></html>") });
    await page.getByRole("button", { name: "Submit for approval" }).click();
    await expect(page.getByText(/Upload a PDF, PNG or JPEG file/).first()).toBeVisible();

    await page.getByLabel("Certificate file").setInputFiles(pdf(number));
    await page.getByRole("button", { name: "Submit for approval" }).click();
    await expect(page).toHaveURL(/\/certificates\/(?!new$)[a-z0-9]{10,}$/, { timeout: 60_000 });
    certificateUrl = new URL(page.url()).pathname;
    await expect(page.getByRole("heading", { name: number })).toBeVisible();
    await expect(page.getByText("Awaiting approval").first()).toBeVisible();
    await expect(page.getByText("No open findings.")).toBeVisible();
    // Compliance managers cannot approve.
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);

    const href = await page.getByRole("link", { name: "Open" }).getAttribute("href");
    const file = await page.request.get(href!);
    expect(file.status()).toBe(200);
    expect(file.headers()["content-type"]).toBe("application/pdf");
    expect(file.headers()["x-content-type-options"]).toBe("nosniff");

    // The same file cannot be fetched through another organisation's URL.
    const foreign = await page.request.get(href!.replace(`/o/${DEMO_ORG}/`, "/o/greenpack-industries/"));
    expect(foreign.status()).toBe(404);
  });

  test("the same number cannot be entered twice in one organisation", async ({ page }) => {
    await login(page, "compliance@demo.eprflow.in");
    await page.goto(`${BASE}/certificates/new`);
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Certificate number").fill(number.toLowerCase());
    await choose(page, "Recycler / processor", /GreenLoop Plastics LLP/);
    await choose(page, "Category", /Category II/);
    await page.getByLabel("Issue date").fill(new Date(Date.now() - 86_400_000).toISOString().slice(0, 10));
    await page.locator("#quantity").fill("500");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText(/already recorded in your organisation/)).toBeVisible();
  });

  test("an admin approves it; it then counts towards the targets", async ({ page }) => {
    test.skip(!certificateUrl, "depends on the first test");
    await login(page, "admin@demo.eprflow.in");
    await page.goto(certificateUrl);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Certificate approved — it now counts towards your targets.")).toBeVisible();
    await expect(page.getByText("Approved by Asha Admin")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
  });

  test("a certificate claimed by another company is flagged and cannot be approved", async ({ page }) => {
    await login(page, "admin@demo.eprflow.in");
    await page.goto(`${BASE}/certificates?status=PENDING_APPROVAL`);
    await page.getByRole("link", { name: "EPR/MH-0412/2026/000777" }).click();
    await expect(page.getByText("Claimed elsewhere").first()).toBeVisible();
    await expect(page.getByText(/already been claimed elsewhere on EPRFlow/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve" })).toBeDisabled();
    await expect(page.getByText(/Approval is blocked until the high-severity flags/)).toBeVisible();
    // The message never names the other organisation.
    await expect(page.getByText("GreenPack")).toHaveCount(0);

    await page.getByRole("button", { name: "Dismiss" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Dismiss with note" }).click();
    await expect(dialog.getByText("Note is required")).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
  });

  test("a rejected certificate shows the reason; viewers only read", async ({ page }) => {
    await login(page, "viewer@demo.eprflow.in");
    await page.goto(`${BASE}/certificates?status=REJECTED`);
    await page.getByRole("link", { name: "EPR/WB-0031/2026/000903" }).click();
    await expect(page.getByText(/does not match the transfer on the CPCB portal/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);
    await page.goto(`${BASE}/certificates`);
    await expect(page.getByRole("link", { name: "Add certificate" })).toHaveCount(0);
    // Pages under /o stream a loading state first, so a not-found page arrives with status 200.
    await page.goto(`${BASE}/certificates/new`);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });
});

test.describe("recyclers", () => {
  test("directory shows verification, capacity and ratings; teams can add a private recycler", async ({ page }) => {
    await login(page, "compliance@demo.eprflow.in");
    await page.goto(`${BASE}/recyclers`);
    await expect(page.getByRole("heading", { name: "Recycler directory" })).toBeVisible();
    const row = page.getByRole("row").filter({ hasText: "GreenLoop Plastics LLP" });
    await expect(row.getByText("Verified")).toBeVisible();

    await page.getByRole("button", { name: "Add recycler" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Add recycler" }).click();
    await expect(dialog.getByText("Name is required")).toBeVisible();
    const name = `E2E Recycler ${Date.now()}`;
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByRole("combobox", { name: "State" }).click();
    await page.getByRole("option", { name: "Gujarat" }).click();
    await dialog.getByLabel("Contact phone").fill("12");
    await dialog.getByRole("button", { name: "Add recycler" }).click();
    await expect(dialog.getByText("Enter a 10-digit mobile or landline number")).toBeVisible();
    await dialog.getByLabel("Contact phone").fill("98250 12345");
    await dialog.getByRole("button", { name: "Add recycler" }).click();
    await expect(page.getByText(`${name} added.`, { exact: false })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: name }).getByText("Unverified")).toBeVisible();

    await page.getByRole("link", { name: "GreenLoop Plastics LLP" }).click();
    await expect(page.getByText(/Capacity — FY/)).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Certificates arrive within a week" })).toBeVisible();
    await page.getByRole("radio", { name: "5 stars" }).check({ force: true });
    await page.getByRole("button", { name: "Update rating" }).click();
    await expect(page.getByText("Thanks — your rating is saved.")).toBeVisible();
  });

  test("platform admins verify recyclers and set capacity", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Work email").fill("ops@eprflow.in");
    await page.getByLabel("Password", { exact: true }).fill("Demo@12345");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/admin\/rules/);
    await page.getByRole("link", { name: "Recyclers" }).click();
    await expect(page.getByRole("heading", { name: "Recycler directory" })).toBeVisible();
    const row = page.getByRole("row").filter({ hasText: "Shree Polymers Recycling" });
    await row.getByRole("button", { name: "Capacity" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Save capacity" }).click();
    await expect(dialog.getByText("Select a category")).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();

    // Organisations' admins cannot reach it.
    await page.context().clearCookies();
    await login(page, "admin@demo.eprflow.in");
    expect((await page.goto("/admin/recyclers"))?.status()).toBe(404);
  });
});
