import { expect, test } from "@playwright/test";
import { blockRemoteSupabase } from "./demo-network";

test("Wooly stays available on Home and Setlists with current main behavior", async ({ page }) => {
  test.skip(process.env.WOOLY_TUTORIAL_ENABLED !== "1", "Run in the dedicated Wooly-enabled CI step.");
  const blocked = await blockRemoteSupabase(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dashboard");
  const launcher = page.getByRole("button", { name: "Wooly", exact: true });
  await expect(launcher).toBeVisible();
  await launcher.click();
  const help = page.getByRole("dialog", { name: "Help with Wooly", exact: true });
  await expect(help).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(help).not.toBeVisible();
  await expect(launcher).toBeFocused();

  await page.goto("/setlists/new");
  await expect(page.getByText("This is a standalone setlist.", { exact: false })).toBeVisible();
  await expect(launcher).toBeVisible();
  const bounds = await launcher.boundingBox();
  expect(bounds).not.toBeNull();
  const viewport = page.viewportSize()!;
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
  expect(blocked).toEqual([]);
});
