import { pathToFileURL } from "node:url";

const REQUIRED_PRODUCTION_VARIABLES = [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CRON_SECRET",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
];

const PLACEHOLDER_PATTERN =
  /(?:^|[-_\s])(change[-_\s]?me|example|placeholder|replace|sample|test|your[-_\s]|todo)(?:$|[-_\s])/i;

function valueOf(environment, variable) {
  const value = environment[variable];
  return typeof value === "string" ? value.trim() : "";
}

function isPlaceholder(value) {
  return PLACEHOLDER_PATTERN.test(value);
}

function addIssue(issues, variable, message) {
  issues.push({ variable, message });
}

function validateHttpsUrl(issues, environment, variable, { allowLocalhost = false } = {}) {
  const value = valueOf(environment, variable);
  if (!value) {
    return;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      addIssue(issues, variable, "must use HTTPS in production");
    }
    if (url.username || url.password) {
      addIssue(issues, variable, "must not contain embedded credentials");
    }
    if (!allowLocalhost && ["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
      addIssue(issues, variable, "must not point to localhost in production");
    }
  } catch {
    addIssue(issues, variable, "must be a valid absolute URL");
  }
}

function validateSecret(issues, environment, variable, minimumBytes) {
  const value = valueOf(environment, variable);
  if (!value) {
    return;
  }
  if (isPlaceholder(value)) {
    addIssue(issues, variable, "must not use a placeholder value");
  }
  if (Buffer.byteLength(value, "utf8") < minimumBytes) {
    addIssue(issues, variable, `must contain at least ${minimumBytes} bytes`);
  }
}

function validateOptionalPair(issues, environment, first, second) {
  const firstPresent = Boolean(valueOf(environment, first));
  const secondPresent = Boolean(valueOf(environment, second));
  if (firstPresent !== secondPresent) {
    addIssue(issues, firstPresent ? second : first, `must be configured together with ${firstPresent ? first : second}`);
  }
}

export function validateProductionEnvironment(environment = process.env) {
  const issues = [];

  for (const variable of REQUIRED_PRODUCTION_VARIABLES) {
    const value = valueOf(environment, variable);
    if (!value) {
      addIssue(issues, variable, "is required for production");
    } else if (isPlaceholder(value)) {
      addIssue(issues, variable, "must not use a placeholder value");
    }
  }

  validateHttpsUrl(issues, environment, "NEXT_PUBLIC_SITE_URL");
  validateHttpsUrl(issues, environment, "NEXT_PUBLIC_SUPABASE_URL");
  validateHttpsUrl(issues, environment, "UPSTASH_REDIS_REST_URL");

  validateSecret(issues, environment, "CRON_SECRET", 32);
  validateSecret(issues, environment, "SUPABASE_SERVICE_ROLE_KEY", 32);
  validateSecret(issues, environment, "UPSTASH_REDIS_REST_TOKEN", 20);

  const publishableKey = valueOf(environment, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = valueOf(environment, "SUPABASE_SERVICE_ROLE_KEY");
  if (publishableKey && serviceRoleKey && publishableKey === serviceRoleKey) {
    addIssue(
      issues,
      "SUPABASE_SERVICE_ROLE_KEY",
      "must be different from NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  }

  validateOptionalPair(issues, environment, "NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY");
  validateOptionalPair(issues, environment, "SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET");

  if (valueOf(environment, "NEXT_PUBLIC_VAPID_PUBLIC_KEY")) {
    validateSecret(issues, environment, "NEXT_PUBLIC_VAPID_PUBLIC_KEY", 40);
    validateSecret(issues, environment, "VAPID_PRIVATE_KEY", 20);
  }
  if (valueOf(environment, "SPOTIFY_CLIENT_ID")) {
    validateSecret(issues, environment, "SPOTIFY_CLIENT_ID", 16);
    validateSecret(issues, environment, "SPOTIFY_CLIENT_SECRET", 16);
  }

  return issues;
}

export function formatProductionEnvironmentFailure(issues) {
  return [
    "Production environment preflight failed. Values were not printed:",
    ...issues.map(({ variable, message }) => `- ${variable}: ${message}`),
  ].join("\n");
}

function shouldValidate(argumentsList, environment) {
  return argumentsList.includes("--force") || environment.VERCEL_ENV === "production";
}

function runCli() {
  if (!shouldValidate(process.argv.slice(2), process.env)) {
    console.log("Production environment preflight skipped outside a Vercel production build.");
    return;
  }

  const issues = validateProductionEnvironment(process.env);
  if (issues.length > 0) {
    console.error(formatProductionEnvironmentFailure(issues));
    process.exitCode = 1;
    return;
  }

  console.log(
    `Production environment preflight passed (${REQUIRED_PRODUCTION_VARIABLES.length} required variables; values redacted).`,
  );
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (entryPoint === import.meta.url) {
  runCli();
}
