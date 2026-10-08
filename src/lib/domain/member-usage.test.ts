import { describe, expect, it } from "vitest";
import { formatLastSeen, shouldRecordUsage, summarizeMemberUsage, usageDateRangeIsValid } from "@/lib/domain/member-usage";

describe("member usage semantics", () => {
  it("does not credit hidden, offline, stale, or invalid input timestamps", () => {
    const activity = { now: 100_000, lastInputAt: 40_001, visible: true, online: true };
    expect(shouldRecordUsage(activity)).toBe(true);
    expect(shouldRecordUsage({ ...activity, visible: false })).toBe(false);
    expect(shouldRecordUsage({ ...activity, online: false })).toBe(false);
    expect(shouldRecordUsage({ ...activity, lastInputAt: 40_000 })).toBe(false);
    expect(shouldRecordUsage({ ...activity, lastInputAt: 100_001 })).toBe(false);
  });
  it("shows honest relative last-seen times and unknown history", () => {
    const now = Date.parse("2026-10-05T12:00:00Z");
    expect(formatLastSeen(null, now)).toBe("Last seen unavailable");
    expect(formatLastSeen("invalid", now)).toBe("Last seen unavailable");
    expect(formatLastSeen("2026-10-05T11:59:50Z", now)).toBe("Last seen just now");
    expect(formatLastSeen("2026-10-05T11:57:00Z", now)).toBe("Last seen 3 minutes ago");
    expect(formatLastSeen("2026-10-05T11:00:00Z", now)).toBe("Last seen 1 hour ago");
    expect(formatLastSeen("2026-10-04T12:00:00Z", now)).toBe("Last seen 1 day ago");
  });
  it("ranks total active minutes and keeps sessions and dates separate", () => {
    const common = { team_id: "team", usage_date: "2026-10-05" };
    const summaries = summarizeMemberUsage([
      { ...common, member_id: "a", active_minutes: 30, sessions: 4 },
      { ...common, member_id: "b", active_minutes: 120, sessions: 2 },
      { ...common, usage_date: "2026-10-04", member_id: "a", active_minutes: 45, sessions: 3 },
    ]);
    expect(summaries).toEqual([
      { memberId: "b", activeMinutes: 120, sessions: 2, dates: ["2026-10-05"] },
      { memberId: "a", activeMinutes: 75, sessions: 7, dates: ["2026-10-04", "2026-10-05"] },
    ]);
  });
  it("bounds UTC date ranges and rejects invalid calendar dates", () => {
    expect(usageDateRangeIsValid("2026-10-01", "2026-10-05")).toBe(true);
    expect(usageDateRangeIsValid("2026-10-05", "2026-10-01")).toBe(false);
    expect(usageDateRangeIsValid("2026-02-30", "2026-03-05")).toBe(false);
    expect(usageDateRangeIsValid("2025-01-01", "2026-10-05")).toBe(false);
    expect(usageDateRangeIsValid("", "2026-10-05")).toBe(false);
  });
});
