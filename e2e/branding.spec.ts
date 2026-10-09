import { expect, test } from "@playwright/test";
import { blockRemoteSupabase } from "./demo-network";

test("dashboard shortcuts retain bare icons after a production build", async ({ page }) => {
  const blockedRequests = await blockRemoteSupabase(page);
  await page.goto("/dashboard");
  const shortcuts = page.locator("section").filter({ has: page.getByRole("heading", { name: "Quick Access", exact: true }) });
  await expect(shortcuts).toBeVisible();
  const icons = shortcuts.locator("a svg");
  expect(await icons.count()).toBeGreaterThan(0);
  for (const icon of await icons.all()) {
    expect(await icon.evaluate(element => getComputedStyle(element.parentElement!).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
    await icon.hover();
    expect(await icon.evaluate(element => getComputedStyle(element.parentElement!).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  }
  expect(blockedRequests).toEqual([]);
});

test("Sunday Setlist branding renders across public and team screens", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const blockedRequests = await blockRemoteSupabase(page);
  await page.route("https://fonts.googleapis.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/css", body: "" }),
  );

  for (const path of ["/", "/login", "/teams", "/teams/new", "/teams/join", "/pending", "/dashboard", "/worship-remote"]) {
    const response = await page.goto(path, { waitUntil: "networkidle" });
    expect(response?.status(), path).toBeLessThan(400);
    await expect(page).toHaveTitle(/Sunday Setlist/);
    await expect(page.locator("body")).not.toContainText("Anointed Worship");
    const logos = page.locator('img[src*="sunday-setlist"]:visible');
    if (path !== "/worship-remote") {
      await expect(logos.first()).toBeVisible();
      expect(await logos.count(), `${path} should show the selected brand`).toBeGreaterThan(0);
    }
    for (const logo of await logos.all()) {
      await expect(logo).toHaveAttribute("alt", /\S/);
      await expect.poll(() => logo.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${path} should fit the viewport`).toBe(true);
    if (path === "/" || path === "/dashboard") {
      if (path === "/") {
        await expect(page.locator('img[src*="sunday-setlist-banner"]')).toBeVisible();
      }
      await page.screenshot({ path: `docs/testing/sunday-setlist-${testInfo.project.name}-${path === "/" ? "home" : "dashboard"}.png`, fullPage: true, animations: "disabled" });
      if (path === "/dashboard" && testInfo.project.name === "chromium") {
        await page.setViewportSize({ width: 1024, height: 768 });
        for (const link of await page.locator('header a:visible').all()) {
          const bounds = await link.boundingBox();
          expect(bounds).not.toBeNull();
          expect(bounds!.x + bounds!.width, "tablet header links should remain on-screen").toBeLessThanOrEqual(1024);
        }
        await page.screenshot({ path: "docs/testing/sunday-setlist-tablet-dashboard.png", fullPage: true, animations: "disabled" });
      }
    }
  }
  expect(blockedRequests, "demo verification must not contact remote Supabase").toEqual([]);
});

test("metadata, manifest, and icon assets use the new brand", async ({ page, request }) => {
  await page.goto("/login");
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute("content", "Sunday Setlist");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/brand\/sunday-setlist-og\.png$/);
  const manifestResponse = await request.get("/manifest.json");
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest.name).toBe("Sunday Setlist");
  expect(manifest.short_name).toBe("Sunday Setlist");
  expect(manifest.start_url).toBe("/dashboard");
  expect(manifest.icons.some((icon: { purpose: string }) => icon.purpose === "maskable")).toBe(true);
  for (const icon of manifest.icons) {
    expect(icon.src).toContain("sunday-setlist");
    expect((await request.get(icon.src)).ok()).toBe(true);
  }
  for (const asset of ["/brand/sunday-setlist-logo.svg", "/brand/sunday-setlist-icon.svg", "/brand/sunday-setlist-banner.png", "/brand/sunday-setlist-og.png", "/favicon.ico"]) {
    expect((await request.get(asset)).ok(), asset).toBe(true);
  }
});
