import { AppShell } from "@/components/app-shell";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { createClient } from "@/lib/supabase/server";
import { AnalyticsDashboard } from "@/components/analytics-dashboard";
import { MemberUsageAnalytics } from "@/components/member-usage-analytics";
import { Activity, Radio } from "lucide-react";
import { redirect } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { loadTeamAnalytics } from "@/lib/server/team-analytics";

const demoAnalytics = {
  mostPlayedSongs: [
    { title: "Goodness of God", count: 8 },
    { title: "What a Beautiful Name", count: 6 },
    { title: "Way Maker", count: 5 },
  ],
  attendanceStats: [
    { type: "sunday_service", rate: 92 },
    { type: "rehearsal", rate: 84 },
  ],
  mostActiveChannels: [
    { name: "Worship Team", count: 42 },
    { name: "Announcements", count: 18 },
  ],
};

export default async function AnalyticsPage() {
  const teamContext = await getRequiredTeamContext();
  const isAdminOrOwner = teamContext.role === "admin" || teamContext.role === "owner";
  if (!isAdminOrOwner) {
    redirect("/dashboard");
  }

  const memberNames: Record<string, string> = {};
  let analytics = demoAnalytics;
  if (hasSupabaseEnv()) {
    const client = await createClient();
    const [loadedAnalytics, members] = await Promise.all([
      loadTeamAnalytics(client, teamContext.teamId),
      client.from("team_members").select("id, profiles(full_name)").eq("team_id", teamContext.teamId),
    ]);
    analytics = loadedAnalytics;
    if (members.error) throw new Error("Team member names could not be loaded");
    for (const member of members.data ?? []) {
      const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
      memberNames[member.id] = profile?.full_name ?? "Team member";
    }
  }

  return (
    <AppShell active="Analytics" teamContext={teamContext}>
      <div className="mx-auto max-w-6xl">
        <section className="motion-safe:animate-fade-down flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300">
              <Activity className="size-4" aria-hidden="true" />
              Ministry overview
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Team engagement
            </h1>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-zinc-400">
              See how {teamContext.teamName ?? "your worship team"} is showing up, serving,
              and staying connected.
            </p>
          </div>

          <div className="inline-flex w-fit shrink-0 items-center gap-2 px-1 py-2 text-xs font-semibold text-zinc-400">
            <Radio className="size-3.5 text-emerald-400" aria-hidden="true" />
            Current team snapshot
          </div>
        </section>

        <AnalyticsDashboard
          mostPlayedSongs={analytics.mostPlayedSongs}
          attendanceStats={analytics.attendanceStats}
          mostActiveChannels={analytics.mostActiveChannels}
        />
        <MemberUsageAnalytics teamId={hasSupabaseEnv() ? teamContext.teamId : null} memberNames={memberNames} />
      </div>
    </AppShell>
  );
}
