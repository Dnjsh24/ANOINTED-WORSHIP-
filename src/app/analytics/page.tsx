import { AnalyticsDashboard } from "@/components/analytics-dashboard";
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

  return (
    <AppShell active="Analytics" teamContext={teamContext}>
      <AnalyticsDashboard key={`${range.start}:${range.end}`} analytics={analytics} />
    </AppShell>
  );
}
