import { notFound, redirect } from "next/navigation";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { isDesktopRuntime } from "@/lib/desktop/runtime";
import { listDesktopSetlists } from "@/lib/desktop/workspace";
import { getDesktopSetlistBackground, listDesktopBackgroundAssets, listDesktopBackgroundCollections } from "@/lib/desktop/background-media";
import { listDesktopMotionPresets } from "@/lib/desktop/motion-presets";
import { listDesktopSceneLayers } from "@/lib/desktop/scene-layers";
import { seedDesktopProductionLayout } from "@/lib/desktop/production-layout";
import { listDesktopLivePropPresets } from "@/lib/desktop/live-props";
import { listImportedPresentations } from "@/lib/desktop/pptx-import";
import { listDesktopLyricShortcuts } from "@/lib/desktop/lyric-shortcuts";
import PresenterClient, { type PresenterSetlist } from "./presenter-client";
import { getPresenterDestination } from "@/lib/presentation/remote-pairing";

export default async function GlobalPresenterPage({
  searchParams,
}: {
  searchParams: Promise<{ setlist?: string }>;
}) {
  const { setlist: requestedSetlistId } = await searchParams;
  const presenterDestination = getPresenterDestination(isDesktopRuntime());
  if (presenterDestination) redirect(presenterDestination);
  const teamContext = await getRequiredTeamContext();

  if (teamContext.teamId) {
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
      presentationSettings: (
        "presentationSettings" in setlist ? setlist.presentationSettings : undefined
      ) as PresenterSetlist["presentationSettings"],
    }));
    const initialBackgrounds = listDesktopBackgroundAssets(teamContext.teamId);
    const backgroundCollections = listDesktopBackgroundCollections(teamContext.teamId);
    const motionPresets = listDesktopMotionPresets(teamContext.teamId);
    const sceneLayers = Object.fromEntries(setlists.map((setlist) => [setlist.id, listDesktopSceneLayers(teamContext.teamId, setlist.id)]));
    const productionLayout = seedDesktopProductionLayout(teamContext.teamId);
    const livePropPresets = listDesktopLivePropPresets(teamContext.teamId);
    const importedPresentations = Object.fromEntries(setlists.map((setlist) => [
      setlist.id,
      listImportedPresentations(teamContext.teamId, setlist.id),
    ]));
    const lyricShortcuts = Object.fromEntries(setlists.map((setlist) => [
      setlist.id,
      listDesktopLyricShortcuts(teamContext.teamId, setlist.id),
    ]));
    const setlistBackgrounds = Object.fromEntries(setlists.map((setlist) => [
      setlist.id,
      getDesktopSetlistBackground(teamContext.teamId, setlist.id),
    ]));
    return <PresenterClient setlists={setlists} initialSetlistId={requestedSetlistId} desktopMode desktopBackgrounds={initialBackgrounds} desktopBackgroundCollections={backgroundCollections} desktopSetlistBackgrounds={setlistBackgrounds} desktopMotionPresets={motionPresets} desktopSceneLayers={sceneLayers} desktopAudienceLooks={productionLayout.looks} desktopOutputConfigs={productionLayout.outputs} desktopLivePropPresets={livePropPresets} desktopImportedPresentations={importedPresentations} desktopLyricShortcuts={lyricShortcuts} />;
  }

  notFound();
}
