import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimCloudRemotePairing,
  claimCloudRemotePairingByPin,
  createCloudRemotePairing,
  resumeCloudRemotePairing,
  revokeCloudRemotePairing,
} from "./remote-pairing-actions";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  qr: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc }),
}));

vi.mock("@/lib/supabase/env", () => ({
  getSiteUrl: () => "https://worship.example",
}));

vi.mock("qrcode", () => ({
  default: { toDataURL: mocks.qr },
}));

const sessionId = "2fba2e5d-ae65-4c8c-a434-bc2016795c9b";
const setlistId = "32c5c66e-cf0d-43d0-ac4c-171319b6f548";
const token = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("secure cloud Remote pairing actions", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.qr.mockReset().mockResolvedValue("data:image/png;base64,qr");
  });

  it("creates a private eight-hour session with a fragment-only QR token", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{
        session_id: sessionId,
        qr_token: token,
        pin_code: "123456",
        claim_expires_at: "2026-08-02T02:10:00.000Z",
        expires_at: "2026-08-02T10:00:00.000Z",
        channel_topic: `worship-remote-session:${sessionId}`,
        private_channel: true,
      }],
      error: null,
    });

    const pairing = await createCloudRemotePairing(setlistId);

    expect(mocks.rpc).toHaveBeenCalledWith("create_worship_remote_pairing", { p_setlist_id: setlistId });
    expect(pairing.url).toBe(`https://worship.example/worship-remote#pair=${sessionId}.${token}`);
    expect(new URL(pairing.url).search).toBe("");
    expect(pairing).toMatchObject({
      sessionId,
      pinCode: "123456",
      channelTopic: `worship-remote-session:${sessionId}`,
      privateChannel: true,
    });
  });

  it("claims a QR and PIN without exposing database errors", async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: [{ session_id: sessionId, setlist_id: setlistId, team_id: "team-1", expires_at: "2026-08-02T10:00:00.000Z", channel_topic: `worship-remote-session:${sessionId}`, private_channel: true }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ session_id: null, error_code: "rate_limited" }],
        error: null,
      });

    await expect(claimCloudRemotePairing(`${sessionId}.${token}`)).resolves.toMatchObject({ ok: true, sessionId });
    await expect(claimCloudRemotePairingByPin("123456")).resolves.toEqual({
      ok: false,
      code: "rate_limited",
      message: "Too many incorrect codes. Wait 10 minutes, then try again.",
    });
  });

  it("resumes and revokes only through the dedicated RPCs", async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: [{ session_id: sessionId, setlist_id: setlistId, team_id: "team-1", expires_at: "2026-08-02T10:00:00.000Z", channel_topic: `worship-remote-session:${sessionId}`, private_channel: true }],
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null });

    await expect(resumeCloudRemotePairing(sessionId)).resolves.toMatchObject({ ok: true, sessionId });
    await expect(revokeCloudRemotePairing(sessionId)).resolves.toBe(true);
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "resume_worship_remote_pairing", { p_session_id: sessionId });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "revoke_worship_remote_pairing", { p_session_id: sessionId });
  });
});
