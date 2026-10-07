import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessagesClient } from "./messages-client";
import type { MessageHistoryPage } from "@/lib/supabase/message-data";

const mocks = vi.hoisted(() => ({ query: "", client: vi.fn(), load: vi.fn(), router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router, useSearchParams: () => new URLSearchParams(mocks.query) }));
vi.mock("@/lib/supabase/client", () => ({ createOptionalClient: mocks.client }));
vi.mock("@/app/actions", () => ({ addChannelMemberAction: vi.fn(), createChannelAction: vi.fn(), getOrCreateDirectChannelAction: vi.fn(), leaveChannelAction: vi.fn(), removeChannelMemberAction: vi.fn(), markMessagesReadAction: vi.fn() }));
vi.mock("@/app/messages/message-actions", () => ({
  loadChannelMessagesAction: mocks.load,
  searchChannelMessagesAction: vi.fn().mockResolvedValue({ ok: true, data: { messages: [], hasMore: false, nextCursor: null } }),
  sendMessageOnceAction: vi.fn(),
}));

type InsertHandler = (payload: { new: Record<string, unknown> }) => void | Promise<void>;
class FakeChannel {
  state = "joined";
  insert?: InsertHandler;
  constructor(readonly name: string) {}
  on(event: string, _filter: unknown, callback: InsertHandler) { if (event === "postgres_changes") this.insert = callback; return this; }
  subscribe() { return this; }
  presenceState() { return {}; }
  track() { return Promise.resolve(); }
  unsubscribe() { return Promise.resolve(); }
}
const channels = [{ id: "a", name: "Team", preview: "", membersOnline: 0, messages: [], messagesLoaded: true }];
const props = { channels, currentMemberId: "member", currentProfileId: "profile", teamId: "team", role: "member" };
const insert = (id: string, body: string, attachment: string | null = null) => ({ new: { id, body, channel_id: "a", sender_member_id: "other", attachment_file_id: attachment, created_at: "2026-10-06T00:00:00Z" } });

describe("stable message subscription", () => {
  beforeEach(() => {
    mocks.query = "";
    mocks.router.refresh.mockReset();
    mocks.client.mockReset();
    mocks.load.mockReset().mockResolvedValue({ ok: true, data: { messages: [], hasMore: false, nextCursor: null } });
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => vi.useRealTimers());
  it("merges realtime inserts received during the first page load without losing or duplicating messages", async () => {
    const firstLoad = Promise.withResolvers<{ ok: true; data: MessageHistoryPage }>();
    mocks.load.mockReturnValueOnce(firstLoad.promise);
    const global = new FakeChannel("messages-realtime");
    mocks.client.mockReturnValue({ channel: (name: string) => name === "messages-realtime" ? global : new FakeChannel(name), removeChannel: vi.fn() });
    mocks.query = "channel=a";
    render(<MessagesClient {...props} channels={[{ ...channels[0], messagesLoaded: false }]} />);
    expect(screen.getByText("Loading messages...")).toBeInTheDocument();
    expect(mocks.load).toHaveBeenCalledTimes(1);
    await act(async () => {
      await global.insert?.(insert("shared-live", "Received during page load"));
      await global.insert?.(insert("live-only", "Received after history snapshot"));
      await global.insert?.(insert("live-only", "Received after history snapshot"));
    });
    await act(async () => {
      firstLoad.resolve({ ok: true, data: { messages: [
        { id: "history", author: "Alex", body: "Existing history", createdAt: "Now", mine: false },
        { id: "shared-live", author: "Alex", body: "Received during page load", createdAt: "Now", mine: false },
      ], hasMore: false, nextCursor: null } });
    });
    expect(screen.getAllByText("Existing history", { exact: true })).toHaveLength(1);
    expect(screen.getAllByText("Received during page load", { exact: true })).toHaveLength(1);
    expect(screen.getAllByText("Received after history snapshot", { exact: true })).toHaveLength(1);
    expect(screen.queryByText("Loading messages...")).not.toBeInTheDocument();
    expect(mocks.load).toHaveBeenCalledTimes(1);
  });
  it("keeps insert subscription across chat navigation, deduplicates, and cleans up across identities", async () => {
    const subscriptions: FakeChannel[] = [];
    const remove = vi.fn();
    mocks.client.mockReturnValue({ channel: (name: string) => { const channel = new FakeChannel(name); subscriptions.push(channel); return channel; }, removeChannel: remove });
    const view = render(<MessagesClient {...props} />);
    const global = subscriptions.find(channel => channel.name === "messages-realtime")!;
    mocks.query = "channel=a";
    view.rerender(<MessagesClient {...props} />);
    mocks.query = "";
    view.rerender(<MessagesClient {...props} />);
    expect(remove).not.toHaveBeenCalledWith(global);
    await act(async () => { await global.insert?.(insert("live", "Received while in inbox")); await global.insert?.(insert("live", "Received while in inbox")); });
    mocks.query = "channel=a";
    view.rerender(<MessagesClient {...props} />);
    expect(screen.getAllByText("Received while in inbox", { exact: true })).toHaveLength(1);
    expect(subscriptions.filter(channel => channel.name === "messages-realtime")).toHaveLength(1);
    view.rerender(<MessagesClient {...props} currentProfileId="another-profile" />);
    expect(remove).toHaveBeenCalledWith(global);
    expect(screen.queryByText("Received while in inbox", { exact: true })).not.toBeInTheDocument();
    await act(async () => { await global.insert?.(insert("late", "Old identity event")); });
    expect(screen.queryByText("Old identity event", { exact: true })).not.toBeInTheDocument();
    expect(subscriptions.filter(channel => channel.name === "messages-realtime")).toHaveLength(2);
    view.unmount();
    expect(remove).toHaveBeenCalledWith(subscriptions.filter(channel => channel.name === "messages-realtime")[1]);
  });
  it("coalesces refreshes for bursts of messages from unloaded channels", async () => {
    vi.useFakeTimers();
    const global = new FakeChannel("messages-realtime");
    mocks.client.mockReturnValue({ channel: (name: string) => name === "messages-realtime" ? global : new FakeChannel(name), removeChannel: vi.fn() });
    const view = render(<MessagesClient {...props} />);
    const firstUnloadedMessage = insert("unloaded-1", "First update");
    const secondUnloadedMessage = insert("unloaded-2", "Second update");
    firstUnloadedMessage.new.channel_id = "unloaded-channel";
    secondUnloadedMessage.new.channel_id = "unloaded-channel";

    await act(async () => {
      await global.insert?.(firstUnloadedMessage);
      await global.insert?.(secondUnloadedMessage);
    });
    expect(mocks.router.refresh).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(200); });

    expect(mocks.router.refresh).toHaveBeenCalledTimes(1);
    view.unmount();
    vi.useRealTimers();
  });
  it("keeps the current presence channel when refreshed props still include the conversation", () => {
    const subscriptions: FakeChannel[] = [];
    mocks.client.mockReturnValue({ channel: (name: string) => { const channel = new FakeChannel(name); subscriptions.push(channel); return channel; }, removeChannel: vi.fn() });
    mocks.query = "channel=a";
    const view = render(<MessagesClient {...props} />);

    expect(subscriptions.filter(channel => channel.name === "online-presence-a")).toHaveLength(1);

    view.rerender(<MessagesClient {...props} channels={channels.map((channel) => ({ ...channel }))} />);

    expect(subscriptions.filter(channel => channel.name === "online-presence-a")).toHaveLength(1);
  });
  it("keeps a received message when its attachment lookup fails", async () => {
    const global = new FakeChannel("messages-realtime");
    const query = { select: () => query, eq: () => query, maybeSingle: async () => { throw new Error("offline"); } };
    mocks.client.mockReturnValue({ channel: (name: string) => name === "messages-realtime" ? global : new FakeChannel(name), removeChannel: vi.fn(), from: () => query });
    const view = render(<MessagesClient {...props} />);
    await act(async () => { await global.insert?.(insert("attachment", "Still received", "file")); });
    expect(screen.getByRole("status")).toHaveTextContent("attachment could not load");
    mocks.query = "channel=a";
    view.rerender(<MessagesClient {...props} />);
    expect(screen.getByText("Still received", { exact: true })).toBeInTheDocument();
  });
});
