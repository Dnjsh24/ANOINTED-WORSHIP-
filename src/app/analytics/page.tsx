import { AppShell } from "@/components/app-shell";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { createClient } from "@/lib/supabase/server";
import { AnalyticsDashboard } from "@/components/analytics-dashboard";
import { Activity, Radio } from "lucide-react";
import { redirect } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/supabase/env";

type TopSongRow = {
  song_id: string;
  songs: { title: string } | Array<{ title: string }> | null;
};

type EventAttendanceRow = {
  type: string | null;
  attendance: Array<{ status: string | null }>;
};

type RecentMessageRow = {
  channel_id: string;
  message_channels: { name: string } | Array<{ name: string }> | null;
};

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

async function loadAnalytics(teamId: string) {
  const supabase = await createClient();

  const { data: topSongs } = await supabase
    .from("setlist_songs")
    .select(`
      song_id,
      songs(title),
      setlists!inner(team_id)
    `)
    .eq("setlists.team_id", teamId)
    .limit(1000);

  const songCounts: Record<string, { title: string; count: number }> = {};
  if (topSongs) {
    for (const row of topSongs as unknown as TopSongRow[]) {
      const song = Array.isArray(row.songs) ? row.songs[0] : row.songs;
      if (song?.title) {
        if (!songCounts[row.song_id]) {
          songCounts[row.song_id] = { title: song.title, count: 0 };
        }
        songCounts[row.song_id].count++;
      }
    }
  }
  const mostPlayedSongs = Object.values(songCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const { data: eventsAndAttendance } = await supabase
    .from("events")
    .select(`
      id,
      type,
      attendance(
        status
      )
    `)
    .eq("team_id", teamId);

  const eventTypeStats: Record<string, { type: string; total: number; confirmed: number }> = {};
  if (eventsAndAttendance) {
    for (const ev of eventsAndAttendance as unknown as EventAttendanceRow[]) {
      const type = ev.type || "sunday_service";
      if (!eventTypeStats[type]) {
        eventTypeStats[type] = { type, total: 0, confirmed: 0 };
      }

      const attendance = ev.attendance || [];
      eventTypeStats[type].total += attendance.length;
      eventTypeStats[type].confirmed += attendance.filter(
        (entry) => entry.status === "available",
      ).length;
    }
  }

  const attendanceStats = Object.values(eventTypeStats).map(stat => ({
    type: stat.type,
    rate: stat.total > 0 ? (stat.confirmed / stat.total) * 100 : 0
  }));

  const { data: recentMessages } = await supabase
    .from("messages")
    .select(`
      channel_id,
      message_channels!inner(name, team_id)
    `)
    .eq("message_channels.team_id", teamId)
    .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  const channelCounts: Record<string, { name: string; count: number }> = {};
  if (recentMessages) {
    for (const msg of recentMessages as unknown as RecentMessageRow[]) {
      const channel = Array.isArray(msg.message_channels)
        ? msg.message_channels[0]
        : msg.message_channels;
      if (channel?.name) {
        if (!channelCounts[msg.channel_id]) {
          channelCounts[msg.channel_id] = { name: channel.name, count: 0 };
        }
        channelCounts[msg.channel_id].count++;
      }
    }
  }
  const mostActiveChannels = Object.values(channelCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return { mostPlayedSongs, attendanceStats, mostActiveChannels };
}

export default async function AnalyticsPage() {
  const teamContext = await getRequiredTeamContext();
  const isAdminOrOwner = teamContext.role === "admin" || teamContext.role === "owner";
  if (!isAdminOrOwner) {
    redirect("/dashboard");
  }

  const analytics = hasSupabaseEnv()
    ? await loadAnalytics(teamContext.teamId)
    : demoAnalytics;

  return (
    <AppShell active="Analytics" teamContext={teamContext}>
      <div className="mx-auto max-w-6xl">
        <section className="animate-fade-down flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300">
              <span className="flex size-7 items-center justify-center rounded-lg border border-violet-400/20 bg-violet-500/10">
                <Activity className="size-3.5" aria-hidden="true" />
              </span>
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

          <div className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-300">
            <Radio className="size-3.5 text-emerald-400" aria-hidden="true" />
            Current team snapshot
          </div>
        </section>

        <AnalyticsDashboard
          mostPlayedSongs={analytics.mostPlayedSongs}
          attendanceStats={analytics.attendanceStats}
          mostActiveChannels={analytics.mostActiveChannels}
        />
      </div>
    </AppShell>
  );
}
