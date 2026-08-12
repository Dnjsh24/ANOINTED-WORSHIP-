import { expect, test, type Page } from "@playwright/test";
import { blockRemoteSupabase } from "./demo-network";

const blockedSupabaseRequests = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  blockedSupabaseRequests.set(page, await blockRemoteSupabase(page));
});

test.afterEach(async ({ page }) => {
  expect(
    blockedSupabaseRequests.get(page) ?? [],
    "forced-demo tests must never contact remote Supabase",
  ).toEqual([]);
});

test("landing page routes into login and team onboarding", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Anointed Worship Ministry Planning" })).toBeVisible();
  await page.getByRole("link", { name: /Get Started with Google/i }).click();
  await expect(page.getByRole("heading", { name: "Welcome Back" })).toBeVisible();
});

test("team join flow opens the join form and pending request screen", async ({ page }) => {
  await page.goto("/teams");
  await expect(page.getByRole("heading", { name: "Welcome to Anointed Worship" })).toBeVisible();
  await page.getByRole("link", { name: /Join a Team/i }).click();
  await expect(page.getByRole("heading", { name: "Join an Existing Team" })).toBeVisible();

  await page.goto("/pending");
  await expect(page.getByRole("heading", { name: "Request Sent" })).toBeVisible();
  await expect(page.getByText("Pending Approval")).toBeVisible();
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

test("website Quick Access opens Worship Remote and Presenter URLs redirect", async ({ page }) => {
  await page.goto("/dashboard");
  const remoteLink = page.getByRole("link", { name: /Worship Remote Connect to Windows Presenter/i });
  await expect(remoteLink).toBeVisible();
  await remoteLink.click();
  await expect(page).toHaveURL(/\/worship-remote$/);
  await expect(page.getByRole("heading", { name: "Worship Remote" })).toBeVisible();
  await expect(page.getByLabel("Six-digit pairing code")).toBeVisible();
  const scanButton = page.getByRole("button", { name: "Scan QR Code" });
  await expect(scanButton).toBeVisible();
  await scanButton.click();
  await expect(page.getByRole("dialog", { name: "Scan the Presenter QR code" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close QR scanner" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Scan the Presenter QR code" })).toBeHidden();
  await expect(scanButton).toBeFocused();

  await page.goto("/presenter");
  await expect(page).toHaveURL(/\/worship-remote$/);
  await page.goto("/setlists/sunday-service/presenter");
  await expect(page).toHaveURL(/\/worship-remote$/);
});

test("admin can open announcement and reminder composers", async ({ page }) => {
  await page.goto("/announcements");
  await page.getByRole("button", { name: "Add Announcement" }).click();
  await expect(page.getByRole("dialog", { name: "Add Announcement" })).toBeVisible();
  await expect(page.getByLabel("Priority")).toBeVisible();
  await expect(page.getByLabel("Linked event")).toBeVisible();
  await page.getByLabel("Tag").selectOption("role");
  await expect(page.locator('select[name="targetRole"]')).toBeVisible();
  await expect(page.locator('select[name="targetRole"]')).toContainText("Band Members");
  await page.getByRole("button", { name: "Close" }).click();

  await page.goto("/reminders");
  await page.getByRole("button", { name: "Add Reminder" }).click();
  await expect(page.getByRole("dialog", { name: "Add Reminder" })).toBeVisible();
  await expect(page.getByLabel("Schedule date")).toBeVisible();
  await expect(page.getByLabel("Repeat")).toBeVisible();
  await page.getByLabel("Repeat").selectOption("weekly");
  await expect(page.getByLabel("Occurrences")).toBeEnabled();
  await page.getByLabel("Tag").selectOption("person");
  await expect(page.locator('select[name="targetMemberId"]')).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("heading", { name: "Admin Delivery" })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Setlists", exact: true })).toBeVisible();
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

test("song forms and add-song picker controls respond", async ({ page }) => {
  await page.goto("/setlists/sunday-service/add-song");
  await page.getByRole("button", { name: "Filters" }).click();
  await expect(page.getByText("Filter by key")).toBeVisible();
  await page.getByRole("button", { name: "All Keys" }).click();

  await page.goto("/songs/opening-song/edit");
  await page.getByLabel("Default Key").selectOption("B");
  await expect(page.getByLabel("Default Key")).toHaveValue("B");
  await page.getByRole("button", { name: "Delete Song" }).click();
  await expect(page.getByRole("heading", { name: "Delete Song" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Yes, delete song" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
});

test("member management shows approval controls", async ({ page }) => {
  await page.goto("/members");
  await expect(page.getByRole("heading", { name: "Team Management" })).toBeVisible();
  await expect(page.getByLabel("Approve Casey Lee")).toBeVisible();
  await expect(page.getByText("DM-10001")).toBeVisible();
  await page.getByRole("link", { name: /View all requests/i }).click();
  await expect(page).toHaveURL(/\/members\/requests$/);
  await expect(page.getByRole("heading", { level: 1, name: "Pending Requests" })).toBeVisible();
  await expect(page.getByText("casey@example.com")).toBeVisible();
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
  await page.getByRole("tab", { name: "Past" }).click();
  await expect(page.getByText("No setlists match this view.")).toBeVisible();

  await page.getByRole("link", { name: /New Setlist/i }).click();
  await expect(page.getByRole("heading", { name: "New Setlist" })).toBeVisible();
  await expect(page.getByLabel("Setlist Name *")).toBeVisible();
  await expect(page.getByLabel("Notes (Optional)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Setlist" })).toBeVisible();
});

test("setlist detail actions have real targets", async ({ page }) => {
  await page.goto("/setlists/sunday-service");
  await page.getByRole("link", { name: "Edit Setlist" }).click();
  await expect(page.getByRole("heading", { name: "Edit Setlist" })).toBeVisible();
  await expect(page.getByLabel("Setlist Name *")).toHaveValue("Sunday Service");
  await expect(page.getByRole("button", { name: "Save Changes" })).toBeVisible();

  await page.goto("/setlists/sunday-service");
  await expect(page.getByRole("heading", { name: "Conflict Detection" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Who's Missing?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Version History" })).toBeVisible();
  await page.getByRole("button", { name: "Share" }).click();
  await expect(page.getByText(/Share link copied|Share link ready/i)).toBeVisible();
  await page.getByRole("button", { name: "Maybe" }).click();
  await expect(page.getByText(/Marked maybe|Sign in with Supabase to save attendance/i)).toBeVisible();
  await page.getByRole("link", { name: /Add Song/i }).click();
  await expect(page.getByRole("heading", { name: "Add Song to Sunday Service" })).toBeVisible();
});

test("standalone setlist detail hides Timeline-only metadata", async ({ page }) => {
  await page.goto("/setlists/youth-night");

  await expect(page.getByText("Standalone Setlist", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Song Order" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Stage" })).toBeVisible();
  await expect(page.getByText("Call Time", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Location", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "My Status" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Conflict Detection" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Who's Missing?" })).toHaveCount(0);
});

test("Timeline detail combines event information with the linked setlist workspace", async ({ page }) => {
  await page.goto("/events/event-sunday");

  await expect(page.getByText("Service - Sunday Worship", { exact: true })).toBeVisible();
  await expect(page.getByText("Call Time", { exact: true })).toBeVisible();
  await expect(page.getByText("Event Time", { exact: true })).toBeVisible();
  await expect(page.getByText("Worship Leader", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Linked Setlist", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Song Order" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Add Song" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Attendance" })).toBeVisible();
});

test("Timeline event without a setlist offers create and link actions", async ({ page }) => {
  await page.goto("/events/event-rehearsal");

  await expect(page.getByRole("heading", { name: "No setlist linked yet" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create Setlist" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Link Existing Setlist" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Song Order" })).toHaveCount(0);
});

test("arrangement editor adds editable chords and lyrics on every viewport", async ({ page }) => {
  await page.goto("/setlists/sunday-service");
  const editArrangement = page.getByRole("button", { name: "Edit arrangement" }).first();
  await editArrangement.scrollIntoViewIfNeeded();
  await editArrangement.click({ force: true });

  const dialog = page.getByRole("dialog", { name: "Edit Arrangement" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Add Ending" }).click();
  await expect(dialog.getByRole("textbox", { name: "Section name" })).toHaveValue("Ending");

  const contentEditor = dialog.getByRole("textbox", { name: "Chords and lyrics" });
  await expect(contentEditor).toBeVisible();
  await contentEditor.fill("G  C\nYou reign forever");
  await expect(dialog.getByText("You reign forever", { exact: true }).last()).toBeVisible();

  await dialog.getByRole("button", { name: "Save Arrangement" }).click();
  await expect(dialog).toBeHidden();
});

test("events filters and detail actions work", async ({ page }) => {
  await page.goto("/events");
  await page.getByPlaceholder("Search events...").fill("Prayer");
  await expect(page.getByRole("link", { name: "Prayer Meeting", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sunday Morning Worship", exact: true })).toHaveCount(0);

  await page.getByPlaceholder("Search events...").fill("");
  await page.getByRole("button", { name: "All Events" }).click();
  await expect(page.getByRole("link", { name: /Midweek Band Rehearsal/i })).toBeVisible();
  await page.getByRole("button", { name: "Calendar View" }).click();
  await expect(page.getByRole("heading", { name: "July 2026" })).toBeVisible();
  await expect(page.getByTitle(/Sunday Morning Worship/)).toBeVisible();
  await page.getByRole("link", { name: "Add Event" }).click();
  await expect(page.getByRole("heading", { name: "Add Event" })).toBeVisible();
});

test("messages controls switch channel and report send persistence", async ({ page, isMobile }) => {
  await page.goto("/messages");
  await page.getByRole("button", { name: "Open attachment menu" }).click();
  await expect(page.getByRole("menu", { name: "Attachment options" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Attach file" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Attach picture" })).toBeVisible();
  await page.keyboard.press("Escape");
  if (isMobile) {
    await page.getByRole("button", { name: "Focus message search" }).click();
  }
  await page.getByPlaceholder("Search messages...").fill("bridge");
  await expect(page.getByText("The new bridge arrangement is ready for review.")).toBeVisible();
  if (isMobile) {
    await page.keyboard.press("Escape");
  }
  await page.getByRole("button", { name: "Open emoji menu" }).click();
  await page.getByRole("button", { name: /Insert/i }).first().click();
  await page.getByPlaceholder(/Message Worship Team/i).fill("See you at rehearsal");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("status")).toContainText(/Sent!|Sign in with Supabase to send messages/i);
});

test("team/profile/song/settings controls are interactive", async ({ page }) => {
  await page.goto("/members");
  await page.getByPlaceholder("Search members...").fill("Alex");
  await expect(page.getByRole("button", { name: "View Alex Morgan" })).toBeVisible();
  await page.getByRole("button", { name: "Copy Code" }).click();
  await expect(page.getByText(/Team code copied|Team code ready to copy/i)).toBeVisible();
  await page.getByRole("link", { name: /Invite Member/i }).click();
  await expect(page.getByRole("heading", { name: "Invite Member" })).toBeVisible();

  await page.goto("/profile");
  await expect(page.getByLabel("Email")).toBeDisabled();
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText(/Profile save requires sign-in|Profile saved/i)).toBeVisible();
  await page.getByRole("button", { name: "Reset Password" }).click();
  await expect(page.getByText(/Password reset needs a Supabase email reset flow/i)).toBeVisible();

  await page.goto("/songs");
  await page.getByPlaceholder("Search by title, artist, or tag...").fill("Opening");
  await expect(page.getByRole("link", { name: /Opening Song/i })).toBeVisible();
  await page.getByRole("button", { name: "Filter songs" }).click();
  await expect(page.getByRole("button", { name: "Favorites" })).toBeVisible();

  await page.goto("/admin/settings");
  await expect(page.getByRole("heading", { name: "Team Controls" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy Code" })).toBeVisible();
  await page.getByRole("button", { name: /Manage Access/i }).click();
  await expect(page.getByRole("heading", { name: "Private Materials Settings" })).toBeVisible();
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText(/Private material preferences are ready/i)).toBeVisible();
  await page.getByRole("button", { name: "Integrations" }).click();
  await page.getByRole("button", { name: "Connect SongSelect" }).click();
  await expect(page.getByText(/SongSelect setup needs CCLI OAuth credentials/i)).toBeVisible();
  await page.getByRole("button", { name: "Billing" }).click();
  await page.getByRole("button", { name: "Update Card Details" }).click();
  await expect(page.getByText(/Card updates need a secure billing portal/i)).toBeVisible();
});
