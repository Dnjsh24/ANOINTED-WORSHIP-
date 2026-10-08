import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateSetlistSongNotesAction, updateSongSlotArrangementAction } from "@/app/actions";
import { PracticeToolsPanel } from "./practice-tools-panel";
import type { PracticeSetlist } from "./practice-mode.types";
import type { StageSetlistSong } from "../stage/stage-mode-client";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions", () => ({
  updateSetlistSongNotesAction: vi.fn(),
  updateSongSlotArrangementAction: vi.fn(),
}));
vi.mock("@/components/service-preparation", () => ({ ServicePreparation: () => <div>Service preparation</div> }));
vi.mock("@/components/shared-preparation", () => ({ SharedPreparation: () => <div>Shared preparation</div> }));
vi.mock("@/components/saved-song-readiness", () => ({ SavedSongReadiness: () => <div>Song readiness</div> }));
vi.mock("@/components/song-form", () => ({ SongForm: () => <div>Song editor</div> }));

const song = {
  id: "song-1",
  title: "Opening Song",
  artist: "Worship Team",
  originalKey: "C",
  currentKey: "C",
  bpm: 80,
  timeSignature: "4/4",
  tags: [],
  favorite: false,
  sections: [{ label: "Verse", lines: [{ chords: "C G", lyric: "Sample lyrics" }] }],
};
const setlist: PracticeSetlist = {
  id: "setlist-1",
  name: "Sunday Service",
  date: "2026-10-11",
  songs: [{
    slotId: "slot-1",
    assignedKey: "D",
    lead: "Alex",
    arrangement: "Verse, Chorus",
    notes: "Hold the last line",
    bandNotes: "Build into the chorus",
    song,
  }],
};
const stageSong: StageSetlistSong = {
  id: "slot-1",
  order: 1,
  assignedKey: "D",
  lead: "Alex",
  youtubeUrl: null,
  arrangement: "Verse, Chorus",
  song: { id: "song-1", title: "Opening Song", bpm: 80, originalKey: "C", timeSignature: "4/4", lyricsChords: "" },
};

describe("PracticeToolsPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps note drafts visible and announces note save results", async () => {
    vi.mocked(updateSetlistSongNotesAction).mockResolvedValueOnce({ ok: false, message: "Permission denied." });
    vi.mocked(updateSetlistSongNotesAction).mockResolvedValueOnce({ ok: true, message: "Notes updated." });
    render(<PracticeToolsPanel setlist={setlist} stageSong={stageSong} memberId="member-1" canManage isPracticed={false} practicedCount={0} onTogglePracticed={vi.fn()} practiceTimeSignature="4/4" onPracticeTimeSignatureChange={vi.fn()} onSelectSong={vi.fn()} onClose={vi.fn()} />);

    const notesField = screen.getByLabelText("Band notes");
    fireEvent.change(screen.getByLabelText("Lead vocal"), { target: { value: "Jordan" } });
    fireEvent.change(screen.getByLabelText("Setlist notes"), { target: { value: "Hold the last line" } });
    fireEvent.change(notesField, { target: { value: "Keep the verse quiet" } });
    fireEvent.click(screen.getByRole("button", { name: "Save song notes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Permission denied.");
    expect(notesField).toHaveValue("Keep the verse quiet");
    expect(screen.getByLabelText("Lead vocal")).toHaveValue("Jordan");
    expect(screen.getByLabelText("Setlist notes")).toHaveValue("Hold the last line");

    fireEvent.click(screen.getByRole("button", { name: "Save song notes" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Notes updated.");
    await waitFor(() => expect(updateSetlistSongNotesAction).toHaveBeenCalledTimes(2));
    const savedValues = vi.mocked(updateSetlistSongNotesAction).mock.calls[1][0];
    expect(savedValues.get("lead")).toBe("Jordan");
    expect(savedValues.get("setlistNotes")).toBe("Hold the last line");
    expect(savedValues.get("bandNotes")).toBe("Keep the verse quiet");
  });

  it("persists section order and reports a saved arrangement", async () => {
    vi.mocked(updateSongSlotArrangementAction).mockResolvedValueOnce({ ok: true, message: "Arrangement updated." });
    render(<PracticeToolsPanel setlist={setlist} stageSong={stageSong} memberId="member-1" canManage isPracticed={false} practicedCount={0} onTogglePracticed={vi.fn()} practiceTimeSignature="4/4" onPracticeTimeSignatureChange={vi.fn()} onSelectSong={vi.fn()} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit arrangement" }));
    fireEvent.change(screen.getByLabelText("Song section order"), { target: { value: "Intro, Bridge, Chorus" } });
    fireEvent.click(screen.getByRole("button", { name: "Save arrangement" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Arrangement updated.");
    expect(updateSongSlotArrangementAction).toHaveBeenCalledWith(expect.any(FormData));
  });

  it("shows the existing song form for lyric and chord edits", async () => {
    render(<PracticeToolsPanel setlist={setlist} stageSong={stageSong} memberId="member-1" canManage={false} isPracticed={false} practicedCount={0} onTogglePracticed={vi.fn()} practiceTimeSignature="4/4" onPracticeTimeSignatureChange={vi.fn()} onSelectSong={vi.fn()} onClose={vi.fn()} />);

    fireEvent.click(screen.getByText("Edit song, lyrics, and chords"));
    expect(await screen.findByText("Song editor")).toBeInTheDocument();
  });
});
