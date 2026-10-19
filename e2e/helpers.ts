import { expect, type Page } from "@playwright/test";

export const DEMO_PASSWORD = "Demo@12345";
export const DEMO_ORG = "demo-consumer-goods";

export async function login(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/o\/[^/]+\/dashboard/);
}

/** Builds a GSTIN with a valid check digit (same algorithm as src/lib/domain/gstin.ts). */
export function makeGstin(stateGst: string, pan: string) {
  const charset = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const first14 = `${stateGst}${pan}1Z`;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = charset.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return first14 + charset[(36 - (sum % 36)) % 36];
}
