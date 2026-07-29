import { describe, expect, it } from "vitest";
import {
  assertRemotePairingSetlistTeam,
  isRemotePairingActive,
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
