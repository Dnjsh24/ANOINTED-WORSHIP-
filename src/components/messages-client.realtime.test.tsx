import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessagesClient } from "./messages-client";

const mocks = vi.hoisted(() => ({ query: "", client: vi.fn(), router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router, useSearchParams: () => new URLSearchParams(mocks.query) }));
vi.mock("@/lib/supabase/client", () => ({ createOptionalClient: mocks.client }));
vi.mock("@/app/actions", () => ({ addChannelMemberAction: vi.fn(), createChannelAction: vi.fn(), getOrCreateDirectChannelAction: vi.fn(), leaveChannelAction: vi.fn(), removeChannelMemberAction: vi.fn(), sendMessageAction: vi.fn(), markMessagesReadAction: vi.fn() }));

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
const channels = [{ id: "a", name: "Team", preview: "", membersOnline: 0, messages: [] }];
const props = { channels, currentMemberId: "member", currentProfileId: "profile", teamId: "team", role: "member" };
const insert = (id: string, body: string, attachment: string | null = null) => ({ new: { id, body, channel_id: "a", sender_member_id: "other", attachment_file_id: attachment, created_at: "2026-10-06T00:00:00Z" } });

describe("stable message subscription", () => {
  beforeEach(() => { mocks.query = ""; mocks.client.mockReset(); Element.prototype.scrollIntoView = vi.fn(); });
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
