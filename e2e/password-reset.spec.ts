import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Client } from "pg";

// The email itself is not readable from a test, so the test plants a known token
// (stored hashed, exactly as the app stores it) for the account it creates.
async function plantResetToken(email: string) {
  const token = randomBytes(32).toString("base64url");
  const client = new Client({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query(`SELECT id FROM "User" WHERE email = $1`, [email]);
    const identifier = `password-reset:${rows[0].id}`;
    await client.query(`DELETE FROM "VerificationToken" WHERE identifier = $1`, [identifier]);
    await client.query(`INSERT INTO "VerificationToken" (identifier, token, expires) VALUES ($1, $2, now() + interval '1 hour')`, [
      identifier,
      createHash("sha256").update(token).digest("hex"),
    ]);
  } finally {
    await client.end();
  }
  return token;
}

test("forgotten password: same answer for any email, one-time link, other sessions signed out", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const email = `e2e-reset-${Date.now()}@example.com`;
  const oldPassword = "Harbour-Lamp-2026";
  const newPassword = "Quiet-River-7781";

  // An existing session on "another device".
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Reset Tester");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(oldPassword);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 60_000 });

  const other = await browser.newContext();
  const p = await other.newPage();
  await p.goto("/login");
  await p.getByRole("link", { name: "Forgot password?" }).click();
  await expect(p.getByText("Reset your password", { exact: true })).toBeVisible();
  await p.waitForLoadState("networkidle");
  await p.getByRole("button", { name: "Send reset link" }).click();
  await expect(p.getByLabel("Work email")).toHaveAttribute("aria-invalid", "true");
  await p.getByLabel("Work email").fill(`nobody-${Date.now()}@example.com`);
  await p.getByRole("button", { name: "Send reset link" }).click();
  const generic = /If an account exists for this email, a link to reset the password is on its way/;
  await expect(p.getByText(generic)).toBeVisible();

  const token = await plantResetToken(email);
  await p.goto(`/reset-password?token=${token}`);
  await p.waitForLoadState("networkidle");
  await p.getByLabel("New password").fill("short");
  await p.getByRole("button", { name: "Set new password" }).click();
  await expect(p.getByLabel("New password")).toHaveAttribute("aria-invalid", "true");
  await p.getByLabel("New password").fill(newPassword);
  await p.getByRole("button", { name: "Set new password" }).click();
  await expect(p).toHaveURL(/\/login\?reset=1/, { timeout: 60_000 });
  await expect(p.getByText("Your password was changed. Log in with the new one.")).toBeVisible();

  // The link works only once.
  await p.goto(`/reset-password?token=${token}`);
  await p.waitForLoadState("networkidle");
  await p.getByLabel("New password").fill("Another-Strong-9911");
  await p.getByRole("button", { name: "Set new password" }).click();
  await expect(p.getByText("This reset link is invalid or has expired. Request a new one.")).toBeVisible();

  // The session that existed before the reset is no longer valid.
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/login/, { timeout: 60_000 });

  // The old password fails; the new one works.
  await p.goto("/login");
  await p.getByLabel("Work email").fill(email);
  await p.getByLabel("Password", { exact: true }).fill(oldPassword);
  await p.getByRole("button", { name: "Log in" }).click();
  await expect(p.getByText("Incorrect email or password.")).toBeVisible();
  await p.getByLabel("Password", { exact: true }).fill(newPassword);
  await p.getByRole("button", { name: "Log in" }).click();
  await expect(p).toHaveURL(/\/onboarding/, { timeout: 60_000 });
  await other.close();
});
