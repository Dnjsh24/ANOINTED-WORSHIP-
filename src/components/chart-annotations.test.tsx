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
  for (const name of ["Bold", "Italic", "Underline", "Strikethrough"]) fireEvent.click(screen.getByRole("button", { name }));
  fireEvent.keyDown(screen.getByRole("button", { name: "Move text note 1" }), { key: "ArrowDown" });
  const saved = JSON.parse(localStorage.getItem("chart-notes_set_slot")!);
  expect(saved[0]).toMatchObject({ text: "Quiet intro", font: "serif", fontSize: 32, bold: true, italic: true, underline: true, strike: true, y: 110 });
  chart.unmount();
  render(<Chart editable={false} />);
  expect(screen.getByLabelText("Text note 1")).toHaveTextContent("Quiet intro");
  expect(screen.getByLabelText("Text note 1").parentElement).toHaveStyle({ fontFamily: "Georgia, serif", fontSize: "32px", fontWeight: "bold", fontStyle: "italic", textDecoration: "underline line-through" });
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.queryByRole("textbox")).toBeNull();
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
});
