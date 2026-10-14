import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateSetlistSongNotesAction, updateSongSlotArrangementAction } from "@/app/actions";
import { reloadPreparationAction, saveRehearsalPlanAction } from "@/app/workflow-actions";
import { defaultPreparationTasks } from "@/lib/domain/team-workflows";
import { PracticeToolsPanel } from "./practice-tools-panel";
import type { PracticeSetlist } from "./practice-mode.types";
import type { StageSetlistSong } from "../stage/stage-mode-client";
import type { PreparationWorkspace, WorkspaceResult } from "@/lib/supabase/workflow-data";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions", () => ({
  updateSetlistSongNotesAction: vi.fn(),
  updateSongSlotArrangementAction: vi.fn(),
}));
vi.mock("@/components/service-preparation", () => ({ ServicePreparation: () => <div>Service preparation</div> }));
vi.mock("@/app/workflow-actions", () => ({ saveRehearsalPlanAction: vi.fn(), reloadPreparationAction: vi.fn(), respondPreparationTaskAction: vi.fn() }));
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

  it("shows active song allocation from the shared team plan", () => {
    const preparation = { ok: true, data: { plan: { allocations: [{ slot_id: "slot-1", minutes: 12, focus: "Bridge" }] }, readiness: [], members: [], assignedMemberIds: [], checks: [] } } as unknown as WorkspaceResult<PreparationWorkspace>;
    render(<PracticeToolsPanel setlist={setlist} stageSong={stageSong} preparation={preparation} memberId="member-1" canManage isPracticed={false} practicedCount={0} onTogglePracticed={vi.fn()} practiceTimeSignature="4/4" onPracticeTimeSignatureChange={vi.fn()} onSelectSong={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText("12 allocated minutes for Opening Song")).toBeInTheDocument();
  });

  it("updates the timer after reloading the latest saved allocation", async () => {
    const secondSlot = { ...setlist.songs[0], slotId: "slot-2", song: { ...song, id: "song-2", title: "Second Song" } };
    const rehearsalSetlist = { ...setlist, songs: [setlist.songs[0], secondSlot] };
    const secondStageSong = { ...stageSong, id: "slot-2", song: { ...stageSong.song, id: "song-2", title: "Second Song" } };
    const latest = makePreparation(9);
    latest.data.plan = { ...latest.data.plan!, allocations: [{ slot_id: "slot-1", minutes: 9, focus: "Bridge" }, { slot_id: "slot-2", minutes: 6, focus: "Verse" }] };
    vi.mocked(reloadPreparationAction).mockResolvedValue({ ok: true, data: latest.data });
    const props = { setlist: rehearsalSetlist, preparation: makePreparation(7), memberId: "member-1", canManage: true, isPracticed: false, practicedCount: 0, onTogglePracticed: vi.fn(), practiceTimeSignature: "4/4", onPracticeTimeSignatureChange: vi.fn(), onSelectSong: vi.fn(), onClose: vi.fn() };
    const { rerender } = render(<PracticeToolsPanel {...props} stageSong={stageSong} />);

    expect(screen.getByText("7 allocated minutes for Opening Song")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reload latest plan (replace draft)" }));
    expect(await screen.findByText("9 allocated minutes for Opening Song")).toBeInTheDocument();
    rerender(<PracticeToolsPanel {...props} stageSong={secondStageSong} />);
    expect(screen.getByText("6 allocated minutes for Second Song")).toBeInTheDocument();
    rerender(<PracticeToolsPanel {...props} stageSong={stageSong} />);
    expect(screen.getByText("9 allocated minutes for Opening Song")).toBeInTheDocument();
  });

  it("keeps the current timer allocation when reloading fails", async () => {
    vi.mocked(reloadPreparationAction).mockResolvedValue({ ok: false, message: "Offline" });
    render(<PracticeToolsPanel setlist={setlist} stageSong={stageSong} preparation={makePreparation(7)} memberId="member-1" canManage isPracticed={false} practicedCount={0} onTogglePracticed={vi.fn()} practiceTimeSignature="4/4" onPracticeTimeSignatureChange={vi.fn()} onSelectSong={vi.fn()} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Reload latest plan (replace draft)" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Offline");
    expect(screen.getByText("7 allocated minutes for Opening Song")).toBeInTheDocument();
  });

  it("clears the timer when a successful reload returns no saved plan", async () => {
    vi.mocked(reloadPreparationAction).mockResolvedValue({ ok: true, data: { ...makePreparation(7).data, plan: null } });
    render(<PracticeToolsPanel setlist={setlist} stageSong={stageSong} preparation={makePreparation(7)} memberId="member-1" canManage isPracticed={false} practicedCount={0} onTogglePracticed={vi.fn()} practiceTimeSignature="4/4" onPracticeTimeSignatureChange={vi.fn()} onSelectSong={vi.fn()} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Reload latest plan (replace draft)" }));
    await waitFor(() => expect(screen.queryByLabelText("Opening Song rehearsal timer")).not.toBeInTheDocument());
  });

  it("updates the timer after a successful shared plan save", async () => {
    vi.mocked(saveRehearsalPlanAction).mockResolvedValue({ ok: true, message: "Saved", data: { revision: 2 } });
    render(<PracticeToolsPanel setlist={setlist} stageSong={stageSong} preparation={makePreparation(7)} memberId="member-1" canManage isPracticed={false} practicedCount={0} onTogglePracticed={vi.fn()} practiceTimeSignature="4/4" onPracticeTimeSignatureChange={vi.fn()} onSelectSong={vi.fn()} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Minutes for Opening Song"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Save shared plan" }));
    expect(await screen.findByText("9 allocated minutes for Opening Song")).toBeInTheDocument();
  });
});

function makePreparation(minutes: number): Extract<WorkspaceResult<PreparationWorkspace>, { ok: true }> {
  return { ok: true, data: { plan: { setlist_id: "setlist-1", team_id: "team-1", revision: 1, allocations: [{ slot_id: "slot-1", minutes, focus: "Bridge" }], tasks: defaultPreparationTasks(), updated_by: "member-1", updated_at: "2026-10-14" }, readiness: [], members: [], assignedMemberIds: [], checks: [] } };
}
