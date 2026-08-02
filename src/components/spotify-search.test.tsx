import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SpotifySearch, type SpotifyTrack } from "@/components/spotify-search";

const track: SpotifyTrack = {
  id: "4uLU6hMCjMI75M1A2tKUQC",
  name: "Oceans",
  artists: [{ name: "Hillsong UNITED" }],
  album: { name: "Zion", images: [] },
  external_urls: {
    spotify: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
  },
};

describe("SpotifySearch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("opens a titled Spotify player from a keyboard-accessible preview button", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [track],
    }));
    const user = userEvent.setup();

    render(<SpotifySearch onSelect={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Search Spotify to autofill..."), {
      target: { value: "Oceans" },
    });

    const previewButton = await screen.findByRole("button", {
      name: "Show Spotify player for Oceans",
    });
    await user.click(previewButton);

    await waitFor(() => {
      const player = screen.getByTitle("Spotify player for Oceans");
      expect(player).toHaveAttribute(
        "src",
        "https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC",
      );
    });
  });
});
