import { expect, test } from "@playwright/test";
import { blockRemoteSupabase } from "./demo-network";

const viewports = [
  { width: 320, height: 844 },
  { width: 344, height: 780 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 412, height: 915 },
  { width: 414, height: 896 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 844, height: 390 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

test("Home keeps long service content and actions within narrow viewports", async ({ page }) => {
  const blocked = await blockRemoteSupabase(page);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();

  const notificationsButton = page.getByRole("button", { name: "Open notifications" });
  await notificationsButton.click();
  await expect(notificationsButton).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("menu", { name: "Notifications" })).toBeVisible();
  await notificationsButton.click();
  await expect(notificationsButton).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("menu", { name: "Notifications" })).toHaveCount(0);
  expect(pageErrors).toEqual([]);

  const fixtures = await page.evaluate(() => {
    // DOM-only adversarial strings exercise valid 160-character fields; no account or server data is changed.
    const longName = "AnnualSundayWorshipServiceAndMusicMinistryPlanningCelebrationSetlist";
    const longEvent = "NextUpEventForTheEntireWorshipAndMusicMinistryPlanningTeam";
    const longSong = "CongregationalPraiseAndWorshipSongTitleForTheSundayService";
    const longAnnouncement = "AnnouncementHeadlineForTheEntireWorshipAndMusicMinistry";
    const longReminder = "RehearsalReminderForTheWholeMusicMinistryAndWorshipTeam";
    const longLocation = "MainSanctuaryAndCommunityWorshipCenterNorthCampus";
    const validCallTime = "4:30 PM";
    const longLeader = "JordanAndersonWorshipAndMusicMinistryCoordinator";
    const longTeam = "GraceCommunityChurchWorshipAndMusicMinistryTeam";

    const serviceTitle = document.querySelector("main h2");
    const eventLink = document.querySelector<HTMLElement>("main a.inline-flex[href^='/events/'] span");
    const songTitle = document.querySelector<HTMLElement>("main a[href^='/songs/'] span.flex-1");
    const announcementTitle = document.querySelector<HTMLElement>("main a[href='/announcements'].group p:first-of-type");
    const reminderTitle = document.querySelector<HTMLElement>("main a[href='/reminders'].group p:first-of-type");
    const welcome = document.querySelector<HTMLElement>("main section p.mt-1");
    const metadata = serviceTitle?.parentElement?.querySelectorAll<HTMLElement>(".mt-5.flex.flex-wrap > span > span.min-w-0");

    if (!serviceTitle || !eventLink || !songTitle || !announcementTitle || !reminderTitle || !welcome || !metadata || metadata.length < 3) {
      throw new Error("Expected Home service, event, song, announcement, reminder, metadata, and team content.");
    }

    serviceTitle.textContent = longName;
    eventLink.textContent = `Next up: ${longEvent}`;
    songTitle.textContent = longSong;
    announcementTitle.textContent = longAnnouncement;
    reminderTitle.textContent = longReminder;
    welcome.textContent = `Welcome back, worship team. Ready for ${longTeam} this week.`;
    metadata[0].textContent = longLocation;
    metadata[1].textContent = validCallTime;
    metadata[2].textContent = longLeader;

    return { longName, longEvent: `Next up: ${longEvent}`, longSong, longAnnouncement, longReminder, longLocation, validCallTime, longLeader, longTeam };
  });

  const serviceTitle = page.locator("main h2.break-words").first();
  const eventLink = page.locator("main a.inline-flex[href^='/events/'] span");
  const songTitle = page.locator("main a[href^='/songs/'] span.flex-1").first();
  const announcementTitle = page.locator("main a[href='/announcements'].group p:first-of-type").first();
  const reminderTitle = page.locator("main a[href='/reminders'].group p:first-of-type").first();
  const welcome = page.locator("main section p.mt-1").first();
  const metadata = serviceTitle.locator("xpath=..").locator(".mt-5.flex.flex-wrap > span > span.min-w-0");

  await expect(serviceTitle).toHaveText(fixtures.longName);
  await expect(eventLink).toHaveText(fixtures.longEvent);
  await expect(songTitle).toHaveText(fixtures.longSong);
  await expect(announcementTitle).toHaveText(fixtures.longAnnouncement);
  await expect(reminderTitle).toHaveText(fixtures.longReminder);
  await expect(welcome).toContainText(fixtures.longTeam);
  await expect(metadata.nth(0)).toHaveText(fixtures.longLocation);
  await expect(metadata.nth(1)).toHaveText(fixtures.validCallTime);
  await expect(metadata.nth(2)).toHaveText(fixtures.longLeader);

  const contentSelectors = ["main h2.break-words", "main a.inline-flex[href^='/events/'] span", "main a[href^='/songs/'] span.flex-1", "main a[href='/announcements'].group p:first-of-type", "main a[href='/reminders'].group p:first-of-type", "main section p.mt-1", "main h2.break-words ~ p", "main h2.break-words ~ div.mt-5 span > span.min-w-0"];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await expect.poll(async () => {
      const measurements = await Promise.all(contentSelectors.map(async (selector) => page.locator(selector).evaluateAll((elements) => elements.map((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const elementBounds = element.getBoundingClientRect();
        return {
          left: elementBounds.left,
          right: elementBounds.right,
          textRects: [...range.getClientRects()].map((rect) => ({ left: rect.left, right: rect.right })),
        };
      }))));
      const visibleText = measurements.flat();
      return visibleText.every((item) => item.textRects.length > 0
        && item.left >= -1
        && item.right <= viewport.width + 1
        && item.textRects.every((rect) => rect.left >= item.left - 1 && rect.right <= Math.min(item.right, viewport.width) + 1));
    }).toBe(true);


    const actionRects = await page.locator("main a[href^='/events/'], main a[href^='/setlists/'], main a[href='/messages']").evaluateAll((links) => links.map((link) => {
      const rect = link.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    }));
    expect(actionRects.length).toBeGreaterThan(0);
    expect(actionRects.every((rect) => rect.left >= -1 && rect.right <= viewport.width + 1)).toBe(true);
  }

  expect(pageErrors).toEqual([]);
  expect(blocked).toEqual([]);
});
