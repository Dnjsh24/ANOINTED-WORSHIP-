import { describe, expect, it } from "vitest";
import { toPostgresTime } from "@/lib/domain/time";

describe("toPostgresTime", () => {
  it("keeps valid 24-hour input and adds missing seconds", () => {
    expect(toPostgresTime("09:00")).toBe("09:00:00");
    expect(toPostgresTime("18:30:15")).toBe("18:30:15");
  });

  it("converts 12-hour display values from forms", () => {
    expect(toPostgresTime("9:00 AM")).toBe("09:00:00");
    expect(toPostgresTime("12:00 AM")).toBe("00:00:00");
    expect(toPostgresTime("12:30 PM")).toBe("12:30:00");
    expect(toPostgresTime("6:05 pm")).toBe("18:05:00");
  });

  it("falls back for blank or invalid input", () => {
    expect(toPostgresTime("")).toBe("09:00:00");
    expect(toPostgresTime("9:00 AM:00")).toBe("09:00:00");
    expect(toPostgresTime("25:00")).toBe("09:00:00");
  });
});
