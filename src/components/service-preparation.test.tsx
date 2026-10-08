import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ServicePreparation } from "./service-preparation";

describe("service preparation", () => {
  it("edits allocation and checklist totals and downloads a text snapshot", () => {
    const createUrl = vi.fn(() => "blob:rehearsal");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createUrl });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<ServicePreparation name="Sunday" songs={[{ id: "a", title: "Song A", assignedKey: "D", bpm: 80 }]} />);
    fireEvent.click(screen.getByText("Open preparation tools"));
    fireEvent.change(screen.getByLabelText("Minutes for Song A"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Focus for Song A"), { target: { value: "Opening cue" } });
    fireEvent.click(screen.getByLabelText("Tune instruments and check cables"));
    expect(screen.getByRole("status")).toHaveTextContent("12 planned rehearsal minutes · 1 of 10");
    fireEvent.click(screen.getByRole("button", { name: "Download rehearsal plan" }));
    expect(createUrl).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledOnce();
    click.mockRestore();
  });
  it("keeps preparation available for an empty setlist", () => {
    render(<ServicePreparation name="Empty" songs={[]} />);
    fireEvent.click(screen.getByText("Open preparation tools"));
    expect(screen.getByText("Add songs to plan your rehearsal order.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("0 planned rehearsal minutes");
  });
});
