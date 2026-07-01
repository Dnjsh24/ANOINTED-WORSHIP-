import { AppShell } from "@/components/app-shell";
import { MessagesClient } from "@/components/messages-client";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTeamContext } from "@/lib/supabase/team-context";
import { messages as sampleMessages } from "@/lib/sample-data";

export default async function MessagesPage() {
  const teamContext = await getCurrentTeamContext();

  let channelsList: any[] = [];
  let teamMembersList: any[] = [];
  let allChannelMemberships: { channelId: string; memberId: string }[] = [];
  let myMemberId = "";

  if (hasSupabaseEnv() && teamContext.teamId && teamContext.userId) {
    const supabase = await createClient();

    // Fetch my own membership ID
    const { data: myMembership } = await supabase
      .from("team_members")
      .select("id")
      .eq("profile_id", teamContext.userId)
      .eq("team_id", teamContext.teamId)
      .maybeSingle();

    if (myMembership) {
      myMemberId = myMembership.id;
    }

    if (myMemberId) {
      // 1. Fetch all team members and their profiles
      const { data: dbMembers } = await supabase
        .from("team_members")
        .select("id, profile_id, role")
        .eq("team_id", teamContext.teamId);

      const profileIds = dbMembers?.map((m) => m.profile_id) || [];
      let dbProfiles: any[] = [];
      if (profileIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email, avatar_url")
          .in("id", profileIds);
        if (profiles) dbProfiles = profiles;
      }

      const memberMap = new Map<string, any>();
      dbMembers?.forEach((m) => {
        const profile = dbProfiles.find((p) => p.id === m.profile_id);
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

      // 2. Fetch ALL channel memberships for this team (for admin panel)
      const { data: allMemberships } = await supabase
        .from("message_channel_members")
        .select("channel_id, team_member_id");

      allChannelMemberships = (allMemberships || []).map((m) => ({
        channelId: m.channel_id,
        memberId: m.team_member_id,
      }));

      const myChannelIds = new Set(
        allMemberships
          ?.filter((m) => m.team_member_id === myMemberId)
          .map((m) => m.channel_id) || []
      );

      // 3. Fetch all channels for this team
      const { data: dbChannels } = await supabase
        .from("message_channels")
        .select("*")
        .eq("team_id", teamContext.teamId);

      if (dbChannels) {
        // Only show channels the current user is a member of
        const visibleDbChannels = dbChannels.filter((c) => myChannelIds.has(c.id));

        // Fetch messages for each visible channel
        for (const chan of visibleDbChannels) {
          const { data: dbMsgs } = await supabase
            .from("messages")
            .select("*")
            .eq("channel_id", chan.id)
            .order("created_at", { ascending: true });

          const chanMembers = allMemberships?.filter((m) => m.channel_id === chan.id) || [];
          const membersCount = chanMembers.length;

          // Resolve direct message name
          let channelName = chan.name;
          if (chan.channel_type === "direct") {
            const otherMember = chanMembers.find((m) => m.team_member_id !== myMemberId);
            if (otherMember) {
              const sender = memberMap.get(otherMember.team_member_id);
              if (sender) channelName = sender.fullName;
            }
          }

          const formattedMessages = (dbMsgs || []).map((msg) => {
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

  // Fallback to sample data if no supabase or empty
  if (channelsList.length === 0) {
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
        role={teamContext.role || "member"}
        allChannelMemberships={allChannelMemberships}
      />
    </AppShell>
  );
}
