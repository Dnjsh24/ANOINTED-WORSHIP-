import { describe, expect, it } from "vitest";
import { buildRehearsalPlan, rehearsalMinutes } from "./rehearsal-plan";

describe("rehearsal plan", () => {
  it("exports song order, assigned keys, honest tempo, focus and checked preparation", () => {
    const plan = buildRehearsalPlan("Sunday", [{ id: "a", title: "Song A", assignedKey: "D", bpm: null, lead: "Anna", arrangement: "Quiet intro" }, { id: "b", title: "Song B", assignedKey: "F", bpm: 90 }], { a: { minutes: 12, focus: "Work on harmonies" } }, new Set(["Warm up and check comfortable keys"]));
    expect(plan).toContain("Planned rehearsal: 17 minutes");
    expect(plan.indexOf("1. Song A")).toBeLessThan(plan.indexOf("2. Song B"));
    expect(plan).toContain("Key D | BPM not recorded | 12 rehearsal min");
    expect(plan).toContain("Lead: Anna\nArrangement: Quiet intro\nFocus: Work on harmonies");
    expect(plan).toContain("[x] Warm up and check comfortable keys");
    expect(plan).toContain("[ ] Check microphones and backing tracks");
  });
  it("bounds rehearsal allocations and rejects non-numeric input", () => {
    expect(rehearsalMinutes("-1")).toBe(0);
    expect(rehearsalMinutes("999")).toBe(120);
    expect(rehearsalMinutes("12.6")).toBe(13);
    expect(rehearsalMinutes("oops")).toBe(0);
    expect(rehearsalMinutes("Infinity")).toBe(0);
  });
});
