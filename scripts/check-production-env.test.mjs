import { describe, expect, it } from "vitest";

import {
  formatProductionEnvironmentFailure,
  validateProductionEnvironment,
} from "./check-production-env.mjs";

const validEnvironment = {
  NEXT_PUBLIC_SITE_URL: "https://worship.example",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: `sb_publishable_${"p".repeat(32)}`,
  SUPABASE_SERVICE_ROLE_KEY: `sb_secret_${"s".repeat(40)}`,
  CRON_SECRET: "c".repeat(32),
  UPSTASH_REDIS_REST_URL: "https://redis.example",
  UPSTASH_REDIS_REST_TOKEN: "r".repeat(24),
};

describe("production environment preflight", () => {
  it("requires main for Vercel production builds, including redeploys", () => {
    expect(validateProductionEnvironment({ ...validEnvironment, VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" })).toEqual([]);
    for (const branch of ["codex/website-production-readiness", "Dn-Jsh/Fixing-things", ""]) {
      expect(validateProductionEnvironment({ ...validEnvironment, VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: branch })).toEqual([
        { variable: "VERCEL_GIT_COMMIT_REF", message: "production builds must use main; integrate reviewed changes before deploying" },
      ]);
    }
  });

  it("allows feature branch preview builds", () => {
    expect(validateProductionEnvironment({ ...validEnvironment, VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "codex/website-production-readiness" })).toEqual([]);
  });

  it("accepts a complete production environment", () => {
    expect(validateProductionEnvironment(validEnvironment)).toEqual([]);
  });

  it("reports every missing required variable without reading optional integrations", () => {
    const issues = validateProductionEnvironment({});

    expect(issues.map((issue) => issue.variable)).toEqual([
      "NEXT_PUBLIC_SITE_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "CRON_SECRET",
      "UPSTASH_REDIS_REST_URL",
      "UPSTASH_REDIS_REST_TOKEN",
    ]);
  });

  it("rejects insecure URLs, weak secrets, placeholders, and key reuse", () => {
    const privateDetail = "do-not-print-this-secret";
    const issues = validateProductionEnvironment({
      ...validEnvironment,
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: privateDetail,
      SUPABASE_SERVICE_ROLE_KEY: privateDetail,
      CRON_SECRET: "replace-with-a-secret",
      UPSTASH_REDIS_REST_TOKEN: "short",
    });
    const output = formatProductionEnvironmentFailure(issues);

    expect(issues.some((issue) => issue.variable === "NEXT_PUBLIC_SITE_URL")).toBe(true);
    expect(issues.some((issue) => issue.variable === "NEXT_PUBLIC_SUPABASE_URL")).toBe(true);
    expect(issues.some((issue) => issue.message.includes("different"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("at least 32 bytes"))).toBe(true);
    expect(output).not.toContain(privateDetail);
    expect(output).not.toContain("replace-with-a-secret");
  });

  it("requires optional credential pairs to be configured together", () => {
    const issues = validateProductionEnvironment({
      ...validEnvironment,
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: "v".repeat(64),
      SPOTIFY_CLIENT_SECRET: "s".repeat(32),
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        {
          variable: "VAPID_PRIVATE_KEY",
          message: "must be configured together with NEXT_PUBLIC_VAPID_PUBLIC_KEY",
        },
        {
          variable: "SPOTIFY_CLIENT_ID",
          message: "must be configured together with SPOTIFY_CLIENT_SECRET",
        },
      ]),
    );
  });
});
