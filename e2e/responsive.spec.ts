import { expect, test } from "@playwright/test";
import { blockRemoteSupabase } from "./demo-network";

test.beforeEach(async ({ page }) => { await blockRemoteSupabase(page); });

test("navigation fits phone, tablet, landscape and laptop widths", async ({ page }) => {
  test.setTimeout(120_000);
  for (const width of [320, 393, 768, 820, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: width < 768 ? 740 : 900 });
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
    const mobile = page.getByRole("navigation", { name: "Mobile bottom navigation" });
    const desktop = page.getByRole("navigation", { name: "Primary", exact: true });
    if (width < 1024) {
      await expect(mobile).toBeVisible();
      await expect(desktop).toBeHidden();
      const trigger = page.getByRole("button", { name: "Expand navigation" });
      await trigger.click();
      const drawer = page.getByRole("dialog", { name: /More/ });
      await expect(drawer).toBeVisible();
      await expect(drawer.getByRole("link", { name: "Analytics", exact: true })).toBeVisible();
      await expect(drawer.getByRole("link", { name: "Profile", exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(drawer).toBeHidden();
      await expect(trigger).toBeFocused();
    } else {
      await expect(desktop).toBeVisible();
      await expect(mobile).toBeHidden();
    }
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(dimensions.scroll, `navigation at ${width}px`).toBeLessThanOrEqual(dimensions.width + 1);
  }
});

test("More drawer traps focus and restores it without exposing closed links", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 740 });
  await page.goto("/dashboard");
  const trigger = page.getByRole("button", { name: "Expand navigation" });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  const drawer = page.getByRole("dialog", { name: /More/ });
  for (let index = 0; index < 15; index += 1) {
    await page.keyboard.press("Tab");
    expect(await drawer.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("dialog", { name: /More/ })).toHaveCount(0);
});

test("song controls remain touch-sized and fit a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/songs/opening-song");
  for (const name of ["Lower song key", "Raise song key", "Transpose down", "Transpose up"]) {
    const control = page.getByRole("button", { name, exact: true });
    await expect(control).toBeVisible();
    const bounds = await control.boundingBox();
    expect(bounds?.width, name).toBeGreaterThanOrEqual(44);
    expect(bounds?.height, name).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test("resizing an open tablet drawer restores desktop scroll and keyboard navigation", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 900 });
  await page.goto("/dashboard");
  const overflow = await page.evaluate(() => document.body.style.overflow);
  await page.getByRole("button", { name: "Expand navigation" }).click();
  await expect(page.getByRole("dialog", { name: /More/ })).toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByRole("dialog", { name: /More/ })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe(overflow);
  const navigation = page.getByRole("navigation", { name: "Primary", exact: true });
  await expect(navigation.getByRole("link").first()).toBeFocused();
  const nextLink = navigation.getByRole("link").nth(1);
  const href = await nextLink.getAttribute("href");
  await nextLink.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`${href}$`));
});

test("conversation composer stays reachable in short landscape and keyboard-sized viewports", async ({ page }) => {
  for (const viewport of [{ width: 740, height: 360 }, { width: 393, height: 430 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/messages");
    const conversation = page.getByRole("button", { name: /Worship Team/ });
    await conversation.click();
    const composer = page.locator('input[name="body"]');
    await expect(composer).toBeVisible();
    await composer.focus();
    const bounds = await composer.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height - 60);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  }
});
