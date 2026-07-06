import { AppShell } from "@/components/app-shell";
import { SetlistsClient } from "@/components/setlists-client";
import { setlists as sampleSetlists } from "@/lib/sample-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import type { Setlist } from "@/lib/types";

export default async function SetlistsPage() {
  const teamContext = await getRequiredTeamContext();
  let setlistsList: Setlist[] = [];

  if (hasSupabaseEnv() && teamContext.teamId && teamContext.userId) {
    const supabase = await createClient();

    // Fetch setlists, leaders (with profile names), and setlist songs (with song titles/BPMs) in a single nested select
    const { data: dbSetlists } = (await supabase
      .from("setlists")
      .select(`
        *,
        events (
          type
        ),
        leader:team_members (
          id,
          profile_id,
          profiles (
            id,
            full_name
          )
        ),
        setlist_songs (
          id,
          assigned_key,
          song_order,
          song:songs (
            id,
            title,
            bpm
          )
        )
      `)
      .eq("team_id", teamContext.teamId)
      .order("setlist_date", { ascending: false })) as any;

    setlistsList = (dbSetlists ?? []).map((s: any) => {
      const leaderName = s.leader?.profiles?.full_name || "Worship Leader";
      const songs = (s.setlist_songs ?? [])
        .sort((a: any, b: any) => a.song_order - b.song_order)
        .map((ss: any) => ({
          id: ss.id,
          assignedKey: ss.assigned_key,
          order: ss.song_order,
          song: {
            id: ss.song?.id,
            title: ss.song?.title || "Unknown Song",
            bpm: ss.song?.bpm || 70,
          },
        }));

      return {
        id: s.id,
        name: s.name,
        date: s.setlist_date,
        leader: leaderName,
        location: s.location ?? "Main Sanctuary",
        callTime: s.call_time?.slice(0, 5) || "09:00",
        rehearsalTime: s.rehearsal_time?.slice(0, 5) || "08:00",
        serviceTimes: s.service_times || ["Sunday Worship"],
        eventType: s.events?.type,
        songs,
      };
    });
  }

  // Fallback to sample data only when Supabase is not configured (demo mode).
  if (!hasSupabaseEnv() && setlistsList.length === 0) {
    setlistsList = sampleSetlists;
  }

  return (
    <AppShell active="Setlists" teamContext={teamContext}>
      <SetlistsClient setlists={setlistsList} />
    </AppShell>
  );
}
