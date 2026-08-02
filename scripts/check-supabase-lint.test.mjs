import { describe, expect, it } from "vitest";
import { classifyWebsiteSupabaseLint } from "./check-supabase-lint.mjs";

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

  it("rejects an unexpected result shape", () => {
    expect(() => classifyWebsiteSupabaseLint({})).toThrow(/expected JSON result shape/i);
  });
});
