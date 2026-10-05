import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessagesClient } from "./messages-client";

const mocks = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), read: vi.fn(), direct: vi.fn(), query: "" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }), useSearchParams: () => new URLSearchParams(mocks.query) }));
vi.mock("@/lib/supabase/client", () => ({ createOptionalClient: () => null }));
vi.mock("@/app/actions", () => ({
  addChannelMemberAction: vi.fn(), createChannelAction: vi.fn(), getOrCreateDirectChannelAction: mocks.direct,
  leaveChannelAction: vi.fn(), removeChannelMemberAction: vi.fn(), sendMessageAction: vi.fn(), markMessagesReadAction: mocks.read,
}));

const channels = [{ id: "channel-1", name: "Worship Team", membersOnline: 0, preview: "New message", messages: [{ id: "message-1", author: "Alex", body: "Hello team", createdAt: "Now", mine: false }] }];
const props = { channels, currentMemberId: "member-1", currentProfileId: "profile-1", teamId: "team-1", role: "member" };

describe("Messages chat selection", () => {
  beforeEach(() => {
    mocks.query = "";
    mocks.push.mockReset();
    mocks.replace.mockReset();
    mocks.read.mockReset();
    mocks.direct.mockReset();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("starts with a visible chat list and does not read a conversation", () => {
    render(<MessagesClient {...props} />);
    expect(screen.getByRole("heading", { name: "Messages" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Worship Team conversation" })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Message Worship Team...")).not.toBeInTheDocument();
    expect(mocks.read).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Worship Team/ }));
    expect(mocks.push).toHaveBeenCalledWith("/messages?channel=channel-1");
  });

  it("opens only an explicitly selected channel and lets users return to chats", () => {
    mocks.query = "channel=channel-1";
    render(<MessagesClient {...props} />);
    expect(screen.getByRole("region", { name: "Worship Team conversation" })).toBeInTheDocument();
    expect(screen.getByText("Hello team")).toBeInTheDocument();
    expect(mocks.read).toHaveBeenCalledWith("channel-1", ["message-1"]);
    fireEvent.click(screen.getByRole("button", { name: "Back to chats" }));
    expect(mocks.replace).toHaveBeenCalledWith("/messages");
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
