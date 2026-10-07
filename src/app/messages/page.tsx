import { AppShell } from "@/components/app-shell";
import {
  MessagesClient,
  type MessagesChannel,
  type MessagesChannelMembership,
  type MessagesTeamMember,
} from "@/components/messages-client";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { messages as sampleMessages } from "@/lib/sample-data";
import type { Database } from "@/lib/supabase/database.types";
import { loadMessageHistoryPage, MESSAGE_PAGE_SIZE, type MessageAuthor } from "@/lib/supabase/message-data";
import { getListingPage, getListingPageCount, parsePageNumber } from "@/lib/domain/listing-pagination";
import { z } from "zod";

type MessageMemberRow = Pick<
  Database["public"]["Tables"]["team_members"]["Row"],
  "id" | "profile_id" | "role"
> & {
  profiles: Pick<
    Database["public"]["Tables"]["profiles"]["Row"],
    "id" | "full_name" | "email" | "avatar_url"
  > | null;
};
type MessageChannelMembershipRow = Pick<
  Database["public"]["Tables"]["message_channel_members"]["Row"],
  "channel_id" | "team_member_id"
>;
type MessageChannelRow = Pick<
  Database["public"]["Tables"]["message_channels"]["Row"],
  "id" | "name" | "channel_type" | "avatar_url" | "updated_at"
> & { message_channel_members: MessageChannelMembershipRow[] };
type PreviewRpcRow = {
  channel_id: string;
  message: Pick<Database["public"]["Tables"]["messages"]["Row"], "id" | "body" | "created_at" | "sender_member_id"> | null;
};
type SearchParams = Promise<{ channel?: string; channelPage?: string }>;

export const dynamic = "force-dynamic";
const channelIdSchema = z.string().uuid();
const previewRpcClient = (client: Awaited<ReturnType<typeof createClient>>) => client as unknown as {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

function getChannelName(channel: MessageChannelRow, currentMemberId: string, members: Map<string, MessagesTeamMember>) {
  if (channel.channel_type !== "direct") return channel.name;
  const otherMember = channel.message_channel_members.find((membership) => membership.team_member_id !== currentMemberId);
  return otherMember ? members.get(otherMember.team_member_id)?.fullName ?? channel.name : channel.name;
}

export default async function MessagesPage({ searchParams = Promise.resolve({}) }: { searchParams?: SearchParams }) {
  const teamContext = await getRequiredTeamContext();
  const params = await searchParams;
  const requestedChannelId = channelIdSchema.safeParse(params.channel).success ? params.channel! : "";
  const requestedPage = Math.min(parsePageNumber(params.channelPage), 1000);
  const channelPage = getListingPage(requestedPage, MESSAGE_PAGE_SIZE);
  let channelsList: MessagesChannel[] = [];
  let teamMembersList: MessagesTeamMember[] = [];
  let allChannelMemberships: MessagesChannelMembership[] = [];
  let myMemberId = "";
  let totalChannelCount = 0;
  let historyError = "";

  if (hasSupabaseEnv() && teamContext.teamId && teamContext.memberId) {
    const supabase = await createClient();
    myMemberId = teamContext.memberId;
    const [membersResult, initialMembershipPage] = await Promise.all([
      supabase
        .from("team_members")
        .select("id, profile_id, role, profiles(id, full_name, email, avatar_url)")
        .eq("team_id", teamContext.teamId),
      supabase
        .from("message_channel_members")
        .select("channel_id", { count: "exact" })
        .eq("team_member_id", myMemberId)
        .order("created_at", { ascending: false }).order("channel_id", { ascending: true })
        .range(channelPage.from, channelPage.to),
    ]);

    let channelMembershipPage = initialMembershipPage;
    const lastPage = getListingPageCount(channelMembershipPage.count ?? 0, MESSAGE_PAGE_SIZE);
    if (!channelMembershipPage.error && requestedPage > lastPage) {
      const range = getListingPage(lastPage, MESSAGE_PAGE_SIZE);
      channelMembershipPage = await supabase.from("message_channel_members").select("channel_id", { count: "exact" })
        .eq("team_member_id", myMemberId).order("created_at", { ascending: false }).order("channel_id", { ascending: true }).range(range.from, range.to);
    }
    if (channelMembershipPage.error) historyError = "Chats could not be loaded. Reload to try again.";
    const memberMap = new Map<string, MessagesTeamMember>();
    for (const member of (membersResult.data ?? []) as unknown as MessageMemberRow[]) {
      memberMap.set(member.id, {
        memberId: member.id,
        profileId: member.profile_id,
        fullName: member.profiles?.full_name || "Unknown Member",
        email: member.profiles?.email || "",
        role: member.role,
        avatarUrl: member.profiles?.avatar_url || null,
      });
    }
    teamMembersList = [...memberMap.values()];

    const visibleChannelIds = (channelMembershipPage.data ?? []).map((membership) => membership.channel_id);
    totalChannelCount = channelMembershipPage.count ?? visibleChannelIds.length;
    let visibleDbChannels: MessageChannelRow[] = [];
    if (visibleChannelIds.length) {
      const { data, error } = await supabase
        .from("message_channels")
        .select("id, name, channel_type, avatar_url, updated_at, message_channel_members(channel_id, team_member_id)")
        .eq("team_id", teamContext.teamId)
        .in("id", visibleChannelIds);
      if (error) historyError = "Chats could not be loaded. Reload to try again.";
      visibleDbChannels = (data ?? []) as unknown as MessageChannelRow[];
    }

    const selectedIsOnPage = visibleDbChannels.some((channel) => channel.id === requestedChannelId);
    if (requestedChannelId && !selectedIsOnPage) {
      const [membershipResult, channelResult] = await Promise.all([
        supabase.from("message_channel_members").select("channel_id").eq("channel_id", requestedChannelId).eq("team_member_id", myMemberId).maybeSingle(),
        supabase
          .from("message_channels")
          .select("id, name, channel_type, avatar_url, updated_at, message_channel_members(channel_id, team_member_id)")
          .eq("team_id", teamContext.teamId)
          .eq("id", requestedChannelId)
          .maybeSingle(),
      ]);
      if (membershipResult.data && channelResult.data) visibleDbChannels = [channelResult.data as unknown as MessageChannelRow, ...visibleDbChannels];
    }

    allChannelMemberships = visibleDbChannels.flatMap((channel) => channel.message_channel_members ?? []).map((membership) => ({
      channelId: membership.channel_id,
      memberId: membership.team_member_id,
    }));

    const loadedChannelIds = [...new Set(visibleDbChannels.map((channel) => channel.id))].slice(0, 50);
    const previewByChannelId = new Map<string, PreviewRpcRow["message"]>();
    if (loadedChannelIds.length) {
      const { data, error } = await previewRpcClient(supabase).rpc("get_message_previews", { p_channel_ids: loadedChannelIds });
      if (error) historyError = "Chat previews could not be loaded. Try refreshing the page.";
      for (const preview of (Array.isArray(data) ? data : []) as PreviewRpcRow[]) previewByChannelId.set(preview.channel_id, preview.message);
    }

    channelsList = visibleDbChannels.map((channel) => {
      const preview = previewByChannelId.get(channel.id);
      const author = preview ? memberMap.get(preview.sender_member_id)?.fullName ?? "Unknown Member" : "";
      return {
        id: channel.id,
        name: getChannelName(channel, myMemberId, memberMap),
        type: channel.channel_type,
        membersOnline: channel.message_channel_members.length,
        preview: preview ? author + ": " + (preview.body || "Shared an attachment") : "No messages yet",
        messages: [],
        messagesLoaded: false,
        avatarUrl: channel.avatar_url,
      };
    });

    if ((teamContext.role === "owner" || teamContext.role === "admin") && channelsList.length < 100) {
      const { data: adminChannels } = await supabase
        .from("message_channels")
        .select("id, name, channel_type, avatar_url, updated_at, message_channel_members(channel_id, team_member_id)")
        .eq("team_id", teamContext.teamId)
        .neq("channel_type", "direct")
        .order("updated_at", { ascending: false })
        .range(0, 49);
      const knownIds = new Set(channelsList.map((channel) => channel.id));
      for (const channel of (adminChannels ?? []) as unknown as MessageChannelRow[]) {
        if (knownIds.has(channel.id) || channel.message_channel_members.some((membership) => membership.team_member_id === myMemberId)) continue;
        channelsList.push({
          id: channel.id,
          name: channel.name,
          type: channel.channel_type,
          membersOnline: 0,
          preview: "Channel settings",
          messages: [],
          messagesLoaded: true,
          adminOnly: true,
          avatarUrl: channel.avatar_url,
        });
      }
    }

    const targetChannel = channelsList.find((channel) => channel.id === requestedChannelId);
    if (requestedChannelId && targetChannel && !targetChannel.adminOnly) {
      const authorRows: MessageAuthor[] = teamMembersList.map((member) => ({
        memberId: member.memberId,
        fullName: member.fullName,
        avatarUrl: member.avatarUrl ?? null,
      }));
      try {
        const page = await loadMessageHistoryPage(supabase, requestedChannelId, myMemberId, authorRows);
        targetChannel.messages = page.messages;
        targetChannel.messagesLoaded = true;
        targetChannel.hasMoreMessages = page.hasMore;
        targetChannel.nextMessageCursor = page.nextCursor;
      } catch {
        historyError = "Messages could not be loaded. Try again.";
      }
    }
  }

  if (!hasSupabaseEnv() && channelsList.length === 0) {
    channelsList = [{
      id: "11111111-1111-4111-8111-111111111111",
      name: "Worship Team",
      type: "team",
      membersOnline: 8,
      preview: "Casey: The new bridge arrangement...",
      messages: sampleMessages,
      messagesLoaded: true,
    }];
    totalChannelCount = channelsList.length;
  }

  const pageCount = getListingPageCount(totalChannelCount, MESSAGE_PAGE_SIZE);
  const actualPage = Math.min(requestedPage, pageCount);
  return (
    <AppShell active="Messages" teamContext={teamContext}>
      <MessagesClient
        channels={channelsList}
        teamMembers={teamMembersList}
        currentMemberId={myMemberId}
        currentProfileId={teamContext.userId ?? ""}
        teamId={teamContext.teamId ?? ""}
        role={teamContext.role || "member"}
        allChannelMemberships={allChannelMemberships}
        channelPage={actualPage}
        channelPageCount={pageCount}
        previousChannelsHref={actualPage > 1 ? "/messages?channelPage=" + (actualPage - 1) : null}
        nextChannelsHref={actualPage < pageCount ? "/messages?channelPage=" + (actualPage + 1) : null}
        initialLoadError={historyError}
      />
    </AppShell>
  );
}
