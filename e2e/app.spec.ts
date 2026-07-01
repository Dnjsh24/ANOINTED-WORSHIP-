import { expect, test } from "@playwright/test";

test("landing page routes into login and team onboarding", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Empower Your Worship Ministry" })).toBeVisible();
  await page.getByRole("link", { name: /Get Started with Google/i }).click();
  await expect(page.getByRole("heading", { name: "Welcome Back" })).toBeVisible();
});

test("team join flow opens the join form and pending request screen", async ({ page }) => {
  await page.goto("/teams");
  await expect(page.getByRole("heading", { name: "Welcome to Anointed Worship" })).toBeVisible();
  await page.getByRole("link", { name: /Join a Team/i }).click();
  await expect(page.getByRole("heading", { name: "Join an Existing Team" })).toBeVisible();

  await page.goto("/pending");
  await expect(page.getByRole("heading", { name: "Welcome Back" })).toBeVisible();
});

test("home and setlist screens render core workflow", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  await expect(page.getByText(/Welcome back, Alex/i)).toBeVisible();
  await page.getByRole("link", { name: /View all announcements/i }).click();
  await expect(page.getByRole("heading", { name: "Announcements" })).toBeVisible();
  await page.goto("/dashboard");
  await page.getByRole("link", { name: /View all reminders/i }).click();
  await expect(page.getByRole("heading", { name: "Reminders" })).toBeVisible();
  await page.goto("/dashboard");
  await page.getByRole("link", { name: "Opening Song B 90 BPM" }).click();
  await expect(page.getByRole("heading", { name: "Opening Song" })).toBeVisible();
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

test("song viewer renders chord tools and practice controls", async ({ page }) => {
  await page.goto("/songs/opening-song");
  await expect(page.getByRole("heading", { name: "Opening Song" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Chord Shapes" })).toBeVisible();
  await page.getByRole("button", { name: "Lyrics" }).click();
  await expect(page.getByText("Sample chorus line one")).toBeVisible();
  await page.getByRole("button", { name: "Chords" }).click();
  await expect(page.getByLabel("Metronome tempo")).toBeVisible();
});

test("member management shows approval controls", async ({ page }) => {
  await page.goto("/members");
  await expect(page.getByRole("heading", { name: "Team Management" })).toBeVisible();
  await expect(page.getByLabel("Approve Casey Lee")).toBeVisible();
  await expect(page.getByText("DM-10001")).toBeVisible();
});

test("global shell opens notifications and settings", async ({ page, isMobile }) => {
  test.skip(isMobile, "Desktop shell icon buttons are hidden on mobile.");

  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Open notifications" }).click();
  await expect(page.getByRole("menu", { name: "Notifications" })).toBeVisible();
  await page.getByRole("link", { name: /Attendance reminder/i }).click();
  await expect(page.getByRole("heading", { name: "Reminders" })).toBeVisible();

  await page.goto("/dashboard");
  await page.getByRole("link", { name: "Open settings" }).click();
  await expect(page.getByRole("heading", { name: "Team Controls" })).toBeVisible();
});

test("setlists page filters and exposes create/edit flows", async ({ page }) => {
  await page.goto("/setlists");
  await page.getByPlaceholder("Search setlists...").fill("Youth");
  await expect(page.getByRole("heading", { name: "Youth Night", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sunday Service", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Filters" }).click();
  await page.getByRole("button", { name: "Past" }).click();
  await expect(page.getByText("No setlists match these filters.")).toBeVisible();

  await page.getByRole("link", { name: /New Setlist/i }).click();
  await expect(page.getByRole("heading", { name: "New Setlist" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Band" })).toBeVisible();
  await expect(page.locator('select[name="secondKeys"]')).toBeVisible();
  await page.getByRole("button", { name: "Remove Keys 2" }).click();
  await expect(page.locator('select[name="secondKeys"]')).toHaveCount(0);
  await expect(page.locator('select[name="drums"]')).toBeVisible();
  await expect(page.locator('select[name="electricGuitar"]')).toBeVisible();
  await expect(page.locator('select[name="backupSingers"]')).toHaveCount(2);
  await page.getByRole("button", { name: "Remove Singer 2" }).click();
  await expect(page.locator('select[name="backupSingers"]')).toHaveCount(1);
  await expect(page.locator('select[name="dancers"]')).toHaveCount(3);
  await page.getByRole("button", { name: "Remove Dancer 3" }).click();
  await expect(page.locator('select[name="dancers"]')).toHaveCount(2);
  await page.getByRole("button", { name: "Add More" }).click();
  await expect(page.locator('select[name="extraBandMembers"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Remove Band Member 1" }).click();
  await expect(page.locator('select[name="extraBandMembers"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Add Singer" }).click();
  await expect(page.locator('select[name="backupSingers"]')).toHaveCount(2);
  await page.getByRole("button", { name: "Add Dancers" }).click();
  await expect(page.locator('select[name="dancers"]')).toHaveCount(3);
});

test("setlist detail actions have real targets", async ({ page }) => {
  await page.goto("/setlists/sunday-service");
  await page.getByRole("link", { name: "Edit Details" }).click();
  await expect(page.getByRole("heading", { name: "Edit Setlist" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Singers" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dance" })).toBeVisible();

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
  await expect(page.getByRole("link", { name: /Midweek Band Rehearsal/i })).toBeVisible();
  await page.getByRole("link", { name: "Add Event" }).click();
  await expect(page.getByRole("heading", { name: "Add Event" })).toBeVisible();
});

test("messages controls switch channel and report send persistence", async ({ page, isMobile }) => {
  await page.goto("/messages");
  await page.getByRole("button", { name: "Open attachment menu" }).click();
  await expect(page.getByRole("menu", { name: "Attachment options" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Attach file" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Attach picture" })).toBeVisible();
  if (!isMobile) {
    await expect(page.getByText("No files uploaded yet.")).toBeVisible();
  }

  await page.keyboard.press("Escape");
  await page.getByPlaceholder("Search messages...").fill("bridge");
  await expect(page.getByText("The new bridge arrangement is ready for review.")).toBeVisible();
  await page.getByRole("button", { name: "Open emoji menu" }).click();
  await page.getByRole("button", { name: /Insert/i }).first().click();
  await page.getByPlaceholder(/Message Worship Team/i).fill("See you at rehearsal");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(/Message sent|Sign in with Supabase to send messages/i)).toBeVisible();
});

test("team/profile/song/settings controls are interactive", async ({ page }) => {
  await page.goto("/members");
  await page.getByPlaceholder("Search members...").fill("Alex");
  await expect(page.getByRole("link", { name: /Alex Morgan/i })).toBeVisible();
  await page.getByRole("button", { name: "Copy Code" }).click();
  await expect(page.getByText(/Team code copied|Team code ready to copy/i)).toBeVisible();
  await page.getByRole("link", { name: /Invite Member/i }).click();
  await expect(page.getByRole("heading", { name: "Invite Member" })).toBeVisible();

  await page.goto("/profile");
  await expect(page.getByLabel("Email")).toBeDisabled();
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText(/Profile save requires sign-in|Profile saved/i)).toBeVisible();

  await page.goto("/songs");
  await page.getByPlaceholder("Search by title, artist, or tag...").fill("Opening");
  await expect(page.getByRole("link", { name: /Opening Song/i })).toBeVisible();
  await page.getByRole("button", { name: "Filter songs" }).click();
  await expect(page.getByRole("button", { name: "Favorites" })).toBeVisible();

  await page.goto("/admin/settings");
  await expect(page.getByRole("heading", { name: "Team Controls" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy Code" })).toBeVisible();
});
