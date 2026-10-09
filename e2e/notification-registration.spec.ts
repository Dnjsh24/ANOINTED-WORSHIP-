import { expect, test, type Page } from "@playwright/test";
import { blockRemoteSupabase } from "./demo-network";

async function installNotificationProvider(page: Page, failFirstSubscribe: boolean) {
  await page.addInitScript(({ failFirstSubscribe }) => {
    const readCount = (key: string) => Number(sessionStorage.getItem(key) || 0);
    let currentSubscription: object | null = null;
    const registration = {
      scope: location.origin + "/",
      active: { state: "activated" },
      waiting: null,
      installing: null,
      addEventListener() {},
      pushManager: {
        async getSubscription() { return currentSubscription; },
        async subscribe(options: { applicationServerKey: ArrayBuffer | Uint8Array }) {
          const count = readCount("push-subscribe-count") + 1;
          sessionStorage.setItem("push-subscribe-count", String(count));
          const key = new Uint8Array(options.applicationServerKey);
          sessionStorage.setItem("push-key-length", String(key.byteLength));
          if (failFirstSubscribe && count === 1) {
            throw new DOMException("Registration failed - push service error", "AbortError");
          }
          currentSubscription = {
            options: { applicationServerKey: key.buffer },
            async unsubscribe() { currentSubscription = null; return true; },
            toJSON() {
              return {
                endpoint: "https://push.example.test/device",
                expirationTime: null,
                keys: { p256dh: "p".repeat(87), auth: "a".repeat(22) },
              };
            },
          };
          return currentSubscription;
        },
      },
    };
    class NotificationProvider {
      static get permission() { return sessionStorage.getItem("push-permission") || "default"; }
      static async requestPermission() {
        sessionStorage.setItem("push-permission-count", String(readCount("push-permission-count") + 1));
        sessionStorage.setItem("push-permission", "granted");
        return "granted";
      }
    }
    Object.defineProperty(window, "Notification", { configurable: true, value: NotificationProvider });
    Object.defineProperty(window, "PushManager", { configurable: true, value: class {} });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        controller: registration.active,
        async register() { return registration; },
        ready: Promise.resolve(registration),
      },
    });
  }, { failFirstSubscribe });
}

test.beforeEach(async ({ page }) => {
  await blockRemoteSupabase(page);
  await page.route("https://fonts.googleapis.com/**", route => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
});

test("notification service failure remains retryable after permission grant and reload", async ({ page }) => {
  await installNotificationProvider(page, true);
  let saves = 0;
  await page.route("**/api/web-push/subscribe", route => {
    saves += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });
  await page.goto("/dashboard");
  const prompt = page.getByText("Enable ministry notifications?", { exact: true });
  await expect(prompt).toBeVisible();
  await page.getByRole("button", { name: /^Enable$/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: /browser.*push service/i })).toBeVisible();
  expect(saves).toBe(0);
  await page.reload();
  await expect(prompt).toBeVisible();
  await page.getByRole("button", { name: /^(Enable|Try again|Retry)$/ }).click();
  await expect(prompt).toHaveCount(0);
  expect(saves).toBe(1);
  expect(await page.evaluate(() => sessionStorage.getItem("push-permission-count"))).toBe("1");
  expect(await page.evaluate(() => sessionStorage.getItem("push-key-length"))).toBe("65");
});

test("notification save retry reuses the subscription and prevents duplicate enables", async ({ page }) => {
  await installNotificationProvider(page, false);
  let saves = 0;
  await page.route("**/api/web-push/subscribe", async route => {
    saves += 1;
    await new Promise(resolve => setTimeout(resolve, 300));
    await route.fulfill({ status: saves === 1 ? 500 : 200, contentType: "application/json", body: saves === 1 ? '{"error":"Could not save"}' : '{"ok":true}' });
  });
  await page.goto("/dashboard");
  const prompt = page.getByText("Enable ministry notifications?", { exact: true });
  const enable = page.getByRole("button", { name: /^Enable$/ });
  await expect(prompt).toBeVisible();
  await enable.evaluate(button => {
    if (!(button instanceof HTMLButtonElement)) throw new Error("Expected notification Enable button");
    button.click();
    button.click();
  });
  await expect(page.getByRole("button", { name: /Enabling/ })).toBeDisabled();
  await expect(page.getByRole("alert").filter({ hasText: /server could not save/i })).toBeVisible();
  expect(saves).toBe(1);
  await page.getByRole("button", { name: /^(Enable|Try again|Retry)$/ }).click();
  await expect(prompt).toHaveCount(0);
  expect(saves).toBe(2);
  expect(await page.evaluate(() => sessionStorage.getItem("push-subscribe-count"))).toBe("1");
});
