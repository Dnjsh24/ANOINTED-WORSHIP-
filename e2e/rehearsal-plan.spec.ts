import { expect, test } from "@playwright/test";
import { blockRemoteSupabase } from "./demo-network";

test("setlist opens a dedicated rehearsal plan and returns to song order", async ({ page }) => {
  const blocked = await blockRemoteSupabase(page);
  await page.goto("/setlists/sunday-service");
  await expect(page.getByRole("region", { name: "Shared rehearsal preparation" })).toHaveCount(0);
  await page.getByRole("link", { name: "Team rehearsal plan", exact: true }).click();
  await expect(page).toHaveURL(/\/setlists\/sunday-service\/rehearsal$/);
  await expect(page.getByRole("heading", { name: "Team rehearsal plan", level: 1 })).toBeVisible();
  await expect(page.getByText("Demo plan:", { exact: false })).toBeVisible();
  await page.getByText("Open preparation tools", { exact: true }).click();
  await page.getByLabel("Focus for Opening Song", { exact: true }).fill("Practice the intro");
  await page.getByLabel("Minutes for Opening Song", { exact: true }).fill("12");
  await page.getByRole("checkbox", { name: "Tune instruments and check cables" }).check();
  const downloadReady = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download rehearsal plan" }).click();
  expect((await downloadReady).suggestedFilename()).toBe("rehearsal-plan.txt");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("link", { name: "Back to setlist", exact: true }).click();
  await expect(page).toHaveURL(/\/setlists\/sunday-service$/);
  await expect(page.getByRole("heading", { name: "Song Order" })).toBeVisible();
  expect(blocked).toEqual([]);
});
