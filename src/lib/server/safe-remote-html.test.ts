import { beforeEach, describe, expect, it, vi } from "vitest";

const lookupMock = vi.hoisted(() => vi.fn());

vi.mock("node:dns/promises", async () => {
  const actual = await vi.importActual<typeof import("node:dns/promises")>("node:dns/promises");
  return {
    ...actual,
    default: { ...actual, lookup: lookupMock },
    lookup: lookupMock,
  };
});

import {
  fetchAllowedRemoteHtml,
  isPrivateNetworkAddress,
  MAX_IMPORT_BYTES,
  parseAllowedImportUrl,
} from "./safe-remote-html";

describe("safe remote chord import", () => {
  beforeEach(() => {
    lookupMock.mockReset();
    lookupMock.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
  });

  it.each([
    "http://worshipchords.com/song",
    "https://user:pass@worshipchords.com/song",
    "https://worshipchords.com:8443/song",
    "https://example.com/song",
    "https://127.0.0.1/song",
    "not-a-url",
  ])("rejects unsupported URL %s", (value) => {
    expect(() => parseAllowedImportUrl(value)).toThrow();
  });

  it("rejects non-string and overlong URLs", () => {
    expect(() => parseAllowedImportUrl(null)).toThrow("valid supported URL");
    expect(() => parseAllowedImportUrl(`https://worshipchords.com/${"x".repeat(2049)}`)).toThrow(
      "valid supported URL",
    );
  });

  it("accepts supported HTTPS providers", () => {
    expect(parseAllowedImportUrl("https://www.worshipchords.com/song").hostname).toBe("www.worshipchords.com");
    expect(parseAllowedImportUrl("https://tabs.ultimate-guitar.com/tab").hostname).toBe("tabs.ultimate-guitar.com");
  });

  it.each(["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.1.1", "::1", "fd00::1"])(
    "classifies %s as private",
    (address) => expect(isPrivateNetworkAddress(address)).toBe(true),
  );

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])(
    "classifies %s as public",
    (address) => expect(isPrivateNetworkAddress(address)).toBe(false),
  );

  it.each([
    "0.0.0.0",
    "100.64.0.1",
    "198.18.0.1",
    "224.0.0.1",
    "::",
    "fe80::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "invalid-address",
  ])("classifies reserved or invalid address %s as private", (address) => {
    expect(isPrivateNetworkAddress(address)).toBe(true);
  });

  it("fetches an allowed public HTML page", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response("<html>song</html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );

    await expect(fetchAllowedRemoteHtml("https://worshipchords.com/song", fetcher)).resolves.toMatchObject({
      html: "<html>song</html>",
      url: expect.objectContaining({ hostname: "worshipchords.com" }),
    });
    expect(fetcher).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it("follows relative redirects only while they remain on an allowed provider", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: "/final" },
      }))
      .mockResolvedValueOnce(new Response("<html>final</html>", {
        status: 200,
        headers: { "content-type": "application/xhtml+xml" },
      }));

    const result = await fetchAllowedRemoteHtml("https://worshipchords.com/start", fetcher);
    expect(result.url.pathname).toBe("/final");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects redirects to an unsupported host and redirect loops", async () => {
    const offsite = vi.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "https://example.com/song" } }),
    );
    await expect(fetchAllowedRemoteHtml("https://worshipchords.com/start", offsite)).rejects.toThrow(
      "not supported",
    );

    const loop = vi.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "/again" } }),
    );
    await expect(fetchAllowedRemoteHtml("https://worshipchords.com/start", loop)).rejects.toThrow(
      "too many times",
    );
  });

  it("rejects private DNS answers, HTTP failures, and non-HTML responses", async () => {
    lookupMock.mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    await expect(fetchAllowedRemoteHtml("https://worshipchords.com/song", vi.fn())).rejects.toThrow(
      "private network",
    );

    await expect(fetchAllowedRemoteHtml(
      "https://worshipchords.com/song",
      vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })),
    )).rejects.toThrow("HTTP 503");

    await expect(fetchAllowedRemoteHtml(
      "https://worshipchords.com/song",
      vi.fn().mockResolvedValue(new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      })),
    )).rejects.toThrow("HTML page");
  });

  it("rejects responses that declare or stream more than the byte limit", async () => {
    const declared = new Response(null, {
      status: 200,
      headers: {
        "content-type": "text/html",
        "content-length": String(MAX_IMPORT_BYTES + 1),
      },
    });
    await expect(fetchAllowedRemoteHtml(
      "https://worshipchords.com/song",
      vi.fn().mockResolvedValue(declared),
    )).rejects.toThrow("too large");

    const oversized = new Response(new Uint8Array(MAX_IMPORT_BYTES + 1), {
      status: 200,
      headers: { "content-type": "text/html" },
    });
    await expect(fetchAllowedRemoteHtml(
      "https://worshipchords.com/song",
      vi.fn().mockResolvedValue(oversized),
    )).rejects.toThrow("too large");
  });
});
