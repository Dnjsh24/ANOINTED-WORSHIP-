import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SongViewer } from "@/components/song-viewer";
import type { Song } from "@/lib/types";
import { updateSetlistSongKeyAction } from "@/app/actions";

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

describe("SongViewer", () => {
  afterEach(() => {
    vi.useRealTimers();
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

  it("does not embed or link executable and unrelated YouTube-looking URLs", () => {
    const view = render(<SongViewer song={{ ...songWithRepeatedSections, youtubeUrl: "javascript:alert(1);//watch?v=dQw4w9WgXcQ" }} />);
    expect(screen.queryByRole("link", { name: "Open on YouTube" })).not.toBeInTheDocument();
    expect(view.container.querySelector("iframe")).toBeNull();
    view.rerender(<SongViewer song={{ ...songWithRepeatedSections, youtubeUrl: "https://evil.example/watch?v=dQw4w9WgXcQ" }} />);
    expect(screen.queryByRole("link", { name: "Open on YouTube" })).not.toBeInTheDocument();
  });

  it("uses a labeled practice tempo when BPM is missing and follows the song meter", () => {
    render(<SongViewer song={{ ...songWithRepeatedSections, bpm: null, timeSignature: "3/4" }} />);

    expect(screen.getByText("Practice tempo · 80 BPM")).toBeInTheDocument();
    expect(screen.getByText("3/4 meter · beat 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start metronome" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start auto-scroll" })).toBeInTheDocument();
    expect(screen.getByLabelText("Practice time signature")).toHaveValue("3/4");
    fireEvent.change(screen.getByLabelText("Practice time signature"), { target: { value: "6/8" } });
    expect(screen.getByText("6/8 meter · beat 1 of 6")).toBeInTheDocument();
    expect(screen.getByLabelText("Auto-scroll speed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Raise song key" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Transpose down" })).toBeInTheDocument();
  });

  it("confirms a saved setlist key and reports action failures", async () => {
    const saveKey = vi.mocked(updateSetlistSongKeyAction);
    saveKey.mockResolvedValueOnce({ ok: true, message: "Key updated." });
    const { unmount } = render(<SongViewer song={songWithRepeatedSections} setlistId="setlist-1" slotId="slot-1" assignedKey="C" />);
    fireEvent.click(screen.getByRole("button", { name: "Raise song key" }));
    fireEvent.click(screen.getByRole("button", { name: "Save to Setlist" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Key updated.");
    expect(screen.queryByRole("button", { name: "Save to Setlist" })).not.toBeInTheDocument();
    expect(saveKey).toHaveBeenCalledWith(expect.any(FormData));
    unmount();

    saveKey.mockResolvedValueOnce({ ok: false, message: "Permission denied." });
    render(<SongViewer song={songWithRepeatedSections} setlistId="setlist-1" slotId="slot-1" assignedKey="C" />);
    fireEvent.click(screen.getByRole("button", { name: "Raise song key" }));
    fireEvent.click(screen.getByRole("button", { name: "Save to Setlist" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Permission denied.");
    expect(screen.getByRole("button", { name: "Save to Setlist" })).toBeInTheDocument();
  });

  it("cycles the metronome beat count and clears both practice timers on unmount", () => {
    vi.useFakeTimers();
    const intervalSpy = vi.spyOn(window, "setInterval");
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    vi.spyOn(window, "scrollBy").mockImplementation(() => undefined);
    const { unmount } = render(<SongViewer song={{ ...songWithRepeatedSections, timeSignature: "3/4" }} />);

    fireEvent.click(screen.getByRole("button", { name: "Start metronome" }));
    fireEvent.click(screen.getByRole("button", { name: "Start auto-scroll" }));
    expect(intervalSpy).toHaveBeenCalledTimes(2);

    act(() => {
      vi.advanceTimersByTime(2501);
    });
    expect(screen.getByText("3/4 meter · beat 1 of 3")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Practice time signature"), { target: { value: "6/8" } });
    act(() => { vi.advanceTimersByTime(4167); });
    expect(screen.getByText("6/8 meter · beat 6 of 6")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(834); });
    expect(screen.getByText("6/8 meter · beat 1 of 6")).toBeInTheDocument();
    const practiceIntervals = intervalSpy.mock.results.map((result) => result.value);

    unmount();
    for (const interval of practiceIntervals) {
      expect(clearIntervalSpy).toHaveBeenCalledWith(interval);
    }
  });
});
