import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PracticeSetlistPage from "./page";
import type { PracticeSetlist } from "./practice-mode.types";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getRequiredTeamContext: vi.fn(),
  hasSupabaseEnv: vi.fn(),
  maybeSingle: vi.fn(),
  where: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/team-guard", () => ({ getRequiredTeamContext: mocks.getRequiredTeamContext }));
vi.mock("@/lib/supabase/env", () => ({ hasSupabaseEnv: mocks.hasSupabaseEnv }));
vi.mock("@/lib/supabase/workflow-data", () => ({ loadPreparationWorkspace: async () => ({ ok: false, message: "Shared planning unavailable" }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("./practice-mode-client", () => ({
  default: ({ setlist }: { setlist: PracticeSetlist }) => (
    <div data-testid="practice-setlist">
      {setlist.id}: {setlist.songs.map((song) => `${song.song.title} (${song.assignedKey})`).join(", ")}
    </div>
  ),
}));

describe("PracticeSetlistPage", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
    mocks.getRequiredTeamContext.mockReset();
    mocks.hasSupabaseEnv.mockReset();
    mocks.maybeSingle.mockReset();
    mocks.where.mockReset();
    mocks.notFound.mockClear();
    mocks.getRequiredTeamContext.mockResolvedValue({ teamId: "team-current", userId: "user-1" });
  });

  it("loads songs in setlist order and scopes the route query to the active team", async () => {
    mocks.hasSupabaseEnv.mockReturnValue(true);
    mocks.maybeSingle.mockResolvedValue({
      data: {
        id: "setlist-current",
        name: "Sunday Service",
        setlist_date: "2026-10-11",
        setlist_songs: [
          { id: "slot-later", assigned_key: "E", song_order: 2, notes: null, arrangement: null, band_notes: null, song: makeDatabaseSong("song-later", "Second Song", "G") },
          { id: "slot-missing", assigned_key: "F", song_order: 1.5, notes: null, arrangement: null, band_notes: null, song: null },
          { id: "slot-first", assigned_key: "D", song_order: 1, notes: "Lead: Alex", arrangement: "Quiet intro", band_notes: "Watch the transition", song: makeDatabaseSong("song-first", "First Song", "C") },
        ],
      },
      error: null,
    });
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: string) => {
        mocks.where(column, value);
        return query;
      }),
      maybeSingle: mocks.maybeSingle,
    };
    mocks.createClient.mockResolvedValue({ from: vi.fn(() => query) });

    render(await PracticeSetlistPage({ params: Promise.resolve({ id: "setlist-current" }) }));

    expect(mocks.where).toHaveBeenCalledWith("id", "setlist-current");
    expect(mocks.where).toHaveBeenCalledWith("team_id", "team-current");
    expect(screen.getByTestId("practice-setlist")).toHaveTextContent(
      "setlist-current: First Song (D), Second Song (E)",
    );
  });

  it("returns not found when the team-scoped database query cannot see the setlist", async () => {
    mocks.hasSupabaseEnv.mockReturnValue(true);
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: mocks.maybeSingle,
    };
    mocks.createClient.mockResolvedValue({ from: vi.fn(() => query) });

    await expect(PracticeSetlistPage({ params: Promise.resolve({ id: "other-team-setlist" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("reports practice query failure without leaking database details", async () => {
    mocks.hasSupabaseEnv.mockReturnValue(true);
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: "sensitive database details" } });
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: mocks.maybeSingle,
    };
    mocks.createClient.mockResolvedValue({ from: vi.fn(() => query) });

    await expect(PracticeSetlistPage({ params: Promise.resolve({ id: "setlist-current" }) })).rejects.toThrow(
      "Unable to load this practice setlist.",
    );
  });

  it("uses an exact sample fixture in demo mode and rejects unknown demo setlist IDs", async () => {
    mocks.hasSupabaseEnv.mockReturnValue(false);

    render(await PracticeSetlistPage({ params: Promise.resolve({ id: "sunday-service" }) }));
    expect(screen.getByTestId("practice-setlist")).toHaveTextContent("sunday-service:");
    expect(screen.getByTestId("practice-setlist")).toHaveTextContent("Opening Song");

    await expect(PracticeSetlistPage({ params: Promise.resolve({ id: "unknown-demo-setlist" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

function makeDatabaseSong(id: string, title: string, originalKey: string) {
  return {
    id,
    title,
    artist: "Worship Team",
    bpm: 80,
    original_key: originalKey,
    time_signature: "4/4",
    tags: [],
    lyrics_chords: "Verse:\nC\nSample lyric",
    youtube_url: null,
    spotify_url: null,
    image_url: null,
    album: null,
  };
}
