import { describe, expect, it } from "vitest";
import { attendanceLabel, attendanceSummary } from "@/lib/domain/attendance";

describe("attendance helpers", () => {
  it("summarizes attendance statuses", () => {
    expect(attendanceSummary(["available", "available", "maybe", "pending"])).toEqual({
      available: 2,
      maybe: 1,
      unavailable: 0,
      pending: 1,
    });
  });

  it("renders user-friendly labels", () => {
    expect(attendanceLabel("unavailable")).toBe("I can't attend");
    expect(attendanceLabel("available")).toBe("I'm available");
    expect(attendanceLabel("maybe")).toBe("Maybe");
    expect(attendanceLabel("pending")).toBe("Pending");
  });
});
