import { expect, test } from "@playwright/test";

test("landing page routes into login and team onboarding", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Empower Your Worship Ministry" })).toBeVisible();
  await page.getByRole("link", { name: /Get Started with Google/i }).click();
  await expect(page.getByRole("heading", { name: "Welcome Back" })).toBeVisible();
});

test("team join flow requires sign-in before pending approval", async ({ page }) => {
  await page.goto("/teams");
  await expect(page.getByRole("heading", { name: "Welcome to Anointed Worship" })).toBeVisible();
  await page.getByRole("button", { name: /Join Existing/i }).click();
  await expect(page.getByRole("heading", { name: "Welcome Back" })).toBeVisible();

  await page.goto("/pending");
  await expect(page.getByRole("heading", { name: "Request Sent!" })).toBeVisible();
});

test("home and setlist screens render core workflow", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  await expect(page.getByText(/Welcome back, David/i)).toBeVisible();
  await page.getByRole("link", { name: "Lion and the Lamb B 90 BPM" }).click();
  await expect(page.getByRole("heading", { name: "Lion and the Lamb" })).toBeVisible();
});

test("desktop uses top navigation with Home before Setlists", async ({ page, isMobile }) => {
  test.skip(isMobile, "Desktop navigation is replaced by the mobile icon rail.");

  await page.goto("/messages");
  const primaryNav = page.getByRole("navigation", { name: "Primary" });

  await expect(primaryNav.getByRole("link", { name: "Home" })).toBeVisible();
  await expect(primaryNav.getByRole("link", { name: "Setlists" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Dashboard" })).toHaveCount(0);

  const navLabels = await primaryNav.getByRole("link").allTextContents();
  expect(navLabels.slice(0, 2)).toEqual(["Home", "Setlists"]);
});

test("mobile icon rail expands to show navigation labels", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Mobile rail only renders below the desktop breakpoint.");

  await page.goto("/dashboard");
  const mobileNav = page.getByRole("navigation", { name: "Mobile" });
  await expect(mobileNav).toBeVisible();
  await page.getByRole("button", { name: "Expand navigation" }).click();
  await expect(mobileNav.getByText("Setlists")).toBeVisible();
  await mobileNav.getByRole("link", { name: "Setlists" }).click();
  await expect(page.getByRole("heading", { name: "Setlists" })).toBeVisible();
});

test("song viewer can transpose and switch to Nashville numbers", async ({ page }) => {
  await page.goto("/songs/how-great-is-our-god");
  await expect(page.getByRole("heading", { name: "How Great Is Our God" })).toBeVisible();
  await page.getByLabel("Key").selectOption("A");
  await expect(page.getByText("A Em").or(page.getByText("A F#m")).first()).toBeVisible();
  await page.getByRole("button", { name: "Chord Mode" }).click();
  await expect(page.getByRole("button", { name: "Numbers On" })).toBeVisible();
});

test("member management shows approval controls", async ({ page }) => {
  await page.goto("/members");
  await expect(page.getByRole("heading", { name: "Member Management" })).toBeVisible();
  await expect(page.getByLabel("Approve Sarah Jenkins")).toBeVisible();
  await expect(page.getByText("AW-92841")).toBeVisible();
});

test("global shell opens notifications and settings", async ({ page, isMobile }) => {
  test.skip(isMobile, "Desktop shell icon buttons are hidden on mobile.");

  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Open notifications" }).click();
  await expect(page.getByRole("menu", { name: "Notifications" })).toBeVisible();
  await page.getByRole("link", { name: /Attendance reminder/i }).click();
  await expect(page.getByRole("heading", { name: "Events & Rehearsal" })).toBeVisible();

  await page.goto("/dashboard");
  await page.getByRole("link", { name: "Open settings" }).click();
  await expect(page.getByRole("heading", { name: "Team Controls" })).toBeVisible();
});

test("setlists page filters and exposes create/edit flows", async ({ page }) => {
  await page.goto("/setlists");
  await page.getByPlaceholder("Search setlists...").fill("Youth");
  await expect(page.getByRole("link", { name: "Youth Night", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sunday Service", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Filters" }).click();
  await page.getByRole("button", { name: "Past" }).click();
  await expect(page.getByText("No setlists match these filters.")).toBeVisible();

  await page.getByRole("link", { name: /New Setlist/i }).click();
  await expect(page.getByRole("heading", { name: "New Setlist" })).toBeVisible();
});

test("setlist detail actions have real targets", async ({ page }) => {
  await page.goto("/setlists/sunday-service");
  await page.getByRole("link", { name: "Edit Details" }).click();
  await expect(page.getByRole("heading", { name: "Edit Setlist" })).toBeVisible();

  await page.goto("/setlists/sunday-service");
  await page.getByRole("button", { name: "Share" }).click();
  await expect(page.getByText(/Share link copied|Share link ready/i)).toBeVisible();
  await page.getByRole("button", { name: "Maybe" }).click();
  await expect(page.getByText(/Marked maybe|Sign in with Supabase to save attendance/i)).toBeVisible();
  await page.getByRole("link", { name: /Add Song/i }).click();
  await expect(page.getByRole("heading", { name: "Add Song to Sunday Service" })).toBeVisible();
});

test("events filters and detail actions work", async ({ page }) => {
  await page.goto("/events");
  await page.getByPlaceholder("Search events...").fill("Prayer");
  await expect(page.getByRole("link", { name: "Prayer Meeting", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sunday Morning Worship", exact: true })).toHaveCount(0);

  await page.getByPlaceholder("Search events...").fill("");
  await page.getByRole("button", { name: "Rehearsals" }).click();
  await expect(page.getByRole("link", { name: /Midweek Band Rehearsal/i })).toBeVisible();
  await page.getByRole("link", { name: "Add Event" }).click();
  await expect(page.getByRole("heading", { name: "Add Event" })).toBeVisible();
});

test("messages controls switch channel and report send persistence", async ({ page }) => {
  await page.goto("/messages");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: /Oceans_Vocal_Harmony_v2.pdf/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("Oceans_Vocal_Harmony_v2.pdf");

  await page.getByRole("button", { name: "Vocalists" }).click();
  await expect(page.getByRole("heading", { name: "Vocalists" })).toBeVisible();
  await page.getByPlaceholder("Search messages...").fill("check");
  await expect(page.getByText("Can everyone check their harmony parts before rehearsal?")).toBeVisible();
  await page.getByRole("button", { name: "Open emoji menu" }).click();
  await page.getByRole("button", { name: "Insert 🙏" }).click();
  await page.getByPlaceholder(/Message Vocalists/i).fill("See you at rehearsal");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(/Message sent|Sign in with Supabase to send messages/i)).toBeVisible();
});

test("team/profile/song/settings controls are interactive", async ({ page }) => {
  await page.goto("/members");
  await page.getByPlaceholder("Search members by name, email, role, or status...").fill("Marcus");
  await expect(page.getByRole("link", { name: /Marcus Johnson/i })).toBeVisible();
  await page.getByRole("button", { name: "Tap to copy team code" }).click();
  await expect(page.getByText(/Team code copied|Team code ready to copy/i)).toBeVisible();
  await page.getByRole("link", { name: /Invite Member/i }).click();
  await expect(page.getByRole("heading", { name: "Invite Member" })).toBeVisible();

  await page.goto("/profile");
  await expect(page.getByLabel("Email")).toBeDisabled();
  await page.getByRole("button", { name: "Save Profile" }).click();
  await expect(page.getByText(/Profile save requires sign-in|Profile saved/i)).toBeVisible();

  await page.goto("/songs");
  await page.getByPlaceholder("Search by title, artist, or tag...").fill("Way Maker");
  await expect(page.getByRole("link", { name: /Way Maker/i })).toBeVisible();
  await page.getByRole("button", { name: "Filter songs" }).click();
  await expect(page.getByRole("button", { name: "Favorites" })).toBeVisible();

  await page.goto("/admin/settings");
  await page.getByRole("button", { name: "Save Settings" }).click();
  await expect(page.getByText(/Settings save requires sign-in|Settings saved/i)).toBeVisible();
});
