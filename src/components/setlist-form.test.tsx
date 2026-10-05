import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SetlistForm } from "./setlist-form";
import { setlists } from "@/lib/sample-data";

vi.mock("@/app/actions", () => ({ createSetlistAction: vi.fn(), updateSetlistAction: vi.fn(), deleteSetlistAction: vi.fn() }));
const song = { id: "extra-song", title: "Extra Song", original_key: "C", bpm: 100 };

describe("Setlist song selection", () => {
  it("supports accessible adding, duplicate prevention, removal and submission IDs", () => {
    const view = render(<SetlistForm songs={[song]} />);
    expect(screen.getByRole("button", { name: "Drag Extra Song" })).toHaveClass("touch-none");
    fireEvent.click(screen.getByRole("button", { name: "Add Extra Song" }));
    expect(view.container.querySelectorAll('input[name="songIds"]')).toHaveLength(1);
    expect(view.container.querySelector('input[name="songIds"]')).toHaveValue(song.id);
    expect(screen.getByRole("button", { name: "Add Extra Song" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Remove song" }));
    expect(view.container.querySelectorAll('input[name="songIds"]')).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Add Extra Song" })).toBeEnabled();
  });

  it("retains edit selections while adding another song", () => {
    const view = render(<SetlistForm setlist={setlists[0]} songs={[song]} />);
    const originalIds = setlists[0].songs.map(slot => slot.song.id);
    fireEvent.click(screen.getByRole("button", { name: "Add Extra Song" }));
    const selectedIds = [...view.container.querySelectorAll<HTMLInputElement>('input[name="songIds"]')].map(input => input.value);
    expect(selectedIds).toEqual([...originalIds, song.id]);
  });
});
