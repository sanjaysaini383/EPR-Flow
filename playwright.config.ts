import { defineConfig, devices } from "@playwright/test";

// Next 16 allows one dev server per project, so reuse the normal dev port.
const PORT = 3000;

export default defineConfig({
  testDir: "e2e",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: false,
  workers: 1, // one dev server compiling on demand: parallel workers just time out
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 90_000,
  expect: { timeout: 20_000 }, // dev server compiles routes on first visit
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { APP_URL: `http://localhost:${PORT}`, AUTH_URL: `http://localhost:${PORT}`, E2E_RATE_LIMIT_MULTIPLIER: "20", AI_PROVIDER: "fake" },
  },
});
