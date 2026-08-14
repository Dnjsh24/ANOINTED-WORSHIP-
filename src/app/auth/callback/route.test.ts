import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  desktopMode: true,
  hasSupabaseEnvironment: true,
  exchangeError: null as Error | null,
  exchangeCodeForSession: vi.fn(),
}));

vi.mock("@/lib/desktop/runtime", () => ({
  isDesktopRuntime: () => mocks.desktopMode,
}));

vi.mock("@/lib/supabase/env", () => ({
  getSiteUrl: () => "http://localhost:3100",
  hasSupabaseEnv: () => mocks.hasSupabaseEnvironment,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      exchangeCodeForSession: mocks.exchangeCodeForSession,
    },
  }),
}));

vi.mock("@/lib/supabase/team-context", () => ({
  getPostLoginRedirectPath: async () => "/dashboard",
}));

import { GET } from "./route";

describe("desktop OAuth callback redirects", () => {
  beforeEach(() => {
    mocks.desktopMode = true;
    mocks.hasSupabaseEnvironment = true;
    mocks.exchangeError = null;
    mocks.exchangeCodeForSession.mockReset();
    mocks.exchangeCodeForSession.mockImplementation(async () => ({ error: mocks.exchangeError }));
  });

  it("keeps missing-code errors on the Electron loopback origin", async () => {
    const response = await GET(
      new NextRequest("http://127.0.0.1:59453/auth/callback", {
        headers: { host: "127.0.0.1:59453" },
      }),
    );

    expect(response.headers.get("location")).toBe(
      "http://127.0.0.1:59453/login?error=auth",
    );
  });

  it("keeps successful desktop sign-in on the Electron loopback origin", async () => {
    const response = await GET(
      new NextRequest("http://127.0.0.1:59453/auth/callback?code=desktop-code", {
        headers: { host: "127.0.0.1:59453" },
      }),
    );

    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("desktop-code");
    expect(response.headers.get("location")).toBe(
      "http://127.0.0.1:59453/dashboard",
    );
  });

  it("does not trust a non-loopback Host header in desktop mode", async () => {
    const response = await GET(
      new NextRequest("http://attacker.example/auth/callback", {
        headers: { host: "attacker.example" },
      }),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3100/login?error=auth",
    );
  });

  it("falls back safely when the desktop Host header is malformed", async () => {
    const response = await GET(
      new NextRequest("http://127.0.0.1:59453/auth/callback", {
        headers: { host: "127.0.0.1:59453%2f%2fattacker.example" },
      }),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3100/login?error=auth",
    );
  });

  it("continues using the configured site origin for the hosted website", async () => {
    mocks.desktopMode = false;

    const response = await GET(
      new NextRequest("https://deployment-preview.example/auth/callback"),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3100/login?error=auth",
    );
  });
});
