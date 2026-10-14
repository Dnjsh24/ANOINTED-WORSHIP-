import { useRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ChartAnnotations } from "./chart-annotations";

function Chart({ editable = true, slotId = "slot" }: { editable?: boolean; slotId?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  return <div ref={containerRef}><ChartAnnotations setlistId="set" slotId={slotId} songId="song" editable={editable} containerRef={containerRef} contentRef={contentRef} /><div ref={contentRef}>Lyrics</div></div>;
}
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ clearRect: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("saves formatting and keyboard movement and displays the note read-only in Stage", () => {
  const chart = render(<Chart />);
  fireEvent.click(screen.getByRole("button", { name: "Add text note" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Text note 1" }), { target: { value: "Quiet intro" } });
  fireEvent.change(screen.getByLabelText("Note font"), { target: { value: "serif" } });
  fireEvent.change(screen.getByLabelText("Note font size"), { target: { value: "32" } });
  fireEvent.click(screen.getByRole("button", { name: "Text color: Sky" }));
  for (const name of ["Bold", "Italic", "Underline", "Strikethrough"]) fireEvent.click(screen.getByRole("button", { name }));
  fireEvent.keyDown(screen.getByRole("button", { name: "Move text note 1" }), { key: "ArrowDown" });
  const saved = JSON.parse(localStorage.getItem("chart-notes_set_slot")!);
  expect(saved[0]).toMatchObject({ text: "Quiet intro", font: "serif", fontSize: 32, color: "#38bdf8", bold: true, italic: true, underline: true, strike: true, y: 110 });
  chart.unmount();
  render(<Chart editable={false} />);
  expect(screen.getByLabelText("Text note 1")).toHaveTextContent("Quiet intro");
  expect(screen.getByLabelText("Text note 1").parentElement).toHaveStyle({ color: "#38bdf8", fontFamily: "Georgia, serif", fontSize: "32px", fontWeight: "bold", fontStyle: "italic", textDecoration: "underline line-through" });
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.queryByRole("textbox")).toBeNull();
});

it("uses compact icon buttons and supports a custom text color", () => {
  render(<Chart />);
  for (const name of ["Apple Pencil Annotations", "Eraser", "Add text note"]) {
    const button = screen.getByRole("button", { name });
    expect(button.textContent).toBe("");
    expect(button.querySelector("svg")).not.toBeNull();
  }
  fireEvent.click(screen.getByRole("button", { name: "Apple Pencil Annotations" }));
  fireEvent.click(screen.getByRole("button", { name: "Pen color: Mint" }));
  expect(screen.getByRole("button", { name: "Pen color: Mint" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.change(screen.getByLabelText("Custom pen color"), { target: { value: "#123abc" } });
  expect(screen.getByLabelText("Custom pen color")).toHaveValue("#123abc");
  fireEvent.click(screen.getByRole("button", { name: "Add text note" }));
  fireEvent.change(screen.getByLabelText("Custom text color"), { target: { value: "#e879f9" } });
  expect(JSON.parse(localStorage.getItem("chart-notes_set_slot")!)[0].color).toBe("#e879f9");
});

it("exposes a nonmodal settings dialog and closes it with Escape", () => {
  render(<Chart />);
  fireEvent.click(screen.getByRole("button", { name: "Apple Pencil Annotations" }));
  expect(screen.getByRole("dialog", { name: "Annotation settings" })).not.toHaveAttribute("aria-modal", "true");
  screen.getByLabelText("Custom pen color").focus();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "Annotation settings" })).toBeNull();
  expect(screen.getByRole("button", { name: "Apple Pencil Annotations" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("button", { name: "Apple Pencil Annotations" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Add text note" }));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Keep cue" } });
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.getByRole("button", { name: "Add text note" })).toHaveFocus();
  expect(screen.getByText("Keep cue")).toBeInTheDocument();
});

it("returns focus to an enabled dock control at the note limit", () => {
  const note = { text: "Cue", x: 0, y: 100, font: "sans", fontSize: 24, bold: false, italic: false, underline: false, strike: false };
  localStorage.setItem("chart-notes_set_slot", JSON.stringify(Array.from({ length: 100 }, (_, index) => ({ ...note, id: `note-${index}` }))));
  render(<Chart />);
  expect(screen.getByRole("button", { name: "Add text note" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: /^Edit text note 1$/ }));
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.getByRole("button", { name: "Apple Pencil Annotations" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: /^Edit text note 1$/ }));
  fireEvent.click(screen.getByRole("button", { name: "Done editing" }));
  expect(screen.getByRole("button", { name: "Apple Pencil Annotations" })).toHaveFocus();
});

it("keeps notes isolated across slot switches and restores them on return", () => {
  const chart = render(<Chart />);
  fireEvent.click(screen.getByRole("button", { name: "Add text note" }));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "First song cue" } });
  chart.rerender(<Chart slotId="other" />);
  expect(screen.queryByText("First song cue")).toBeNull();
  chart.rerender(<Chart editable={false} />);
  expect(screen.getByLabelText("Text note 1")).toHaveTextContent("First song cue");
});

it("retains unsaved text and reports a device-storage failure", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Quota exceeded"); });
  render(<Chart />);
  fireEvent.click(screen.getByRole("button", { name: "Add text note" }));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Keep this draft" } });
  expect(screen.getByRole("textbox")).toHaveValue("Keep this draft");
  expect(screen.getByRole("alert")).toHaveTextContent("Could not save annotations");
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "Annotation settings" })).toBeNull();
  expect(screen.getByRole("alert")).toHaveTextContent("Could not save annotations");
});
