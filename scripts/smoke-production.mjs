import { pathToFileURL } from "node:url";

const REQUIRED_SECURITY_HEADERS = [
  "content-security-policy",
  "strict-transport-security",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
];

function failure(check, message) {
  return { check, message };
}

async function request(fetchImplementation, baseUrl, path) {
  return fetchImplementation(new URL(path, baseUrl), {
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
    headers: { "user-agent": "anointed-worship-release-smoke/1.0" },
  });
}

export async function runProductionSmoke(baseUrlInput, fetchImplementation = fetch) {
  const failures = [];
  let baseUrl;

  try {
    baseUrl = new URL(baseUrlInput);
  } catch {
    return [failure("origin", "must be a valid absolute URL")];
  }

  if (baseUrl.protocol !== "https:") {
    return [failure("origin", "must use HTTPS")];
  }

  const health = await request(fetchImplementation, baseUrl, "/api/health");
  if (health.status !== 200) {
    failures.push(failure("health", `expected 200, received ${health.status}`));
  } else {
    try {
      const payload = await health.json();
      if (payload.status !== "ok" || payload.dependencies?.supabase !== "reachable") {
        failures.push(failure("health", "did not report Supabase as reachable"));
      }
    } catch {
      failures.push(failure("health", "did not return valid JSON"));
    }
  }

  const login = await request(fetchImplementation, baseUrl, "/login");
  if (login.status !== 200) {
    failures.push(failure("login", `expected 200, received ${login.status}`));
  }
  for (const header of REQUIRED_SECURITY_HEADERS) {
    if (!login.headers.has(header)) {
      failures.push(failure("security headers", `${header} is missing`));
    }
  }
  const contentSecurityPolicy = login.headers.get("content-security-policy") ?? "";
  if (
    contentSecurityPolicy &&
    (!contentSecurityPolicy.includes("default-src 'self'") ||
      !contentSecurityPolicy.includes("frame-ancestors 'none'"))
  ) {
    failures.push(failure("security headers", "content-security-policy is missing required directives"));
  }

  const dashboard = await request(fetchImplementation, baseUrl, "/dashboard");
  const dashboardLocation = dashboard.headers.get("location");
  if (![307, 308].includes(dashboard.status) || !dashboardLocation) {
    failures.push(failure("authentication", "unauthenticated dashboard did not redirect"));
  } else {
    const redirectUrl = new URL(dashboardLocation, baseUrl);
    if (redirectUrl.origin !== baseUrl.origin || redirectUrl.pathname !== "/login") {
      failures.push(failure("authentication", "unauthenticated dashboard redirected outside the login route"));
    }
  }

  const serviceWorker = await request(fetchImplementation, baseUrl, "/sw.js");
  if (serviceWorker.status !== 200) {
    failures.push(failure("service worker", `expected 200, received ${serviceWorker.status}`));
  } else {
    const source = await serviceWorker.text();
    if (!source.includes("anointed-worship-public-v2")) {
      failures.push(failure("service worker", "expected public-v2 cache version was not deployed"));
    }
    if (/ASSETS_TO_CACHE\s*=\s*\[[\s\S]*["']\/dashboard["']/.test(source)) {
      failures.push(failure("service worker", "authenticated dashboard is present in the precache list"));
    }
  }

  const manifest = await request(fetchImplementation, baseUrl, "/manifest.json");
  if (manifest.status !== 200) {
    failures.push(failure("manifest", `expected 200, received ${manifest.status}`));
  } else {
    try {
      const payload = await manifest.json();
      if (payload.orientation === "portrait") {
        failures.push(failure("manifest", "portrait-only orientation restriction is still deployed"));
      }
    } catch {
      failures.push(failure("manifest", "did not return valid JSON"));
    }
  }

  return failures;
}

export function formatProductionSmokeFailure(baseUrl, failures) {
  return [
    `Production smoke failed for ${new URL(baseUrl).origin}:`,
    ...failures.map(({ check, message }) => `- ${check}: ${message}`),
  ].join("\n");
}

function commandLineBaseUrl(argumentsList, environment) {
  const index = argumentsList.indexOf("--base-url");
  if (index !== -1) {
    return argumentsList[index + 1] ?? "";
  }
  return environment.PRODUCTION_BASE_URL ?? environment.NEXT_PUBLIC_SITE_URL ?? "";
}

async function runCli() {
  const baseUrl = commandLineBaseUrl(process.argv.slice(2), process.env);
  if (!baseUrl) {
    console.error(
      "Production smoke requires --base-url, PRODUCTION_BASE_URL, or NEXT_PUBLIC_SITE_URL.",
    );
    process.exitCode = 1;
    return;
  }

  try {
    const failures = await runProductionSmoke(baseUrl);
    if (failures.length > 0) {
      console.error(formatProductionSmokeFailure(baseUrl, failures));
      process.exitCode = 1;
      return;
    }
    console.log(`Production smoke passed for ${new URL(baseUrl).origin}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown request failure";
    console.error(`Production smoke could not complete: ${message}`);
    process.exitCode = 1;
  }
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (entryPoint === import.meta.url) {
  await runCli();
}
