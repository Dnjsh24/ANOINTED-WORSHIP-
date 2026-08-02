import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/desktop/runtime", () => ({ isDesktopRuntime: () => false }));
vi.mock("@/lib/desktop/workspace", () => ({ findDesktopBibleVerses: () => [] }));

import { GET } from "./route";

describe("Bible API input validation", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("requires a query", async () => {
    const response = await GET(new NextRequest("http://localhost/api/bible"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Missing query" });
  });

  it("rejects unsupported translations before querying a Bible source", async () => {
    const response = await GET(new NextRequest("http://localhost/api/bible?q=John%203&translation=unknown"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Unsupported Bible translation" });
  });

  it("rejects unknown books and out-of-range chapters", async () => {
    const unknownBook = await GET(new NextRequest("http://localhost/api/bible?q=Unknown%201&translation=kjv"));
    const invalidChapter = await GET(new NextRequest("http://localhost/api/bible?q=John%2022&translation=web"));
    expect(unknownBook.status).toBe(400);
    expect(invalidChapter.status).toBe(400);
  });

  it.each([
    "John 3:0",
    "John 3:177",
    "John 3:8-7",
    "John 3:1-177",
    "John",
  ])("rejects malformed or out-of-range verse reference %s", async (query) => {
    const response = await GET(
      new NextRequest(`http://localhost/api/bible?q=${encodeURIComponent(query)}&translation=kjv`),
    );
    expect(response.status).toBe(400);
  });

  it("proxies a valid passage with the selected translation", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ reference: "John 3:16", text: "For God so loved..." }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const response = await GET(
      new NextRequest("http://localhost/api/bible?q=John%203%3A16&translation=web"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ reference: "John 3:16" });
    expect(fetch).toHaveBeenCalledWith(
      "https://bible-api.com/John%203%3A16?translation=web",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("preserves the upstream status without exposing its response body", async () => {
    const privateProviderDetail = "Passage not found: internal-provider-detail";
    vi.mocked(fetch).mockResolvedValue(new Response(privateProviderDetail, { status: 404 }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET(new NextRequest("http://localhost/api/bible?q=John%203"));
    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload).toEqual({ error: "Bible provider request failed" });
    expect(JSON.stringify(payload)).not.toContain(privateProviderDetail);
  });

  it("uses a safe fallback for empty upstream errors", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 502 }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET(new NextRequest("http://localhost/api/bible?q=John%203"));
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "Bible provider request failed" });
  });

  it.each([new Error("network failed: private detail"), "unknown failure"])(
    "returns a redacted 500 response when fetching throws",
    async (reason) => {
    vi.mocked(fetch).mockRejectedValue(reason);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET(new NextRequest("http://localhost/api/bible?q=John%203"));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to fetch verse" });
    },
  );
});
