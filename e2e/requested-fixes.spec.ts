import { expect, test } from "@playwright/test";
import { blockRemoteSupabase } from "./demo-network";

test.beforeEach(async ({ page }) => { await blockRemoteSupabase(page); });

test("demo sign-in explains missing configuration without a document reload", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /Google/ })).toBeVisible();
  const documentRequests: string[] = [];
  page.on("request", request => { if (request.isNavigationRequest() && request.resourceType() === "document") documentRequests.push(request.url()); });
  await page.getByRole("button", { name: /Google/ }).click();
  await expect(page).toHaveURL(/\/login\?error=config$/);
  await expect(page.getByText(/Sign-in is not configured yet/)).toBeVisible();
  expect(documentRequests).toHaveLength(0);
});

test("Practice beside Stage supports rehearsal controls, progress and a team plan download", async ({ page }) => {
  await page.route("https://www.youtube.com/embed/**", route => route.fulfill({ status: 200, contentType: "text/html", body: "Reference player" }));
  await page.goto("/setlists/sunday-service");
  await expect(page.getByRole("link", { name: "Stage", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Practice", exact: true }).click();
  await expect(page).toHaveURL(/\/setlists\/sunday-service\/practice$/);
  await expect(page.getByText("Song 1 of", { exact: false })).toBeVisible();
  const first = await page.getByLabel("Song", { exact: true }).inputValue();
  await expect(page.getByRole("button", { name: "Previous song" })).toBeDisabled();
  await page.getByRole("button", { name: "Mark as practiced" }).click();
  await expect(page.getByRole("progressbar", { name: "Setlist practice progress" })).toHaveAttribute("value", "1");
  await page.getByLabel("Practice time signature").selectOption("6/8");
  await expect(page.getByText("6/8 meter · beat 1 of 6")).toBeVisible();
  await page.getByRole("button", { name: "Lyrics", exact: true }).click();
  await page.getByRole("button", { name: "Chords", exact: true }).click();
  await page.getByRole("button", { name: "Start metronome" }).click();
  await expect(page.getByRole("button", { name: "Stop metronome" })).toBeVisible();
  await page.getByRole("button", { name: "Start auto-scroll" }).click();
  await page.getByRole("button", { name: "Next song" }).click();
  await expect(page.getByLabel("Song", { exact: true })).not.toHaveValue(first);
  await expect(page.getByRole("button", { name: "Start metronome" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start auto-scroll" })).toBeVisible();
  await page.getByLabel("Song", { exact: true }).selectOption(first);
  await expect(page.getByRole("button", { name: "Practiced", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByText("Open preparation tools", { exact: true }).click();
  const prep = page.getByRole("region", { name: "Rehearsal and service preparation" });
  const minutes = prep.getByRole("spinbutton").first();
  await minutes.fill("12");
  await prep.getByRole("textbox").first().fill("Work on opening transitions");
  await prep.getByLabel("Tune instruments and check cables").check();
  await expect(prep.getByRole("status")).toContainText("1 of 10 preparation checks");
  const downloadPromise = page.waitForEvent("download");
  await prep.getByRole("button", { name: "Download rehearsal plan" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("rehearsal-plan.txt");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const plan = Buffer.concat(chunks).toString("utf8");
  expect(plan).toContain("Work on opening transitions");
  expect(plan).toContain("12 rehearsal min");
  expect(plan).toContain("[x] Tune instruments and check cables");
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto("/setlists/midweek-prayer/practice");
  await page.getByText("Open preparation tools", { exact: true }).click();
  await expect(page.getByLabel("Tune instruments and check cables")).not.toBeChecked();
  await expect(page.getByRole("progressbar", { name: "Setlist practice progress" })).toHaveAttribute("value", "0");
});

test("regular workspace pages skip presentation fonts, presenter retains them", async ({ page }) => {
  const fontRequests: string[] = [];
  await page.route("https://fonts.googleapis.com/**", async route => {
    fontRequests.push(route.request().url());
    await route.fulfill({ status: 200, contentType: "text/css", body: "" });
  });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Quick Access" })).toBeVisible();
  expect(fontRequests).toHaveLength(0);
  await page.goto("/presenter");
  await expect.poll(() => fontRequests.length).toBe(1);
  expect(fontRequests[0]).toContain("family=Inter");
});

test("loaded chat opens without another server render", async ({ page }) => {
  await page.goto("/messages");
  await expect(page.getByRole("button", { name: /Worship Team/ })).toBeVisible();
  const renders: string[] = [];
  await page.route(url => url.pathname === "/messages" && url.searchParams.has("channel") && url.searchParams.has("_rsc"), async route => {
    renders.push(route.request().url());
    await new Promise(resolve => setTimeout(resolve, 800));
    await route.continue();
  });
  const started = Date.now();
  await page.getByRole("button", { name: /Worship Team/ }).click();
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();
  console.log(`Loaded chat opened in ${Date.now() - started} ms; channel server renders: ${renders.length}`);
  expect(renders).toHaveLength(0);
});

test("messages opens chats first and browser history restores selection", async ({ page }) => {
  await page.goto("/messages");
  await expect(page.getByRole("heading", { name: "Messages", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send message" })).toHaveCount(0);
  await page.getByRole("button", { name: /Worship Team/ }).click();
  await expect(page).toHaveURL(/\/messages\?channel=/);
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/messages$/);
  await expect(page.getByRole("button", { name: "Send message" })).toHaveCount(0);
  await page.goForward();
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();
  await page.getByRole("button", { name: "Back to chats" }).click();
  await expect(page).toHaveURL(/\/messages$/);
  await expect(page.getByRole("heading", { name: "Messages", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/messages$/);
  await expect(page.getByRole("button", { name: "Send message" })).toHaveCount(0);
  await page.goto("/messages?channel=missing");
  await expect(page.getByRole("button", { name: "Send message" })).toHaveCount(0);
});

test("Quick Access icons have transparent backgrounds", async ({ page }) => {
  await page.goto("/dashboard");
  const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "Quick Access" }) });
  await expect(section).toBeVisible();
  const icons = section.locator("a > span:first-child");
  expect(await icons.count()).toBeGreaterThan(0);
  for (const icon of await icons.all()) {
    await expect(icon).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  }
  await section.locator("a").first().hover();
  await expect(icons.first()).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
});

test("team usage shows honest unavailable data and validates UTC dates", async ({ page }) => {
  for (const route of ["/members", "/analytics"]) {
    await page.goto(route);
    const usage = page.getByRole("region", { name: "Member app usage" });
    await expect(usage).toBeVisible();
    await expect(usage.getByText(/Demo usage is not recorded/)).toBeVisible();
    await usage.getByLabel("From (UTC)").fill("2026-10-05");
    await usage.getByLabel("Through (UTC)").fill("2026-10-01");
    await expect(usage.getByRole("button", { name: "Load usage" })).toHaveCount(0);
    await expect(usage.getByRole("alert")).toContainText("Choose valid UTC dates in order");
    if (route === "/members") {
      await expect(page.getByText("Online", { exact: true })).toHaveCount(0);
      expect(await page.getByText("Last seen unavailable", { exact: true }).count()).toBeGreaterThan(0);
    }
  }
});

for (const route of ["/setlists/new", "/setlists/sunday-service/edit"]) {
  test(`touch and mouse dragging adds a song on ${route}`, async ({ page, isMobile }) => {
    await page.goto(route);
    await expect(page.getByRole("heading", { name: "Song Library", exact: true })).toBeVisible();
    await page.waitForLoadState("networkidle");
    if (route.endsWith("/edit")) await page.getByRole("button", { name: "Remove song" }).first().click();
    const originalIds = await page.locator('input[name="songIds"]').evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value));
    const handle = page.getByRole("button", { name: /^Drag / });
    const candidates = await handle.all();
    let chosen = candidates[0];
    for (const candidate of candidates) {
      const title = (await candidate.getAttribute("aria-label"))!.replace(/^Drag /, "");
      if (await page.getByRole("button", { name: `Add ${title}`, exact: true }).isEnabled()) { chosen = candidate; break; }
    }
    await chosen.evaluate(element => element.scrollIntoView({ block: "center" }));
    const sourceCardBox = await chosen.locator("..").boundingBox();
    const preview = page.locator("div.cursor-grabbing");
    // use the dashed drop area itself, independent of selected rows
    const target = page.locator('[class*="border-dashed"]').first();
    const sourceBox = await chosen.boundingBox();
    const targetBox = await target.boundingBox();
    expect(sourceBox).not.toBeNull();
    expect(targetBox).not.toBeNull();
    const start = { x: sourceBox!.x + sourceBox!.width / 2, y: sourceBox!.y + sourceBox!.height / 2 };
    const end = { x: targetBox!.x + targetBox!.width / 2, y: Math.max(20, targetBox!.y + 25) };
    if (isMobile) {
      const session = await page.context().newCDPSession(page);
      await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
      await page.waitForTimeout(250);
      await expect(chosen).toHaveAttribute("aria-pressed", "true");
      // Holding must show the preview on its source row, not above the finger.
      await expect(preview).toBeVisible();
      const previewBox = await preview.boundingBox();
      expect(Math.abs(previewBox!.y - sourceCardBox!.y)).toBeLessThan(3);
      expect(Math.abs(previewBox!.x - sourceCardBox!.x)).toBeLessThan(3);
      // Drag toward the upper edge until the stacked drop zone scrolls into view.
      let visibleTarget = await target.boundingBox();
      if (visibleTarget && visibleTarget.y + visibleTarget.height < 100) {
        for (let step = 1; step <= 12; step++) {
          await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: start.x, y: start.y + (35 - start.y) * step / 12 }] });
          await page.waitForTimeout(25);
        }
        for (let attempt = 0; attempt < 15; attempt++) {
          await page.waitForTimeout(200);
          visibleTarget = await target.boundingBox();
          if (visibleTarget && visibleTarget.y + visibleTarget.height > 260) break;
        }
      }
      visibleTarget = await target.boundingBox();
      end.x = visibleTarget!.x + visibleTarget!.width / 2;
      end.y = Math.min(page.viewportSize()!.height - 150, Math.max(150, visibleTarget!.y + visibleTarget!.height / 2));
      for (let step = 1; step <= 12; step++) {
        await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: start.x + (end.x - start.x) * step / 12, y: start.y + (end.y - start.y) * step / 12 }] });
        await page.waitForTimeout(25);
      }
      const settledTarget = await target.boundingBox();
      const dropPoint = { x: settledTarget!.x + settledTarget!.width / 2, y: Math.min(page.viewportSize()!.height - 150, Math.max(150, settledTarget!.y + settledTarget!.height / 2)) };
      await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [dropPoint] });
      // Page auto-scroll must not change the preview's offset from the finger.
      await expect.poll(async () => {
        const movedPreview = await preview.boundingBox();
        return Math.abs(movedPreview!.y + start.y - sourceCardBox!.y - dropPoint.y);
      }).toBeLessThan(3);
      await expect(target).toHaveClass(/border-violet-500/);
      await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await session.detach();
    } else {
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 12 });
      await page.mouse.up();
    }
    await expect(preview).toHaveCount(0);
    await expect(page.locator('input[name="songIds"]')).toHaveCount(originalIds.length + 1);
    const currentIds = await page.locator('input[name="songIds"]').evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value));
    expect(new Set(currentIds).size).toBe(currentIds.length);
    for (const id of originalIds) expect(currentIds).toContain(id);
  });
}

test("song selection supports cancellation and keyboard Add", async ({ page, isMobile }) => {
  await page.goto("/setlists/new");
  await expect(page.getByRole("button", { name: "Drag Opening Song" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  const handle = page.getByRole("button", { name: "Drag Opening Song" });
  await handle.evaluate(element => element.scrollIntoView({ block: "center" }));
  if (isMobile) {
    const session = await page.context().newCDPSession(page);
    const box = await handle.boundingBox();
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box!.x + 22, y: box!.y + 22 }] });
    await expect(handle).toHaveAttribute("aria-pressed", "true");
    await session.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    await expect(handle).not.toHaveAttribute("aria-pressed", "true");
    await session.detach();
  } else {
    await handle.focus();
    await page.keyboard.press("Space");
    await expect(handle).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(handle).not.toHaveAttribute("aria-pressed", "true");
  }
  await expect(page.locator('input[name="songIds"]')).toHaveCount(0);
  // Dnd-kit keeps its click suppression listener briefly after touch cancellation.
  if (isMobile) await page.waitForTimeout(100);
  const add = page.getByRole("button", { name: "Add Opening Song", exact: true });
  await add.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('input[name="songIds"]')).toHaveCount(1);
});

test("website links preserve their origin through Back and Forward", async ({ page }) => {
  test.setTimeout(120_000);
  const journeys = [
    ["/dashboard", "/announcements"], ["/dashboard", "/reminders"],
    ["/dashboard", "/songs/opening-song"], ["/dashboard", "/worship-remote"],
    ["/songs", "/songs/new"], ["/songs/opening-song", "/songs/opening-song/edit"],
    ["/setlists/sunday-service", "/setlists/sunday-service/edit"],
    ["/setlists/sunday-service", "/setlists/sunday-service/add-song"],
    ["/events", "/events/new"], ["/events/event-sunday", "/events/event-sunday/edit"],
    ["/members", "/members/invite"], ["/members/member-alex", "/members"],
  ];
  for (const [origin, destination] of journeys) {
    await page.goto(origin);
    await page.waitForLoadState("networkidle");
    const link = page.locator(`a[href="${destination}"]:visible`).first();
    await link.evaluate(element => element.scrollIntoView({ block: "center" }));
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${destination.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
    await page.waitForLoadState("networkidle");
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
    await page.waitForLoadState("networkidle");
    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`${destination.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
    await page.waitForLoadState("networkidle");
  }
});
