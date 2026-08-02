import type { Page } from "@playwright/test";

function safeRequestLabel(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "invalid remote Supabase URL";
  }
}

export async function blockRemoteSupabase(page: Page) {
  const blockedRequests: string[] = [];

  await page.route(/^https:\/\/[^/]+\.supabase\.co\//, async (route) => {
    blockedRequests.push(safeRequestLabel(route.request().url()));
    await route.abort("blockedbyclient");
  });

  return blockedRequests;
}
