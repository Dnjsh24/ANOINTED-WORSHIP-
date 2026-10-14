import { expect, test } from "@playwright/test";
import { blockRemoteSupabase } from "./demo-network";

test("chooses a Timeline event below Notes and restores standalone without losing the draft", async ({ page }) => {
  const remoteRequests = await blockRemoteSupabase(page);
  await page.goto("/setlists/new");
  const notes = page.getByRole("textbox", { name: "Notes (Optional)" });
  const dropdown = page.getByRole("combobox", { name: "Timeline event (Optional)" });
  await expect(dropdown).toHaveValue("");
  await page.getByRole("textbox", { name: "Setlist Name *" }).fill("Our new setlist");
  await notes.fill("Rehearse the transitions");
  await dropdown.scrollIntoViewIfNeeded();
  const notesBox = await notes.boundingBox();
  const dropdownBox = await dropdown.boundingBox();
  expect(dropdownBox!.y).toBeGreaterThanOrEqual(notesBox!.y + notesBox!.height);
  await dropdown.focus();
  await expect(dropdown).toBeFocused();
  const eventId = await dropdown.locator("option").nth(1).getAttribute("value");
  expect(eventId).toBeTruthy();
  await dropdown.selectOption(eventId!);
  await expect(page.getByText(/Saving will add this setlist to the selected event/)).toBeVisible();
  await expect(page.locator('input[name="eventId"]')).toHaveValue(eventId!);
  await dropdown.selectOption("");
  await expect(page.locator('input[name="eventId"]')).toHaveCount(0);
  await expect(notes).toHaveValue("Rehearse the transitions");
  await expect(page.getByRole("textbox", { name: "Setlist Name *" })).toHaveValue("Our new setlist");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(remoteRequests).toEqual([]);
});

test("preselects a Timeline event and allows switching to standalone", async ({ page }) => {
  await blockRemoteSupabase(page);
  await page.goto("/setlists/new?eventId=event-prayer");
  const dropdown = page.getByRole("combobox", { name: "Timeline event (Optional)" });
  await expect(dropdown).toHaveValue("event-prayer");
  await dropdown.selectOption("");
  await expect(page.locator('input[name="eventId"]')).toHaveCount(0);
});
