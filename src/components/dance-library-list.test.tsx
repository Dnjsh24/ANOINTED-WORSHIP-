import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DanceLibraryList } from "./dance-library-list";

afterEach(cleanup);

const chart = {
  id: "dance-1", title: "Service dance", choreographyNotes: "Steps",
  formationNotes: null, outfitNotes: null, songTitle: null, songArtist: null,
  songVersion: null, eventName: null, eventDate: null, createdAt: "2026-10-06",
};

describe("DanceLibraryList video links", () => {
  it.each(["javascript:alert(1)", "data:text/html,hello", "ftp://example.com/video", "https://user:password@example.com/video"])("omits unsafe video link %s", (videoUrl) => {
    render(<DanceLibraryList charts={[{ ...chart, videoUrl }]} canManage={false} />);
    expect(screen.queryByRole("link", { name: "Watch" })).toBeNull();
    expect(screen.getByRole("link", { name: "View Steps" })).toHaveAttribute("href", "/dance/dance-1");
  });

  it("retains a valid external reference with protected target", () => {
    render(<DanceLibraryList charts={[{ ...chart, videoUrl: "https://example.com/video" }]} canManage={false} />);
    expect(screen.getByRole("link", { name: "Watch" })).toHaveAttribute("href", "https://example.com/video");
    expect(screen.getByRole("link", { name: "Watch" })).toHaveAttribute("rel", "noopener noreferrer");
  });
});
