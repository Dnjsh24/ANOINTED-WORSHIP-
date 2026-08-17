import { Mail, Music, Shield } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, Panel } from "@/components/ui/card";
import { joinRequestWithRequesterProfileSelect } from "@/lib/domain/join-requests";
import { getDisplayedMinistries, getMemberLeadershipRole } from "@/lib/domain/member-ministries";
import { members, pendingRequests } from "@/lib/sample-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import type { TeamRole } from "@/lib/types";
import { cn } from "@/lib/utils";

type MemberProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

type MemberDetailRow = {
  id: string;
  profile_id: string;
  role: TeamRole | null;
  status: "active" | "inactive" | null;
  ministry: string | null;
  ministries: string[] | null;
  profiles: MemberProfileRow | MemberProfileRow[] | null;
};

type PendingJoinRequestRow = {
  id: string;
  profile_id: string | null;
  requested_role: TeamRole | null;
  created_at: string;
  profiles: MemberProfileRow | MemberProfileRow[] | null;
};

export default async function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teamContext = await getRequiredTeamContext();

  if (!teamContext.canManageMembers) {
    redirect("/dashboard");
  }

  let member =
    members.find((item) => item.id === id) ??
    members.find((item) => item.profile.fullName.toLowerCase().replaceAll(" ", "-").replaceAll(".", "") === id) ??
    members[0];
  let request = pendingRequests.find((item) => item.id === id);

  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const { data: memberData } = await supabase
      .from("team_members")
      .select("id, profile_id, role, status, ministry, ministries, profiles ( id, full_name, email, avatar_url )")
      .eq("id", id)
      .eq("team_id", teamContext.teamId)
      .maybeSingle();
    const dbMember = memberData as unknown as MemberDetailRow | null;

    if (dbMember) {
      const profile = Array.isArray(dbMember.profiles) ? dbMember.profiles[0] : dbMember.profiles;
      member = {
        id: dbMember.id,
        profile: {
          id: profile?.id ?? dbMember.profile_id,
          fullName: profile?.full_name ?? profile?.email ?? "Unknown",
          email: profile?.email ?? "",
          avatarUrl: profile?.avatar_url ?? undefined,
        },
        role: dbMember.role ?? "member",
        status: dbMember.status ?? "active",
        attendanceRate: 0,
        ministry: dbMember.ministry ?? "",
        ministries: dbMember.ministries ?? (dbMember.ministry ? [dbMember.ministry] : []),
      };

      const [totalEventsResult, attendedResult] = await Promise.all([
        supabase.from("events").select("id", { count: "exact", head: true }).eq("team_id", teamContext.teamId).lte("event_date", new Date().toISOString().split("T")[0]),
        supabase.from("attendance").select("id", { count: "exact", head: true }).eq("team_member_id", dbMember.id).eq("status", "available")
      ]);
      const totalEvents = totalEventsResult.count ?? 0;
      const attended = attendedResult.count ?? 0;
      member.attendanceRate = totalEvents > 0 ? Math.round((attended / totalEvents) * 100) : 100;

      request = undefined;
    } else {
      const { data: requestData } = await supabase
        .from("join_requests")
        .select(joinRequestWithRequesterProfileSelect)
        .eq("id", id)
        .eq("team_id", teamContext.teamId)
        .eq("status", "pending")
        .maybeSingle();
      const dbRequest = requestData as unknown as PendingJoinRequestRow | null;

      if (!dbRequest) {
        notFound();
      }

      const profile = Array.isArray(dbRequest.profiles) ? dbRequest.profiles[0] : dbRequest.profiles;
      request = {
        id: dbRequest.id,
        initials: (profile?.full_name ?? profile?.email ?? "U").slice(0, 2).toUpperCase(),
        name: profile?.full_name ?? profile?.email ?? "Unknown",
        email: profile?.email ?? "",
        requestedRole: dbRequest.requested_role ?? "member",
        ministry: dbRequest.requested_role ?? "member",
        requestedAt: dbRequest.created_at,
        avatarUrl: profile?.avatar_url ?? undefined,
      };
      member = {
        id: dbRequest.id,
        profile: {
          id: dbRequest.profile_id ?? dbRequest.id,
          fullName: request.name,
          email: profile?.email ?? "",
          avatarUrl: profile?.avatar_url ?? undefined,
        },
        role: request.requestedRole,
        status: "inactive",
        attendanceRate: 0,
        ministry: request.ministry,
        ministries: request.ministry ? [request.ministry] : [],
      };
    }
  }

  const memberLeadership = getMemberLeadershipRole(member.role, member.ministries);
  const displayedMinistries = getDisplayedMinistries(member.ministries, member.role);

  return (
    <AppShell active="Team Management" teamContext={teamContext}>
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="p-6 text-center">
          <Avatar name={request?.name ?? member.profile.fullName} src={member.profile.avatarUrl} className="mx-auto size-20 text-2xl" />
          <h1 className="mt-5 text-2xl font-bold">{request?.name ?? member.profile.fullName}</h1>
          {memberLeadership ? (
            <div className="mt-2 flex justify-center">
              <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border", memberLeadership.badgeClass)}>
                <span>{memberLeadership.iconEmoji}</span>
                <span>{memberLeadership.label}</span>
              </span>
            </div>
          ) : (
            <p className="mt-1 text-sm font-semibold text-zinc-400 capitalize">{request?.ministry ?? (displayedMinistries.length > 0 ? displayedMinistries.join(", ") : "Member")}</p>
          )}
          <div className="mt-5 flex justify-center gap-2">
            <Badge>{request ? "Pending" : member.status}</Badge>
            {!request && <Badge>{member.attendanceRate}% Attendance</Badge>}
          </div>
        </Card>
        <Panel>
          <h2 className="text-2xl font-bold">Member Details</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
              <p className="flex items-center gap-2 text-sm font-bold text-zinc-300">
                <Mail className="size-4" />
                Email
              </p>
              <p className="mt-2 font-semibold">{request ? "Pending invitation" : member.profile.email}</p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
              <p className="flex items-center gap-2 text-sm font-bold text-zinc-300">
                <Shield className="size-4" />
                Access Level
              </p>
              <p className="mt-2 font-semibold">{request ? request.requestedRole.replace("_", " ") : member.role.replace("_", " ")}</p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.04] p-4 md:col-span-2">
              <p className="flex items-center gap-2 text-sm font-bold text-zinc-300">
                <Music className="size-4" />
                Ministry Role
              </p>
              <p className="mt-2 font-semibold">{request?.ministry ?? (displayedMinistries.length > 0 ? displayedMinistries.join(", ") : "Member")}</p>
            </div>
          </div>
          <ButtonLink href="/members" variant="secondary" className="mt-6">
            Back to Team
          </ButtonLink>
        </Panel>
      </div>
    </AppShell>
  );
}
