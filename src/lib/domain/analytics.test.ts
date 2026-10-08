import { describe, expect, it } from "vitest";
import {
  activityDescription,
  analyticsDayTimestamp,
  analyticsToday,
  buildAvailabilityTrend,
  parseAnalyticsRange,
  summarizeAvailability,
  summarizeChannelVolume,
  summarizeSongUsage,
} from "@/lib/domain/analytics";

const now = new Date("2026-10-08T02:00:00Z");
const range = parseAnalyticsRange({ start: "2026-10-01", end: "2026-10-07" }, now);

describe("Analytics calendar dates", () => {
  it("uses Manila midnight and an equal-length previous period", () => {
    expect(analyticsToday(new Date("2026-10-07T16:00:00Z"))).toBe("2026-10-08");
    expect(analyticsToday(new Date("2026-10-07T15:59:59Z"))).toBe("2026-10-07");
    expect(analyticsDayTimestamp("2026-10-08")).toBe("2026-10-07T16:00:00.000Z");
    expect(range).toMatchObject({ days: 7, previousStart: "2026-09-24", previousEnd: "2026-09-30", notice: null });
    expect(parseAnalyticsRange({}, now)).toMatchObject({ start: "2026-09-09", end: "2026-10-08", days: 30 });
  });

  it.each([
    { start: ["2026-10-01", "2026-10-02"], end: "2026-10-07" },
    { start: "2026-10-01", end: ["2026-10-07"] },
    { start: "2026-10-01" },
    { start: "2026-02-30", end: "2026-10-07" },
    { start: "0000-01-01", end: "0000-01-02" },
    { start: "0001-01-01", end: "0001-01-02" },
    { start: "2026-2-01", end: "2026-10-07" },
    { start: "2026-10-07", end: "2026-10-01" },
    { start: "2026-10-09", end: "2026-10-10" },
    { start: "2025-10-01", end: "2026-10-07" },
  ])("falls back with an explanation for invalid dates: %j", (params) => {
    expect(parseAnalyticsRange(params, now)).toMatchObject({ start: "2026-09-09", end: "2026-10-08", days: 30 });
    expect(parseAnalyticsRange(params, now).notice).toBeTruthy();
  });

  it("clamps a future end and handles leap years and the 365-day bound", () => {
    expect(parseAnalyticsRange({ start: "2026-10-01", end: "2026-10-20" }, now)).toMatchObject({ end: "2026-10-08", days: 8 });
    expect(parseAnalyticsRange({ start: "2024-02-29", end: "2024-03-01" }, now)).toMatchObject({ days: 2, previousStart: "2024-02-27", previousEnd: "2024-02-28" });
    expect(parseAnalyticsRange({ start: "2025-10-09", end: "2026-10-08" }, now)).toMatchObject({ days: 365, notice: null });
    expect(parseAnalyticsRange({ start: "1970-01-01", end: "1970-01-01" }, now)).toMatchObject({ days: 1, previousStart: "1969-12-31", notice: null });
  });
});

describe("Analytics aggregates", () => {
  it("groups songs by ID and retains previous-only rotation without counting out-of-range placements", () => {
    expect(summarizeSongUsage([
      { songId: "a", title: "Opening Song", date: "2026-10-01" },
      { songId: "a", title: "Opening Song", date: "2026-10-02" },
      { songId: "a", title: "Opening Song", date: "2026-09-30" },
      { songId: "b", title: "Opening Song", date: "2026-09-24" },
      { songId: "c", title: "Outside", date: "2026-09-23" },
      { songId: "c", title: "Outside", date: "2026-10-08" },
    ], range)).toEqual([
      { id: "a", title: "Opening Song", count: 2, previousCount: 1 },
      { id: "b", title: "Opening Song", count: 0, previousCount: 1 },
    ]);
  });

  it("groups all channels using Manila publication dates", () => {
    const channels = summarizeChannelVolume([
      { channelId: "one", name: "Worship Team", publishedAt: "2026-09-30T16:00:00Z" },
      { channelId: "one", name: "Worship Team", publishedAt: "2026-09-30T15:59:59Z" },
      { channelId: "two", name: "Announcements", publishedAt: "2026-10-07T15:59:59Z" },
      { channelId: "two", name: "Announcements", publishedAt: "2026-10-07T16:00:00Z" },
    ], range);
    expect(channels).toEqual([
      { id: "two", name: "Announcements", count: 1, previousCount: 0 },
      { id: "one", name: "Worship Team", count: 1, previousCount: 1 },
    ]);
  });

  it("weights availability by recorded rows, includes pending, and ignores unlinked/current-day/future events", () => {
    const data = summarizeAvailability([
      { id: "service", date: "2026-10-01", type: "service" },
      { id: "rehearsal", date: "2026-10-02", type: "rehearsal" },
      { id: "empty", date: "2026-10-03", type: "meeting" },
      { id: "today", date: "2026-10-08", type: "service" },
      { id: "future", date: "2026-10-09", type: "service" },
    ], [
      { eventId: "service", status: "available" },
      ...Array.from({ length: 9 }, () => ({ eventId: "rehearsal", status: "pending" } satisfies Parameters<typeof summarizeAvailability>[1][number])),
      { eventId: "today", status: "available" },
      { eventId: "future", status: "available" },
      { eventId: "outside", status: "available" },
    ], parseAnalyticsRange({ start: "2026-10-01", end: "2026-10-08" }, now));
    expect(data.current).toEqual({ available: 1, total: 10, rate: 10, eventCount: 3 });
    expect(data.previous.rate).toBeNull();
    expect(data.byEventType).toEqual([
      { type: "service", label: "Service", available: 1, total: 1, rate: 100, eventCount: 1 },
      { type: "rehearsal", label: "Rehearsal", available: 0, total: 9, rate: 0, eventCount: 1 },
      { type: "meeting", label: "Meeting", available: 0, total: 0, rate: null, eventCount: 1 },
    ]);
  });

  it("builds weighted weekly comparisons and preserves empty daily gaps", () => {
    const data = summarizeAvailability([
      { id: "a", date: "2026-10-01", type: "service" },
      { id: "b", date: "2026-10-02", type: "service" },
      { id: "c", date: "2026-09-24", type: "rehearsal" },
    ], [
      { eventId: "a", status: "available" },
      { eventId: "b", status: "unavailable" },
      { eventId: "b", status: "pending" },
      { eventId: "c", status: "available" },
    ], range);
    const weekly = buildAvailabilityTrend(data, range, "weekly");
    expect(weekly).toEqual([{
      label: "Oct 1", currentDate: "2026-10-01", previousDate: "2026-09-24",
      currentRate: expect.any(Number), previousRate: 100, currentTotal: 3, previousTotal: 1,
    }]);
    expect(weekly[0].currentRate).toBeCloseTo(100 / 3);
    expect(buildAvailabilityTrend(data, range, "daily")[2]).toMatchObject({ currentRate: null, previousRate: null });
    const eightDays = parseAnalyticsRange({ start: "2026-10-01", end: "2026-10-08" }, now);
    expect(buildAvailabilityTrend(summarizeAvailability([], [], eightDays), eightDays, "weekly")).toHaveLength(2);
  });

  it("normalizes missing and unstructured activity details without displaying arbitrary JSON", () => {
    expect(activityDescription("created", "setlist", { name: " Sunday Worship " })).toBe("Created setlist: Sunday Worship");
    expect(activityDescription("created", "song", { title: "Opening Song" })).toBe("Created song: Opening Song");
    expect(activityDescription("updated", "team_member", { title: { secret: "hidden" } })).toBe("Updated team member");
    expect(activityDescription("created", "song", ["hidden"])).toBe("Created song");
    expect(activityDescription("created", "song", null)).toBe("Created song");
  });
});
