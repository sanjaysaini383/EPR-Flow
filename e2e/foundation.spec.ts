import { expect, test } from "@playwright/test";
import { DEMO_ORG, login, makeGstin } from "./helpers";

test.describe("signup and onboarding", () => {
  test("a new user signs up, creates a company and lands on its dashboard", async ({ page }) => {
    const stamp = Date.now();
    const email = `e2e-${stamp}@example.com`;
    const company = `E2E Packaging ${stamp}`;

    await page.goto("/signup");
    await page.getByLabel("Full name").fill("E2E Tester");
    await page.getByLabel("Work email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("Sup3rSecretPass");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(/\/onboarding/);

    // Step 1 — schema validation runs before moving on
    await page.getByLabel("Company name").fill(company);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Select a state")).toBeVisible();
    await expect(page.getByText("Select at least one entity type")).toBeVisible();

    await page.getByRole("combobox", { name: "Head office state" }).click();
    await page.getByRole("option", { name: "Karnataka" }).click();
    await page.getByRole("checkbox", { name: /Brand Owner/ }).click();
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 2 — GSTIN
    await page.getByLabel("GSTIN").fill("29AAAAA0000A1Z0");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("GSTIN checksum does not match")).toBeVisible();
    const gstin = makeGstin("29", "AAACE1234K");
    await page.getByLabel("GSTIN").fill(gstin);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText(gstin)).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 3 — brands
    await page.getByLabel("Brand name").fill("Crunchy Co");
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Create company" }).click();

    await expect(page).toHaveURL(/\/o\/e2e-packaging-\d+\/dashboard/);
    await expect(page.getByText(company).first()).toBeVisible();

    // Audit trail recorded the creation
    await page.getByRole("link", { name: "Audit log" }).click();
    await expect(page.getByText("organization.create")).toBeVisible();

    // Tenant isolation: the demo org is invisible to this user
    const response = await page.goto(`/o/${DEMO_ORG}/dashboard`);
    expect(response?.status()).toBe(404);
  });
});

test.describe("roles and members", () => {
  test("an admin can invite a member and gets a shareable link", async ({ page }) => {
    await login(page, "admin@demo.eprflow.in");
    await page.goto(`/o/${DEMO_ORG}/settings/members`);
    await page.getByLabel("Email").fill(`invitee-${Date.now()}@example.com`);
    await page.getByRole("button", { name: "Send invite" }).click();
    await expect(page.getByText(/\/invite\//)).toBeVisible();
    await expect(page.getByText("Pending invitations")).toBeVisible();
  });

  test("a viewer cannot manage members or edit the organization", async ({ page }) => {
    await login(page, "viewer@demo.eprflow.in");
    await page.goto(`/o/${DEMO_ORG}/settings/members`);
    await expect(page.getByText("Invite a team member")).toHaveCount(0);
    await page.goto(`/o/${DEMO_ORG}/settings`);
    await expect(page.getByText("Only admins can edit organization details.")).toBeVisible();
  });

  test("unauthenticated visitors are sent to login", async ({ page }) => {
    await page.goto(`/o/${DEMO_ORG}/dashboard`);
    await expect(page).toHaveURL(/\/login/);
  });

  test("placeholder sections render and unknown sections 404", async ({ page }) => {
    await login(page, "compliance@demo.eprflow.in");
    await page.getByRole("link", { name: "Certificates" }).click();
    await expect(page.getByText("Coming in phase 4")).toBeVisible();
    // Streams behind the loading skeleton, so the status is 200 + noindex; the UI shows the 404.
    await page.goto(`/o/${DEMO_ORG}/not-a-section`);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });
});
