// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkChangeScope } from "./check-change-scope.mjs";

let directory;
function git(...args) {
  return execFileSync("git", ["-c", "core.fsmonitor=false", ...args], { cwd: directory, encoding: "utf8" });
}
function commitFile(path, contents) {
  writeFileSync(join(directory, path), contents);
  git("add", "--", path);
  git("commit", "-qm", "fixture change");
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "change-scope-"));
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Scope Test");
  git("config", "user.email", "scope@example.invalid");
  git("config", "commit.gpgsign", "false");
  commitFile("analytics.txt", "current analytics");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  git("checkout", "-qb", "fix");
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

describe("release change scope", () => {
  it("accepts a focused committed fix and preserves current analytics", () => {
    commitFile("fix.txt", "new fix");
    expect(checkChangeScope(directory, ["fix.txt"]).changedFiles).toEqual(["fix.txt"]);
  });
  it("blocks the stale branch that would replace newer main work", () => {
    commitFile("fix.txt", "new fix");
    git("checkout", "-q", "main");
    commitFile("analytics.txt", "even newer analytics");
    git("update-ref", "refs/remotes/origin/main", "HEAD");
    git("checkout", "-q", "fix");
    expect(() => checkChangeScope(directory, ["fix.txt"])).toThrow("missing commits");
  });
  it("blocks an unrelated analytics rollback even on an updated branch", () => {
    commitFile("fix.txt", "new fix");
    commitFile("analytics.txt", "old analytics");
    expect(() => checkChangeScope(directory, ["fix.txt"])).toThrow("analytics.txt");
  });
  it("blocks uncommitted tracked work", () => {
    commitFile("fix.txt", "new fix");
    writeFileSync(join(directory, "analytics.txt"), "unfinished work");
    expect(() => checkChangeScope(directory, ["fix.txt"])).toThrow("uncommitted or untracked");
  });
  it("blocks untracked work instead of silently omitting it", () => {
    commitFile("fix.txt", "new fix");
    writeFileSync(join(directory, "unfinished.txt"), "preserve me");
    expect(() => checkChangeScope(directory, ["fix.txt"])).toThrow("uncommitted or untracked");
  });
  it("requires both paths for a rename", () => {
    git("mv", "analytics.txt", "renamed.txt");
    git("commit", "-qm", "rename fixture");
    expect(() => checkChangeScope(directory, ["renamed.txt"])).toThrow("analytics.txt");
    expect(checkChangeScope(directory, ["analytics.txt", "renamed.txt"]).changedFiles).toHaveLength(2);
  });
  it.each([[], ["src/*"], ["../analytics.txt"], ["/analytics.txt"], ["--all"]].map((files) => ({ files })))("rejects unsafe or broad file declarations $files", ({ files }) => {
    expect(() => checkChangeScope(directory, files)).toThrow("exact repository-relative paths");
  });
  it("blocks an empty candidate", () => {
    expect(() => checkChangeScope(directory, ["fix.txt"])).toThrow("no changes");
  });
  it("fails closed when the main reference is missing", () => {
    git("update-ref", "-d", "refs/remotes/origin/main");
    expect(() => checkChangeScope(directory, ["fix.txt"])).toThrow();
  });
});
