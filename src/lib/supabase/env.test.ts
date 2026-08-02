import { afterEach, describe, expect, it } from "vitest";
import { getSiteUrl, getSupabaseEnv, hasSupabaseEnv } from "@/lib/supabase/env";

const original = {
  demo: process.env.E2E_FORCE_DEMO,
  publicDemo: process.env.NEXT_PUBLIC_E2E_FORCE_DEMO,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
};

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

afterEach(() => {
  restoreEnvironment("E2E_FORCE_DEMO", original.demo);
  restoreEnvironment("NEXT_PUBLIC_E2E_FORCE_DEMO", original.publicDemo);
  restoreEnvironment("NEXT_PUBLIC_SITE_URL", original.siteUrl);
  restoreEnvironment("NEXT_PUBLIC_SUPABASE_URL", original.supabaseUrl);
  restoreEnvironment("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", original.supabaseKey);
});

describe("Supabase and site environment validation", () => {
  it("forces demo mode even when Supabase values exist", () => {
    process.env.E2E_FORCE_DEMO = "1";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable";
    expect(hasSupabaseEnv()).toBe(false);
    expect(() => getSupabaseEnv()).toThrow("disabled in forced demo mode");
  });

  it("propagates forced demo mode into browser code", () => {
    delete process.env.E2E_FORCE_DEMO;
    process.env.NEXT_PUBLIC_E2E_FORCE_DEMO = "1";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable";

    expect(hasSupabaseEnv()).toBe(false);
    expect(() => getSupabaseEnv()).toThrow("disabled in forced demo mode");
  });

  it("requires both Supabase values and returns them when configured", () => {
    delete process.env.E2E_FORCE_DEMO;
    delete process.env.NEXT_PUBLIC_E2E_FORCE_DEMO;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    expect(hasSupabaseEnv()).toBe(false);
    expect(() => getSupabaseEnv()).toThrow("not configured");

    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable";
    expect(hasSupabaseEnv()).toBe(true);
    expect(getSupabaseEnv()).toEqual({
      url: "https://project.supabase.co",
      publishableKey: "publishable",
    });
  });

  it("normalizes valid site URLs and rejects non-HTTP protocols", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(getSiteUrl()).toBe("http://localhost:3000");

    process.env.NEXT_PUBLIC_SITE_URL = "https://worship.example/path";
    expect(getSiteUrl()).toBe("https://worship.example");

    process.env.NEXT_PUBLIC_SITE_URL = "javascript:alert(1)";
    expect(() => getSiteUrl()).toThrow("HTTP or HTTPS");
  });
});
