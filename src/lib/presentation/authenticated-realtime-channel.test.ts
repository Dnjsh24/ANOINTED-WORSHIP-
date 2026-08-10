import { describe, expect, it, vi } from "vitest";

import {
  authenticateRealtimeClient,
  realtimeConnectionErrorMessage,
} from "./authenticated-realtime-channel";

function createClient(
  sessionResult:
    | { data: { session: { access_token: string } }; error: null }
    | { data: { session: null }; error: Error | null },
) {
  const setAuth = vi.fn().mockResolvedValue(undefined);

  return {
    client: {
      auth: {
        getSession: vi.fn().mockResolvedValue(sessionResult),
      },
      realtime: { setAuth },
    },
    setAuth,
  };
}

describe("authenticated Realtime channels", () => {
  it("applies the current access token before a private channel is joined", async () => {
    const { client, setAuth } = createClient({
      data: { session: { access_token: "access-token" } },
      error: null,
    });

    await authenticateRealtimeClient(client);

    expect(setAuth).toHaveBeenCalledWith("access-token");
  });

  it("fails closed when Supabase cannot read the current session", async () => {
    const { client, setAuth } = createClient({
      data: { session: null },
      error: new Error("storage unavailable"),
    });

    await expect(authenticateRealtimeClient(client)).rejects.toThrow(
      "Your sign-in session could not authorize Worship Remote.",
    );
    expect(setAuth).not.toHaveBeenCalled();
  });

  it("does not join a private channel without an authenticated session", async () => {
    const { client, setAuth } = createClient({
      data: { session: null },
      error: null,
    });

    await expect(authenticateRealtimeClient(client)).rejects.toThrow(
      "Sign in again before connecting Worship Remote.",
    );
    expect(setAuth).not.toHaveBeenCalled();
  });

  it("turns authorization failures into an actionable pairing message", () => {
    expect(
      realtimeConnectionErrorMessage(
        new Error("Unauthorized: row-level security policy denied the join"),
      ),
    ).toBe(
      "Realtime authorization was rejected. Sign out, sign in again, and create a new pairing code.",
    );
  });

  it("preserves useful non-authorization errors", () => {
    expect(realtimeConnectionErrorMessage(new Error("Network unavailable"))).toBe(
      "Network unavailable",
    );
  });

  it("uses a safe fallback for unknown errors", () => {
    expect(realtimeConnectionErrorMessage({ reason: "unknown" })).toBe(
      "The private Presenter channel could not be joined.",
    );
  });
});
