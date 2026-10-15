import { expect, test } from "@playwright/test";
import { blockRemoteSupabase } from "./demo-network";

for (const mode of ["practice", "stage"]) {
  test(`${mode} keeps long lyrics and chords readable with vertical scrolling only`, async ({ page }, testInfo) => {
    const blockedRequests = await blockRemoteSupabase(page);
    await page.goto(`/setlists/sunday-service/${mode}`);
    await expect(page.getByRole("heading", { name: "Opening Song" })).toBeVisible();
    const chart = page.locator('[data-wooly-target="practice-chart"]');
    const controls = page.locator('[data-wooly-target="stage-controls"]');
    await expect.poll(() => chart.getByLabel("Saved chart drawing").evaluate(element => (element as HTMLCanvasElement).width))
      .toBeGreaterThanOrEqual(page.viewportSize()!.width);

    for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      for (const scale of [100, 180]) {
        if (scale === 180) {
          for (let step = 0; step < 8; step++) await page.getByTitle("Increase Font", { exact: true }).click();
        }

        // Stress the real rendered rows without changing demo data or layout classes.
        await chart.locator(".mx-auto").evaluate(content => {
          for (const chord of content.querySelectorAll(".font-mono")) chord.textContent = "D/F#          G          D/F#          G          A";
          for (const lyric of content.querySelectorAll(".font-semibold")) lyric.textContent = "Ako’y lumalapit at sumasamo’ng palakasin ako. " + "Maglilingkod".repeat(12);
        });

        const errors = await chart.evaluate(element => {
          const bounds = element.getBoundingClientRect();
          const failures: string[] = [];
          if (element.scrollWidth > element.clientWidth) failures.push("chart overflows horizontally");
          const content = element.querySelector(".mx-auto")!;
          const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            for (const match of (node.textContent ?? "").matchAll(/\S+/g)) {
              const range = document.createRange();
              range.setStart(node, match.index);
              range.setEnd(node, match.index + match[0].length);
              for (const rect of range.getClientRects()) {
                if (rect.left < bounds.left - 1 || rect.right > bounds.right + 1) failures.push(`clipped text: ${match[0]}`);
              }
            }
          }
          for (const row of [element, ...content.querySelectorAll<HTMLElement>("div")]) {
            row.scrollLeft = 999;
            if (row.scrollLeft !== 0) failures.push("a lyric/chord row scrolls horizontally");
          }
          element.scrollTop = element.scrollHeight;
          if (element.scrollTop <= 0) failures.push("chart cannot scroll vertically");
          element.scrollTop = 0;
          return failures;
        });
        expect(errors, `${mode} ${viewport.width}px ${scale}%`).toEqual([]);
        expect(await controls.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (viewport.width === 390 && scale === 180) await page.screenshot({ path: testInfo.outputPath(`${mode}-390-large-text.png`) });
        if (scale === 180) {
          for (let step = 0; step < 8; step++) await page.getByTitle("Decrease Font", { exact: true }).click();
        }
      }
    }
    expect(blockedRequests, "demo layout checks must not contact hosted Supabase").toEqual([]);
  });
}
