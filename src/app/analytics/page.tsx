import { AnalyticsDashboard } from "@/components/analytics-dashboard";
import { MemberUsageAnalytics } from "@/components/member-usage-analytics";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { createDemoAnalytics, loadAnalytics } from "@/lib/server/analytics";
import { parseAnalyticsRange } from "@/lib/domain/analytics";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { redirect } from "next/navigation";

type AnalyticsSearchParams = Record<string, string | string[] | undefined>;

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<AnalyticsSearchParams>;
}) {
  const teamContext = await getRequiredTeamContext();
  const isAdminOrOwner = teamContext.role === "admin" || teamContext.role === "owner";
  if (!isAdminOrOwner) {
    redirect("/dashboard");
  }

  const range = parseAnalyticsRange(await searchParams);
  const analytics = hasSupabaseEnv()
    ? await loadAnalytics(teamContext.teamId, range)
    : createDemoAnalytics(range);

  const memberNames: Record<string, string> = {};
  if (hasSupabaseEnv()) {
    const client = await createClient();
    const members = await client.from("team_members").select("id, profiles(full_name)").eq("team_id", teamContext.teamId);
    if (members.error) throw new Error("Team member names could not be loaded");
    for (const member of members.data ?? []) {
      const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
      memberNames[member.id] = profile?.full_name ?? "Team member";
    }
  }

  return (
    <AppShell active="Analytics" teamContext={teamContext}>
      <AnalyticsDashboard key={`${range.start}:${range.end}`} analytics={analytics} />
      <MemberUsageAnalytics teamId={hasSupabaseEnv() ? teamContext.teamId : null} memberNames={memberNames} />
    </AppShell>
  );
}
