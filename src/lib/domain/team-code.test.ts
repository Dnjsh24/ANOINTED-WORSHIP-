import { describe, expect, it } from "vitest";
import { generateTeamCode } from "@/lib/domain/team-code";

describe("team code generation", () => {
  it("uses initials and a five digit suffix", () => {
    expect(generateTeamCode("Anointed Worship", 92841)).toMatch(/^AW-\d{5}$/);
  });

  it("falls back for blank names", () => {
    expect(generateTeamCode(" ", 1)).toMatch(/^TM-\d{5}$/);
  });

  it("uses at least two letters for one-word team names", () => {
    expect(generateTeamCode("Binan", 1)).toMatch(/^BIN-\d{5}$/);
  });

  it("ignores non-letter characters in the team code prefix", () => {
    expect(generateTeamCode("123 Worship", 1)).toMatch(/^WOR-\d{5}$/);
  });

  it("supports unique string seeds for workspace creation retries", () => {
    expect(generateTeamCode("Anointed Worship", "owner-1")).not.toEqual(
      generateTeamCode("Anointed Worship", "owner-2"),
    );
  });
});
