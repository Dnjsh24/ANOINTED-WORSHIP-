import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WorshipRemoteSessionPage from "./page";

const mocks = vi.hoisted(() => ({
  resume: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("@/app/presenter/remote-pairing-actions", () => ({
  resumeCloudRemotePairing: mocks.resume,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: mocks.maybeSingle,
      };
      return query;
    },
  }),
}));

vi.mock("@/app/setlists/[id]/remote/remote-client", () => ({
  default: ({ cloudTopic, cloudPrivate, setlist }: { cloudTopic: string; cloudPrivate: boolean; setlist: { name: string } }) => (
    <div data-testid="remote" data-topic={cloudTopic} data-private={String(cloudPrivate)}>{setlist.name}</div>
  ),
}));

describe("claimed Worship Remote session", () => {
  beforeEach(() => {
    mocks.resume.mockReset();
    mocks.maybeSingle.mockReset();
  });

  it("resumes the private PC channel independently of the selected website team", async () => {
    mocks.resume.mockResolvedValue({
      ok: true,
      sessionId: "session-1",
      setlistId: "setlist-1",
      teamId: "paired-team",
      channelTopic: "worship-remote-session:session-1",
      privateChannel: true,
      expiresAt: "2026-08-02T10:00:00.000Z",
    });
    mocks.maybeSingle.mockResolvedValue({
      data: {
        id: "setlist-1",
        name: "Sunday Service",
        presentation_settings: {},
        setlist_songs: [],
      },
      error: null,
    });

    render(await WorshipRemoteSessionPage({ params: Promise.resolve({ sessionId: "session-1" }) }));

    const remote = screen.getByTestId("remote");
    expect(remote).toHaveTextContent("Sunday Service");
    expect(remote).toHaveAttribute("data-topic", "worship-remote-session:session-1");
    expect(remote).toHaveAttribute("data-private", "true");
  });

  it("shows a safe recovery screen for expired or revoked sessions", async () => {
    mocks.resume.mockResolvedValue({ ok: false, code: "invalid", message: "That pairing code is invalid, used, or expired." });

    render(await WorshipRemoteSessionPage({ params: Promise.resolve({ sessionId: "expired" }) }));

    expect(screen.getByRole("heading", { name: "Remote session ended" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pair again" })).toHaveAttribute("href", "/worship-remote");
  });
});
