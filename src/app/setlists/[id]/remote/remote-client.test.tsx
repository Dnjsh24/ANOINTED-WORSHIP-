import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RemoteClient from "./remote-client";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: vi.fn(),
    removeChannel: vi.fn(),
  }),
}));

class TestBroadcastChannel {
  static instances: TestBroadcastChannel[] = [];

  readonly messages: unknown[] = [];
  closed = false;
  readonly listeners = new Set<(event: MessageEvent) => void>();

  constructor(readonly name: string) {
    TestBroadcastChannel.instances.push(this);
  }

  postMessage(message: unknown) {
    if (this.closed) {
      throw new DOMException("Channel is closed", "InvalidStateError");
    }
    this.messages.push(message);
  }

  addEventListener(_type: "message", listener: (event: MessageEvent) => void) {
    this.listeners.add(listener);
  }

  removeEventListener(_type: "message", listener: (event: MessageEvent) => void) {
    this.listeners.delete(listener);
  }

  close() {
    this.closed = true;
  }
}

describe("desktop Worship Remote transport", () => {
  beforeEach(() => {
    window.localStorage.clear();
    TestBroadcastChannel.instances = [];
    vi.stubGlobal("BroadcastChannel", TestBroadcastChannel);
  });

  it("keeps its BroadcastChannel open when the controller ID is initialized", async () => {
    const view = render(
      <RemoteClient
        desktopMode
        setlist={{
          id: "setlist-1",
          name: "Sunday Service",
          songs: [{
            id: "setlist-song-1",
            song: {
              title: "Washed",
              lyricsChords: "[Verse 1]\nI've been washed",
            },
          }],
        }}
      />,
    );

    await waitFor(() => {
      expect(window.localStorage.getItem("anointed-worship-remote-controller")).toBeTruthy();
    });

    expect(TestBroadcastChannel.instances).toHaveLength(1);
    expect(TestBroadcastChannel.instances[0].closed).toBe(false);
    expect(TestBroadcastChannel.instances[0].messages).toEqual(expect.arrayContaining([
      { event: "remote_state_request" },
      { event: "presentation_state_request" },
    ]));

    view.unmount();
    expect(TestBroadcastChannel.instances[0].closed).toBe(true);
  });
});
