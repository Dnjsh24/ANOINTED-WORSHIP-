import { describe, expect, it } from "vitest";

import { safeErrorDetails } from "@/lib/server/safe-error";

describe("safeErrorDetails", () => {
  it("keeps only bounded identifiers and an HTTP status", () => {
    expect(
      safeErrorDetails({
        name: "PostgrestError",
        code: "PGRST116",
        statusCode: 409,
        message: "private database detail",
      }),
    ).toEqual({ type: "PostgrestError", code: "PGRST116", status: 409 });
  });

  it("does not retain secret-bearing provider or request fields", () => {
    const secret = "authorization-bearer-secret";
    const details = safeErrorDetails({
      name: "FetchError",
      message: secret,
      stack: secret,
      endpoint: `https://push.example/${secret}`,
      headers: { authorization: secret },
      body: secret,
    });

    expect(JSON.stringify(details)).not.toContain(secret);
    expect(details).toEqual({ type: "FetchError" });
  });

  it("rejects attacker-controlled identifiers and invalid statuses", () => {
    expect(
      safeErrorDetails({
        name: "Error\nsecret",
        code: "code with a secret",
        status: 999,
      }),
    ).toEqual({ type: "Error" });
    expect(safeErrorDetails("plain failure")).toEqual({ type: "Error" });
  });
});
