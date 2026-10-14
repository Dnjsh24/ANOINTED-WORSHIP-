import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SetlistForm } from "./setlist-form";
import { setlists } from "@/lib/sample-data";

vi.mock("@/app/actions", () => ({ createSetlistAction: vi.fn(), updateSetlistAction: vi.fn(), deleteSetlistAction: vi.fn() }));
const song = { id: "extra-song", title: "Extra Song", original_key: "C", bpm: 100 };
const events = [
  { id: "rehearsal-1", name: "Band rehearsal", type: "rehearsal" as const, event_date: "2026-10-18" },
  { id: "service-1", name: "Sunday worship", type: "service" as const, event_date: "2026-10-19" },
];

describe("Setlist song selection", () => {
  it("creates standalone setlists without submitting a Timeline event link", () => {
    const view = render(<SetlistForm />);
    const form = view.container.querySelector("form")!;

    expect(new FormData(form).has("eventId")).toBe(false);
    expect(screen.getByRole("combobox", { name: "Timeline event (Optional)" })).toHaveValue("");
    expect(screen.getByText(/This is a standalone setlist/)).toBeInTheDocument();
  });

  it("submits the explicit event link when creation starts from Timeline", () => {
    const view = render(<SetlistForm eventId="rehearsal-1" initialEventType="rehearsal" events={events} />);
    const form = view.container.querySelector("form")!;

    expect(new FormData(form).get("eventId")).toBe("rehearsal-1");
    expect(screen.getByText(/This setlist is linked to a Timeline event/)).toBeInTheDocument();
    expect(screen.queryByText(/This is a standalone setlist/)).not.toBeInTheDocument();
  });

  it("selects an event then returns to standalone without losing the draft", () => {
    const view = render(<SetlistForm events={events} songs={[song]} />);
    const form = view.container.querySelector("form")!;
    const select = screen.getByRole("combobox", { name: "Timeline event (Optional)" });
    fireEvent.change(screen.getByRole("textbox", { name: "Setlist Name *" }), { target: { value: "My songs" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Notes (Optional)" }), { target: { value: "Keep these notes" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Extra Song" }));
    fireEvent.change(select, { target: { value: "rehearsal-1" } });
    expect(new FormData(form).getAll("eventId")).toEqual(["rehearsal-1"]);
    expect(new FormData(form).get("eventType")).toBe("rehearsal");
    expect(new FormData(form).get("serviceDate")).toBe("2026-10-18");
    expect(select).toHaveAccessibleDescription(/Saving will add this setlist/);
    fireEvent.change(select, { target: { value: "service-1" } });
    expect(new FormData(form).getAll("eventId")).toEqual(["service-1"]);
    fireEvent.change(select, { target: { value: "" } });
    const standalone = new FormData(form);
    expect(standalone.has("eventId")).toBe(false);
    expect(standalone.get("title")).toBe("My songs");
    expect(standalone.get("notes")).toBe("Keep these notes");
    expect(standalone.getAll("songIds")).toEqual([song.id]);
  });

  it("does not submit an unavailable preselected event", () => {
    const view = render(<SetlistForm events={events} eventId="foreign-event" />);
    expect(new FormData(view.container.querySelector("form")!).has("eventId")).toBe(false);
    expect(screen.getByRole("combobox")).toHaveValue("");
  });

  it("reports a load failure while retaining the standalone option", () => {
    render(<SetlistForm eventsUnavailable />);
    expect(screen.getByRole("combobox")).toHaveAccessibleDescription(/could not be loaded/);
    expect(screen.getByRole("option", { name: "Standalone setlist" })).toBeInTheDocument();
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
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    const originalIds = setlists[0].songs.map(slot => slot.song.id);
    fireEvent.click(screen.getByRole("button", { name: "Add Extra Song" }));
    const selectedIds = [...view.container.querySelectorAll<HTMLInputElement>('input[name="songIds"]')].map(input => input.value);
    expect(selectedIds).toEqual([...originalIds, song.id]);
  });
});
