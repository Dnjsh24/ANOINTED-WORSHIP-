import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultPresentationSettings, type PresentationSlide } from "@/lib/domain/presentation";
import ProjectorClient from "./projector-client";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: vi.fn(),
    removeChannel: vi.fn(),
  }),
}));

class TestBroadcastChannel {
  static listener: ((event: MessageEvent) => void) | null = null;

  addEventListener(_type: "message", listener: (event: MessageEvent) => void) {
    TestBroadcastChannel.listener = listener;
  }

  removeEventListener() {
    TestBroadcastChannel.listener = null;
  }

  postMessage() {}
  close() {}
}

const firstSlide: PresentationSlide = {
  id: "slide-1",
  type: "lyrics",
  sectionLabel: "Verse 1",
  content: ["First lyric"],
};

const secondSlide: PresentationSlide = {
  id: "slide-2",
  type: "lyrics",
  sectionLabel: "Verse 1",
  content: ["Second lyric"],
};

describe("Projector persistent background", () => {
  beforeEach(() => {
    TestBroadcastChannel.listener = null;
    vi.stubGlobal("BroadcastChannel", TestBroadcastChannel);
    Object.defineProperty(window, "anointedDesktop", {
      configurable: true,
      value: { markOutputReady: vi.fn() },
    });
  });

  it("keeps the same background video mounted when only the lyric slide changes", () => {
    const settings = {
      ...defaultPresentationSettings,
      slideTransition: "None" as const,
      backgroundMediaUrl: "/api/desktop/backgrounds/background-1",
      backgroundMediaType: "video" as const,
    };
    const view = render(
      <ProjectorClient
        setlistId="setlist-1"
        initialSettings={settings}
        initialLiveState={{ slide: firstSlide, outputMode: "slide" }}
      />,
    );
    const backgroundBefore = view.container.querySelector<HTMLVideoElement>(
      'video[src="/api/desktop/backgrounds/background-1"]',
    );

    expect(backgroundBefore).not.toBeNull();
    act(() => {
      TestBroadcastChannel.listener?.(new MessageEvent("message", {
        data: {
          event: "projector_sync",
          payload: { slide: secondSlide, settings, outputMode: "slide" },
        },
      }));
    });

    expect(screen.getByText("Second lyric")).toBeInTheDocument();
    const backgroundAfter = view.container.querySelector<HTMLVideoElement>(
      'video[src="/api/desktop/backgrounds/background-1"]',
    );
    expect(backgroundAfter).toBe(backgroundBefore);
  });
});
