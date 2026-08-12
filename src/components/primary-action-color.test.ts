import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const confirmAvailabilityTone = "bg-violet-600 text-white hover:bg-violet-500";

describe("primary action color", () => {
  it("uses the Confirm Availability tone for shared primary buttons", () => {
    const source = readFileSync("src/components/ui/button.tsx", "utf8");

    expect(source).toContain(`primary: "${confirmAvailabilityTone}"`);
    expect(source).not.toContain('primary: "bg-violet-500 text-white hover:bg-violet-400"');
  });

  it("uses the same tone for the floating Quick Report action", () => {
    const source = readFileSync("src/components/quick-report-button.tsx", "utf8");

    expect(source).toContain("rounded-full bg-violet-600 text-white");
    expect(source).toContain("hover:bg-violet-500");
    expect(source).not.toContain("bg-violet-500 text-white transition-all duration-200 hover:bg-violet-400");
  });
});
