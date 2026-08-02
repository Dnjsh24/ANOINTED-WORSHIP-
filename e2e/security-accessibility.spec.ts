import { expect, test, type Page } from "@playwright/test";
import { blockRemoteSupabase } from "./demo-network";

const blockedSupabaseRequests = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  blockedSupabaseRequests.set(page, await blockRemoteSupabase(page));
});

test.afterEach(async ({ page }) => {
  expect(
    blockedSupabaseRequests.get(page) ?? [],
    "security journeys must not contact remote Supabase",
  ).toEqual([]);
});

test("responses carry a nonce CSP and production security headers", async ({ request }) => {
  const response = await request.get("/login");
  expect(response.status()).toBe(200);

  const csp = response.headers()["content-security-policy"] ?? "";
  const scriptDirective = csp.split(";").find((directive) => directive.trim().startsWith("script-src")) ?? "";
  expect(scriptDirective).toMatch(/script-src[^;]*'nonce-[^']+'/);
  expect(scriptDirective).not.toContain("'strict-dynamic'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain(
    "frame-src https://open.spotify.com https://www.youtube.com https://www.youtube-nocookie.com",
  );
  expect(scriptDirective).not.toContain("'unsafe-inline'");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
});

test("approved Spotify and YouTube embeds pass the browser CSP", async ({ page }) => {
  const requestedFrames: string[] = [];
  const policyErrors: string[] = [];

  page.on("request", (request) => {
    if (request.resourceType() === "document") requestedFrames.push(request.url());
  });
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("frame-src")) {
      policyErrors.push(message.text());
    }
  });
  await page.route("https://open.spotify.com/embed/track/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/html", body: "Spotify player" });
  });
  await page.route("https://www.youtube.com/embed/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/html", body: "YouTube player" });
  });

  await page.goto("/login");
  await page.evaluate(() => {
    for (const [title, src] of [
      ["Spotify test player", "https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC"],
      ["YouTube test player", "https://www.youtube.com/embed/dQw4w9WgXcQ"],
    ]) {
      const iframe = document.createElement("iframe");
      iframe.title = title;
      iframe.src = src;
      document.body.append(iframe);
    }
  });

  await expect.poll(() => requestedFrames).toEqual(expect.arrayContaining([
    "https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC",
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
  ]));
  expect(policyErrors).toEqual([]);
});

test("authenticated pages never enter the service-worker cache", async ({ page }) => {
  await page.goto("/login");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();

  const cachedPaths = await page.evaluate(async () => {
    const paths: string[] = [];
    for (const cacheName of await caches.keys()) {
      const cache = await caches.open(cacheName);
      for (const request of await cache.keys()) {
        paths.push(new URL(request.url).pathname);
      }
    }
    return paths;
  });

  expect(cachedPaths).not.toContain("/dashboard");
  expect(cachedPaths).not.toContain("/messages");
  expect(cachedPaths.some((path) => path === "/" || path === "/login")).toBe(true);
});

test("member dialog traps focus, closes with Escape, and restores focus", async ({ page }) => {
  await page.goto("/members");
  const trigger = page.getByRole("button", { name: "View Alex Morgan" });
  await trigger.focus();
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "Alex Morgan" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(":focus")).toHaveCount(1);

  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("critical pages reflow at 320 CSS pixels and allow browser zoom", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });

  for (const route of ["/login", "/dashboard", "/worship-remote", "/members", "/setlists", "/messages"]) {
    await page.goto(route);
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      viewport: document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? "",
    }));
    expect(dimensions.scrollWidth, `${route} must not overflow at 320px`).toBeLessThanOrEqual(
      dimensions.clientWidth + 1,
    );
    expect(dimensions.viewport).not.toMatch(/user-scalable\s*=\s*no/i);
    expect(dimensions.viewport).not.toMatch(/maximum-scale\s*=\s*1(?:\.0+)?(?:,|$)/i);
  }
});
