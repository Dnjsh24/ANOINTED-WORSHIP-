import { expect, test } from "@playwright/test";

test("song search stays compact and preserves server filters", async ({ page }, testInfo) => {
  await page.goto("/songs");
  const search = page.getByRole("textbox", { name: "Search by title, artist, or tag" });
  const filters = page.getByRole("button", { name: "Toggle song filters" });
  await expect(search).toBeVisible();
  await expect(filters).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: "Apply filters" })).toBeHidden();
  await expect(page.getByRole("checkbox", { name: "Favorites only" })).toBeHidden();
  const topDifference = await page.evaluate(() => {
    const search = document.querySelector('[data-wooly-target="song-search"]');
    const filters = document.querySelector('[data-wooly-target="song-filters"]');
    if (!search || !filters) throw new Error("Search toolbar missing");
    return Math.abs(search.getBoundingClientRect().top - filters.getBoundingClientRect().top);
  });
  expect(topDifference).toBeLessThan(1);
  await page.screenshot({ path: testInfo.outputPath("songs-minimal.png"), animations: "disabled" });

  await search.fill("Opening");
  await search.press("Enter");
  await expect(page).toHaveURL(/q=Opening/);
  await expect(page.getByRole("link", { name: "Opening Song", exact: true })).toBeVisible();
  await filters.click();
  await expect(filters).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("combobox", { name: "Sort results" }).selectOption("playCount");
  await page.getByRole("checkbox", { name: "Favorites only" }).check();
  await filters.click();
  await expect(page.getByRole("checkbox", { name: "Favorites only" })).toBeHidden();
  await page.getByRole("button", { name: "Search songs", exact: true }).click();
  await expect(page).toHaveURL(/sort=playCount/);
  await expect(page).toHaveURL(/favorites=true/);
  await expect(search).toHaveValue("Opening");
  await filters.click();
  await expect(page.getByRole("checkbox", { name: "Favorites only" })).toBeChecked();
  await expect(page.getByRole("combobox", { name: "Sort results" })).toHaveValue("playCount");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("generate code matches copy code width", async ({ page }, testInfo) => {
  await page.goto("/admin/settings");
  const copy = page.getByRole("button", { name: "Copy Code", exact: true });
  const generate = page.getByRole("button", { name: "Generate new code", exact: true });
  await expect(copy).toBeVisible();
  await expect(generate).toBeVisible();
  const copyBounds = await copy.boundingBox();
  const generateBounds = await generate.boundingBox();
  expect(copyBounds).not.toBeNull();
  expect(generateBounds?.width).toBe(copyBounds?.width);
  expect(generateBounds?.x).toBe(copyBounds?.x);
  await copy.locator("xpath=../..").evaluate((card) => card.scrollIntoView({ block: "center" }));
  await copy.locator("xpath=../..").screenshot({ path: testInfo.outputPath("team-code-width.png"), animations: "disabled" });
});
