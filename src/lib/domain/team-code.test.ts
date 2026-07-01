import { describe, expect, it } from "vitest";
import { generateTeamCode } from "@/lib/domain/team-code";

describe("team code generation", () => {
  it("uses initials and a five digit suffix", () => {
    expect(generateTeamCode("Anointed Worship", 92841)).toMatch(/^AW-\d{5}$/);
  });

  it("falls back for blank names", () => {
    expect(generateTeamCode(" ", 1)).toMatch(/^TM-\d{5}$/);
  });

  it("supports unique string seeds for workspace creation retries", () => {
    expect(generateTeamCode("Anointed Worship", "owner-1")).not.toEqual(
      generateTeamCode("Anointed Worship", "owner-2"),
    );
  });
});
