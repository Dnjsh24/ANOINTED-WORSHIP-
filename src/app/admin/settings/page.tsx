import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SettingsClientView } from "@/components/settings-client-view";
import { teamCode } from "@/lib/sample-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import type { Permission } from "@/lib/domain/rbac";
import type { CustomRole, TeamRole } from "@/lib/types";

function formatTimeForInput(timeStr: string | null): string {
  if (!timeStr) return "08:00";
  if (/^\d{2}:\d{2}$/.test(timeStr)) return timeStr;

  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const ampm = match[3]?.toUpperCase();
    if (ampm === "PM" && hours < 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, "0")}:${minutes}`;
  }
  return timeStr.substring(0, 5);
}

interface ActivityEntry {
  user: string;
  action: string;
  time: string;
  role: string;
}

export default async function AdminSettingsPage() {
  const teamContext = await getRequiredTeamContext();

  if (!teamContext.canManageMembers) {
    redirect("/dashboard");
  }

  const code = teamContext.teamCode ?? teamCode;
  const isAdmin = teamContext.canManageMembers;

  let defaultServiceLocation = "Main Sanctuary";
  let defaultCallTime = "08:00";
  let defaultRehearsalTime = "08:15";
  let activityLog: ActivityEntry[] = [];
  let memberCountsByRole: Record<string, number> = {};
  let totalMembers = 0;
  let customRoles: CustomRole[] = [];
  let rolePermissionsByRole: Partial<Record<TeamRole, Permission[]>> = {};

  if (hasSupabaseEnv() && teamContext.teamId) {
    const supabase = await createClient();

    const [settingsResult, changesResult, eventsResult, teamMembersResult, rolePermissionsResult] = await Promise.all([
      supabase
        .from("team_settings")
        .select("default_service_location, default_call_time, default_rehearsal_time")
        .eq("team_id", teamContext.teamId)
        .maybeSingle(),
      supabase
        .from("setlist_change_log")
        .select("id, summary, changed_by, created_at")
        .eq("team_id", teamContext.teamId)
        .order("created_at", { ascending: false })
        .limit(15),
      supabase
        .from("events")
        .select("id, name, created_at, created_by")
        .eq("team_id", teamContext.teamId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("team_members")
        .select("profile_id, role, profiles!inner(full_name)")
        .eq("team_id", teamContext.teamId)
        .eq("status", "active"),
      supabase
        .from("team_role_permissions")
        .select("role, permissions")
        .eq("team_id", teamContext.teamId),
    ]);

    rolePermissionsByRole = Object.fromEntries(
      (rolePermissionsResult.data ?? []).map((policy) => [
        policy.role as TeamRole,
        policy.permissions as Permission[],
      ]),
    ) as Partial<Record<TeamRole, Permission[]>>;

    const settings = settingsResult.data;
    if (settings) {
      if (settings.default_service_location) defaultServiceLocation = settings.default_service_location;
      if (settings.default_call_time) defaultCallTime = formatTimeForInput(settings.default_call_time);
      if (settings.default_rehearsal_time) defaultRehearsalTime = formatTimeForInput(settings.default_rehearsal_time);
    }

    // Build activity log from setlist changes and events
    const activityEntries: ActivityEntry[] = [];

    const userIds = new Set<string>();
    (changesResult.data ?? []).forEach((change) => {
      if (change.changed_by) userIds.add(change.changed_by);
    });
    (eventsResult.data ?? []).forEach((event) => {
      if (event.created_by) userIds.add(event.created_by);
    });

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", [...userIds]);

    const profileNameMap = new Map(
      (profiles ?? []).map((profile) => [profile.id, profile.full_name] as const),
    );

    const teamMembers = teamMembersResult.data ?? [];
    const roleByProfileId = new Map(
      teamMembers.map((member) => [member.profile_id, member.role ?? "member"] as const),
    );

    (changesResult.data ?? []).forEach((change) => {
      activityEntries.push({
        user: profileNameMap.get(change.changed_by ?? "") ?? "Team Member",
        action: change.summary,
        time: change.created_at,
        role: roleByProfileId.get(change.changed_by ?? "") ?? "member",
      });
    });

    (eventsResult.data ?? []).forEach((event) => {
      activityEntries.push({
        user: profileNameMap.get(event.created_by ?? "") ?? "Team Member",
        action: `created event "${event.name}"`,
        time: event.created_at,
        role: roleByProfileId.get(event.created_by ?? "") ?? "member",
      });
    });

    activityEntries.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    activityLog = activityEntries.slice(0, 25);

    // Compute member counts by role
    totalMembers = teamMembers.length;
    memberCountsByRole = (teamMembers as Array<{ profile_id: string; role: string }>).reduce((acc, m) => {
      acc[m.role] = (acc[m.role] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    // Fetch custom roles
    const { data: customRolesData } = await supabase
      .from("custom_roles")
      .select("*")
      .eq("team_id", teamContext.teamId)
      .order("created_at", { ascending: true });
    
    customRoles = (customRolesData || []) as CustomRole[];
  }

  return (
    <AppShell active="Settings" teamContext={teamContext}>
      <div className="animate-fade-up">
        <h1 className="text-4xl font-extrabold tracking-tight">Team Controls</h1>
        <p className="mt-1.5 text-sm font-semibold text-zinc-400">
          Manage your team preferences, access, and security policies.
        </p>
      </div>

      <SettingsClientView
        teamId={teamContext.teamId}
        teamName={teamContext.teamName || "New Hope Worship"}
        teamCode={code}
        isAdmin={isAdmin}
        role={teamContext.role}
        defaultServiceLocation={defaultServiceLocation}
        defaultCallTime={defaultCallTime}
        defaultRehearsalTime={defaultRehearsalTime}
        activityLog={activityLog}
        memberCountsByRole={memberCountsByRole}
        totalMembers={totalMembers}
        customRoles={customRoles}
        customPermissions={teamContext.customPermissions}
        rolePermissionsByRole={rolePermissionsByRole}
      />
    </AppShell>
  );
}
