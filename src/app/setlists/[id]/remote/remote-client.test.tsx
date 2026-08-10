import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RemoteClient from "./remote-client";

const supabaseMocks = vi.hoisted(() => ({
  createOptionalClient: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: supabaseMocks.createOptionalClient,
  createOptionalClient: supabaseMocks.createOptionalClient,
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

  emit(data: unknown) {
    const event = new MessageEvent("message", { data });
    this.listeners.forEach((listener) => listener(event));
  }
}

describe("desktop Worship Remote transport", () => {
  beforeEach(() => {
    window.localStorage.clear();
    TestBroadcastChannel.instances = [];
    vi.stubGlobal("BroadcastChannel", TestBroadcastChannel);
    supabaseMocks.createOptionalClient.mockReset();
    supabaseMocks.createOptionalClient.mockReturnValue({
      channel: vi.fn(),
      removeChannel: vi.fn(),
    });
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

  it("orders lineup, Presentation, and Bible and presents metadata-only deck slides", async () => {
    render(
      <RemoteClient
        desktopMode
        setlist={{
          id: "setlist-1",
          name: "Sunday Service",
          songs: [{ id: "song-1", song: { title: "Washed", lyricsChords: "[Verse]\nWashed" } }],
        }}
      />,
    );
    await waitFor(() => expect(TestBroadcastChannel.instances).toHaveLength(1));
    const channel = TestBroadcastChannel.instances[0];
    act(() => {
      channel.emit({ event: "remote_state", payload: { controllerReady: true, controller: "remote", activeSongIndex: 0, displays: [] } });
      channel.emit({
        event: "remote_library",
        payload: {
          version: 1,
          setlistId: "setlist-1",
          capabilities: { presentations: true, bible: true },
          presentations: [{ id: "deck-1", name: "Sunday Deck", slides: [{ id: "slide-1", label: "Slide 1", preview: "Welcome home" }] }],
          updatedAt: new Date().toISOString(),
        },
      });
    });

    const lineup = screen.getByText("Lineup");
    const presentationButton = screen.getByRole("button", { name: /Presentation/ });
    const bibleButton = screen.getByRole("button", { name: /Bible/ });
    expect(lineup.compareDocumentPosition(presentationButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(presentationButton.compareDocumentPosition(bibleButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(presentationButton);
    expect(await screen.findByText("Welcome home")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Slide 1.*Welcome home/ }));
    expect(channel.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: "remote_command",
        payload: expect.objectContaining({
          kind: "present-presentation-slide",
          payload: { presentationId: "deck-1", slideId: "slide-1" },
        }),
      }),
    ]));
  }, 10_000);

  it("loads a Bible chapter without changing output and presents only the tapped verse", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ verses: [{ book_name: "John", chapter: 3, verse: 16, text: "For God so loved the world." }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <RemoteClient
        desktopMode
        setlist={{ id: "setlist-1", name: "Sunday Service", songs: [] }}
      />,
    );
    await waitFor(() => expect(TestBroadcastChannel.instances).toHaveLength(1));
    const channel = TestBroadcastChannel.instances[0];
    act(() => channel.emit({ event: "remote_state", payload: { controllerReady: true, controller: "remote", activeSongIndex: 0, displays: [] } }));

    fireEvent.click(screen.getByRole("button", { name: /Bible/ }));
    fireEvent.change(screen.getByLabelText("Book"), { target: { value: "John" } });
    fireEvent.change(screen.getByLabelText("Chapter"), { target: { value: "3" } });
    expect(await screen.findByText("For God so loved the world.")).toBeInTheDocument();
    expect(channel.messages.some((message) => {
      if (!message || typeof message !== "object" || !("payload" in message)) return false;
      const payload = message.payload;
      return Boolean(payload && typeof payload === "object" && "kind" in payload && payload.kind === "present-bible-verse");
    })).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /John 3:16.*For God so loved the world/ }));
    expect(channel.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: "remote_command",
        payload: expect.objectContaining({
          kind: "present-bible-verse",
          payload: { reference: "John 3:16", translation: "kjv", text: "For God so loved the world." },
        }),
      }),
    ]));
  }, 10_000);

  it("presents lyric slides with focused shortcuts and sends custom bindings", async () => {
    render(
      <RemoteClient
        desktopMode
        setlist={{
          id: "setlist-1",
          name: "Sunday Service",
          songs: [{ id: "song-1", song: { title: "Washed", lyricsChords: "[Verse]\nWashed\n\n[Chorus]\nFree" } }],
        }}
      />,
    );
    await waitFor(() => {
      expect(TestBroadcastChannel.instances).toHaveLength(1);
      expect(window.localStorage.getItem("anointed-worship-remote-controller")).toBeTruthy();
    });
    const channel = TestBroadcastChannel.instances[0];
    const initialSlideId = "song-1:slide-sec0-0-reflow4";
    act(() => {
      channel.emit({ event: "remote_state", payload: { controllerReady: true, controller: "remote", activeSongIndex: 0, displays: [] } });
      channel.emit({
        event: "remote_library",
        payload: {
          version: 1,
          setlistId: "setlist-1",
          capabilities: { presentations: true, bible: true },
          presentations: [],
          lyricShortcuts: [{ setlistSongId: "song-1", bindings: [{ slideId: initialSlideId, keyCode: "Digit7" }] }],
          updatedAt: new Date().toISOString(),
        },
      });
    });

    await waitFor(() => expect(screen.getByText("7")).toBeInTheDocument());
    fireEvent.keyDown(window, { code: "Digit7", key: "7" });
    expect(channel.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: "remote_command",
        payload: expect.objectContaining({ kind: "select-slide", payload: { slideId: initialSlideId } }),
      }),
    ]));

    fireEvent.click(screen.getAllByRole("button", { name: /Change keyboard shortcut/ })[0]);
    fireEvent.keyDown(window, { code: "KeyQ", key: "q" });
    expect(channel.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: "remote_command",
        payload: expect.objectContaining({
          kind: "set-lyric-shortcut",
          payload: { setlistSongId: "song-1", slideId: initialSlideId, keyCode: "KeyQ" },
        }),
      }),
    ]));
  }, 10_000);
});

describe("cloud Worship Remote transport", () => {
  beforeEach(() => {
    window.localStorage.clear();
    supabaseMocks.createOptionalClient.mockReset();
  });

  it("authenticates Realtime before subscribing to the private Presenter channel", async () => {
    const callOrder: string[] = [];
    const channel = {
      on: vi.fn(() => channel),
      subscribe: vi.fn((onStatus?: (status: string) => void) => {
        callOrder.push("subscribe");
        onStatus?.("SUBSCRIBED");
        return channel;
      }),
      send: vi.fn(),
    };
    const client = {
      auth: {
        getSession: vi.fn(async () => {
          callOrder.push("get-session");
          return { data: { session: { access_token: "phone-token" } }, error: null };
        }),
      },
      realtime: {
        setAuth: vi.fn(async (token: string) => {
          callOrder.push(`set-auth:${token}`);
        }),
      },
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    };
    supabaseMocks.createOptionalClient.mockReturnValue(client);

    render(
      <RemoteClient
        setlist={{ id: "setlist-1", name: "Sunday Service", songs: [] }}
        cloudTopic="worship-remote-session:session-1"
        cloudPrivate
        cloudExpiresAt="2099-01-01T00:00:00.000Z"
      />,
    );

    await waitFor(() => expect(channel.subscribe).toHaveBeenCalledTimes(1));
    expect(callOrder).toEqual(["get-session", "set-auth:phone-token", "subscribe"]);
    expect(screen.getByText("Waiting for Presenter")).toBeInTheDocument();
  });
});
