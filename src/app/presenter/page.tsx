import { notFound } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { isDesktopRuntime } from "@/lib/desktop/runtime";
import { listDesktopSetlists } from "@/lib/desktop/workspace";
import { getDesktopSetlistBackground, listDesktopBackgroundAssets, listDesktopBackgroundCollections } from "@/lib/desktop/background-media";
import { listDesktopMotionPresets } from "@/lib/desktop/motion-presets";
import { listDesktopSceneLayers } from "@/lib/desktop/scene-layers";
import { seedDesktopProductionLayout } from "@/lib/desktop/production-layout";
import { listDesktopLivePropPresets } from "@/lib/desktop/live-props";
import { listImportedPresentations } from "@/lib/desktop/pptx-import";
import PresenterClient from "./presenter-client";

export default async function GlobalPresenterPage({
  searchParams,
}: {
  searchParams: Promise<{ setlist?: string }>;
}) {
  const { setlist: requestedSetlistId } = await searchParams;
  const teamContext = await getRequiredTeamContext();

  if (isDesktopRuntime() && teamContext.teamId) {
    const setlists = listDesktopSetlists(teamContext.teamId).map((setlist) => ({
      id: setlist.id,
      name: setlist.name,
      date: setlist.date,
      type: setlist.eventType || "sunday_service",
      songs: setlist.songs.map((item) => ({
        id: item.id,
        order: item.order,
        assignedKey: item.assignedKey,
        song: {
          id: item.song.id,
          title: item.song.title,
          bpm: item.song.bpm || 70,
          originalKey: item.song.originalKey,
          // Keep the original text. Joining parsed line objects produced
          // "[object Object]" and made desktop Lyrics Reflow appear empty.
          lyricsChords: item.song.rawLyricsChords || "",
          notes: item.bandNotes || item.lead || "",
        },
      })),
      presentationSettings: (setlist as any).presentationSettings,
    }));
    const initialBackgrounds = listDesktopBackgroundAssets(teamContext.teamId);
    const backgroundCollections = listDesktopBackgroundCollections(teamContext.teamId);
    const motionPresets = listDesktopMotionPresets(teamContext.teamId);
    const sceneLayers = Object.fromEntries(setlists.map((setlist) => [setlist.id, listDesktopSceneLayers(teamContext.teamId, setlist.id)]));
    const productionLayout = seedDesktopProductionLayout(teamContext.teamId);
    const livePropPresets = listDesktopLivePropPresets(teamContext.teamId);
    const importedPresentations = listImportedPresentations(teamContext.teamId);
    const setlistBackgrounds = Object.fromEntries(setlists.map((setlist) => [
      setlist.id,
      getDesktopSetlistBackground(teamContext.teamId, setlist.id),
    ]));
    return <PresenterClient setlists={setlists} initialSetlistId={requestedSetlistId} desktopMode desktopBackgrounds={initialBackgrounds} desktopBackgroundCollections={backgroundCollections} desktopSetlistBackgrounds={setlistBackgrounds} desktopMotionPresets={motionPresets} desktopSceneLayers={sceneLayers} desktopAudienceLooks={productionLayout.looks} desktopOutputConfigs={productionLayout.outputs} desktopLivePropPresets={livePropPresets} desktopImportedPresentations={importedPresentations} />;
  } else if (hasSupabaseEnv() && teamContext.teamId && teamContext.userId) {
    const supabase = await createClient();

    // Fetch all upcoming setlists for the team
    const { data: dbSetlists } = await supabase
      .from("setlists")
      .select(`
        *,
        events (
          type
        ),
        setlist_songs (
          id,
          assigned_key,
          song_order,
          notes,
          arrangement,
          song:songs (
            id,
            title,
            bpm,
            original_key,
            lyrics_chords
          )
        )
      `)
      .eq("team_id", teamContext.teamId)
      .order("setlist_date", { ascending: false })
      .limit(10); // Fetching the 10 most recent/upcoming setlists for the dropdown

    if (dbSetlists) {
      const setlists = dbSetlists.map((dbSetlist: any) => {
        const dbSetlistSongs = dbSetlist.setlist_songs || [];
        dbSetlistSongs.sort((a: any, b: any) => (a.song_order ?? 0) - (b.song_order ?? 0));

        const songsList = dbSetlistSongs.map((ss: any) => ({
          id: ss.id,
          order: ss.song_order,
          assignedKey: ss.assigned_key,
          song: {
            id: ss.song?.id,
            title: ss.song?.title || "Unknown Song",
            bpm: ss.song?.bpm || 70,
            originalKey: ss.song?.original_key || "C",
            lyricsChords: ss.song?.lyrics_chords || "",
          },
        }));

        return {
          id: dbSetlist.id,
          name: dbSetlist.name,
          date: dbSetlist.setlist_date,
          type: dbSetlist.events?.type || "sunday_service",
          songs: songsList,
          presentationSettings: dbSetlist.presentation_settings,
        };
      });

      return <PresenterClient setlists={setlists} initialSetlistId={requestedSetlistId} />;
    }
  }

  notFound();
}
