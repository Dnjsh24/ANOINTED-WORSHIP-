import { AppShell } from "@/components/app-shell";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { createClient } from "@/lib/supabase/server";
import { AnalyticsDashboard } from "@/components/analytics-dashboard";
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
    <AppShell active="analytics">
      <div className="flex-1 overflow-y-auto bg-[#0A0A0A] p-4 md:p-8">
        <div className="mx-auto max-w-6xl space-y-8">
          <div>
             <h1 className="text-3xl font-bold tracking-tight text-white">Team Engagement</h1>
             <p className="text-sm text-zinc-400 mt-1">Analytics and insights for {teamContext.teamId}</p>
          </div>
          
          <AnalyticsDashboard 
            mostPlayedSongs={analytics.mostPlayedSongs}
            attendanceStats={analytics.attendanceStats}
            mostActiveChannels={analytics.mostActiveChannels}
          />
        </div>
      </div>
    </AppShell>
  );
}
