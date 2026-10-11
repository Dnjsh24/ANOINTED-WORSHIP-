import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const forceDemo = process.env.E2E_FORCE_DEMO === "1";
const useProductionBuild = process.env.E2E_PRODUCTION_BUILD === "1";
// Public P-256 generator point: a deterministic test fixture, no private key.
const demoVapidPublicKey = "BGsX0fLhLEJH-Lzm5WOkQPJ3A32BLeszoPShOUXYmMKWT-NC4v4af5uO5-tKfA-eFivOM1drMV7Oy7ZAaDe_UfU";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  workers: 1,
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: useProductionBuild ? "npm run start" : "npm run dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          E2E_FORCE_DEMO: forceDemo ? "1" : "",
          NEXT_PUBLIC_E2E_FORCE_DEMO: forceDemo ? "1" : "",
          NEXT_PUBLIC_VAPID_PUBLIC_KEY: forceDemo ? demoVapidPublicKey : process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
        },
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "tablet",
      use: { ...devices["Desktop Chrome"], viewport: { width: 820, height: 1180 }, hasTouch: true },
      testMatch: /(?:responsive|website-smoke|security-accessibility)\.spec\.ts/,
    },
    {
      name: "iphone",
      use: { ...devices["iPhone 13"] },
      testMatch: /(?:responsive|website-smoke|security-accessibility)\.spec\.ts/,
    },
  ],
});
