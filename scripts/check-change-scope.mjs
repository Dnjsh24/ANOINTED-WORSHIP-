import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

function git(directory, args) {
  return execFileSync("git", ["-c", "core.fsmonitor=false", ...args], {
    cwd: directory,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

// Read-only: compare the complete candidate tree with the fetched main tree.
export function checkChangeScope(directory, allowedFiles) {
  if (!allowedFiles.length || allowedFiles.some((file) =>
    !file || file.startsWith("-") || /[\\:*?\x00-\x1f]/.test(file) ||
    file.split("/").some((part) => !part || part === "." || part === ".." || part === ".git")
  )) {
    throw new Error("Declare exact repository-relative paths; directories and globs are not supported.");
  }

  const baseCommit = git(directory, ["rev-parse", "--verify", "origin/main^{commit}"]).trim();
  const candidateCommit = git(directory, ["rev-parse", "--verify", "HEAD^{commit}"]).trim();
  try {
    git(directory, ["merge-base", "--is-ancestor", baseCommit, candidateCommit]);
  } catch {
    throw new Error("Candidate is missing commits from origin/main. Start from current main or merge main and review conflicts.");
  }

  if (git(directory, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]).length) {
    throw new Error("Candidate has uncommitted or untracked files. Preserve them and use a clean release checkout.");
  }

  // Disable rename detection so both the old and new paths need approval.
  const changedFiles = git(directory, ["diff", "--no-renames", "--name-only", "-z", baseCommit, candidateCommit, "--"])
    .split("\0").filter(Boolean);
  if (!changedFiles.length) throw new Error("Candidate has no changes relative to origin/main.");
  // Match literal paths, including Next.js [id] segments; never expand globs.
  const unexpectedFiles = changedFiles.filter((file) => !allowedFiles.includes(file));
  if (unexpectedFiles.length) {
    throw new Error(`Files outside the declared task:\n${unexpectedFiles.join("\n")}`);
  }
  return { baseCommit, candidateCommit, changedFiles };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] !== "--files") {
      throw new Error("Usage: node scripts/check-change-scope.mjs --files path/to/fix path/to/test");
    }
    const result = checkChangeScope(process.cwd(), process.argv.slice(3));
    console.log(`PASS: ${result.candidateCommit} contains fetched main ${result.baseCommit}.`);
    console.log(`Declared changes:\n${result.changedFiles.join("\n")}`);
    console.log("Fetch origin before checking. Review every changed line; this check validates paths, not behavior.");
  } catch (error) {
    console.error(`BLOCKED: ${error.message}`);
    process.exitCode = 1;
  }
}
