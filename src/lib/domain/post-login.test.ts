import { describe, expect, it } from "vitest";
import { resolvePostLoginPath, resolveSafePostLoginReturnPath } from "@/lib/domain/post-login";

describe("post-login routing", () => {
  it("sends active team members to Home", () => {
    expect(resolvePostLoginPath({ hasActiveMembership: true, hasPendingJoinRequest: true })).toBe("/dashboard");
  });

  it("sends users with pending requests to the pending screen", () => {
    expect(resolvePostLoginPath({ hasActiveMembership: false, hasPendingJoinRequest: true })).toBe("/pending");
  });

  it("sends users with no team state to onboarding", () => {
    expect(resolvePostLoginPath({ hasActiveMembership: false, hasPendingJoinRequest: false })).toBe("/teams");
  });

  it("returns only to the public Worship Remote pairing screen", () => {
    expect(resolveSafePostLoginReturnPath("/worship-remote", "/dashboard")).toBe("/worship-remote");
    expect(resolveSafePostLoginReturnPath("https://evil.example", "/dashboard")).toBe("/dashboard");
    expect(resolveSafePostLoginReturnPath("//evil.example", "/dashboard")).toBe("/dashboard");
    expect(resolveSafePostLoginReturnPath("/worship-remote/session/secret", "/dashboard")).toBe("/dashboard");
  });
});
