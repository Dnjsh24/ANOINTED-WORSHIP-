import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SetlistSongOrder, type OrderedSetlistSong } from "./setlist-song-order";

const mockBulkReorder = vi.hoisted(() => vi.fn());

vi.mock("@/app/actions", () => ({
  bulkReorderSetlistSongsAction: mockBulkReorder,
}));

const initialSongs: OrderedSetlistSong[] = [
  {
    id: "slot-1",
    order: 1,
    assignedKey: "C",
    song: { id: "song-1", title: "First Song", originalKey: "C", bpm: 72 },
  },
  {
    id: "slot-2",
    order: 2,
    assignedKey: "G",
    song: { id: "song-2", title: "Second Song", originalKey: "G", bpm: 84 },
  },
];

describe("SetlistSongOrder", () => {
  beforeEach(() => mockBulkReorder.mockReset().mockResolvedValue({ ok: true, message: "Songs reordered successfully." }));

  it("moves songs by tap and persists the new order", async () => {
    const { container } = render(<SetlistSongOrder setlistId="setlist-1" initialSongs={initialSongs} canManageSetlist />);

    fireEvent.click(screen.getByRole("button", { name: "Move Second Song up" }));

    await waitFor(() => expect(mockBulkReorder).toHaveBeenCalledTimes(1));
    const submittedFormData: unknown = mockBulkReorder.mock.calls[0][0];
    expect(submittedFormData).toBeInstanceOf(FormData);
    if (!(submittedFormData instanceof FormData)) throw new Error("Reorder action must receive form data.");
    expect(submittedFormData.get("setlistId")).toBe("setlist-1");
    expect(JSON.parse(String(submittedFormData.get("updates")))).toEqual([
      { id: "slot-2", song_order: 1 },
      { id: "slot-1", song_order: 2 },
    ]);
    expect(screen.getByRole("button", { name: "Move First Song down" })).toBeInTheDocument();
    expect(container.querySelector('[data-slot-id="slot-2"]')).toHaveAttribute("data-song-order", "1");
  });

  it("restores the previous order and reports a failed save", async () => {
    mockBulkReorder.mockResolvedValue({ ok: false, message: "Songs could not be reordered." });
    render(<SetlistSongOrder setlistId="setlist-1" initialSongs={initialSongs} canManageSetlist />);

    fireEvent.click(screen.getByRole("button", { name: "Move Second Song up" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Songs could not be reordered.");
    expect(screen.getByRole("button", { name: "Move First Song up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Second Song down" })).toBeDisabled();
  });

  it("restores the previous order and reports a rejected save", async () => {
    mockBulkReorder.mockRejectedValueOnce(new Error("network failure"));
    render(<SetlistSongOrder setlistId="setlist-1" initialSongs={initialSongs} canManageSetlist />);

    fireEvent.click(screen.getByRole("button", { name: "Move First Song down" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Songs could not be reordered. Try again.");
    expect(mockBulkReorder).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Move First Song up" })).toBeDisabled();
  });

});
