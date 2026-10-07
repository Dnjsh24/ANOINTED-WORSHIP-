import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessagesClient } from "./messages-client";
import type { MessageHistoryPage } from "@/lib/supabase/message-data";

const mocks = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), read: vi.fn(), direct: vi.fn(), send: vi.fn(), load: vi.fn(), search: vi.fn(), query: "" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }), useSearchParams: () => new URLSearchParams(mocks.query) }));
vi.mock("@/lib/supabase/client", () => ({ createOptionalClient: () => null }));
vi.mock("@/app/actions", () => ({
  addChannelMemberAction: vi.fn(), createChannelAction: vi.fn(), getOrCreateDirectChannelAction: mocks.direct,
  leaveChannelAction: vi.fn(), removeChannelMemberAction: vi.fn(), markMessagesReadAction: mocks.read,
}));
vi.mock("@/app/messages/message-actions", () => ({
  loadChannelMessagesAction: mocks.load,
  searchChannelMessagesAction: mocks.search,
  sendMessageOnceAction: mocks.send,
}));

const channels = [{ id: "channel-1", name: "Worship Team", membersOnline: 0, preview: "New message", messages: [{ id: "message-1", author: "Alex", body: "Hello team", createdAt: "Now", mine: false }] }];
const props = { channels, currentMemberId: "member-1", currentProfileId: "profile-1", teamId: "team-1", role: "member" };
const persistedChannelId = "00000000-0000-4000-8000-000000000001";
type HistoryResult = { ok: true; data: MessageHistoryPage };

describe("Messages chat selection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(window.history, "pushState");
    vi.spyOn(window.history, "replaceState");
    mocks.query = "";
    mocks.push.mockReset();
    mocks.replace.mockReset();
    mocks.read.mockReset();
    mocks.direct.mockReset();
    mocks.send.mockReset();
    mocks.load.mockReset().mockResolvedValue({ ok: true, data: { messages: [], hasMore: false, nextCursor: null } });
    mocks.search.mockReset().mockResolvedValue({ ok: true, data: { messages: [], hasMore: false, nextCursor: null } });
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => { vi.useRealTimers(); });

  it("keeps matching demo messages after the search debounce without a server request", async () => {
    vi.useFakeTimers();
    mocks.query = "channel=channel-1";
    render(<MessagesClient {...props} />);
    fireEvent.change(screen.getByPlaceholderText("Search messages..."), { target: { value: "Hello" } });
    expect(screen.getByText("Hello team", { exact: true })).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(screen.getByText("Hello team", { exact: true })).toBeInTheDocument();
    expect(mocks.search).not.toHaveBeenCalled();
    expect(screen.queryByText("Searching this conversation...")).not.toBeInTheDocument();
    expect(screen.queryByText("No matching messages.")).not.toBeInTheDocument();
  });

  it("clears a rejected initial load and retries when the conversation is reopened", async () => {
    const firstLoad = Promise.withResolvers<HistoryResult>();
    mocks.load.mockReturnValueOnce(firstLoad.promise).mockResolvedValueOnce({ ok: true, data: { messages: channels[0].messages, hasMore: false, nextCursor: null } });
    const unloadedProps = { ...props, channels: [{ ...channels[0], id: persistedChannelId, messages: [], messagesLoaded: false }] };
    mocks.query = `channel=${persistedChannelId}`;
    const view = render(<MessagesClient {...unloadedProps} />);
    expect(screen.getByText("Loading messages...")).toBeInTheDocument();
    await act(async () => { firstLoad.reject(new Error("Network response lost")); });
    expect(screen.queryByText("Loading messages...")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Messages could not be loaded");
    mocks.query = "";
    view.rerender(<MessagesClient {...unloadedProps} />);
    mocks.query = `channel=${persistedChannelId}`;
    view.rerender(<MessagesClient {...unloadedProps} />);
    expect(await screen.findByText("Hello team", { exact: true })).toBeInTheDocument();
    expect(mocks.load).toHaveBeenCalledTimes(2);
    expect(mocks.load).toHaveBeenLastCalledWith(persistedChannelId);
    expect(screen.queryByText("Loading messages...")).not.toBeInTheDocument();
  });

  it("clears a rejected older-page load and lets the same button retry", async () => {
    const olderLoad = Promise.withResolvers<HistoryResult>();
    const olderMessage = { ...channels[0].messages[0], id: "older", body: "Earlier rehearsal details" };
    mocks.load.mockReturnValueOnce(olderLoad.promise).mockResolvedValueOnce({ ok: true, data: { messages: [olderMessage], hasMore: false, nextCursor: null } });
    mocks.query = `channel=${persistedChannelId}`;
    render(<MessagesClient {...props} channels={[{ ...channels[0], id: persistedChannelId, messagesLoaded: true, hasMoreMessages: true, nextMessageCursor: "older-cursor" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Load older messages" }));
    expect(screen.getByRole("button", { name: "Loading older messages..." })).toBeDisabled();
    await act(async () => { olderLoad.reject(new Error("Network response lost")); });
    expect(screen.getByRole("status")).toHaveTextContent("Older messages could not be loaded");
    const retryButton = screen.getByRole("button", { name: "Load older messages" });
    expect(retryButton).toBeEnabled();
    fireEvent.click(retryButton);
    expect(await screen.findByText("Earlier rehearsal details", { exact: true })).toBeInTheDocument();
    expect(mocks.load).toHaveBeenNthCalledWith(1, persistedChannelId, "older-cursor");
    expect(mocks.load).toHaveBeenNthCalledWith(2, persistedChannelId, "older-cursor");
    expect(screen.getByText("Hello team", { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Loading older messages/ })).not.toBeInTheDocument();
  });

  it("preserves the reading position after prepending an older page without scrolling to the bottom", async () => {
    const olderLoad = Promise.withResolvers<HistoryResult>();
    mocks.load.mockReturnValueOnce(olderLoad.promise);
    mocks.query = `channel=${persistedChannelId}`;
    const view = render(<MessagesClient {...props} channels={[{ ...channels[0], id: persistedChannelId, messagesLoaded: true, hasMoreMessages: true, nextMessageCursor: "older-cursor" }]} />);
    const messageList = view.container.querySelector<HTMLDivElement>(".overflow-y-auto.overflow-x-hidden");
    if (!messageList) throw new Error("Conversation message list is missing");
    let scrollHeight = 1000;
    Object.defineProperty(messageList, "scrollHeight", { configurable: true, get: () => scrollHeight });
    messageList.scrollTop = 200;
    vi.mocked(Element.prototype.scrollIntoView).mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Load older messages" }));
    scrollHeight = 1400;
    await act(async () => {
      olderLoad.resolve({ ok: true, data: { messages: [{ ...channels[0].messages[0], id: "older", body: "Earlier rehearsal details" }, channels[0].messages[0]], hasMore: false, nextCursor: null } });
    });
    expect(messageList.scrollTop).toBe(600);
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(screen.getAllByText("Hello team", { exact: true })).toHaveLength(1);
    expect(screen.getByText("Earlier rehearsal details", { exact: true })).toBeInTheDocument();
  });

  it("clears server search results on send and shows the newly sent message", async () => {
    vi.useFakeTimers();
    mocks.query = `channel=${persistedChannelId}`;
    mocks.search.mockResolvedValue({ ok: true, data: { messages: channels[0].messages, hasMore: false, nextCursor: null } });
    mocks.send.mockResolvedValue({ ok: true, data: { messageId: "sent-after-search" } });
    render(<MessagesClient {...props} channels={[{ ...channels[0], id: persistedChannelId, messagesLoaded: true }]} />);
    fireEvent.change(screen.getByPlaceholderText("Search messages..."), { target: { value: "Hello" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(mocks.search).toHaveBeenCalledWith(persistedChannelId, "Hello");
    expect(screen.getByText("Hello team", { exact: true })).toBeInTheDocument();
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("Message Worship Team..."), { target: { value: "Fresh message after search" } });
      fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    });
    expect(screen.getByPlaceholderText("Search messages...")).toHaveValue("");
    expect(screen.getByText("Fresh message after search", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Hello team", { exact: true })).toBeInTheDocument();
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("starts with a visible chat list and does not read a conversation", () => {
    render(<MessagesClient {...props} />);
    expect(screen.getByRole("heading", { name: "Messages" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Worship Team conversation" })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Message Worship Team...")).not.toBeInTheDocument();
    expect(mocks.read).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Worship Team/ }));
    expect(window.history.pushState).toHaveBeenCalledWith(null, "", "/messages?channel=channel-1");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("opens only an explicitly selected channel and lets users return to chats", () => {
    mocks.query = "channel=channel-1";
    render(<MessagesClient {...props} />);
    expect(screen.getByRole("region", { name: "Worship Team conversation" })).toBeInTheDocument();
    expect(screen.getByText("Hello team")).toBeInTheDocument();
    expect(mocks.read).toHaveBeenCalledWith("channel-1", ["message-1"]);
    fireEvent.click(screen.getByRole("button", { name: "Back to chats" }));
    expect(window.history.replaceState).toHaveBeenCalledWith(null, "", "/messages");
  });

  it("does not fall back to another conversation after removal or an invalid URL", () => {
    mocks.query = "channel=missing";
    const view = render(<MessagesClient {...props} />);
    expect(screen.getByRole("status")).toHaveTextContent("This conversation is unavailable");
    expect(mocks.read).not.toHaveBeenCalled();
    mocks.query = "";
    view.rerender(<MessagesClient {...props} channels={[...channels]} />);
    expect(screen.queryByPlaceholderText("Message Worship Team...")).not.toBeInTheDocument();
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("clears the draft when browser navigation switches conversations", () => {
    mocks.query = "channel=channel-1";
    const view = render(<MessagesClient {...props} />);
    fireEvent.change(screen.getByPlaceholderText("Message Worship Team..."), { target: { value: "Private draft" } });
    mocks.query = "";
    view.rerender(<MessagesClient {...props} />);
    mocks.query = "channel=channel-1";
    view.rerender(<MessagesClient {...props} />);
    expect(screen.getByPlaceholderText("Message Worship Team...")).toHaveValue("");
  });

  it("shows a direct-chat failure in the inbox", async () => {
    mocks.direct.mockResolvedValue({ ok: false, message: "Conversation could not be opened." });
    render(<MessagesClient {...props} teamMembers={[{ memberId: "other", profileId: "other-profile", fullName: "Jamie", email: "", role: "member" }]} />);
    fireEvent.change(screen.getByPlaceholderText("Search messages..."), { target: { value: "Jamie" } });
    fireEvent.click(screen.getByRole("button", { name: /Jamie/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("Conversation could not be opened.");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("retains sent messages across chat switches but clears them when identity changes", async () => {
    mocks.query = "channel=channel-1";
    mocks.send.mockResolvedValue({ ok: true, data: { messageId: "sent-1" } });
    const view = render(<MessagesClient {...props} />);
    fireEvent.change(screen.getByPlaceholderText("Message Worship Team..."), { target: { value: "New private message" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText("New private message");
    mocks.query = "";
    view.rerender(<MessagesClient {...props} />);
    mocks.query = "channel=channel-1";
    view.rerender(<MessagesClient {...props} />);
    expect(screen.getByText("New private message")).toBeInTheDocument();
    view.rerender(<MessagesClient {...props} currentProfileId="another-profile" />);
    expect(screen.queryByText("New private message")).not.toBeInTheDocument();
  });

  it("requests server data for a direct chat that is not yet loaded", async () => {
    mocks.direct.mockResolvedValue({ ok: true, data: { channelId: "new-direct" } });
    render(<MessagesClient {...props} teamMembers={[{ memberId: "other", profileId: "other-profile", fullName: "Jamie", email: "", role: "member" }]} />);
    fireEvent.change(screen.getByPlaceholderText("Search messages..."), { target: { value: "Jamie" } });
    fireEvent.click(screen.getByRole("button", { name: /Jamie/ }));
    await vi.waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/messages?channel=new-direct"));
    expect(window.history.pushState).not.toHaveBeenCalled();
  });

  it("revokes an attachment preview when navigation closes its conversation", () => {
    const revoke = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:test-preview" });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });
    mocks.query = "channel=channel-1";
    const view = render(<MessagesClient {...props} />);
    const fileInput = view.container.querySelectorAll('input[type="file"]')[1];
    fireEvent.change(fileInput, { target: { files: [new File(["image"], "photo.png", { type: "image/png" })] } });
    mocks.query = "";
    view.rerender(<MessagesClient {...props} />);
    expect(revoke).toHaveBeenCalledWith("blob:test-preview");
  });
});
