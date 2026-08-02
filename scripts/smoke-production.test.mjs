import { describe, expect, it } from "vitest";

import { runProductionSmoke } from "./smoke-production.mjs";

function response(body, init = {}) {
  return new Response(body, init);
}

function successfulFetch(url) {
  const path = new URL(url).pathname;
  const securityHeaders = {
    "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
    "strict-transport-security": "max-age=63072000",
    "x-frame-options": "DENY",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=()",
  };

  if (path === "/api/health") {
    return Promise.resolve(
      Response.json({ status: "ok", dependencies: { supabase: "reachable" } }),
    );
  }
  if (path === "/login") {
    return Promise.resolve(response("login", { status: 200, headers: securityHeaders }));
  }
  if (path === "/dashboard") {
    return Promise.resolve(
      response("", { status: 307, headers: { location: "https://worship.example/login" } }),
    );
  }
  if (path === "/sw.js") {
    return Promise.resolve(
      response('const CACHE_NAME = "anointed-worship-public-v2"; const ASSETS_TO_CACHE = ["/"];'),
    );
  }
  if (path === "/manifest.json") {
    return Promise.resolve(Response.json({ name: "Anointed Worship", display: "standalone" }));
  }
  throw new Error(`Unexpected path: ${path}`);
}

describe("production smoke", () => {
  it("accepts the expected public production contract", async () => {
    await expect(runProductionSmoke("https://worship.example", successfulFetch)).resolves.toEqual(
      [],
    );
  });

  it("rejects a non-HTTPS production origin before making requests", async () => {
    const fetchImplementation = () => {
      throw new Error("must not be called");
    };

    await expect(
      runProductionSmoke("http://worship.example", fetchImplementation),
    ).resolves.toEqual([{ check: "origin", message: "must use HTTPS" }]);
  });

  it("detects stale health, headers, authentication, service worker, and manifest behavior", async () => {
    const staleFetch = async (url) => {
      const path = new URL(url).pathname;
      if (path === "/api/health") return response("", { status: 307 });
      if (path === "/login") return response("login");
      if (path === "/dashboard") return response("dashboard");
      if (path === "/sw.js") {
        return response('const ASSETS_TO_CACHE = ["/dashboard"];');
      }
      if (path === "/manifest.json") return Response.json({ orientation: "portrait" });
      throw new Error(`Unexpected path: ${path}`);
    };

    const failures = await runProductionSmoke("https://worship.example", staleFetch);
    expect(failures).toEqual(
      expect.arrayContaining([
        { check: "health", message: "expected 200, received 307" },
        {
          check: "authentication",
          message: "unauthenticated dashboard did not redirect",
        },
        {
          check: "service worker",
          message: "expected public-v2 cache version was not deployed",
        },
        {
          check: "service worker",
          message: "authenticated dashboard is present in the precache list",
        },
        {
          check: "manifest",
          message: "portrait-only orientation restriction is still deployed",
        },
      ]),
    );
    expect(failures.filter((item) => item.check === "security headers")).toHaveLength(6);
  });
});
