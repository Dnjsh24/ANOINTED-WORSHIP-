import { createClient } from "@supabase/supabase-js";
import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MessagesPage from "@/app/messages/page";
import type { MessagesChannel } from "@/components/messages-client";
import type { Database } from "@/lib/supabase/database.types";

const serverClient = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({ createClient: serverClient }));
vi.mock("@/lib/supabase/env", () => ({ hasSupabaseEnv: () => true }));
vi.mock("@/lib/supabase/team-guard", () => ({ getRequiredTeamContext: async () => ({
  teamId: "team-a", userId: "profile-a", memberId: "member-a", role: "member",
}) }));
vi.mock("@/components/app-shell", () => ({ AppShell: () => null }));
vi.mock("@/components/messages-client", () => ({ MessagesClient: () => null }));

const channelId = "11111111-1111-4111-8111-111111111111";
const message = (id: string, attachment: string | null) => ({
  id, channel_id: channelId, sender_member_id: "member-a", body: id,
  created_at: "2026-10-05T12:00:00Z", attachment_file_id: attachment, parent_message_id: null,
});
const files = [
  { id: "file-a", storage_path: "team-a/shared.pdf", file_name: "Shared.pdf", mime_type: "application/pdf", size_bytes: 1024 },
  { id: "file-b", storage_path: "team-a/shared.pdf", file_name: "Copy.pdf", mime_type: "application/pdf", size_bytes: 1024 },
  { id: "file-c", storage_path: "team-a/denied.pdf", file_name: "Denied.pdf", mime_type: "application/pdf", size_bytes: 1024 },
];
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", "Content-Range": "0-0/1" } });

function channelsFromPage(page: Awaited<ReturnType<typeof MessagesPage>>) {
  const child: unknown = page.props.children;
  if (!isValidElement<{ channels: MessagesChannel[] }>(child)) throw new Error("Expected MessagesClient element");
  return child.props.channels;
}

function clientFor({ readResponse, signedResponse }: { readResponse?: Promise<Response>; signedResponse?: () => Response | Promise<Response> } = {}) {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.includes("/storage/")) {
      expect(init?.method).toBe("POST");
      return signedResponse ? signedResponse() : json([
        { path: "team-a/denied.pdf", signedURL: null, error: "Unauthorized" },
        { path: "team-a/shared.pdf", signedURL: "/object/sign/practice-files/team-a/shared.pdf?token=scoped", error: null },
      ]);
    }
    switch (url.pathname.split("/").at(-1)) {
      case "team_members":
        return json([{ id: "member-a", profile_id: "profile-a", role: "member", profiles: { id: "profile-a", full_name: "Anna", email: "anna@example.test", avatar_url: null } }]);
      case "message_channel_members":
        return json([{ channel_id: channelId }]);
      case "message_channels":
        return json([{ id: channelId, name: "Team", channel_type: "team", avatar_url: null, updated_at: "2026-10-05T12:00:00Z", message_channel_members: [{ channel_id: channelId, team_member_id: "member-a" }] }]);
      case "get_message_previews":
        return json([{ channel_id: channelId, message: { id: "preview", sender_member_id: "member-a", body: "Latest", created_at: "2026-10-05T12:00:00Z" } }]);
      case "messages":
        return json([message("one", "file-a"), message("two", "file-b"), message("three", "file-c"), message("four", "file-hidden")]);
      case "message_reads":
        return readResponse ?? json([{ message_id: "one", profile_id: "reader", profiles: { full_name: "Ben", avatar_url: null } }]);
      case "practice_files":
        return json(files);
      default:
        throw new Error("Unexpected mocked request: " + url.pathname);
    }
  });
  const client = createClient<Database>("https://supabase.example.test", "test-publishable-key", { global: { fetch }, auth: { persistSession: false } });
  serverClient.mockResolvedValue(client);
  return fetch;
}

describe("bounded message server loading", () => {
  beforeEach(() => { serverClient.mockReset(); });

  it("loads only channel previews for the inbox", async () => {
    const fetch = clientFor();
    const channels = channelsFromPage(await MessagesPage({ searchParams: Promise.resolve({}) }));
    expect(channels).toHaveLength(1);
    expect(channels[0]).toMatchObject({ preview: "Anna: Latest", messages: [], messagesLoaded: false });
    expect(fetch.mock.calls.some(([input]) => new URL(String(input)).pathname.endsWith("/messages"))).toBe(false);
    expect(fetch.mock.calls.some(([input]) => String(input).includes("message_reads"))).toBe(false);
    expect(fetch.mock.calls.some(([input]) => String(input).includes("practice_files"))).toBe(false);
  });

  it("loads receipts and attachment metadata only for the selected 50-message window", async () => {
    const reads = Promise.withResolvers<Response>();
    const fetch = clientFor({ readResponse: reads.promise });
    const pendingPage = MessagesPage({ searchParams: Promise.resolve({ channel: channelId }) });
    await vi.waitFor(() => expect(fetch.mock.calls.some(([input]) => String(input).includes("practice_files"))).toBe(true));
    expect(fetch.mock.calls.some(([input]) => String(input).includes("message_reads"))).toBe(true);
    reads.resolve(json([{ message_id: "one", profile_id: "reader", profiles: { full_name: "Ben", avatar_url: null } }]));
    const channels = channelsFromPage(await pendingPage);
    expect(channels[0].messages).toHaveLength(4);
    expect(channels[0].messagesLoaded).toBe(true);
    const messageWithReceipt = channels[0].messages.find((item) => item.id === "one");
    const messageWithSharedFile = channels[0].messages.find((item) => item.id === "two");
    const messageWithDeniedFile = channels[0].messages.find((item) => item.id === "three");
    const messageWithoutFile = channels[0].messages.find((item) => item.id === "four");
    expect(messageWithReceipt?.reads?.[0].fullName).toBe("Ben");
    expect(messageWithReceipt?.attachment?.url).toContain("token=scoped");
    expect(messageWithSharedFile?.attachment?.url).toBe(messageWithReceipt?.attachment?.url);
    expect(messageWithDeniedFile?.attachment).toMatchObject({ name: "Denied.pdf", url: "" });
    expect(messageWithoutFile?.attachment).toBeUndefined();

    const storageCalls = fetch.mock.calls.filter(([input]) => String(input).includes("/storage/"));
    expect(storageCalls).toHaveLength(1);
    const [, request] = storageCalls[0];
    expect(JSON.parse(String(request?.body))).toEqual({ expiresIn: 3600, paths: ["team-a/shared.pdf", "team-a/denied.pdf"] });
    const messageRequest = fetch.mock.calls.find(([input]) => new URL(String(input)).pathname.endsWith("/messages"));
    const messagesUrl = new URL(String(messageRequest?.[0]));
    expect(messagesUrl.searchParams.get("channel_id")).toBe("eq." + channelId);
    expect(messagesUrl.searchParams.get("limit")).toBe("51");
  });

  it("keeps attachment metadata available when storage signing fails", async () => {
    clientFor({ signedResponse: async () => { throw new Error("storage offline"); } });
    const channels = channelsFromPage(await MessagesPage({ searchParams: Promise.resolve({ channel: channelId }) }));
    expect(channels[0].messages).toHaveLength(4);
    expect(channels[0].messages.find((item) => item.id === "one")?.attachment).toMatchObject({ name: "Shared.pdf", url: "" });
    expect(channels[0].messages.find((item) => item.id === "three")?.attachment).toMatchObject({ name: "Denied.pdf", url: "" });
  });
});
