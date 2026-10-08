import { expect, test } from "@playwright/test";
import { blockRemoteSupabase } from "./demo-network";

test.beforeEach(async ({ page }) => {
  await blockRemoteSupabase(page);
  await page.route("https://fonts.googleapis.com/**", route => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
});

test("home omits the personal service summary and navigation has no pulsing strip", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Your next service" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Open service reminders", exact: true })).toHaveCount(0);
  expect(await page.locator("header nav .animate-pulse, header nav .motion-safe\\:animate-pulse").count()).toBe(0);
  const current = page.locator('nav [aria-current="page"]');
  await expect(current.first()).toHaveAttribute("href", "/dashboard");
});

test("owner sees review queue and no sample pending requests", async ({ page }) => {
  await page.goto("/requests");
  await expect(page.getByRole("button", { name: "Review queue" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "My requests" })).toHaveCount(0);
  await page.goto("/members");
  await expect(page.getByRole("heading", { name: "Pending Requests (0)" })).toBeVisible();
  await expect(page.getByText("No pending join requests.")).toBeVisible();
});

test("setlist toolbar has no sorting dropdown", async ({ page }) => {
  await page.goto("/setlists");
  await expect(page.getByRole("heading", { name: "Setlists", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Newest first" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Search", exact: true })).toBeVisible();
});
test("analytics icons are bare and settings history has no canned rows", async ({ page }) => {
  await page.goto("/analytics");
  await expect(page.getByRole("heading", { name: "Team engagement" })).toBeVisible();
  const icons = page.getByRole("region", { name: "Engagement summary" }).locator("svg");
  await expect(icons).toHaveCount(3);
  for (const icon of await icons.all()) {
    await expect(icon).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    expect(await icon.evaluate(element => getComputedStyle(element.parentElement!).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  }
  await page.goto("/admin/settings");
  await page.getByRole("button", { name: "Activity Log", exact: true }).click();
  await expect(page.getByText("No team activity recorded yet.")).toBeVisible();
  await expect(page.getByText("Casey Lee")).toHaveCount(0);
  await page.getByRole("button", { name: "Ministry Defaults", exact: true }).click();
  await expect(page.getByRole("button", { name: "Generate new code" })).toBeVisible();
});
