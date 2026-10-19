import { expect, test } from "@playwright/test";
import { DEMO_ORG, login } from "./helpers";

test.describe("theme", () => {
  test("user can switch between dark and light mode and it persists", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Change theme" }).click();
    await page.getByRole("menuitem", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);

    await page.getByRole("button", { name: "Change theme" }).click();
    await page.getByRole("menuitem", { name: "Light" }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });
});

test.describe("clear errors", () => {
  test("login shows a clear message for wrong credentials and empty fields", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText("Email is required")).toBeVisible();
    await expect(page.getByText("Password is required")).toBeVisible();
    await expect(page.getByLabel("Work email")).toHaveAttribute("aria-invalid", "true");

    await page.getByLabel("Work email").fill("e2e-nobody@example.com");
    await page.getByLabel("Password", { exact: true }).fill("WrongPassword1");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Incorrect email or password." })).toBeVisible();
  });

  test("signup explains password rules and keeps typed values after an error", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Full name").fill("E2E Tester");
    await page.getByLabel("Work email").fill(`e2e-${Date.now()}@example.com`);
    await page.getByLabel("Password", { exact: true }).fill("password1234");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("This password is too common — choose another")).toBeVisible();
    await expect(page.getByLabel("Full name")).toHaveValue("E2E Tester");
  });

  test("unknown pages show a friendly 404", async ({ page }) => {
    await page.goto("/this-page-does-not-exist");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });
});

test.describe("security", () => {
  test("responses carry security headers and a per-request CSP nonce", async ({ request }) => {
    const first = await request.get("/login");
    const headers = first.headers();
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["x-powered-by"]).toBeUndefined();
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");

    const nonce = (h: string) => /'nonce-([^']+)'/.exec(h)?.[1];
    const second = await request.get("/login");
    expect(nonce(headers["content-security-policy"])).not.toBe(nonce(second.headers()["content-security-policy"]));
  });

  test("signed-out visitors are redirected to login with a return path", async ({ page }) => {
    await page.goto(`/o/${DEMO_ORG}/settings/members`);
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fo%2Fdemo-consumer-goods%2Fsettings%2Fmembers/);
  });

  test("open redirects are blocked after login", async ({ page }) => {
    await page.goto("/login?callbackUrl=//evil.example.com");
    await page.getByLabel("Work email").fill("compliance@demo.eprflow.in");
    await page.getByLabel("Password", { exact: true }).fill("Demo@12345");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/localhost:3000\/o\//);
  });

  test("viewers cannot reach admin-only actions even by URL", async ({ page }) => {
    await login(page, "viewer@demo.eprflow.in");
    await page.goto(`/o/${DEMO_ORG}/audit-log`);
    await expect(page.getByText("Your role does not have access to the audit log.")).toBeVisible();
  });
});
