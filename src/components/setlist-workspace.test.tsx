import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SetlistWorkspace } from "@/components/setlist-workspace";

vi.mock("@/components/setlist-song-order", () => ({
  SetlistSongOrder: ({ setlistId }: { setlistId: string }) => <div>Editable songs for {setlistId}</div>,
}));

const song = {
  id: "slot-1",
  order: 1,
  assignedKey: "C",
  youtubeUrl: null,
  arrangement: null,
  arrangementSections: [],
  bandNotes: null,
  song: {
    id: "song-1",
    title: "Opening Song",
    bpm: 90,
    originalKey: "C",
    lyrics: "",
  },
};

describe("SetlistWorkspace", () => {
  it("keeps standalone setlists focused on setlist content", () => {
    render(
      <SetlistWorkspace
        setlistId="setlist-1"
        songs={[song]}
        notes="Setlist-only note"
        canManageSetlist
        linkedToEvent={false}
        teamAssignments={[]}
        assignmentConflicts={[]}
        missingRoles={[]}
        versionHistory={[]}
      />,
    );

    expect(screen.getByText("Song Order")).toBeInTheDocument();
    expect(screen.getByText("Setlist-only note")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /add song/i })).toHaveAttribute("href", "/setlists/setlist-1/add-song");
    expect(screen.queryByText("Conflict Detection")).not.toBeInTheDocument();
    expect(screen.queryByText("Who's Missing?")).not.toBeInTheDocument();
  });

  it("adds event readiness around the same song workspace when linked", () => {
    render(
      <SetlistWorkspace
        setlistId="setlist-1"
        songs={[song]}
        canManageSetlist
        linkedToEvent
        teamAssignments={[["Leadership", "Alex Morgan - Worship Leader", "AM"]]}
        assignmentConflicts={[]}
        missingRoles={[]}
        versionHistory={[]}
      />,
    );

    expect(screen.getByText("Editable songs for setlist-1")).toBeInTheDocument();
    expect(screen.getByText("Conflict Detection")).toBeInTheDocument();
    expect(screen.getByText("Alex Morgan - Worship Leader")).toBeInTheDocument();
    expect(screen.getByText("Who's Missing?")).toBeInTheDocument();
  });
});
