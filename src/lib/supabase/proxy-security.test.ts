import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  isPublicWebsiteRoute,
  isVerifiedMachineRoute,
} from "@/lib/supabase/proxy";

describe("website proxy security boundary", () => {
  it("recognizes only exact cron routes with the correct bearer", () => {
    expect(isVerifiedMachineRoute(
      "/api/songs/cleanup-trash",
      new Headers({ authorization: "Bearer cron-test" }),
      "cron-test",
    )).toBe(true);
    expect(isVerifiedMachineRoute(
      "/api/messages/send-scheduled",
      new Headers({ authorization: "Bearer cron-test" }),
      "cron-test",
    )).toBe(true);
    expect(isVerifiedMachineRoute(
      "/api/songs/cleanup-trash/extra",
      new Headers({ authorization: "Bearer cron-test" }),
      "cron-test",
    )).toBe(false);
    expect(isVerifiedMachineRoute(
      "/api/songs/cleanup-trash",
      new Headers({ authorization: "Bearer wrong" }),
      "cron-test",
    )).toBe(false);
  });

  it("generates a production CSP without unsafe inline or eval scripts", () => {
    const csp = buildContentSecurityPolicy("nonce-value", false);
    const scriptDirective = csp.split(";").find((directive) => directive.trim().startsWith("script-src"));
    expect(scriptDirective).toContain("script-src 'self' 'nonce-nonce-value'");
    expect(scriptDirective).not.toContain("'strict-dynamic'");
    expect(scriptDirective).not.toContain("'unsafe-inline'");
    expect(scriptDirective).not.toContain("'unsafe-eval'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  it("allows only the approved Spotify and YouTube embed origins", () => {
    const csp = buildContentSecurityPolicy("nonce-value", false);
    const frameDirective = csp
      .split(";")
      .find((directive) => directive.trim().startsWith("frame-src"));

    expect(frameDirective?.trim()).toBe(
      "frame-src https://open.spotify.com https://www.youtube.com https://www.youtube-nocookie.com",
    );
    expect(frameDirective).not.toContain("*");
  });

  it("allows unsafe eval only for development debugging", () => {
    expect(buildContentSecurityPolicy("nonce-value", true)).toContain("'unsafe-eval'");
  });

  it("allows pairing entry before sign-in but protects claimed sessions", () => {
    expect(isPublicWebsiteRoute("/worship-remote")).toBe(true);
    expect(isPublicWebsiteRoute("/worship-remote/session/session-1")).toBe(false);
  });
});
