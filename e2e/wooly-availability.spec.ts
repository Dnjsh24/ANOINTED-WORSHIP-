import { expect, test } from "@playwright/test";
import { blockRemoteSupabase } from "./demo-network";

test("Wooly stays available on Home and Setlists with current main behavior", async ({ page }) => {
  test.skip(process.env.WOOLY_TUTORIAL_ENABLED !== "1", "Run in the dedicated Wooly-enabled CI step.");
  const blocked = await blockRemoteSupabase(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const viewportSizes = [
    { width: 320, height: 800 },
    { width: 390, height: 844 },
    { width: 393, height: 430 },
    { width: 430, height: 932 },
    { width: 844, height: 390 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
  ];

  for (const viewportSize of viewportSizes) {
    await page.setViewportSize(viewportSize);
    await page.goto("/dashboard");
    const launcher = page.getByRole("button", { name: "Wooly", exact: true });
    await expect(launcher).toBeVisible();
    const mobileNavigation = page.getByRole("navigation", { name: "Mobile bottom navigation" });
    if (viewportSize.width < 1024) {
      await expect(mobileNavigation).toBeVisible();
      const launcherBounds = await launcher.boundingBox();
      const navigationBounds = await mobileNavigation.boundingBox();
      expect(launcherBounds).not.toBeNull();
      expect(navigationBounds).not.toBeNull();
      expect(launcherBounds!.y + launcherBounds!.height).toBeLessThanOrEqual(navigationBounds!.y);
    } else {
      await expect(mobileNavigation).toBeHidden();
    }

    await launcher.focus();
    await launcher.press("Enter");
    const help = page.getByRole("dialog", { name: "Help with Wooly", exact: true });
    await expect(help).toBeVisible();
    const helpBounds = await help.boundingBox();
    expect(helpBounds).not.toBeNull();
    expect(helpBounds!.x).toBeGreaterThanOrEqual(0);
    expect(helpBounds!.y).toBeGreaterThanOrEqual(0);
    expect(helpBounds!.x + helpBounds!.width).toBeLessThanOrEqual(viewportSize.width);
    expect(helpBounds!.y + helpBounds!.height).toBeLessThanOrEqual(viewportSize.height);
    await page.keyboard.press("Escape");
    await expect(help).not.toBeVisible();
    await expect(launcher).toBeFocused();

    await page.goto("/setlists/new");
    await expect(page.getByText("This is a standalone setlist.", { exact: false })).toBeVisible();
    await expect(launcher).toBeVisible();
    const bounds = await launcher.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewportSize.width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewportSize.height);

    if ((viewportSize.width === 393 && viewportSize.height === 430) || (viewportSize.width === 844 && viewportSize.height === 390)) {
      await page.goto("/messages");
      await page.getByRole("button", { name: /Worship Team/ }).click();
      const composer = page.locator('[data-wooly-target="message-compose"]');
      const send = page.getByRole("button", { name: "Send message" });
      await expect(composer).toBeVisible();
      await composer.fill("Rehearsal notes");
      await expect(send).toBeVisible();
      await expect.poll(async () => {
        const sendBounds = await send.boundingBox();
        const launcherBounds = await launcher.boundingBox();
        if (!sendBounds || !launcherBounds || intersects(sendBounds, launcherBounds)) return false;
        const hitTarget = await page.evaluate(({ x, y }) => {
          const target = document.elementFromPoint(x, y)?.closest("button");
          return target?.getAttribute("aria-label");
        }, { x: sendBounds.x + sendBounds.width / 2, y: sendBounds.y + sendBounds.height / 2 });
        return hitTarget === "Send message";
      }).toBe(true);
      const composerBounds = await composer.boundingBox();
      const sendBounds = await send.boundingBox();
      const launcherBounds = await launcher.boundingBox();
      expect(composerBounds).not.toBeNull();
      expect(sendBounds).not.toBeNull();
      expect(launcherBounds).not.toBeNull();
      expect(intersects(sendBounds!, launcherBounds!)).toBe(false);
      const hitTarget = await page.evaluate(({ x, y }) => {
        const target = document.elementFromPoint(x, y)?.closest("button");
        return target?.getAttribute("aria-label");
      }, { x: sendBounds!.x + sendBounds!.width / 2, y: sendBounds!.y + sendBounds!.height / 2 });
      expect(hitTarget).toBe("Send message");
      expect(composerBounds!.y).toBeLessThan(sendBounds!.y + sendBounds!.height);
    }
  }

  expect(blocked).toEqual([]);
});

function intersects(first: { x: number; y: number; width: number; height: number }, second: { x: number; y: number; width: number; height: number }) {
  return first.x < second.x + second.width
    && first.x + first.width > second.x
    && first.y < second.y + second.height
    && first.y + first.height > second.y;
}
