import { describe, expect, it } from "vitest";
import { MAX_JSON_BODY_BYTES, readBoundedJson } from "@/lib/server/request-body";

describe("readBoundedJson", () => {
  it("parses a bounded JSON object without requiring Content-Length", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify({ ok: true }),
      headers: { "content-type": "application/json" },
    });
    await expect(readBoundedJson(request)).resolves.toEqual({ ok: true });
  });

  it("rejects a declared or streamed oversized body", async () => {
    const declared = new Request("http://localhost/api/test", {
      method: "POST",
      body: "{}",
      headers: {
        "content-type": "application/json",
        "content-length": String(MAX_JSON_BODY_BYTES + 1),
      },
    });
    await expect(readBoundedJson(declared)).rejects.toThrow("too large");

    const streamed = new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify({ data: "x".repeat(MAX_JSON_BODY_BYTES) }),
      headers: { "content-type": "application/json" },
    });
    await expect(readBoundedJson(streamed)).rejects.toThrow("too large");
  });

  it("rejects non-JSON and malformed JSON bodies", async () => {
    const wrongType = new Request("http://localhost/api/test", {
      method: "POST",
      body: "{}",
      headers: { "content-type": "text/plain" },
    });
    await expect(readBoundedJson(wrongType)).rejects.toThrow("application/json");

    const malformed = new Request("http://localhost/api/test", {
      method: "POST",
      body: "{",
      headers: { "content-type": "application/json" },
    });
    await expect(readBoundedJson(malformed)).rejects.toThrow("valid JSON");
  });
});
