import { expect, test } from "@playwright/test";
import { blockRemoteSupabase } from "./demo-network";

test("header request popup supports keyboard dismissal and view all", async ({ page }) => {
  const blocked = await blockRemoteSupabase(page);
  await page.goto("/dashboard");
  const trigger = page.getByRole("button", { name: "Edit requests", exact: true });
  await trigger.click();
  const popup = page.getByRole("dialog", { name: "Edit requests" });
  await expect(popup).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard$/);
  const viewAll = popup.getByRole("link", { name: /View all requests/ });
  await expect(viewAll).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(popup).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await viewAll.click();
  await expect(page).toHaveURL(/\/requests$/);
  await expect(page.getByRole("heading", { name: "Edit requests", exact: true })).toBeVisible();
  expect(blocked).toEqual([]);
});

test("request popup closes outside and switches cleanly with notifications", async ({ page }) => {
  const blocked = await blockRemoteSupabase(page);
  await page.goto("/dashboard");
  const trigger = page.getByRole("button", { name: "Edit requests", exact: true });
  await trigger.click();
  await page.getByRole("heading", { name: "Quick Access", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Edit requests" })).toBeHidden();
  await page.getByRole("button", { name: "Open notifications" }).click();
  await expect(page.getByRole("menu", { name: "Notifications" })).toBeVisible();
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "Edit requests" })).toBeVisible();
  await expect(page.getByRole("menu", { name: "Notifications" })).toBeHidden();
  await page.getByRole("button", { name: "Open notifications" }).click();
  await expect(page.getByRole("dialog", { name: "Edit requests" })).toBeHidden();
  await expect(page.getByRole("menu", { name: "Notifications" })).toBeVisible();
  expect(blocked).toEqual([]);
});
