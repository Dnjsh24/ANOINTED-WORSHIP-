import { describe, expect, it } from "vitest";
import { buildListingHref, getListingPage, getListingPageCount, parsePageNumber, sanitizeListingSearch } from "./listing-pagination";
import { encodeMessageCursor, parseMessageCursor } from "@/lib/supabase/message-data";

describe("server listing pagination", () => {
  it("bounds page parsing and produces inclusive database ranges", () => {
    expect(parsePageNumber("4")).toBe(4);
    expect(parsePageNumber("-2")).toBe(1);
    expect(parsePageNumber("1.5")).toBe(1);
    expect(getListingPage(3, 20)).toEqual({ page: 3, pageSize: 20, from: 40, to: 59 });
    expect(getListingPageCount(41, 20)).toBe(3);
    expect(getListingPageCount(0, 20)).toBe(1);
  });

  it("normalizes search input before it is placed in filter expressions", () => {
    expect(sanitizeListingSearch("  songs,(guitar)  ")).toBe("songs guitar");
    expect(sanitizeListingSearch("x".repeat(120))).toHaveLength(100);
  });

  it("keeps active filters when moving between server pages", () => {
    expect(buildListingHref("/songs", 2, { q: "worship", favorites: "true", page: "8" })).toBe("/songs?q=worship&favorites=true&page=2");
  });

  it("round-trips stable timestamp and id cursors and rejects invalid cursors", () => {
    const cursor = { createdAt: "2026-10-05T12:00:00.000Z", id: "11111111-1111-4111-8111-111111111111" };
    expect(parseMessageCursor(encodeMessageCursor(cursor))).toEqual(cursor);
    expect(parseMessageCursor("2026-10-05T12:00:00.000Z|nope")).toBeUndefined();
    expect(parseMessageCursor(undefined)).toBeNull();
  });
});
