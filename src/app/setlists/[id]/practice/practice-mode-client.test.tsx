import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import PracticeModeClient from "./practice-mode-client";
import type { PracticeSetlist } from "./practice-mode.types";
import type { StageSetlist, StageSetlistSong } from "../stage/stage-mode-client";

vi.mock("../stage/stage-mode-client", async () => {
  const { useState } = await import("react");
  return {
    default: function StageModeStub({
      setlist,
      renderPracticeTools,
      canManageSetlist,
    }: {
      setlist: StageSetlist;
      renderPracticeTools?: (song: StageSetlistSong, close: () => void, selectSong: (slotId: string) => void) => ReactNode;
      canManageSetlist: boolean;
    }) {
      const [index, setIndex] = useState(0);
      const [toolsOpen, setToolsOpen] = useState(false);
      const activeSong = setlist.songs[index];
      return (
        <div>
          <h1 data-testid="stage-title">{activeSong?.song.title}</h1>
          <p data-testid="stage-key">{activeSong?.assignedKey}</p>
          <p data-testid="stage-lyrics">{activeSong?.song.lyricsChords}</p>
          <button type="button" onClick={() => setIndex((current) => Math.min(current + 1, setlist.songs.length - 1))}>Next song</button>
          <button type="button" onClick={() => setToolsOpen(true)}>Practice & edit</button>
          <p data-testid="can-manage">{String(canManageSetlist)}</p>
          {toolsOpen && activeSong && renderPracticeTools?.(activeSong, () => setToolsOpen(false), (slotId) => {
            const nextIndex = setlist.songs.findIndex((song) => song.id === slotId);
            if (nextIndex >= 0) setIndex(nextIndex);
          })}
        </div>
      );
    },
  };
});

vi.mock("./practice-tools-panel", () => ({
  PracticeToolsPanel: ({ stageSong, isPracticed, practicedCount, setlist, onTogglePracticed, practiceTimeSignature, onPracticeTimeSignatureChange, onSelectSong }: {
    stageSong: StageSetlistSong;
    isPracticed: boolean;
    practicedCount: number;
    setlist: PracticeSetlist;
    onTogglePracticed: (slotId: string) => void;
    practiceTimeSignature: string;
    onPracticeTimeSignatureChange: (timeSignature: string) => void;
    onSelectSong: (slotId: string) => void;
  }) => (
    <section aria-label="Practice tools">
      <h2>{stageSong.song.title}</h2>
      <p>{practicedCount} of {setlist.songs.length} songs practiced this session.</p>
      <button type="button" aria-pressed={isPracticed} onClick={() => onTogglePracticed(stageSong.id)}>
        {isPracticed ? "Practiced" : "Mark practiced"}
      </button>
      <label htmlFor="practice-song-picker">Song</label>
      <select id="practice-song-picker" value={stageSong.id} onChange={(event) => onSelectSong(event.target.value)}>
        {setlist.songs.map((song) => <option key={song.slotId} value={song.slotId}>{song.song.title}</option>)}
      </select>
      <label htmlFor="practice-time-signature">Practice time signature</label>
      <select id="practice-time-signature" value={practiceTimeSignature} onChange={(event) => onPracticeTimeSignatureChange(event.target.value)}>
        <option value="4/4">4/4</option>
        <option value="3/4">3/4</option>
        <option value="6/8">6/8</option>
      </select>
    </section>
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

function createSong(id: string, title: string, key: string) {
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
    sections: [{ label: "Verse", lines: [{ chords: "C G", lyric: "Sample lyrics" }] }],
  };
}

describe("PracticeModeClient", () => {
  it("reuses the stage setlist viewer with each song's assigned key and chord chart", () => {
    render(<PracticeModeClient setlist={practiceSetlist} canManage />);

    expect(screen.getByTestId("stage-title")).toHaveTextContent("First Song");
    expect(screen.getByTestId("stage-key")).toHaveTextContent("D");
    expect(screen.getByTestId("stage-lyrics")).toHaveTextContent("[Verse]");
    expect(screen.getByTestId("can-manage")).toHaveTextContent("true");

    fireEvent.click(screen.getByRole("button", { name: "Next song" }));
    expect(screen.getByTestId("stage-title")).toHaveTextContent("Second Song");
    expect(screen.getByTestId("stage-key")).toHaveTextContent("E");
  });

  it("tracks practice progress in the stage edit drawer for the active song", () => {
    render(<PracticeModeClient setlist={practiceSetlist} />);
    fireEvent.click(screen.getByRole("button", { name: "Practice & edit" }));

    expect(screen.getByRole("region", { name: "Practice tools" })).toHaveTextContent("0 of 3 songs practiced this session.");
    fireEvent.click(screen.getByRole("button", { name: "Mark practiced" }));
    expect(screen.getByRole("button", { name: "Practiced" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region", { name: "Practice tools" })).toHaveTextContent("1 of 3 songs practiced this session.");
  });

  it("lets the drawer jump songs and changes the active session meter", () => {
    render(<PracticeModeClient setlist={practiceSetlist} />);
    fireEvent.click(screen.getByRole("button", { name: "Practice & edit" }));
    fireEvent.change(screen.getByLabelText("Practice time signature"), { target: { value: "6/8" } });
    expect(screen.getByLabelText("Practice time signature")).toHaveValue("6/8");

    fireEvent.change(screen.getByLabelText("Song"), { target: { value: "slot-2" } });
    expect(screen.getByTestId("stage-title")).toHaveTextContent("Second Song");
    expect(screen.getByLabelText("Practice time signature")).toHaveValue("4/4");
  });

  it("shows an add-song action instead of mounting the stage when the setlist is empty", () => {
    render(<PracticeModeClient setlist={{ ...practiceSetlist, songs: [] }} />);

    expect(screen.getByRole("heading", { name: "No songs in this setlist yet" })).toBeInTheDocument();
    expect(screen.queryByTestId("stage-title")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add songs" })).toHaveAttribute("href", "/setlists/setlist-1/add-song");
  });
});
