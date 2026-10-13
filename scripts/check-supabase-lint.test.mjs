import { describe, expect, it } from "vitest";
import { classifyWebsiteSupabaseLint, parseWebsiteSupabaseLintOutput } from "./check-supabase-lint.mjs";

function issue(functionName, sqlState, message = "lint problem") {
  return {
    function: functionName,
    issues: [{ level: "error", message, sqlState }],
  };
}

describe("classifyWebsiteSupabaseLint", () => {
  it("passes an empty lint result", () => {
    expect(classifyWebsiteSupabaseLint({ results: [] })).toEqual({
      blocking: [],
      excluded: [],
    });
  });

  it("excludes only the documented desktop enum issue", () => {
    const result = classifyWebsiteSupabaseLint({
      results: [issue("public.apply_worship_mutation", "42804")],
    });

    expect(result.blocking).toEqual([]);
    expect(result.excluded).toHaveLength(1);
  });

  it("blocks a new issue in the excluded desktop function", () => {
    const result = classifyWebsiteSupabaseLint({
      results: [issue("public.apply_worship_mutation", "42501")],
    });

    expect(result.blocking).toHaveLength(1);
    expect(result.excluded).toEqual([]);
  });

  it("blocks every website function issue", () => {
    const result = classifyWebsiteSupabaseLint({
      results: [issue("public.claim_worship_remote_pairing", "42804")],
    });

    expect(result.blocking).toHaveLength(1);
    expect(result.excluded).toEqual([]);
  });

  it("accepts the CLI array without hiding website issues", () => {
    expect(classifyWebsiteSupabaseLint([])).toEqual({ blocking: [], excluded: [] });
    const result = classifyWebsiteSupabaseLint([
      issue("public.apply_worship_mutation", "42804"),
      issue("public.claim_worship_remote_pairing", "42501"),
    ]);
    expect(result.excluded).toHaveLength(1);
    expect(result.blocking).toHaveLength(1);
    expect(result.blocking[0].functionName).toBe("public.claim_worship_remote_pairing");
  });

  it.each([{}, null, [null], [{ function: "public.example" }],
    [{ function: "", issues: [] }],
    [{ function: "public.example", issues: [null] }],
    [{ function: "public.example", issues: [{ message: "problem" }] }],
  ])("rejects malformed output instead of silently passing: %j", (payload) => {
    expect(() => classifyWebsiteSupabaseLint(payload)).toThrow(/expected JSON result shape/i);
  });
});

describe("parseWebsiteSupabaseLintOutput", () => {
  it("accepts the CLI's explicit clean-schema stderr with empty stdout", () => {
    expect(parseWebsiteSupabaseLintOutput(" \n", "Linting schema: private\nLinting schema: public\n\nNo schema errors found\n"))
      .toEqual([]);
  });

  it.each(["", "Linting schema: public", "No schema errors found while checking something else"])(
    "rejects empty stdout without the exact success line: %j", (stderr) => {
      expect(() => parseWebsiteSupabaseLintOutput("", stderr)).toThrow();
    },
  );

  it("does not accept malformed nonempty output even with a success line", () => {
    expect(() => parseWebsiteSupabaseLintOutput("not JSON", "No schema errors found\n")).toThrow();
  });

  it("preserves JSON issues even with a clean-schema line", () => {
    const payload = [issue("public.example", "42501")];
    const result = parseWebsiteSupabaseLintOutput(JSON.stringify(payload), "No schema errors found\n");
    expect(classifyWebsiteSupabaseLint(result).blocking).toHaveLength(1);
  });
});
