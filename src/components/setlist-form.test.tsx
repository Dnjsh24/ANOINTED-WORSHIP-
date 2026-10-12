import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SetlistForm } from "./setlist-form";
import { setlists } from "@/lib/sample-data";

vi.mock("@/app/actions", () => ({ createSetlistAction: vi.fn(), updateSetlistAction: vi.fn(), deleteSetlistAction: vi.fn() }));
const song = { id: "extra-song", title: "Extra Song", original_key: "C", bpm: 100 };

describe("Setlist song selection", () => {
  it("creates standalone setlists without submitting a Timeline event link", () => {
    const view = render(<SetlistForm />);
    const form = view.container.querySelector("form")!;

    expect(new FormData(form).has("eventId")).toBe(false);
    expect(screen.getByText(/This is a standalone setlist/)).toHaveTextContent("Setlist (optional)");
  });

  it("submits the explicit event link when creation starts from Timeline", () => {
    const view = render(<SetlistForm eventId="rehearsal-1" initialEventType="rehearsal" />);
    const form = view.container.querySelector("form")!;

    expect(new FormData(form).get("eventId")).toBe("rehearsal-1");
    expect(screen.getByText(/This setlist is linked to a Timeline event/)).toBeInTheDocument();
    expect(screen.queryByText(/This is a standalone setlist/)).not.toBeInTheDocument();
  });


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
