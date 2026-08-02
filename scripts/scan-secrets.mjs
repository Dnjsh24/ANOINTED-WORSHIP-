import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { extname } from "node:path";

const repoRoot = process.cwd();
const maxBlobBytes = 5 * 1024 * 1024;
const binaryExtensions = new Set([
  ".7z",
  ".db",
  ".dll",
  ".dmg",
  ".docx",
  ".exe",
  ".gif",
  ".ico",
  ".icns",
  ".jpeg",
  ".jpg",
  ".msi",
  ".mp3",
  ".mp4",
  ".otf",
  ".p12",
  ".pdf",
  ".pfx",
  ".png",
  ".pptx",
  ".rar",
  ".so",
  ".sqlite",
  ".sqlite3",
  ".ttf",
  ".webp",
  ".woff",
  ".woff2",
  ".xlsx",
  ".zip",
]);

const strictDetectors = [
  {
    type: "private-key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g,
  },
  {
    type: "aws-access-key",
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  },
  {
    type: "github-token",
    pattern:
      /\b(?:gh[pousr]_[A-Za-z0-9]{30,255}|github_pat_[A-Za-z0-9_]{20,255})\b/g,
  },
  {
    type: "openai-api-key",
    pattern: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    type: "anthropic-api-key",
    pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    type: "supabase-secret-key",
    pattern: /\bsb_secret_[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    type: "stripe-live-key",
    pattern: /\b(?:sk_live|rk_live)_[A-Za-z0-9]{16,}\b/g,
  },
  {
    type: "slack-token",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  },
  {
    type: "sendgrid-key",
    pattern: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g,
  },
  {
    type: "google-api-key",
    pattern: /\bAIza[A-Za-z0-9_-]{30,}\b/g,
  },
  {
    type: "npm-token",
    pattern: /\bnpm_[A-Za-z0-9]{30,}\b/g,
  },
  {
    type: "database-uri-with-credentials",
    pattern:
      /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|rediss):\/\/[^\s:@/]+:[^\s@/]+@[^\s'"`]+/gi,
  },
  {
    type: "url-with-embedded-credentials",
    pattern: /\bhttps?:\/\/[^\s/:@]+:[^\s/@]+@[^\s'"`]+/gi,
  },
  {
    type: "hardcoded-bearer-token",
    pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/g,
  },
];

const findings = [];
let allowedPublicKeys = 0;
let historyBlobsScanned = 0;
let commitMessagesScanned = 0;
let workingFilesScanned = 0;
let binaryFilesClassified = 0;
let oversizedHistoryBlobsSkipped = 0;
let oversizedWorkingFilesSkipped = 0;

function runGit(args, options = {}) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
    ...options,
  });
}

function fingerprint(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function entropy(value) {
  const counts = new Map();
  for (const character of value) {
    counts.set(character, (counts.get(character) ?? 0) + 1);
  }

  let result = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    result -= probability * Math.log2(probability);
  }
  return result;
}

function isPlaceholder(value) {
  return (
    value.length < 8 ||
    /^(?:true|false|null|undefined|none)$/i.test(value) ||
    /^https?:\/\/(?:user|username):(?:pass|password)@/i.test(value) ||
    /(?:your[_-]|example|placeholder|changeme|replace|generate|xxxxx|dummy|fake|mock|sample|test-token|process\.env|import\.meta\.env|\$\{|<[^>]+>)/i.test(
      value,
    ) ||
    /^\*+$/.test(value)
  );
}

function lineNumber(text, index) {
  return 1 + (text.slice(0, index).match(/\n/g)?.length ?? 0);
}

function recordFinding(meta, type, text, index, value, key) {
  findings.push({
    source: meta.source,
    path: meta.path,
    line: lineNumber(text, index),
    type,
    key,
    fingerprint: fingerprint(value),
    object: meta.object?.slice(0, 12),
  });
}

function scanText(text, meta, includeGenericAssignments) {
  if (!text) {
    return;
  }

  for (const detector of strictDetectors) {
    detector.pattern.lastIndex = 0;
    for (let match; (match = detector.pattern.exec(text)); ) {
      if (!isPlaceholder(match[0])) {
        recordFinding(
          meta,
          detector.type,
          text,
          match.index,
          match[0],
        );
      }
      if (match[0].length === 0) {
        detector.pattern.lastIndex += 1;
      }
    }
  }

  const jwtPattern =
    /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,}\b/g;
  for (let match; (match = jwtPattern.exec(text)); ) {
    let role = "";
    try {
      const payload = JSON.parse(
        Buffer.from(match[0].split(".")[1], "base64url").toString("utf8"),
      );
      role = typeof payload.role === "string" ? payload.role : "";
    } catch {
      role = "";
    }

    if (role === "anon") {
      allowedPublicKeys += 1;
      continue;
    }

    recordFinding(
      meta,
      role === "service_role" ? "supabase-service-role-jwt" : "jwt-token",
      text,
      match.index,
      match[0],
    );
  }

  if (!includeGenericAssignments || meta.path.endsWith(".env.example")) {
    return;
  }

  const assignmentPatterns = [
    /(?:^|\n)[ \t]*(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE_KEY|DATABASE_URL|DB_URL|API_KEY|SERVICE_ROLE_KEY)[A-Za-z0-9_]*)[ \t]*=[ \t]*([^'"\s#\r\n]{8,})/gim,
    /(?:^|[\s,{])['"]?([A-Za-z][A-Za-z0-9_.-]*(?:secret|token|password|passwd|private[_-]?key|database[_-]?url|db[_-]?url|api[_-]?key|service[_-]?role[_-]?key)[A-Za-z0-9_.-]*)['"]?\s*[:=]\s*['"]([^'"\r\n]{8,})['"]/gim,
  ];

  for (const pattern of assignmentPatterns) {
    for (let match; (match = pattern.exec(text)); ) {
      const key = match[1];
      const value = match[2].trim();
      if (
        /^(?:NEXT_PUBLIC_|PUBLIC_)/i.test(key) ||
        /publishable/i.test(key) ||
        isPlaceholder(value)
      ) {
        continue;
      }

      if (value.length >= 16 && entropy(value) >= 3) {
        recordFinding(
          meta,
          "high-entropy-secret-assignment",
          text,
          match.index,
          value,
          key,
        );
      }
    }
  }
}

function scanBuffer(buffer, meta) {
  const hasNullByte = buffer
    .subarray(0, Math.min(buffer.length, 8192))
    .includes(0);

  if (hasNullByte || binaryExtensions.has(extname(meta.path).toLowerCase())) {
    binaryFilesClassified += 1;
    scanText(buffer.toString("latin1"), meta, false);
    if (hasNullByte) {
      scanText(buffer.toString("utf16le"), meta, false);
    }
    return;
  }

  scanText(buffer.toString("utf8"), meta, true);
}

function scanHistory() {
  const objectLines = runGit(["rev-list", "--objects", "--all"])
    .split(/\r?\n/)
    .filter(Boolean);
  const pathByObject = new Map();

  for (const line of objectLines) {
    const separator = line.indexOf(" ");
    if (separator > 0) {
      const object = line.slice(0, separator);
      if (!pathByObject.has(object)) {
        pathByObject.set(object, line.slice(separator + 1));
      }
    }
  }

  const objects = [...new Set(objectLines.map((line) => line.split(" ", 1)[0]))];
  const allChecks = runGit(
    ["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"],
    { input: `${objects.join("\n")}\n` },
  )
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [object, type, size] = line.split(" ");
      return {
        object,
        type,
        size: Number(size),
        path: pathByObject.get(object) ?? "(unknown)",
      };
    });
  const checks = allChecks.filter(
    ({ type, size }) => type === "blob" && size <= maxBlobBytes,
  );
  oversizedHistoryBlobsSkipped = allChecks.filter(
    ({ type, size }) => type === "blob" && size > maxBlobBytes,
  ).length;

  const batch = spawnSync("git", ["cat-file", "--batch"], {
    cwd: repoRoot,
    input: `${checks.map(({ object }) => object).join("\n")}\n`,
    encoding: null,
    maxBuffer: 768 * 1024 * 1024,
  });

  if (batch.status !== 0) {
    throw new Error("Unable to read Git object history.");
  }

  let position = 0;
  for (const item of checks) {
    const headerEnd = batch.stdout.indexOf(10, position);
    if (headerEnd < 0) {
      throw new Error("Unexpected Git object stream.");
    }

    const header = batch.stdout
      .subarray(position, headerEnd)
      .toString("utf8")
      .split(" ");
    const size = Number(header[2]);
    position = headerEnd + 1;
    const body = batch.stdout.subarray(position, position + size);
    position += size + 1;

    historyBlobsScanned += 1;
    scanBuffer(body, {
      source: "git-history",
      path: item.path,
      object: item.object,
    });
  }
}

function scanCommitMessages() {
  const commits = runGit(["rev-list", "--all"])
    .split(/\r?\n/)
    .filter(Boolean);
  if (commits.length === 0) {
    return;
  }

  const batch = spawnSync("git", ["cat-file", "--batch"], {
    cwd: repoRoot,
    input: `${commits.join("\n")}\n`,
    encoding: null,
    maxBuffer: 256 * 1024 * 1024,
  });

  if (batch.status !== 0) {
    throw new Error("Unable to read Git commit history.");
  }

  let position = 0;
  for (const commit of commits) {
    const headerEnd = batch.stdout.indexOf(10, position);
    if (headerEnd < 0) {
      throw new Error("Unexpected Git commit stream.");
    }

    const header = batch.stdout
      .subarray(position, headerEnd)
      .toString("utf8")
      .split(" ");
    const size = Number(header[2]);
    position = headerEnd + 1;
    const body = batch.stdout.subarray(position, position + size);
    position += size + 1;

    const messageStart = body.indexOf(Buffer.from("\n\n"));
    const message =
      messageStart >= 0
        ? body.subarray(messageStart + 2).toString("utf8")
        : "";
    commitMessagesScanned += 1;
    scanText(
      message,
      {
        source: "git-commit-message",
        path: "(commit message)",
        object: commit,
      },
      true,
    );
  }
}

function scanWorkingTree() {
  const paths = runGit([
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
  ])
    .split("\0")
    .filter(Boolean);

  for (const path of paths) {
    let stats;
    try {
      stats = statSync(path);
    } catch {
      continue;
    }
    if (!stats.isFile()) {
      continue;
    }
    if (stats.size > maxBlobBytes) {
      oversizedWorkingFilesSkipped += 1;
      continue;
    }

    workingFilesScanned += 1;
    scanBuffer(readFileSync(path), {
      source: "working-tree",
      path,
    });
  }
}

function runDetectorSelfTest() {
  const startingFindingCount = findings.length;
  const jwtHeader = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const jwtPayload = Buffer.from(
    JSON.stringify({ role: "service_role", exp: 4_102_444_800 }),
  ).toString("base64url");
  const syntheticInput = [
    ["-----BEGIN", "PRIVATE KEY-----"].join(" "),
    `github_pat_${"Ab1_".repeat(10)}`,
    `postgresql://audit:${"Q7z9-".repeat(6)}@db.invalid/postgres`,
    `CRON_SECRET=${"N7v3Kp9_".repeat(5)}`,
    `${jwtHeader}.${jwtPayload}.${"A1b2C3d4".repeat(5)}`,
  ].join("\n");

  scanText(
    syntheticInput,
    { source: "self-test", path: "(synthetic)" },
    true,
  );

  const detectedTypes = new Set(
    findings
      .slice(startingFindingCount)
      .map((finding) => finding.type),
  );
  const expectedTypes = [
    "private-key",
    "github-token",
    "database-uri-with-credentials",
    "high-entropy-secret-assignment",
    "supabase-service-role-jwt",
  ];

  findings.splice(startingFindingCount);

  for (const expectedType of expectedTypes) {
    if (!detectedTypes.has(expectedType)) {
      throw new Error(`Secret scanner self-test missed ${expectedType}.`);
    }
  }
}

runDetectorSelfTest();
scanHistory();
scanCommitMessages();
scanWorkingTree();

const deduplicated = [
  ...new Map(
    findings.map((finding) => [
      [
        finding.source,
        finding.path,
        finding.line,
        finding.type,
        finding.fingerprint,
      ].join("|"),
      finding,
    ]),
  ).values(),
];

console.log(
  JSON.stringify(
    {
      historyBlobsScanned,
      commitMessagesScanned,
      workingFilesScanned,
      binaryFilesClassified,
      oversizedHistoryBlobsSkipped,
      oversizedWorkingFilesSkipped,
      allowedPublicKeys,
      detectorSelfTest: "passed",
      findings: deduplicated,
    },
    null,
    2,
  ),
);

if (deduplicated.length > 0) {
  process.exitCode = 1;
}
