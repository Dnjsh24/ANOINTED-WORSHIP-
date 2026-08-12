import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const membersPageSource = readFileSync(join(process.cwd(), "src", "app", "members", "page.tsx"), "utf8");

describe("Team Management request loading", () => {
  it("loads only pending join requests into the pending requests panel", () => {
    expect(membersPageSource).toContain('.eq("status", "pending")');
    expect(membersPageSource).not.toContain('.in("status", ["pending", "rejected"])');
  });
});
