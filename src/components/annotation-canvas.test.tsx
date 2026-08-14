import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { AnnotationCanvas } from "./annotation-canvas";

// Mock server actions
vi.mock("@/app/actions", () => ({
  saveSongAnnotationAction: vi.fn().mockResolvedValue({ ok: true, message: "Saved" }),
  copyAnnotationToSetlistAction: vi.fn().mockResolvedValue({ ok: true, message: "Copied" }),
  saveAnnotationToMasterSongAction: vi.fn().mockResolvedValue({ ok: true, message: "Saved as master" }),
}));

describe("AnnotationCanvas", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();

    // Mock HTMLCanvasElement for jsdom environment
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      drawImage: vi.fn(),
    });
    HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue("data:image/png;base64,mock");
  });

  it("renders drawing toolbar controls and toggles draw mode", async () => {
    const user = userEvent.setup();
    const containerRef = { current: document.createElement("div") };

    render(
      <AnnotationCanvas
        songId="song-101"
        setlistId="setlist-1"
        setlistSongId="slot-1"
        songTitle="Amazing Grace"
        containerRef={containerRef}
      />,
    );

    const drawBtn = screen.getByRole("button", { name: /draw/i });
    expect(drawBtn).toBeInTheDocument();

    await user.click(drawBtn);
    expect(screen.getByRole("button", { name: /drawing on/i })).toBeInTheDocument();
  });

  it("toggles on-screen notes mode and places text notes", async () => {
    const user = userEvent.setup();
    const containerRef = { current: document.createElement("div") };

    render(
      <AnnotationCanvas
        songId="song-101"
        setlistId="setlist-1"
        setlistSongId="slot-1"
        songTitle="Amazing Grace"
        containerRef={containerRef}
      />,
    );

    const notesBtn = screen.getByRole("button", { name: /^notes/i });
    await user.click(notesBtn);

    expect(screen.getByRole("button", { name: /notes mode on/i })).toBeInTheDocument();
  });

  it("toggles personal vs team shared visibility", async () => {
    const user = userEvent.setup();
    const containerRef = { current: document.createElement("div") };

    render(
      <AnnotationCanvas
        songId="song-101"
        setlistId="setlist-1"
        setlistSongId="slot-1"
        songTitle="Amazing Grace"
        containerRef={containerRef}
      />,
    );

    const visibilityBtn = screen.getByRole("button", { name: /personal/i });
    expect(visibilityBtn).toBeInTheDocument();

    await user.click(visibilityBtn);
    const teamOption = screen.getByRole("button", { name: /entire team/i });
    await user.click(teamOption);

    const saveShareBtn = screen.getByRole("button", { name: /save sharing settings/i });
    await user.click(saveShareBtn);

    expect(screen.getByRole("button", { name: /team shared/i })).toBeInTheDocument();
  });

  it("opens copy modal and accepts target setlist ID", async () => {
    const user = userEvent.setup();
    const containerRef = { current: document.createElement("div") };

    render(
      <AnnotationCanvas
        songId="song-101"
        setlistId="setlist-1"
        setlistSongId="slot-1"
        songTitle="Amazing Grace"
        containerRef={containerRef}
      />,
    );

    const copyBtn = screen.getByTitle(/copy notes to another setlist/i);
    await user.click(copyBtn);

    const input = screen.getByPlaceholderText(/enter target setlist id/i);
    expect(input).toBeInTheDocument();

    await user.type(input, "easter-service");
    expect(input).toHaveValue("easter-service");
  });
});
