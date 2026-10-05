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

const message = (id: string, attachment: string | null) => ({
  id, channel_id: "channel-a", sender_member_id: "member-a", body: id,
  created_at: "2026-10-05T12:00:00Z", attachment_file_id: attachment,
});
const files = [
  { id: "file-a", storage_path: "team-a/shared.pdf", file_name: "Shared.pdf", mime_type: "application/pdf", size_bytes: 1024 },
  { id: "file-b", storage_path: "team-a/shared.pdf", file_name: "Copy.pdf", mime_type: "application/pdf", size_bytes: 1024 },
  { id: "file-c", storage_path: "team-a/denied.pdf", file_name: "Denied.pdf", mime_type: "application/pdf", size_bytes: 1024 },
];
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });

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
      case "team_members": return json([{ id: "member-a", profile_id: "profile-a", role: "member", profiles: { full_name: "Anna" } }]);
      case "message_channels": return json([
        { id: "channel-a", name: "Team", channel_type: "team", message_channel_members: [{ channel_id: "channel-a", team_member_id: "member-a" }] },
        { id: "other-channel", name: "Private", channel_type: "team", message_channel_members: [] },
      ]);
      case "messages": return json([message("one", "file-a"), message("two", "file-b"), message("three", "file-c"), message("four", "file-hidden")]);
      case "message_reads": return readResponse ?? json([{ message_id: "one", profile_id: "reader", profiles: { full_name: "Ben" } }]);
      case "practice_files": return json(files);
      default: throw new Error(`Unexpected mocked request: ${url.pathname}`);
    }
  });
  const client = createClient<Database>("https://supabase.example.test", "test-publishable-key", { global: { fetch }, auth: { persistSession: false } });
  serverClient.mockResolvedValue(client);
  return fetch;
}

describe("message server loading", () => {
  beforeEach(() => { serverClient.mockReset(); });

  it("loads file metadata while receipts are pending and signs only loaded paths once", async () => {
    const reads = Promise.withResolvers<Response>();
    const fetch = clientFor({ readResponse: reads.promise });
    const pendingPage = MessagesPage();
    await vi.waitFor(() => expect(fetch.mock.calls.some(([input]) => String(input).includes("practice_files"))).toBe(true));
    expect(fetch.mock.calls.some(([input]) => String(input).includes("message_reads"))).toBe(true);
    reads.resolve(json([{ message_id: "one", profile_id: "reader", profiles: { full_name: "Ben" } }]));
    const channels = channelsFromPage(await pendingPage);
    expect(channels).toHaveLength(1);
    expect(channels[0].messages).toHaveLength(4);
    expect(channels[0].messages[0].reads?.[0].fullName).toBe("Ben");
    expect(channels[0].messages[0].attachment?.url).toContain("token=scoped");
    expect(channels[0].messages[1].attachment?.url).toBe(channels[0].messages[0].attachment?.url);
    expect(channels[0].messages[2].attachment).toMatchObject({ name: "Denied.pdf", url: "" });
    expect(channels[0].messages[3].attachment).toBeUndefined();
    const storageCalls = fetch.mock.calls.filter(([input]) => String(input).includes("/storage/"));
    expect(storageCalls).toHaveLength(1);
    const [, request] = storageCalls[0];
    expect(JSON.parse(String(request?.body))).toEqual({ expiresIn: 3600, paths: ["team-a/shared.pdf", "team-a/denied.pdf"] });
    const messagesUrl = new URL(String(fetch.mock.calls.find(([input]) => String(input).includes("/messages?"))?.[0]));
    expect(messagesUrl.searchParams.get("channel_id")).toBe("in.(channel-a)");
    expect(messagesUrl.searchParams.has("limit")).toBe(false);
  });

  it("keeps full message history and file metadata when storage rejects the batch", async () => {
    clientFor({ signedResponse: async () => { throw new Error("storage offline"); } });
    const channels = channelsFromPage(await MessagesPage());
    expect(channels[0].messages).toHaveLength(4);
    expect(channels[0].messages[0].attachment).toMatchObject({ name: "Shared.pdf", url: "" });
    expect(channels[0].messages[2].attachment).toMatchObject({ name: "Denied.pdf", url: "" });
  });
});
