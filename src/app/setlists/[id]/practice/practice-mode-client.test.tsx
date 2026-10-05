import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PracticeModeClient from "./practice-mode-client";
import type { PracticeSetlist } from "./practice-mode.types";
import type { Song } from "@/lib/types";

vi.mock("@/components/song-viewer", () => ({
  SongViewer: ({ song, assignedKey }: { song: Song; assignedKey?: string }) => (
    <div data-testid="song-viewer" data-assigned-key={assignedKey}>{song.title}</div>
  ),
}));

const practiceSetlist: PracticeSetlist = {
  id: "setlist-1",
  name: "Sunday Service",
  date: "2026-10-11",
  songs: [
    {
      slotId: "slot-1",
      assignedKey: "D",
      lead: "Alex",
      arrangement: "Quiet intro, full band after chorus",
      notes: null,
      bandNotes: null,
      song: createSong("song-1", "First Song", "C"),
    },
    {
      slotId: "slot-2",
      assignedKey: "E",
      lead: null,
      arrangement: null,
      notes: null,
      bandNotes: null,
      song: createSong("song-2", "Second Song", "G"),
    },
    {
      slotId: "slot-3",
      assignedKey: "F",
      lead: null,
      arrangement: null,
      notes: null,
      bandNotes: null,
      song: createSong("song-3", "Third Song", "F"),
    },
  ],
};

function createSong(id: string, title: string, key: string): Song {
  return {
    id,
    title,
    artist: "Worship Team",
    originalKey: key,
    currentKey: key,
    bpm: 80,
    timeSignature: "4/4",
    tags: [],
    favorite: false,
    sections: [],
  };
}

describe("PracticeModeClient", () => {
  it("moves through ordered songs and passes each setlist key to SongViewer", () => {
    render(<PracticeModeClient setlist={practiceSetlist} />);

    expect(screen.getByTestId("song-viewer")).toHaveTextContent("First Song");
    expect(screen.getByTestId("song-viewer")).toHaveAttribute("data-assigned-key", "D");
    expect(screen.getByRole("button", { name: "Previous song" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Next song" }));
    expect(screen.getByTestId("song-viewer")).toHaveTextContent("Second Song");
    expect(screen.getByTestId("song-viewer")).toHaveAttribute("data-assigned-key", "E");

    fireEvent.click(screen.getByRole("button", { name: "Previous song" }));
    expect(screen.getByTestId("song-viewer")).toHaveTextContent("First Song");
  });

  it("selects a song by its ordered picker and tracks practice progress for this session", () => {
    render(<PracticeModeClient setlist={practiceSetlist} />);
    const picker = screen.getByRole("combobox", { name: "Song" });

    expect(within(picker).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "1. First Song",
      "2. Second Song",
      "3. Third Song",
    ]);

    fireEvent.change(picker, { target: { value: "slot-3" } });
    expect(screen.getByTestId("song-viewer")).toHaveTextContent("Third Song");
    fireEvent.click(screen.getByRole("button", { name: "Mark as practiced" }));
    expect(screen.getByRole("button", { name: "Practiced" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("1 of 3")).toBeInTheDocument();

    fireEvent.change(picker, { target: { value: "slot-1" } });
    expect(screen.getByRole("button", { name: "Mark as practiced" })).toHaveAttribute("aria-pressed", "false");
  });

  it("shows a safe empty state and disables song controls when setlist has no songs", () => {
    render(<PracticeModeClient setlist={{ ...practiceSetlist, songs: [] }} />);

    expect(screen.getByRole("heading", { name: "No songs in this setlist yet" })).toBeInTheDocument();
    expect(screen.queryByTestId("song-viewer")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Song" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous song" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next song" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Add songs" })).toHaveAttribute("href", "/setlists/setlist-1/add-song");
  });
});
