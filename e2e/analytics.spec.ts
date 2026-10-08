import { expect, test, type Page } from "@playwright/test";
import { blockRemoteSupabase } from "./demo-network";

const blockedRequestsByPage = new WeakMap<Page, string[]>();
const runtimeErrorsByPage = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  blockedRequestsByPage.set(page, await blockRemoteSupabase(page));
  runtimeErrorsByPage.set(page, []);
  await page.route("https://fonts.googleapis.com/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/css", body: "" });
  });
  page.on("pageerror", (error) => runtimeErrorsByPage.get(page)?.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrorsByPage.get(page)?.push(`console: ${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 500) {
      runtimeErrorsByPage.get(page)?.push(`response ${response.status()}: ${response.url()}`);
    }
  });
});

test.afterEach(async ({ page }) => {
  expect(blockedRequestsByPage.get(page) ?? [], "demo analytics must not contact Supabase").toEqual([]);
  expect(runtimeErrorsByPage.get(page) ?? [], "analytics should not emit browser or server errors").toEqual([]);
});

test("Analytics shows its metrics, real date filtering, charts, and accessible data", async ({ page }, testInfo) => {
  await page.goto("/analytics");

  await expect(page.getByRole("heading", { level: 1, name: "Analytics" })).toBeVisible();
  await expect(page.getByText("Demo data")).toBeVisible();
  await expect(page.getByRole("region", { name: "Analytics summary" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Song Usage" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Attendance Trend" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Team Activity" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Channel Activity", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Availability by Event Type" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Website Totals" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Availability snapshot" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Recent activity breakdown by area" })).toBeVisible();
  const fonts = await page.locator("main > div").evaluate((element) => ({ page: getComputedStyle(element).fontFamily, body: getComputedStyle(document.body).fontFamily }));
  expect(fonts.page).toBe(fonts.body);

  await testInfo.attach("analytics-desktop.png", {
    body: await page.screenshot({ fullPage: true, animations: "disabled", path: testInfo.outputPath("analytics-enhanced.png") }),
    contentType: "image/png",
  });

  const topRotation = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Top rotation" }),
  });
  const originalRotation = await topRotation.locator("p").first().innerText();
  const end = await page.getByLabel("To", { exact: true }).inputValue();
  const startDate = new Date(end + "T00:00:00Z");
  startDate.setUTCDate(startDate.getUTCDate() - 6);
  const sevenDayStart = startDate.toISOString().slice(0, 10);

  await page.getByLabel("From", { exact: true }).fill(sevenDayStart);
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(new RegExp("start=" + sevenDayStart + ".*end=" + end));
  await expect(page.getByLabel("From", { exact: true })).toHaveValue(sevenDayStart);
  await expect(page.getByLabel("To", { exact: true })).toHaveValue(end);
  await expect(topRotation.locator("p").first()).not.toHaveText(originalRotation);

  await page.getByRole("link", { name: "30 days" }).click();
  const thirtyDayStart = new Date(end + "T00:00:00Z");
  thirtyDayStart.setUTCDate(thirtyDayStart.getUTCDate() - 29);
  await expect(page.getByLabel("From", { exact: true })).toHaveValue(thirtyDayStart.toISOString().slice(0, 10));
  await expect(page.getByLabel("To", { exact: true })).toHaveValue(end);

  const trendInterval = page.getByLabel("Trend interval");
  await trendInterval.selectOption("weekly");
  const trendDisclosure = page.locator("summary").filter({ hasText: "Attendance trend data" });
  await trendDisclosure.focus();
  await expect(trendDisclosure).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("table", { name: /Confirmed availability by week/ })).toBeVisible();
  await trendInterval.selectOption("daily");
  await expect(page.getByRole("table", { name: /Confirmed availability by day/ })).toBeVisible();

  const songLimit = page.getByLabel("Songs shown");
  await songLimit.selectOption("10");
  await expect(songLimit).toHaveValue("10");

  const channelFilter = page.getByLabel("Filter message volume by channel");
  const channelRows = page.getByRole("list", { name: "Message volume by channel" }).getByRole("listitem");
  await expect(channelRows).toHaveCount(2);
  const firstChannelValue = await channelFilter.locator("option").nth(1).getAttribute("value");
  if (firstChannelValue) {
    await channelFilter.selectOption(firstChannelValue);
    await expect(channelRows).toHaveCount(1);
  }
});

test("Analytics stays within mobile viewports and respects keyboard and reduced-motion preferences", async ({ page }, testInfo) => {
  await page.goto("/analytics");
  await expect(page.getByRole("heading", { level: 1, name: "Analytics" })).toBeVisible();

  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const measurements = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(measurements.scrollWidth, `analytics page should not create viewport-wide horizontal overflow at ${width}px`)
      .toBeLessThanOrEqual(measurements.clientWidth);
    await testInfo.attach(`analytics-${width}px.png`, {
      body: await page.screenshot({ fullPage: true, animations: "disabled", path: testInfo.outputPath("analytics-enhanced.png") }),
      contentType: "image/png",
    });
  }

  const dashboard = page.locator("main > div");
  const motionDurations = await Promise.all([
    dashboard.evaluate((element) => getComputedStyle(element).animationDuration),
    page.locator('[class*="barFill"]').first().evaluate((element) => getComputedStyle(element).animationDuration),
    page.locator('[class*="currentLine"]').first().evaluate((element) => getComputedStyle(element).animationDuration),
  ]);
  expect(motionDurations.map((duration) => Number.parseFloat(duration))).toEqual([0.36, 0.52, 0.7]);

  await page.emulateMedia({ reducedMotion: "reduce" });
  const animationNames = await Promise.all([
    dashboard.evaluate((element) => getComputedStyle(element).animationName),
    page.locator('[class*="barFill"]').first().evaluate((element) => getComputedStyle(element).animationName),
    page.locator('[class*="currentLine"]').first().evaluate((element) => getComputedStyle(element).animationName),
  ]);
  expect(animationNames).toEqual(["none", "none", "none"]);
  for (const selector of ['circle[class*="ringFill"]', '[class*="activityBreakdown"] li > div > span', '[class*="channelBarCurrent"]']) {
    const animations = await page.locator(selector).evaluateAll((elements) => elements.map((element) => getComputedStyle(element).animationName));
    expect(animations.every((name) => name === "none")).toBe(true);
  }

  const barScaleY = await page.locator('[class*="barFill"]').first().evaluate((element) => {
    const transform = getComputedStyle(element).transform;
    return transform === "none" ? 1 : new DOMMatrixReadOnly(transform).m22;
  });
  const lineDashOffset = await page.locator('[class*="currentLine"]').first().evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).strokeDashoffset),
  );
  expect(barScaleY, "reduced motion must leave song bars visible").toBe(1);
  expect(lineDashOffset, "reduced motion must leave the current trend line visible").toBe(0);
});
