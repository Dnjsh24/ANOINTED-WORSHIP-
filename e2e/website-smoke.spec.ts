import { expect, test } from "@playwright/test";
import { blockRemoteSupabase } from "./demo-network";

const websiteRoutes = [
  "/",
  "/login",
  "/teams",
  "/teams/new",
  "/teams/join",
  "/pending",
  "/dashboard",
  "/announcements",
  "/reminders",
  "/analytics",
  "/messages",
  "/dance",
  "/members",
  "/members/member-alex",
  "/members/requests",
  "/members/invite",
  "/admin/settings",
  "/events",
  "/events/new",
  "/events/event-sunday",
  "/events/event-sunday/edit",
  "/profile",
  "/songs",
  "/songs/new",
  "/songs/trash",
  "/songs/opening-song",
  "/songs/opening-song/edit",
  "/setlists",
  "/setlists/new",
  "/setlists/templates",
  "/setlists/sunday-service",
  "/setlists/sunday-service/edit",
  "/setlists/sunday-service/add-song",
  "/setlists/sunday-service/confidence",
  "/setlists/sunday-service/stage",
  "/setlists/sunday-service/presenter",
  "/setlists/sunday-service/projector",
] as const;

test("every website page renders without server or console errors", async ({ page }, testInfo) => {
  test.setTimeout(120_000);

  for (const route of websiteRoutes) {
    // Isolate routes so a fullscreen/presenter listener from one page cannot
    // affect the navigation lifecycle of the next page.
    const routePage = await page.context().newPage();
    const blockedSupabaseRequests = await blockRemoteSupabase(routePage);
    // The audit runner has no public-network access. Stub only the optional
    // Google Fonts stylesheet so blocked internet does not hide app failures.
    await routePage.route("https://fonts.googleapis.com/**", async (fontRoute) => {
      await fontRoute.fulfill({ status: 200, contentType: "text/css", body: "" });
    });
    const errors: string[] = [];
    const onConsole = (message: { type(): string; text(): string }) => {
      const text = message.text();
      if (message.type() === "error") {
        errors.push(`console: ${text}`);
      }
    };
    const onResponse = (response: { status(): number; url(): string }) => {
      if (response.status() >= 500) {
        errors.push(`response ${response.status()}: ${response.url()}`);
      }
    };

    routePage.on("console", onConsole);
    routePage.on("response", onResponse);

    const response = await routePage.goto(route, { waitUntil: "domcontentloaded" });
    await expect(routePage.locator("body"), `${route} should render visible content`).not.toBeEmpty();
    expect(response?.status(), `${route} should not return an error status`).toBeLessThan(400);

    routePage.off("console", onConsole);
    routePage.off("response", onResponse);
    await routePage.close();

    if (blockedSupabaseRequests.length > 0) {
      errors.push(
        ...blockedSupabaseRequests.map((url) => `blocked remote Supabase request: ${url}`),
      );
    }

    if (errors.length > 0) {
      await testInfo.attach(`errors-${route.replaceAll("/", "-") || "root"}`, {
        body: errors.join("\n"),
        contentType: "text/plain",
      });
    }
    expect(errors, `${route} emitted runtime errors`).toEqual([]);
  }
});

test("demo health endpoint reports ready", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ status: "ok" });
});
