import { AppShell } from "@/components/app-shell";
import { MessagesClient } from "@/components/messages-client";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { messages as sampleMessages } from "@/lib/sample-data";
import { fileKindLabel, formatFileSize } from "@/lib/domain/files";

export default async function MessagesPage() {
  const teamContext = await getRequiredTeamContext();

  let channelsList: any[] = [];
  let teamMembersList: any[] = [];
  let allChannelMemberships: { channelId: string; memberId: string }[] = [];
  let myMemberId = "";

  if (hasSupabaseEnv() && teamContext.teamId && teamContext.userId) {
    const supabase = await createClient();

    if (teamContext.memberId) {
      myMemberId = teamContext.memberId;

      // 1. Fetch team members (with profiles) and channels (with memberships) in parallel.
      const [{ data: dbMembers }, { data: dbChannels }] = (await Promise.all([
        supabase
          .from("team_members")
          .select(`
            id,
            profile_id,
            role,
            profiles (
              id,
              full_name,
              email,
              avatar_url
            )
          `)
          .eq("team_id", teamContext.teamId),
        supabase
          .from("message_channels")
          .select(`
            *,
            message_channel_members (
              channel_id,
              team_member_id
            )
          `)
          .eq("team_id", teamContext.teamId),
      ])) as any;

      const memberMap = new Map<string, any>();
      dbMembers?.forEach((m: any) => {
        const profile = m.profiles;
        memberMap.set(m.id, {
          memberId: m.id,
          profileId: m.profile_id,
          fullName: profile?.full_name || "Unknown Member",
          email: profile?.email || "",
          role: m.role,
          avatarUrl: profile?.avatar_url || null,
        });
      });

      // All other team members (for DM list and admin panel)
      teamMembersList = Array.from(memberMap.values());

      const allMemberships = (dbChannels || []).flatMap((c: any) => c.message_channel_members || []);

      allChannelMemberships = allMemberships.map((m: any) => ({
        channelId: m.channel_id,
        memberId: m.team_member_id,
      }));

      const myChannelIds = new Set(
        allChannelMemberships
          ?.filter((m: any) => m.memberId === myMemberId)
          .map((m: any) => m.channelId) || []
      );

      if (dbChannels) {
        // Only show channels the current user is a member of
        const visibleDbChannels = dbChannels.filter((c: any) => myChannelIds.has(c.id));
        const visibleChannelIds = visibleDbChannels.map((channel: any) => channel.id);
        const { data: dbMsgs } = (visibleChannelIds.length > 0
          ? await supabase
              .from("messages")
              .select("*")
              .in("channel_id", visibleChannelIds)
              .order("created_at", { ascending: true })
          : { data: [] }) as any;

        const messagesByChannel = new Map<string, any[]>();
        (dbMsgs || []).forEach((message: any) => {
          const messages = messagesByChannel.get(message.channel_id) ?? [];
          messages.push(message);
          messagesByChannel.set(message.channel_id, messages);
        });

        const msgIds = (dbMsgs || []).map((m: any) => m.id);
        const { data: dbMsgReads } = (msgIds.length > 0
          ? await supabase
              .from("message_reads")
              .select("message_id, profile_id, profiles(avatar_url, full_name)")
              .in("message_id", msgIds)
          : { data: [] }) as any;

        const messageReadsByMsgId = new Map<string, any[]>();
        (dbMsgReads || []).forEach((read: any) => {
          const reads = messageReadsByMsgId.get(read.message_id) ?? [];
          reads.push({
            profileId: read.profile_id,
            avatarUrl: read.profiles?.avatar_url,
            fullName: read.profiles?.full_name,
          });
          messageReadsByMsgId.set(read.message_id, reads);
        });

        const attachmentFileIds = Array.from(
          new Set<string>(
            (dbMsgs || [])
              .map((message: any) => message.attachment_file_id)
              .filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
          )
        );
        const attachmentMap = new Map<string, any>();

        if (attachmentFileIds.length > 0) {
          const { data: dbFiles } = (await supabase
            .from("practice_files")
            .select("id, storage_path, file_name, mime_type, size_bytes")
            .in("id", attachmentFileIds)) as any;

          await Promise.all(
            (dbFiles || []).map(async (file: any) => {
              const { data: signedUrl } = await supabase.storage
                .from("practice-files")
                .createSignedUrl(file.storage_path, 60 * 60);

              attachmentMap.set(file.id, {
                id: file.id,
                name: file.file_name,
                size: formatFileSize(Number(file.size_bytes)),
                type: fileKindLabel(file.mime_type, file.file_name),
                mimeType: file.mime_type,
                url: signedUrl?.signedUrl ?? "",
              });
            })
          );
        }

        for (const chan of visibleDbChannels) {
          const chanMembers = allMemberships?.filter((m: any) => m.channel_id === chan.id) || [];
          const membersCount = chanMembers.length;
          const channelMessages = messagesByChannel.get(chan.id) ?? [];

          // Resolve direct message name
          let channelName = chan.name;
          if (chan.channel_type === "direct") {
            const otherMember = chanMembers.find((m: any) => m.team_member_id !== myMemberId);
            if (otherMember) {
              const sender = memberMap.get(otherMember.team_member_id);
              if (sender) channelName = sender.fullName;
            }
          }

          const formattedMessages = channelMessages.map((msg) => {
            const sender = memberMap.get(msg.sender_member_id);
            return {
              id: msg.id,
              author: sender ? sender.fullName : "Unknown",
              body: msg.body,
              avatarUrl: sender ? sender.avatarUrl : null,
              createdAt: new Date(msg.created_at).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              }),
              mine: msg.sender_member_id === myMemberId,
              timestamp: new Date(msg.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
              attachment: msg.attachment_file_id ? attachmentMap.get(msg.attachment_file_id) : undefined,
              reads: messageReadsByMsgId.get(msg.id) || [],
              parentMessageId: msg.parent_message_id || null,
            };
          });

          channelsList.push({
            id: chan.id,
            name: channelName,
            type: chan.channel_type,
            membersOnline: membersCount,
            preview:
              formattedMessages.length > 0
                ? `${formattedMessages[formattedMessages.length - 1].author}: ${formattedMessages[formattedMessages.length - 1].body}`
                : "No messages yet",
            messages: formattedMessages,
            avatarUrl: (chan as any).avatar_url ?? null,
          });
        }

        // For admin panel: pass ALL channels (not just ones user is in)
        // so they can manage members of other channels too
        if (teamContext.role === "owner" || teamContext.role === "admin") {
          const allChannelIds = new Set(channelsList.map((c) => c.id));
          for (const chan of dbChannels) {
            if (!allChannelIds.has(chan.id) && chan.channel_type !== "direct") {
              channelsList.push({
                id: chan.id,
                name: chan.name,
                type: chan.channel_type,
                membersOnline: 0,
                preview: "No messages yet",
                messages: [],
                adminOnly: true, // flag: admin can see but can't chat
                avatarUrl: (chan as any).avatar_url ?? null,
              });
            }
          }
        }
      }
    }
  }

  // Fallback to sample data only when Supabase is not configured (demo mode).
  if (!hasSupabaseEnv() && channelsList.length === 0) {
    channelsList = [
      {
        id: "sunday-morning-team",
        name: "Worship Team",
        type: "team",
        membersOnline: 8,
        preview: "Casey: The new bridge arrangement...",
        messages: sampleMessages,
      },
    ];
  }

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
      />
    </AppShell>
  );
}
