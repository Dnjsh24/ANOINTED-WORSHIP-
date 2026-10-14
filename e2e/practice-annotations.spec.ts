import { expect, test, type Page } from "@playwright/test";
import { blockRemoteSupabase } from "./demo-network";

test.beforeEach(async ({ page }) => { await blockRemoteSupabase(page); });

async function dragAcross(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, touch: boolean) {
  if (touch) {
    const session = await page.context().newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [to] });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await session.detach();
  } else {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
  }
}

test("Practice saves movable formatted text and drawings for read-only Stage", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/setlists/sunday-service/practice");
  await expect(page.getByRole("button", { name: "Add text note", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("minimal-annotation-dock.png") });
  await page.getByRole("button", { name: "Add text note" }).click();
  await page.getByRole("textbox", { name: "Text note 1" }).fill("Quiet intro · watch the leader");
  await page.getByLabel("Note font", { exact: true }).selectOption("serif");
  await page.getByLabel("Note font size", { exact: true }).selectOption("32");
  await page.getByRole("button", { name: "Text color: Sky", exact: true }).click();
  expect(await page.getByLabel("Custom text color").evaluate(element => {
    const box = element.getBoundingClientRect();
    return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === element;
  })).toBe(true);
  for (const name of ["Bold", "Italic", "Underline", "Strikethrough"]) await page.getByRole("button", { name, exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("text-color-controls.png") });
  const handle = page.getByRole("button", { name: "Move text note 1", exact: true });
  await handle.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("heading", { name: "Opening Song" })).toBeVisible();
  await page.getByRole("button", { name: "Done editing" }).click();
  const touch = testInfo.project.name === "mobile";
  {
    const before = await page.evaluate(() => JSON.parse(Object.entries(localStorage).find(([key]) => key.startsWith("chart-notes_"))![1])[0]);
    const bounds = await handle.boundingBox();
    await dragAcross(page, { x: bounds!.x + 20, y: bounds!.y + 20 }, { x: bounds!.x + 50, y: bounds!.y + 70 }, touch);
    await expect.poll(() => page.evaluate(() => JSON.parse(Object.entries(localStorage).find(([key]) => key.startsWith("chart-notes_"))![1])[0].y)).toBe(before.y + 50);
    await page.getByRole("button", { name: "Done editing" }).click();
  }
  await page.getByRole("button", { name: "Apple Pencil Annotations" }).click();
  await page.getByRole("button", { name: "Pen color: Mint", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("pen-color-controls.png") });
  const canvas = page.getByLabel("Saved chart drawing");
  const bounds = await canvas.boundingBox();
  const strokeX = Math.min(bounds!.width - 120, 400);
  await dragAcross(page, { x: bounds!.x + strokeX, y: bounds!.y + 55 }, { x: bounds!.x + strokeX + 100, y: bounds!.y + 85 }, touch);
  // Shrink and expand without clipping the underlying drawing.
  const originalViewport = page.viewportSize()!;
  await page.setViewportSize({ width: 320, height: 700 });
  await expect(page.locator('[data-wooly-target="practice-chart"]')).toHaveJSProperty("clientWidth", 256);
  await expect(page.getByLabel("Custom pen color")).toBeInViewport();
  expect(await page.getByLabel("Custom pen color").evaluate(element => {
    const box = element.getBoundingClientRect();
    return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === element;
  })).toBe(true);
  await page.setViewportSize(originalViewport);
  await expect.poll(() => canvas.evaluate((element, x) => {
    const context = (element as HTMLCanvasElement).getContext("2d")!;
    return Array.from(context.getImageData(x, 55, 120, 40).data).some((value, index) => index % 4 === 3 && value > 0);
  }, strokeX)).toBe(true);
  const saved = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("chart-")));
  expect(saved.some(([key]) => key.startsWith("chart-drawing_"))).toBe(true);
  await page.goto("/setlists/sunday-service/stage");
  await expect(page.getByRole("button", { name: "Apple Pencil Annotations" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add text note" })).toHaveCount(0);
  const note = page.getByLabel("Text note 1", { exact: true });
  await expect(note).toHaveText("Quiet intro · watch the leader");
  await expect(note.locator("..")).toHaveCSS("font-size", "32px");
  await expect(note.locator("..")).toHaveCSS("font-style", "italic");
  await expect(note.locator("..")).toHaveCSS("font-weight", "700");
  await expect(note.locator("..")).toHaveCSS("color", "rgb(56, 189, 248)");
  await expect.poll(() => canvas.evaluate((element, x) => {
    const context = (element as HTMLCanvasElement).getContext("2d")!;
    const pixels = context.getImageData(x, 55, 120, 40).data;
    return pixels.some((value, index) => index % 4 === 3 && value > 0 && pixels[index - 2] > pixels[index - 3] && pixels[index - 2] > pixels[index - 1]);
  }, strokeX)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("stage-saved-annotations.png") });
  await page.getByRole("button", { name: "Next song", exact: true }).click();
  await expect(page.getByLabel("Text note 1", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Previous song", exact: true }).click();
  await expect(page.getByLabel("Text note 1", { exact: true })).toHaveText("Quiet intro · watch the leader");
  await page.reload();
  await expect(page.getByLabel("Text note 1", { exact: true })).toHaveText("Quiet intro · watch the leader");
  expect(errors).toEqual([]);
});

test("saved rehearsal minutes appear for the selected Practice song in the right panel", async ({ page }, testInfo) => {
  await page.goto("/setlists/youth-night/rehearsal");
  await page.getByLabel("Minutes for Demo Song One", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Save rehearsal notes", exact: true }).click();
  await expect(page.getByText(/Demo rehearsal notes saved on this device/)).toBeVisible();
  await page.goto("/setlists/youth-night/practice");
  await page.getByRole("button", { name: "Practice & edit", exact: true }).click();
  const timer = page.getByRole("region", { name: "Demo Song One rehearsal timer" });
  await timer.scrollIntoViewIfNeeded();
  await expect(timer.getByRole("timer")).toHaveText("02:00");
  await timer.getByRole("button", { name: "Start timer", exact: true }).click();
  await expect(timer.getByRole("timer")).toHaveText("01:59");
  await page.getByRole("dialog", { name: "Practice & edit" }).getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Practice & edit" })).toHaveCount(0);
  await page.getByRole("button", { name: "Practice & edit", exact: true }).click();
  await timer.scrollIntoViewIfNeeded();
  await expect(timer.getByRole("button", { name: "Pause timer", exact: true })).toBeVisible();
  await expect(timer.getByRole("timer")).not.toHaveText("02:00");
  await timer.getByRole("button", { name: "Pause timer", exact: true }).click();
  await expect(timer.getByRole("button", { name: "Resume timer", exact: true })).toBeVisible();
  await timer.getByRole("button", { name: "Reset timer", exact: true }).click();
  await expect(timer.getByRole("timer")).toHaveText("02:00");
  await page.screenshot({ path: testInfo.outputPath("practice-right-panel-timer.png") });
  await page.getByLabel("Song", { exact: true }).selectOption("demo-song-two-slot");
  const nextTimer = page.getByRole("region", { name: "Demo Song Two rehearsal timer" });
  await nextTimer.scrollIntoViewIfNeeded();
  await expect(nextTimer.getByRole("timer")).toHaveText("05:00");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
