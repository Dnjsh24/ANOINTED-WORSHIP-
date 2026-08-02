import { describe, expect, it } from "vitest";
import { hasValidCronAuthorization } from "./cron-auth";

describe("hasValidCronAuthorization", () => {
  it("fails closed when the secret is missing", () => {
    expect(hasValidCronAuthorization(new Request("http://localhost"), undefined)).toBe(false);
  });

  it("rejects missing and incorrect credentials", () => {
    expect(hasValidCronAuthorization(new Request("http://localhost"), "secret")).toBe(false);
    expect(hasValidCronAuthorization(new Request("http://localhost", {
      headers: { authorization: "Bearer wrong" },
    }), "secret")).toBe(false);
  });

  it("accepts the exact bearer credential", () => {
    expect(hasValidCronAuthorization(new Request("http://localhost", {
      headers: { authorization: "Bearer secret" },
    }), "secret")).toBe(true);
  });
});
