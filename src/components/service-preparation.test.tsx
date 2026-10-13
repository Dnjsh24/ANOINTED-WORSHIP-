import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServicePreparation } from "./service-preparation";
import { RehearsalNote } from "./rehearsal-note";

const songs = [{ id: "a", title: "Song A", assignedKey: "D", bpm: 80 }];
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe("service preparation", () => {
  it("saves per-song demo notes for the setlist and Stage without a download", () => {
    render(<>
      <ServicePreparation setlistId="sunday" name="Sunday" songs={songs} />
      <RehearsalNote setlistId="sunday" slotId="a" demoMode stage />
      <RehearsalNote setlistId="other" slotId="a" demoMode stage />
    </>);
    expect(screen.queryByText("Open preparation tools")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download rehearsal plan" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Minutes for Song A"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Rehearsal notes for Song A"), { target: { value: "Opening cue" } });
    fireEvent.click(screen.getByLabelText("Tune instruments and check cables"));
    expect(screen.getByRole("status")).toHaveTextContent("12 planned rehearsal minutes · 1 of 10");
    expect(screen.queryByRole("region", { name: "Rehearsal notes" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save rehearsal notes" }));
    expect(screen.getByRole("region", { name: "Rehearsal notes" })).toHaveTextContent("Opening cue");
    expect(screen.getAllByRole("region", { name: "Rehearsal notes" })).toHaveLength(1);
    expect(screen.getByText(/Demo rehearsal notes saved on this device/)).toBeVisible();
  });
  it("keeps preparation available for an empty setlist", () => {
    render(<ServicePreparation name="Empty" songs={[]} />);
    expect(screen.getByText("Add songs to plan your rehearsal order.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("0 planned rehearsal minutes");
  });
  it("restores saved notes and minutes on returning and saves clearing a note", () => {
    localStorage.setItem("sunday-setlist:demo-rehearsal:sunday", JSON.stringify({ a: { minutes: 8, focus: "Saved cue" } }));
    render(<><ServicePreparation setlistId="sunday" name="Sunday" songs={songs} /><RehearsalNote setlistId="sunday" slotId="a" demoMode stage /></>);
    expect(screen.getByLabelText("Rehearsal notes for Song A")).toHaveValue("Saved cue");
    expect(screen.getByLabelText("Minutes for Song A")).toHaveValue(8);
    fireEvent.change(screen.getByLabelText("Rehearsal notes for Song A"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save rehearsal notes" }));
    expect(screen.queryByRole("region", { name: "Rehearsal notes" })).not.toBeInTheDocument();
  });
  it("preserves the draft and reports blocked device storage", () => {
    render(<ServicePreparation setlistId="sunday" name="Sunday" songs={songs} />);
    fireEvent.change(screen.getByLabelText("Rehearsal notes for Song A"), { target: { value: "Keep this draft" } });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage blocked"); });
    fireEvent.click(screen.getByRole("button", { name: "Save rehearsal notes" }));
    expect(screen.getByText(/your draft is unchanged/)).toBeVisible();
    expect(screen.getByLabelText("Rehearsal notes for Song A")).toHaveValue("Keep this draft");
  });
  it("ignores malformed demo storage and does not use demo data for connected notes", () => {
    localStorage.setItem("sunday-setlist:demo-rehearsal:sunday", "invalid");
    const { rerender } = render(<RehearsalNote setlistId="sunday" slotId="a" demoMode stage />);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    localStorage.setItem("sunday-setlist:demo-rehearsal:sunday", JSON.stringify({ a: { minutes: 5, focus: "Demo cue" } }));
    rerender(<RehearsalNote setlistId="sunday" slotId="a" note="Saved team cue" stage />);
    expect(screen.getByRole("region")).toHaveTextContent("Saved team cue");
    expect(screen.queryByText("Demo cue")).not.toBeInTheDocument();
  });
});
