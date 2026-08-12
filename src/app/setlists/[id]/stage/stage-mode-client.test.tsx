import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StageModeClient, { type StageSetlist } from "./stage-mode-client";

vi.mock("@/app/actions", () => ({
  updateSetlistSongKeyAction: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createOptionalClient: () => null,
}));

const setlist: StageSetlist = {
  id: "setlist-1",
  date: "2026-08-13",
  type: "service",
  songs: [
    {
      id: "slot-1",
      order: 1,
      assignedKey: "G",
      lead: "",
      youtubeUrl: null,
      arrangement: null,
      arrangementSections: null,
      song: {
        id: "song-1",
        title: "Stage Number Song",
        bpm: 72,
        originalKey: "G",
        lyricsChords: "[Verse]\nG D Em C\nSing the progression",
      },
    },
  ],
};

const canvasContext = {
  beginPath: vi.fn(),
  clearRect: vi.fn(),
  drawImage: vi.fn(),
  lineTo: vi.fn(),
  moveTo: vi.fn(),
  stroke: vi.fn(),
  strokeStyle: "",
  globalCompositeOperation: "source-over",
  lineWidth: 1,
  lineCap: "butt",
};

describe("StageModeClient notation and annotations", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      canvasContext as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/png;base64,saved-annotation",
    );
  });

  it("switches the Stage chart to Nashville numbers", async () => {
    const user = userEvent.setup();
    render(<StageModeClient setlist={setlist} />);
    const notation = within(screen.getByRole("group", { name: "Chord notation" }));

    expect(screen.getByText("G D Em C")).toBeInTheDocument();

    await user.click(notation.getByRole("button", { name: "Nashville" }));

    expect(screen.getByText("1 5 6m 4")).toBeInTheDocument();
    expect(notation.getByRole("button", { name: "Nashville" })).toHaveAttribute("aria-pressed", "true");
  });

  it("lets the guitarist choose a capo fret while preserving the concert key", async () => {
    const user = userEvent.setup();
    render(<StageModeClient setlist={setlist} />);

    await user.click(screen.getByRole("button", { name: "Guitar Mode (Capo)" }));

    const capoFret = screen.getByRole("combobox", { name: "Capo fret" });
    expect(within(capoFret).getByRole("option", { name: "Open" })).toBeInTheDocument();
    expect(within(capoFret).getByRole("option", { name: "Capo 11" })).toBeInTheDocument();

    await user.selectOptions(capoFret, "2");

    expect(screen.getByText("Capo 2", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("F C Dm Bb")).toBeInTheDocument();
    expect(screen.getByText("G")).toBeInTheDocument();
  });

  it("uses the selected drawing color and saves the song annotation on stroke end", async () => {
    const user = userEvent.setup();
    const { container } = render(<StageModeClient setlist={setlist} />);

    await user.click(screen.getByRole("button", { name: "Draw annotations" }));
    await user.click(screen.getByRole("button", { name: "Draw with red" }));

    const redButton = screen.getByRole("button", { name: "Draw with red" });
    expect(redButton).toHaveAttribute("aria-pressed", "true");

    const canvas = container.querySelector("canvas");
    expect(canvas).not.toBeNull();
    fireEvent.pointerDown(canvas!, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(canvas!, { clientX: 30, clientY: 30, pointerId: 1 });
    fireEvent.pointerUp(canvas!, { clientX: 30, clientY: 30, pointerId: 1 });

    expect(canvasContext.strokeStyle).toBe("#ef4444");
    expect(localStorage.getItem("scribbles_setlist-1_slot-1")).toBe(
      "data:image/png;base64,saved-annotation",
    );
    expect(screen.getByText("Saved on this device")).toBeInTheDocument();
  });
});
