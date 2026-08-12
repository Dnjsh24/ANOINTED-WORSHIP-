import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SongViewer } from "@/components/song-viewer";
import type { Song } from "@/lib/types";

vi.mock("@/app/actions", () => ({
  updateSetlistSongKeyAction: vi.fn(),
}));

vi.mock("@/components/chord-diagrams", () => ({
  ChordDiagrams: () => null,
}));

const songWithRepeatedSections: Song = {
  id: "song-1",
  title: "Repeated Song",
  artist: "Test Artist",
  originalKey: "C",
  currentKey: "C",
  bpm: 72,
  timeSignature: "4/4",
  tags: [],
  favorite: false,
  sections: [
    { label: "Chorus", lines: [{ lyric: "First chorus" }] },
    { label: "Bridge", lines: [{ lyric: "First bridge" }] },
    { label: "Chorus", lines: [{ lyric: "Second chorus" }] },
    { label: "Bridge", lines: [{ lyric: "Second bridge" }] },
  ],
};

const songWithChords: Song = {
  ...songWithRepeatedSections,
  id: "song-with-chords",
  title: "Numbered Song",
  sections: [
    { label: "Verse", lines: [{ chords: "C G Am F", lyric: "Sing the progression" }] },
  ],
};

describe("SongViewer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders repeated arrangement sections without duplicate React keys", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(<SongViewer song={songWithRepeatedSections} />);

    const duplicateKeyWarnings = consoleError.mock.calls.filter((call) =>
      call.some((value) => String(value).includes("same key")),
    );
    expect(duplicateKeyWarnings).toEqual([]);
  });

  it("labels embedded players and keeps direct media links available", () => {
    render(
      <SongViewer
        song={{
          ...songWithRepeatedSections,
          spotifyUrl: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
          youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        }}
      />,
    );

    expect(screen.getByTitle("Spotify player for Repeated Song")).toHaveAttribute(
      "src",
      "https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC",
    );
    expect(screen.getByRole("link", { name: "Open on Spotify" })).toHaveAttribute(
      "href",
      "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
    );
    expect(screen.getByRole("link", { name: "Open on YouTube" })).toHaveAttribute(
      "href",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
  });

  it("does not embed an untrusted Spotify URL", () => {
    const { container } = render(
      <SongViewer
        song={{
          ...songWithRepeatedSections,
          spotifyUrl: "javascript:alert('unsafe')",
        }}
      />,
    );

    expect(container.querySelector("iframe[src^='javascript:']")).toBeNull();
    expect(screen.queryByRole("link", { name: "Open on Spotify" })).not.toBeInTheDocument();
  });

  it("switches the chord chart between chord names and Nashville numbers", async () => {
    const user = userEvent.setup();
    render(<SongViewer song={songWithChords} />);
    const notation = within(screen.getByRole("group", { name: "Chord notation" }));

    expect(screen.getByText("C G Am F")).toBeInTheDocument();

    await user.click(notation.getByRole("button", { name: "Nashville" }));

    expect(screen.getByText("1 5 6m 4")).toBeInTheDocument();
    expect(notation.getByRole("button", { name: "Nashville" })).toHaveAttribute("aria-pressed", "true");

    await user.click(notation.getByRole("button", { name: "Chords" }));

    expect(screen.getByText("C G Am F")).toBeInTheDocument();
  });
});
