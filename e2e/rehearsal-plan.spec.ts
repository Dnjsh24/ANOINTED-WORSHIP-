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
  await expect(page.getByText("Open preparation tools", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Focus for Opening Song", { exact: true })).toBeVisible();
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

test("rehearsal fields open immediately, align, and include a song timer", async ({ page }, testInfo) => {
  const blocked = await blockRemoteSupabase(page);
  await page.goto("/setlists/youth-night/rehearsal");
  const focus = page.getByLabel("Focus for Demo Song One", { exact: true });
  const minutes = page.getByLabel("Minutes for Demo Song One", { exact: true });
  await expect(focus).toBeVisible();
  await expect(minutes).toBeVisible();
  await expect(page.getByText("Open preparation tools", { exact: true })).toHaveCount(0);
  const focusBox = await focus.boundingBox();
  const minutesBox = await minutes.boundingBox();
  expect(focusBox).not.toBeNull();
  expect(minutesBox).not.toBeNull();
  if ((page.viewportSize()?.width ?? 0) >= 640) {
    expect(Math.abs(focusBox!.y - minutesBox!.y)).toBeLessThan(2);
    expect(Math.abs(focusBox!.height - minutesBox!.height)).toBeLessThan(2);
  } else {
    expect(minutesBox!.y).toBeGreaterThan(focusBox!.y);
  }
  await focus.fill("Practice ending and cue the next song");
  await minutes.fill("1");
  const runThrough = page.getByRole("region", { name: "Rehearsal run-through" });
  await expect(runThrough.getByText("Focus: Practice ending and cue the next song")).toBeVisible();
  await expect(runThrough.getByRole("timer")).toHaveText("01:00");
  await runThrough.getByRole("button", { name: "Start timer" }).click();
  await expect(runThrough.getByRole("timer")).toHaveText("00:59");
  await runThrough.getByRole("button", { name: "Pause timer" }).click();
  await expect(runThrough.getByRole("button", { name: "Resume timer" })).toBeVisible();
  await runThrough.getByRole("button", { name: "Next song" }).click();
  await expect(runThrough.getByLabel("Rehearsing song")).toHaveValue("demo-song-two-slot");
  await expect(runThrough.getByRole("timer")).toHaveText("05:00");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("rehearsal-ready.png"), fullPage: true });
  expect(blocked).toEqual([]);
});
