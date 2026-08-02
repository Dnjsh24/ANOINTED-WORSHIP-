import { AppShell } from "@/components/app-shell";
import { SetlistsClient } from "@/components/setlists-client";
import { setlists as sampleSetlists } from "@/lib/sample-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { isDesktopRuntime } from "@/lib/desktop/runtime";
import { listDesktopSetlists } from "@/lib/desktop/workspace";
import type { Database } from "@/lib/supabase/database.types";
import type { EventType, Setlist } from "@/lib/types";

type SetlistListRow = Database["public"]["Tables"]["setlists"]["Row"] & {
  events: { type: EventType } | Array<{ type: EventType }> | null;
  leader:
    | { profiles: { full_name: string | null } | Array<{ full_name: string | null }> | null }
    | Array<{ profiles: { full_name: string | null } | Array<{ full_name: string | null }> | null }>
    | null;
  setlist_songs: Array<{
    id: string;
    assigned_key: string;
    song_order: number;
    song:
      | {
          id: string;
          title: string;
          artist: string;
          original_key: string;
          bpm: number | null;
          time_signature: string;
          tags: string[];
        }
      | Array<{
          id: string;
          title: string;
          artist: string;
          original_key: string;
          bpm: number | null;
          time_signature: string;
          tags: string[];
        }>
      | null;
  }>;
};

export default async function SetlistsPage() {
  const teamContext = await getRequiredTeamContext();
  let setlistsList: Setlist[] = [];

  if (isDesktopRuntime() && teamContext.teamId) {
    setlistsList = listDesktopSetlists(teamContext.teamId);
  } else if (hasSupabaseEnv() && teamContext.teamId && teamContext.userId) {
    const supabase = await createClient();

    // Fetch setlists, leaders (with profile names), and setlist songs (with song titles/BPMs) in a single nested select
    const { data: dbSetlists } = await supabase
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
            artist,
            original_key,
            bpm,
            time_signature,
            tags
          )
        )
      `)
      .eq("team_id", teamContext.teamId)
      .order("setlist_date", { ascending: false });

    setlistsList = ((dbSetlists ?? []) as unknown as SetlistListRow[]).map((setlist) => {
      const leader = Array.isArray(setlist.leader) ? setlist.leader[0] : setlist.leader;
      const profile = Array.isArray(leader?.profiles) ? leader.profiles[0] : leader?.profiles;
      const leaderName = profile?.full_name || "Worship Leader";
      const songs = [...(setlist.setlist_songs ?? [])]
        .sort((left, right) => left.song_order - right.song_order)
        .map((slot) => {
          const song = Array.isArray(slot.song) ? slot.song[0] : slot.song;
          return {
            id: slot.id,
            assignedKey: slot.assigned_key || song?.original_key || "C",
            order: slot.song_order,
            song: {
              id: song?.id ?? slot.id,
              title: song?.title || "Unknown Song",
              artist: song?.artist || "",
              originalKey: song?.original_key || "C",
              currentKey: slot.assigned_key || song?.original_key || "C",
              bpm: song?.bpm ?? 70,
              timeSignature: song?.time_signature || "4/4",
              tags: song?.tags ?? [],
              favorite: false,
              sections: [],
            },
          };
        });
      const event = Array.isArray(setlist.events) ? setlist.events[0] : setlist.events;

      return {
        id: setlist.id,
        name: setlist.name,
        date: setlist.setlist_date,
        leader: leaderName,
        location: setlist.location ?? "Main Sanctuary",
        callTime: setlist.call_time?.slice(0, 5) || "09:00",
        rehearsalTime: setlist.rehearsal_time?.slice(0, 5) || "08:00",
        serviceTimes: setlist.service_times || ["Sunday Worship"],
        eventType: event?.type,
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
      <SetlistsClient setlists={setlistsList} referenceDate={!hasSupabaseEnv() ? "2026-07-10" : undefined} />
    </AppShell>
  );
}
