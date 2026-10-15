import { expect, test } from "@playwright/test";
import { blockRemoteSupabase } from "./demo-network";

test.beforeEach(async ({ page }) => { await blockRemoteSupabase(page); });

for (const mode of ["stage", "practice"] as const) {
  for (const width of [320, 1440]) {
    test(`${mode} floats section navigation at the bottom at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`/setlists/sunday-service/${mode}`);
      const navigation = page.getByRole("navigation", { name: "Song sections" });
      await expect(navigation).toBeVisible();
      await expect(navigation).toHaveCSS("position", "absolute");
      const bounds = await navigation.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      expect(bounds!.y).toBeGreaterThan(600);
      expect(bounds!.y + bounds!.height).toBeLessThan(844);
      await expect(page.locator('[data-wooly-target="practice-chart"]')).toHaveJSProperty("clientWidth", width);
      const chorus = navigation.getByRole("button", { name: "Jump to Chorus", exact: true }).first();
      await expect(chorus).toHaveText("Chorus");
      expect((await chorus.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await chorus.click();
      await expect(page.locator("#section-1")).toBeInViewport();
      await chorus.focus();
      await expect(chorus).toBeFocused();

      if (mode === "practice") {
        const annotations = page.getByRole("group", { name: "Practice annotations" });
        await expect(annotations).toBeVisible();
        const annotationBounds = await annotations.boundingBox();
        expect(bounds!.y + bounds!.height).toBeLessThan(annotationBounds!.y);
        await page.getByRole("button", { name: "Apple Pencil Annotations" }).click();
        await expect(page.getByLabel("Custom pen color")).toBeInViewport();
        expect(await page.getByLabel("Custom pen color").evaluate(element => {
          const rect = element.getBoundingClientRect();
          return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === element;
        })).toBe(true);
        await page.keyboard.press("Escape");
        await chorus.click();
      } else {
        await expect(page.getByRole("button", { name: "Add text note" })).toHaveCount(0);
      }
      await page.screenshot({ path: testInfo.outputPath(`${mode}-${width}-floating-navigation.png`) });
    });
  }
}
