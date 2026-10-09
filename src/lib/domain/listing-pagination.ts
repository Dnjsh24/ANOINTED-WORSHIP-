export type ListingPage = {
  page: number;
  pageSize: number;
  from: number;
  to: number;
};

export function parsePageNumber(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value)) return 1;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function getListingPage(page: number, pageSize: number): ListingPage {
  const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const safePageSize = Number.isSafeInteger(pageSize) && pageSize > 0 ? pageSize : 1;
  const from = (safePage - 1) * safePageSize;
  return { page: safePage, pageSize: safePageSize, from, to: from + safePageSize - 1 };
}

export function getListingPageCount(totalCount: number, pageSize: number): number {
  return Math.max(1, Math.ceil(Math.max(0, totalCount) / Math.max(1, pageSize)));
}

export function sanitizeListingSearch(value: string | undefined, maxLength = 100): string {
  return (value ?? "").trim().replace(/[(),\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function buildListingHref(path: string, page: number, params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key !== "page" && value) query.set(key, value);
  }
  if (page > 1) query.set("page", String(page));
  const search = query.toString();
  return search ? path + "?" + search : path;
}
