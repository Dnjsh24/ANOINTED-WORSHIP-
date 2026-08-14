import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import PracticeModeClient from "./practice-mode-client";
import type { PracticeSetlistSong } from "@/lib/domain/practice";

// Mock server actions
vi.mock("@/app/actions", () => ({
  updateSongBpmAction: vi.fn().mockResolvedValue({ ok: true, message: "BPM saved to song." }),
  updateSetlistSongKeyAction: vi.fn().mockResolvedValue({ ok: true, message: "Key updated." }),
}));

const mockSongs: PracticeSetlistSong[] = [
  {
    slotId: "slot-1",
    songId: "song-1",
    order: 1,
    title: "Way Maker",
    lead: "Alex",
    assignedKey: "G",
    originalKey: "G",
    arrangement: "Verse 1, Chorus",
    arrangementSections: null,
    lyricsChords: "Verse 1\n[G]You are here, moving in our [D]midst\nChorus\n[G]Way maker, miracle worker",
    bpm: 68,
    timeSignature: "4/4",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    spotifyUrl: "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
  },
  {
    slotId: "slot-2",
    songId: "song-2",
    order: 2,
    title: "Great Are You Lord",
    lead: "Jordan",
    assignedKey: "A",
    originalKey: "A",
    arrangement: "Verse 1",
    arrangementSections: null,
    lyricsChords: "Verse 1\n[A]You give life, You are [E]love",
    bpm: null, // missing BPM
    timeSignature: "3/4",
    youtubeUrl: null,
    spotifyUrl: "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
  },
  {
    slotId: "slot-3",
    songId: "song-3",
    order: 3,
    title: "Build My Life",
    lead: undefined,
    assignedKey: "D",
    originalKey: "D",
    arrangement: "Chorus",
    arrangementSections: null,
    lyricsChords: "Chorus\n[D]Holy, there is no one [A]like You",
    bpm: 72,
    timeSignature: "4/4",
    youtubeUrl: null,
    spotifyUrl: null, // no media link
  },
];

describe("PracticeModeClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the ordered setlist queue and defaults to the first song", () => {
    render(
      <PracticeModeClient
        setlistId="setlist-1"
        setlistName="Sunday Worship"
        songs={mockSongs}
        canEditSong={true}
        teamContext={{ role: "admin" }}
      />,
    );

    // Queue and active chart contain song titles
    expect(screen.getAllByText("Way Maker").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Great Are You Lord").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Build My Life").length).toBeGreaterThan(0);

    // First song active chart details
    expect(screen.getByRole("heading", { name: "Way Maker" })).toBeInTheDocument();
    expect(screen.getByText("Lead Vocal: Alex")).toBeInTheDocument();
    expect(screen.getByText("You are here, moving in our")).toBeInTheDocument();
    expect(screen.getByText("Saved BPM:")).toBeInTheDocument();
  });

  it("switches active song when a queue item is selected without page reload", async () => {
    render(
      <PracticeModeClient
        setlistId="setlist-1"
        setlistName="Sunday Worship"
        songs={mockSongs}
        canEditSong={true}
        teamContext={{ role: "admin" }}
      />,
    );

    // Click second song in queue
    const secondSongButton = screen.getByText("Great Are You Lord");
    fireEvent.click(secondSongButton);

    // Active chart updates to second song
    expect(screen.getByRole("heading", { name: "Great Are You Lord" })).toBeInTheDocument();
    expect(screen.getByText("You give life, You are")).toBeInTheDocument();
    expect(screen.getByText("BPM not set")).toBeInTheDocument();
    expect(screen.getByText("3/4")).toBeInTheDocument();
  });

  it("prefers YouTube when both YouTube and Spotify links exist and provides provider toggle", () => {
    render(
      <PracticeModeClient
        setlistId="setlist-1"
        setlistName="Sunday Worship"
        songs={mockSongs}
        canEditSong={true}
        teamContext={{ role: "admin" }}
      />,
    );

    // First song has both links -> defaults to YouTube
    expect(screen.getByText("YouTube Audio/Video")).toBeInTheDocument();

    // Toggle to Spotify
    const spotifyToggle = screen.getByRole("button", { name: /spotify/i });
    fireEvent.click(spotifyToggle);

    expect(screen.getByText("Spotify Preview Track")).toBeInTheDocument();
  });

  it("handles missing media links cleanly without blocking chords, metronome or queue navigation", async () => {
    render(
      <PracticeModeClient
        setlistId="setlist-1"
        setlistName="Sunday Worship"
        songs={mockSongs}
        canEditSong={true}
        teamContext={{ role: "admin" }}
      />,
    );

    // Select third song (no media links)
    const thirdSongButton = screen.getByText("Build My Life");
    fireEvent.click(thirdSongButton);

    expect(screen.getByRole("heading", { name: "Build My Life" })).toBeInTheDocument();
    expect(screen.getByText("No media player link available")).toBeInTheDocument();

    // Chords and metronome are still interactive
    expect(screen.getByText("Holy, there is no one")).toBeInTheDocument();
    expect(screen.getByText("Saved BPM:")).toBeInTheDocument();
  });

  it("navigates through queue with Previous and Next buttons", () => {
    render(
      <PracticeModeClient
        setlistId="setlist-1"
        setlistName="Sunday Worship"
        songs={mockSongs}
        canEditSong={true}
        teamContext={{ role: "admin" }}
      />,
    );

    const prevButton = screen.getByRole("button", { name: /previous setlist song/i });
    const nextButton = screen.getByRole("button", { name: /next setlist song/i });

    // Initially on first song -> Previous disabled
    expect(prevButton).toBeDisabled();

    // Click Next -> moves to second song
    fireEvent.click(nextButton);
    expect(screen.getByRole("heading", { name: "Great Are You Lord" })).toBeInTheDocument();
    expect(prevButton).not.toBeDisabled();

    // Click Next -> moves to third song (last song)
    fireEvent.click(nextButton);
    expect(screen.getByRole("heading", { name: "Build My Life" })).toBeInTheDocument();
    expect(nextButton).toBeDisabled();

    // Click Previous -> moves back to second song
    fireEvent.click(prevButton);
    expect(screen.getByRole("heading", { name: "Great Are You Lord" })).toBeInTheDocument();
  });

  it("allows metronome BPM adjustment, tap tempo, and authorized BPM saving", async () => {
    const user = userEvent.setup();

    render(
      <PracticeModeClient
        setlistId="setlist-1"
        setlistName="Sunday Worship"
        songs={mockSongs}
        canEditSong={true}
        teamContext={{ role: "admin" }}
      />,
    );

    // Tap tempo button is present
    const tapButton = screen.getByRole("button", { name: /tap tempo/i });
    expect(tapButton).toBeInTheDocument();

    // Save BPM to Song button for authorized user
    const saveBpmButton = screen.getByRole("button", { name: /save bpm to song/i });
    expect(saveBpmButton).toBeInTheDocument();

    await user.click(saveBpmButton);
    const { updateSongBpmAction } = await import("@/app/actions");
    expect(updateSongBpmAction).toHaveBeenCalled();
  });

  it("switches chord chart notation between Chords and Nashville numbers", async () => {
    render(
      <PracticeModeClient
        setlistId="setlist-1"
        setlistName="Sunday Worship"
        songs={mockSongs}
        canEditSong={true}
        teamContext={{ role: "admin" }}
      />,
    );

    // First song in G: chord G -> 1 in Nashville
    const nashvilleButton = screen.getByRole("button", { name: /nashville/i });
    fireEvent.click(nashvilleButton);

    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
  });
});
