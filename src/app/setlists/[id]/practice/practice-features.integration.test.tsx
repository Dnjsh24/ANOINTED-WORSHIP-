import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PracticeModeClient from "./practice-mode-client";
import { PracticeChecklist } from "@/components/practice-checklist";
import { PracticeSessionTimer } from "@/components/practice-session-timer";
import { ChordDiagram } from "@/components/chord-diagram";
import type { PracticeSetlistSong } from "@/lib/domain/practice";

vi.mock("@/app/actions", () => ({
  updateSetlistSongKeyAction: vi.fn().mockResolvedValue({ success: true }),
}));

const mockSongs: PracticeSetlistSong[] = [
  {
    slotId: "slot-1",
    songId: "song-1",
    order: 1,
    timeSignature: "4/4",
    title: "Awesome Worship Song",
    bpm: 75,
    originalKey: "G",
    assignedKey: "G",
    lead: "Singer A",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    spotifyUrl: null,
    lyricsChords: "[Verse]\n[G]Amazing [D]Grace how [Em]sweet the [C]sound",
    arrangement: "Verse, Chorus",
    arrangementSections: [
      { id: "sec-1", label: "Verse", content: "[G]Amazing [D]Grace how [Em]sweet the [C]sound" },
      { id: "sec-2", label: "Chorus", content: "[C]I once [G]was lost but [D]now am [Em]found" },
    ],
  },
  {
    slotId: "slot-2",
    songId: "song-2",
    order: 2,
    timeSignature: "4/4",
    title: "Second Practice Song",
    bpm: 128,
    originalKey: "E",
    assignedKey: "E",
    lead: "Singer B",
    youtubeUrl: null,
    spotifyUrl: null,
    lyricsChords: "[Intro]\n[E]Holy [B]Lord\n[Chorus]\n[A]Praise [E]Him",
    arrangement: "Intro, Chorus",
    arrangementSections: [
      { id: "sec-21", label: "Intro", content: "[E]Holy [B]Lord" },
      { id: "sec-22", label: "Chorus", content: "[A]Praise [E]Him" },
    ],
  },
];

describe("Practice Features Integration Suite", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders ChordDiagram correctly for C and F#m", () => {
    const { container: container1 } = render(<ChordDiagram chordName="C" />);
    expect(screen.getByText("C")).toBeInTheDocument();
    expect(container1.querySelector("svg")).not.toBeNull();

    const { container: container2 } = render(<ChordDiagram chordName="F#m" />);
    expect(screen.getByText("F#m")).toBeInTheDocument();
    expect(screen.getByText("Fret 2")).toBeInTheDocument();
    expect(container2.querySelector("svg")).not.toBeNull();
  });

  it("interacts with PracticeChecklist goals and rating selection", async () => {
    const user = userEvent.setup();
    const onRatingChange = vi.fn();
    render(
      <PracticeChecklist
        setlistId="setlist-1"
        songSlotId="slot-1"
        songTitle="Awesome Worship Song"
        onRatingChange={onRatingChange}
      />,
    );

    expect(screen.getByText("Song Readiness Rating")).toBeInTheDocument();

    // Click readiness rating button "Service Ready"
    await user.click(screen.getByRole("button", { name: /service ready/i }));
    expect(onRatingChange).toHaveBeenCalledWith("READY");
    expect(localStorage.getItem("confidence_setlist-1_slot-1")).toBe("READY");

    // Add a custom goal
    const input = screen.getByPlaceholderText(/add new practice goal/i);
    await user.type(input, "Master Bridge Vocal Harmonies");
    await user.click(screen.getByTitle("Add goal"));

    expect(screen.getByText("Master Bridge Vocal Harmonies")).toBeInTheDocument();
  });

  it("controls PracticeSessionTimer and opens history modal", async () => {
    const user = userEvent.setup();
    render(
      <PracticeSessionTimer
        setlistId="setlist-1"
        activeSongSlotId="slot-1"
        activeSongTitle="Awesome Song"
      />,
    );

    expect(screen.getByText("Total")).toBeInTheDocument();

    // Open history modal
    await user.click(screen.getByTitle("View Practice History Log"));
    expect(screen.getByText("Practice Session History")).toBeInTheDocument();
  });

  it("renders PracticeModeClient with Split View, Voice Cues, Section Looping, and Chord Popovers", async () => {
    const user = userEvent.setup();
    render(
      <PracticeModeClient
        setlistId="setlist-1"
        setlistName="Sunday Service Setlist"
        songs={mockSongs}
        canEditSong={true}
      />,
    );

    // Header & Vocal Range Indicator
    expect(screen.getAllByText("Awesome Worship Song")[0]).toBeInTheDocument();
    expect(screen.getByText("PRACTICE MODE")).toBeInTheDocument();

    // Toggle Split View
    await user.click(screen.getByTitle("Split-Screen Layout (Chords + Goals Checklist)"));
    expect(screen.getByText("Song Readiness Rating")).toBeInTheDocument();

    // Toggle Voice Cues
    await user.click(screen.getByTitle("Voice Cues (Section Countdown Overlay)"));
    expect(screen.getByText("Active Cue:")).toBeInTheDocument();

    // Click Chord token G to open Chord Diagram Popover Modal
    const chordTokenButton = screen.getAllByTitle("Click for G guitar chord diagram")[0];
    await user.click(chordTokenButton);

    expect(screen.getByTitle("Close Diagram")).toBeInTheDocument();
  });

  it("toggles Double View in Practice Mode with left and right flanks and chord popovers", async () => {
    const user = userEvent.setup();
    render(
      <PracticeModeClient
        setlistId="setlist-1"
        setlistName="Sunday Service Setlist"
        songs={mockSongs}
        canEditSong={true}
      />,
    );

    const doubleViewBtn = screen.getByRole("button", { name: /toggle double view/i });
    expect(doubleViewBtn).toBeInTheDocument();

    // Enable double view
    await user.click(doubleViewBtn);

    expect(screen.getByText("DOUBLE VIEW")).toBeInTheDocument();
    expect(screen.getByText("Awesome Worship Song & Second Practice Song")).toBeInTheDocument();
    expect(screen.getByText("Amazing")).toBeInTheDocument();
    expect(screen.getByText("Holy")).toBeInTheDocument();

    // Verify left and right flanks
    const leftFlank = screen.getByRole("complementary", { name: /song 1 arrangement controls/i });
    const rightFlank = screen.getByRole("complementary", { name: /song 2 arrangement controls/i });
    expect(leftFlank).toBeInTheDocument();
    expect(rightFlank).toBeInTheDocument();

    // Check chord click in Double View
    const chordBtn = screen.getAllByTitle("Click for G chord diagram")[0];
    expect(chordBtn).toBeInTheDocument();
    await user.click(chordBtn);
    expect(screen.getByTitle("Close Diagram")).toBeInTheDocument();
  });
});
