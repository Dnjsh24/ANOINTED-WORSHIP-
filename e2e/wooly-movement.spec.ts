import { expect, test } from "@playwright/test";
import { blockRemoteSupabase } from "./demo-network";

test("Wooly can be moved by pointer, keyboard, and tap controls", async ({ page }) => {
  test.setTimeout(120_000);
  test.skip(process.env.WOOLY_TUTORIAL_ENABLED !== "1", "Run in the dedicated Wooly-enabled CI step.");
  const blocked = await blockRemoteSupabase(page);
  await page.clock.install({ time: new Date("2026-01-01T00:00:00") });
  await page.setViewportSize({ width: 393, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dashboard");
  const launcher = page.getByRole("button", { name: "Wooly", exact: true });
  await expect(launcher).toBeVisible();
  const initial = await launcher.boundingBox();
  expect(initial).not.toBeNull();

  await launcher.focus();
  await launcher.press("Enter");
  await expect(page.getByRole("dialog", { name: "Help with Wooly" })).toBeVisible();
  const tapOrigin = await launcher.boundingBox();
  await page.getByRole("button", { name: "Move Wooly left" }).click();
  await expect.poll(async () => (await launcher.boundingBox())?.x).toBe(tapOrigin!.x - 16);
  await page.getByRole("button", { name: "Reset Wooly position" }).click();
  await expect.poll(async () => (await launcher.boundingBox())?.x).toBe(tapOrigin!.x);
  await page.getByRole("button", { name: "Close Wooly" }).click();
  await expect(page.getByRole("dialog", { name: "Help with Wooly" })).toHaveCount(0);
  const defaultAfterHelp = await launcher.boundingBox();
  await launcher.focus();
  await launcher.press("ArrowLeft");
  await expect.poll(async () => (await launcher.boundingBox())?.x).toBe(defaultAfterHelp!.x - 16);
  await launcher.press("Home");
  await expect.poll(async () => (await launcher.boundingBox())?.x).toBe(defaultAfterHelp!.x);

  await launcher.press("Enter");
  const moveLeft = page.getByRole("button", { name: "Move Wooly left" });
  const moveUp = page.getByRole("button", { name: "Move Wooly up" });
  for (let step = 0; step < 24; step += 1) {
    if ((await launcher.boundingBox())!.x <= 8) break;
    await moveLeft.click();
  }
  for (let step = 0; step < 50; step += 1) {
    if ((await launcher.boundingBox())!.y <= 8) break;
    await moveUp.click();
  }
  // Exercise the existing greeting reappearance after a long tap-only move.
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.getByRole("button", { name: "Close Wooly" }).click();
  const cornerGreeting = page.locator(".wooly-greeting");
  await expect(cornerGreeting).toBeVisible();
  await expect.poll(async () => {
    const bounds = await cornerGreeting.boundingBox();
    return bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 393 && bounds.y + bounds.height <= 844;
  }).toBe(true);
  const cornerGreetingBounds = await cornerGreeting.boundingBox();
  expect(cornerGreetingBounds!.x).toBeGreaterThanOrEqual(0);
  expect(cornerGreetingBounds!.y).toBeGreaterThanOrEqual(0);
  expect(cornerGreetingBounds!.x + cornerGreetingBounds!.width).toBeLessThanOrEqual(393);
  expect(cornerGreetingBounds!.y + cornerGreetingBounds!.height).toBeLessThanOrEqual(844);
  await launcher.focus();
  await launcher.press("Home");
  await expect.poll(async () => (await launcher.boundingBox())?.x).toBe(defaultAfterHelp!.x);

  const beforeDrag = await launcher.boundingBox();
  const startX = beforeDrag!.x + beforeDrag!.width / 2;
  const startY = beforeDrag!.y + beforeDrag!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX - 150, startY - 300, { steps: 8 });
  await page.mouse.up();
  const expectedDrag = { x: Math.max(8, beforeDrag!.x - 150), y: Math.max(8, beforeDrag!.y - 300) };
  await expect.poll(async () => {
    const bounds = await launcher.boundingBox();
    return bounds && { x: bounds.x, y: bounds.y };
  }).toEqual(expectedDrag);
  const afterDrag = await launcher.boundingBox();
  expect(afterDrag!.x).toBe(expectedDrag.x);
  expect(afterDrag!.y).toBe(expectedDrag.y);
  await expect(page.getByRole("dialog", { name: "Help with Wooly" })).toHaveCount(0);

  const greeting = page.locator(".wooly-greeting");
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect.poll(async () => {
    const bounds = await greeting.boundingBox();
    return bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 393 && bounds.y + bounds.height <= 844;
  }).toBe(true);
  const greetingBounds = await greeting.boundingBox();
  expect(greetingBounds).not.toBeNull();
  expect(greetingBounds!.x).toBeGreaterThanOrEqual(0);
  expect(greetingBounds!.y).toBeGreaterThanOrEqual(0);
  expect(greetingBounds!.x + greetingBounds!.width).toBeLessThanOrEqual(393);
  expect(greetingBounds!.y + greetingBounds!.height).toBeLessThanOrEqual(844);

  await page.setViewportSize({ width: 320, height: 480 });
  await expect.poll(async () => {
    const bounds = await launcher.boundingBox();
    return bounds && bounds.x >= 8 && bounds.y >= 8 && bounds.x + bounds.width <= 312 && bounds.y + bounds.height <= 472;
  }).toBe(true);
  const resizedBounds = await launcher.boundingBox();
  expect(resizedBounds!.x).toBeGreaterThanOrEqual(8);
  expect(resizedBounds!.y).toBeGreaterThanOrEqual(8);
  expect(resizedBounds!.x + resizedBounds!.width).toBeLessThanOrEqual(312);
  expect(resizedBounds!.y + resizedBounds!.height).toBeLessThanOrEqual(472);
  await page.setViewportSize({ width: 393, height: 844 });
  await expect.poll(async () => {
    const bounds = await launcher.boundingBox();
    return bounds && bounds.x >= 8 && bounds.y >= 8 && bounds.x + bounds.width <= 385 && bounds.y + bounds.height <= 836;
  }).toBe(true);
  const afterRestoreResize = await launcher.boundingBox();

  await page.getByRole("link", { name: "Setlists" }).first().click();
  await expect(page).toHaveURL(/\/setlists/);
  await expect.poll(async () => {
    const bounds = await launcher.boundingBox();
    return bounds && { x: bounds.x, y: bounds.y };
  }).toEqual({ x: afterRestoreResize!.x, y: afterRestoreResize!.y });
  const afterNavigation = await launcher.boundingBox();
  expect(afterNavigation!.x).toBe(afterRestoreResize!.x);
  expect(afterNavigation!.y).toBe(afterRestoreResize!.y);

  const browser = page.context().browser();
  if (browser?.browserType().name() === "chromium") {
    const session = await page.context().newCDPSession(page);
    const start = await launcher.boundingBox();
    const touchX = start!.x + start!.width / 2;
    const touchY = start!.y + start!.height / 2;
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: touchX, y: touchY, id: 7 }] });
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: touchX + 50, y: touchY, id: 7 }] });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await session.detach();
    await expect.poll(async () => (await launcher.boundingBox())?.x).toBe(afterNavigation!.x + 50);
    const afterTouch = await launcher.boundingBox();
    expect(afterTouch!.x).toBe(afterNavigation!.x + 50);
    await expect(page.getByRole("dialog", { name: "Help with Wooly" })).toHaveCount(0);
  }
  expect(blocked).toEqual([]);
});

test("Wooly stays hidden on landing and login pages", async ({ page }) => {
  test.skip(process.env.WOOLY_TUTORIAL_ENABLED !== "1", "Requires the enabled feature to verify public-page suppression.");
  const blocked = await blockRemoteSupabase(page);
  for (const path of ["/", "/login"]) {
    await page.goto(path);
    await expect(page.getByRole("link", { name: "Sign In", exact: true }).or(page.getByRole("button", { name: "Sign in with Google", exact: true }))).toBeVisible();
    await expect(page.getByRole("button", { name: "Wooly", exact: true })).toHaveCount(0);
    await expect(page.locator(".wooly-panel,.wooly-greeting")).toHaveCount(0);
  }
  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: "Wooly", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Wooly", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Help with Wooly" })).toBeVisible();
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Sign in with Google", exact: true })).toBeVisible();
  await expect(page.locator(".wooly-launcher,.wooly-panel,.wooly-greeting")).toHaveCount(0);
  expect(blocked).toEqual([]);
});
