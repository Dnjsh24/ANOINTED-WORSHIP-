import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StageModeClient, { type StageSetlist } from "./stage-mode-client";

vi.mock("@/app/actions", () => ({
  updateSetlistSongKeyAction: vi.fn().mockResolvedValue({ success: true }),
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
      lead: "Leader 1",
      youtubeUrl: null,
      arrangement: null,
      arrangementSections: null,
      song: {
        id: "song-1",
        title: "Stage Number Song",
        bpm: 72,
        originalKey: "G",
        lyricsChords: "[Verse 1]\nG D Em C\nSing the progression\n[Chorus]\nC G D Em\nChorus of song 1",
      },
    },
    {
      id: "slot-2",
      order: 2,
      assignedKey: "D",
      lead: "Leader 2",
      youtubeUrl: null,
      arrangement: null,
      arrangementSections: null,
      song: {
        id: "song-2",
        title: "Second Worship Song",
        bpm: 120,
        originalKey: "D",
        lyricsChords: "[Intro]\nD A Bm G\n[Verse 1]\nD A Bm G\nSecond song verses",
      },
    },
  ],
};

const sectionColorSetlist: StageSetlist = {
  ...setlist,
  songs: [
    {
      ...setlist.songs[0],
      song: {
        ...setlist.songs[0].song,
        lyricsChords: [
          "[Intro]",
          "G",
          "Intro words",
          "[Verse 1]",
          "G",
          "Verse words",
          "[Pre-Chorus]",
          "C",
          "Pre-chorus words",
          "[Chorus]",
          "D",
          "Chorus words",
          "[Bridge]",
          "Em",
          "Bridge words",
          "[Instrumental]",
          "C",
          "Instrumental words",
          "[Tag]",
          "D",
          "Tag words",
          "[Outro]",
          "G",
          "Outro words",
        ].join("\n"),
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

  it("color-codes section labels without changing lyric colors", () => {
    render(<StageModeClient setlist={sectionColorSetlist} />);

    expect(screen.getByText("Intro", { selector: "div" })).toHaveClass("text-amber-300");
    expect(screen.getByText("Verse 1", { selector: "div" })).toHaveClass("text-emerald-300");
    expect(screen.getByText("Pre-Chorus", { selector: "div" })).toHaveClass("text-violet-300");
    expect(screen.getByText("Chorus", { selector: "div" })).toHaveClass("text-blue-300");
    expect(screen.getByText("Bridge", { selector: "div" })).toHaveClass("text-rose-300");
    expect(screen.getByText("Instrumental", { selector: "div" })).toHaveClass("text-cyan-300");
    expect(screen.getByText("Tag", { selector: "div" })).toHaveClass("text-fuchsia-300");
    expect(screen.getByText("Outro", { selector: "div" })).toHaveClass("text-orange-300");
    expect(screen.getByText("Verse words")).toHaveClass("text-zinc-100");
    expect(screen.getByText("Chorus words")).toHaveClass("text-zinc-100");
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

  it("renders AnnotationCanvas controls and toggles draw mode", async () => {
    const user = userEvent.setup();
    render(<StageModeClient setlist={setlist} />);

    const drawBtn = screen.getByRole("button", { name: /^draw/i });
    expect(drawBtn).toBeInTheDocument();

    await user.click(drawBtn);
    expect(screen.getByRole("button", { name: /drawing on/i })).toBeInTheDocument();
  });

  it("toggles Double View and renders side-by-side songs with left and right flank controls", async () => {
    const user = userEvent.setup();
    render(<StageModeClient setlist={setlist} />);

    const doubleViewBtn = screen.getByRole("button", { name: /toggle double view/i });
    expect(doubleViewBtn).toBeInTheDocument();

    // Enable double view
    await user.click(doubleViewBtn);

    // Both songs should now be visible simultaneously
    expect(screen.getByText("DOUBLE VIEW")).toBeInTheDocument();
    expect(screen.getByText("Stage Number Song & Second Worship Song")).toBeInTheDocument();
    expect(screen.getByText("Sing the progression")).toBeInTheDocument();
    expect(screen.getByText("Second song verses")).toBeInTheDocument();

    // Check Outer Left Flank Sidebar (Song 1)
    const leftFlank = screen.getByRole("complementary", { name: /song 1 arrangement controls/i });
    expect(leftFlank).toBeInTheDocument();
    expect(within(leftFlank).getByRole("button", { name: /jump to verse 1 on song 1/i })).toBeInTheDocument();
    expect(within(leftFlank).getByRole("button", { name: /jump to chorus on song 1/i })).toBeInTheDocument();

    // Check Outer Right Flank Sidebar (Song 2)
    const rightFlank = screen.getByRole("complementary", { name: /song 2 arrangement controls/i });
    expect(rightFlank).toBeInTheDocument();
    expect(within(rightFlank).getByRole("button", { name: /jump to intro on song 2/i })).toBeInTheDocument();
    expect(within(rightFlank).getByRole("button", { name: /jump to verse 1 on song 2/i })).toBeInTheDocument();

    // Test clicking a section on the flank sidebars
    const scrollIntoViewMock = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;

    await user.click(within(leftFlank).getByRole("button", { name: /jump to chorus on song 1/i }));
    expect(scrollIntoViewMock).toHaveBeenCalled();

    // Test Transposing Song 1 and Song 2 independently
    const raiseSong1KeyBtn = screen.getByRole("button", { name: /raise song 1 key/i });
    await user.click(raiseSong1KeyBtn);
    expect(screen.getByText("Ab")).toBeInTheDocument();

    // Toggle back to Single View
    await user.click(doubleViewBtn);
    expect(screen.queryByText("DOUBLE VIEW")).not.toBeInTheDocument();
  });
});
