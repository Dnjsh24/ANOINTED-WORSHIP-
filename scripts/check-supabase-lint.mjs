import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const WEBSITE_SCOPE_EXCLUSIONS = new Map([
  [
    "public.apply_worship_mutation",
    new Set(["42804"]),
  ],
]);

function lintIssues(payload) {
  // The installed CLI's default output is a JSON array; also retain the
  // results envelope used by earlier callers. Reject malformed output closed.
  const results = Array.isArray(payload) ? payload : payload?.results;
  if (!Array.isArray(results) || results.some((result) =>
    typeof result?.function !== "string" || !result.function.trim() ||
    !Array.isArray(result.issues) || result.issues.some((issue) =>
      !issue || ["level", "message", "sqlState"].some((field) =>
        typeof issue[field] !== "string" || !issue[field].trim(),
      ),
    ),
  )) {
    throw new Error("Supabase lint did not return the expected JSON result shape.");
  }

  return results.flatMap((result) =>
    result.issues.map((issue) => ({ functionName: result.function, issue })),
  );
}

export function classifyWebsiteSupabaseLint(payload) {
  const blocking = [];
  const excluded = [];

  for (const entry of lintIssues(payload)) {
    const allowedStates = WEBSITE_SCOPE_EXCLUSIONS.get(entry.functionName);
    const sqlState = typeof entry.issue?.sqlState === "string" ? entry.issue.sqlState : "unknown";
    if (allowedStates?.has(sqlState)) {
      excluded.push(entry);
    } else {
      blocking.push(entry);
    }
  }

  return { blocking, excluded };
}

export function parseWebsiteSupabaseLintOutput(stdout, stderr) {
  const output = stdout.trim();
  // CLI 2.111 emits this exact stderr line, without JSON, for a clean schema.
  // Never let that marker override nonempty output or a failed CLI process.
  if (!output && stderr.split(/\r?\n/).some((line) => line.trim() === "No schema errors found")) {
    return [];
  }
  return JSON.parse(output);
}

function formatIssue({ functionName, issue }) {
  const level = typeof issue?.level === "string" ? issue.level : "unknown";
  const sqlState = typeof issue?.sqlState === "string" ? issue.sqlState : "unknown";
  const message = typeof issue?.message === "string" ? issue.message : "unrecognized lint issue";
  return `${functionName} [${level}/${sqlState}]: ${message}`;
}

function runCli() {
  const supabaseCli = fileURLToPath(
    new URL("../node_modules/supabase/dist/supabase.js", import.meta.url),
  );
  const result = spawnSync(
    process.execPath,
    [supabaseCli, "db", "lint", "--local", "--level", "warning"],
    {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.error) {
    console.error(`Supabase lint could not start: ${result.error.message}`);
    process.exitCode = 1;
    return;
  }

  if (result.status !== 0) {
    console.error(`Supabase lint exited with status ${result.status ?? "unknown"}.`);
    process.exitCode = 1;
    return;
  }

  let payload;
  try {
    payload = parseWebsiteSupabaseLintOutput(result.stdout, result.stderr);
  } catch {
    console.error("Supabase lint returned non-JSON output and cannot be trusted as a release gate.");
    process.exitCode = 1;
    return;
  }

  let classified;
  try {
    classified = classifyWebsiteSupabaseLint(payload);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Supabase lint result could not be classified.");
    process.exitCode = 1;
    return;
  }

  for (const entry of classified.excluded) {
    console.log(`Website scope exclusion: ${formatIssue(entry)}`);
  }

  if (classified.blocking.length > 0) {
    console.error("Website database lint failed:");
    for (const entry of classified.blocking) {
      console.error(`- ${formatIssue(entry)}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Website database lint passed.");
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (entryPoint === import.meta.url) {
  runCli();
}
