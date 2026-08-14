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
    arrangementSections: [],
    lyricsChords: "[Verse 1]\n[G]You are here, moving in our[D] midst",
    bpm: 68,
    timeSignature: "4/4",
    youtubeUrl: "https://www.youtube.com/watch?v=iJCV_2H9xD0",
    spotifyUrl: "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
  },
  {
    slotId: "slot-2",
    songId: "song-2",
    order: 2,
    title: "Great Are You Lord",
    lead: "Sam",
    assignedKey: "A",
    originalKey: "A",
    arrangement: "Chorus, Bridge",
    arrangementSections: [],
    lyricsChords: "[Chorus]\n[A]You give life, You are[E] love",
    bpm: null,
    timeSignature: "3/4",
    youtubeUrl: "https://www.youtube.com/watch?v=sample2",
    spotifyUrl: null,
  },
  {
    slotId: "slot-3",
    songId: "song-3",
    order: 3,
    title: "Build My Life",
    lead: "",
    assignedKey: "D",
    originalKey: "D",
    arrangement: null,
    arrangementSections: [],
    lyricsChords: "[Verse 1]\n[D]Holy, there is no one[G] like You",
    bpm: 72,
    timeSignature: "4/4",
    youtubeUrl: null,
    spotifyUrl: null,
  },
];

describe("PracticeModeClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the active song and chord chart details", () => {
    render(
      <PracticeModeClient
        setlistId="setlist-1"
        setlistName="Sunday Worship"
        songs={mockSongs}
        canEditSong={true}
        teamContext={{ role: "admin" }}
      />,
    );

    // Active chart details
    expect(screen.getByRole("heading", { name: /way maker/i })).toBeInTheDocument();
    expect(screen.getByText("Lead: Alex")).toBeInTheDocument();
    expect(screen.getByText("You are here, moving in our")).toBeInTheDocument();
  });

  it("switches active song when a queue item is selected from drawer without page reload", async () => {
    render(
      <PracticeModeClient
        setlistId="setlist-1"
        setlistName="Sunday Worship"
        songs={mockSongs}
        canEditSong={true}
        teamContext={{ role: "admin" }}
      />,
    );

    // Open Queue Drawer
    const queueBtn = screen.getByRole("button", { name: /queue \(3\)/i });
    fireEvent.click(queueBtn);

    // Click second song in queue drawer
    const secondSongButton = screen.getByText("Great Are You Lord");
    fireEvent.click(secondSongButton);

    // Active chart updates to second song
    expect(screen.getByRole("heading", { name: /great are you lord/i })).toBeInTheDocument();
    expect(screen.getByText("You give life, You are")).toBeInTheDocument();
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

    // Open Player Panel
    const playerBtn = screen.getByRole("button", { name: /player/i });
    fireEvent.click(playerBtn);

    // First song has both links -> defaults to YouTube
    expect(screen.getByText("YouTube Audio/Video")).toBeInTheDocument();

    // Toggle to Spotify
    const spotifyToggle = screen.getByRole("button", { name: /^spotify$/i });
    fireEvent.click(spotifyToggle);

    expect(screen.getByText("Spotify Preview Track")).toBeInTheDocument();
  });

  it("handles missing media links cleanly without blocking chords", async () => {
    render(
      <PracticeModeClient
        setlistId="setlist-1"
        setlistName="Sunday Worship"
        songs={mockSongs}
        canEditSong={true}
        teamContext={{ role: "admin" }}
      />,
    );

    // Open Queue Drawer and select third song (no media links)
    const queueBtn = screen.getByRole("button", { name: /queue \(3\)/i });
    fireEvent.click(queueBtn);

    const thirdSongButton = screen.getByText("Build My Life");
    fireEvent.click(thirdSongButton);

    expect(screen.getByRole("heading", { name: /build my life/i })).toBeInTheDocument();

    // Chords are still interactive
    expect(screen.getByText("Holy, there is no one")).toBeInTheDocument();
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

    const prevButton = screen.getByRole("button", { name: /previous song/i });
    const nextButton = screen.getByRole("button", { name: /next song/i });

    // Initially on first song -> Previous disabled
    expect(prevButton).toBeDisabled();

    // Click Next -> moves to second song
    fireEvent.click(nextButton);
    expect(screen.getByRole("heading", { name: /great are you lord/i })).toBeInTheDocument();
    expect(prevButton).not.toBeDisabled();

    // Click Next -> moves to third song (last song)
    fireEvent.click(nextButton);
    expect(screen.getByRole("heading", { name: /build my life/i })).toBeInTheDocument();
    expect(nextButton).toBeDisabled();

    // Click Previous -> moves back to second song
    fireEvent.click(prevButton);
    expect(screen.getByRole("heading", { name: /great are you lord/i })).toBeInTheDocument();
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

    // Open Metronome Panel
    const metronomeBtn = screen.getByRole("button", { name: /metronome/i });
    fireEvent.click(metronomeBtn);

    // Tap tempo button is present inside panel
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

    expect(screen.getByText("1")).toBeInTheDocument();
  });
});
