import { describe, expect, it } from "vitest";
import {
  assertRemotePairingSetlistTeam,
  formatRemotePairingPin,
  getPresenterDestination,
  isRemotePairingActive,
  normalizeRemotePairingPin,
  parseCloudPairingToken,
  parseWorshipRemoteQrPayload,
  resolveRemoteChannelTarget,
} from "./remote-pairing";

describe("QR Remote session expiry", () => {
  it("accepts only a valid unexpired timestamp", () => {
    expect(isRemotePairingActive("2026-07-27T01:00:01.000Z", Date.parse("2026-07-27T01:00:00.000Z"))).toBe(true);
    expect(isRemotePairingActive("2026-07-27T01:00:00.000Z", Date.parse("2026-07-27T01:00:00.000Z"))).toBe(false);
    expect(isRemotePairingActive("invalid", 0)).toBe(false);
  });
});

describe("QR Remote team isolation", () => {
  it("rejects creating a pairing for a setlist owned by another team", () => {
    expect(() => assertRemotePairingSetlistTeam("team-a", "team-b")).toThrow("selected team");
    expect(() => assertRemotePairingSetlistTeam("team-a", "team-a")).not.toThrow();
  });
});

describe("QR Remote channel privacy", () => {
  it("uses a private Realtime channel for a claimed session", () => {
    const target = resolveRemoteChannelTarget({
      setlistId: "setlist-1",
      cloudTopic: "worship-remote-session:2fba2e5d-ae65-4c8c-a434-bc2016795c9b",
      cloudPrivate: true,
      expiresAt: "2026-07-27T01:00:01.000Z",
      now: Date.parse("2026-07-27T01:00:00.000Z"),
    });

    expect(target).toEqual({
      topic: "worship-remote-session:2fba2e5d-ae65-4c8c-a434-bc2016795c9b",
      options: { config: { private: true } },
    });
  });

  it("falls back to a private setlist channel when a cloud pairing expires", () => {
    const target = resolveRemoteChannelTarget({
      setlistId: "setlist-1",
      cloudTopic: "worship-remote-session:secret",
      expiresAt: "2026-07-27T01:00:00.000Z",
      now: Date.parse("2026-07-27T01:00:01.000Z"),
    });

    expect(target).toEqual({
      topic: "worship-remote:setlist-1",
      options: { config: { private: true } },
    });
  });
});

describe("Worship Remote pairing input", () => {
  const sessionId = "2fba2e5d-ae65-4c8c-a434-bc2016795c9b";
  const token = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  it("normalizes and formats a six-digit PIN", () => {
    expect(normalizeRemotePairingPin("12 3-45a6")).toBe("123456");
    expect(normalizeRemotePairingPin("1234567")).toBe("123456");
    expect(formatRemotePairingPin("123456")).toBe("123 456");
  });

  it("validates the opaque QR pairing token", () => {
    expect(parseCloudPairingToken(`${sessionId}.${token}`)).toEqual({ sessionId, token });
    expect(parseCloudPairingToken(`not-a-uuid.${token}`)).toBeNull();
    expect(parseCloudPairingToken(`${sessionId}.short`)).toBeNull();
  });

  it("accepts only same-origin Worship Remote QR links", () => {
    const origin = "https://worship.example";
    expect(parseWorshipRemoteQrPayload(
      `${origin}/worship-remote#pair=${sessionId}.${token}`,
      origin,
    )).toBe(`${sessionId}.${token}`);
    expect(parseWorshipRemoteQrPayload(
      `${origin}/setlists/setlist-1/remote?pair=${sessionId}.${token}`,
      origin,
    )).toBe(`${sessionId}.${token}`);
    expect(parseWorshipRemoteQrPayload(
      `https://evil.example/worship-remote#pair=${sessionId}.${token}`,
      origin,
    )).toBeNull();
    expect(parseWorshipRemoteQrPayload(
      `${origin}/dashboard#pair=${sessionId}.${token}`,
      origin,
    )).toBeNull();
  });
});

describe("Presenter runtime routing", () => {
  it("keeps Presenter on Windows and sends the website to Worship Remote", () => {
    expect(getPresenterDestination(true)).toBeNull();
    expect(getPresenterDestination(false)).toBe("/worship-remote");
    expect(getPresenterDestination(true, "setlist/one")).toBe("/presenter?setlist=setlist%2Fone");
    expect(getPresenterDestination(false, "setlist/one")).toBe("/worship-remote");
  });
});
