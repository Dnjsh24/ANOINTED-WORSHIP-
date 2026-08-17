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
import { setlists as sampleSetlists } from "@/lib/sample-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import type { Song } from "@/lib/types";

function getSongLyricsChords(song: { rawLyricsChords?: string; lyricsChords?: string; sections?: Song["sections"] }): string {
  if (typeof song.rawLyricsChords === "string" && song.rawLyricsChords.trim()) {
    return song.rawLyricsChords;
  }
  if (typeof song.lyricsChords === "string" && song.lyricsChords.trim()) {
    return song.lyricsChords;
  }
  if (Array.isArray(song.sections) && song.sections.length > 0) {
    return song.sections
      .map((section) => {
        const header = section.label ? `[${section.label}]\n` : "";
        const body = (section.lines || [])
          .map((line) => {
            const chords = line.chords ? `${line.chords}\n` : "";
            const lyric = line.lyric ? `${line.lyric}\n` : "";
            return `${chords}${lyric}`;
          })
          .join("");
        return `${header}${body}`;
      })
      .join("\n");
  }
  return "";
}

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
    let rawSetlists = listDesktopSetlists(teamContext.teamId);
    if (rawSetlists.length === 0) {
      const allLocal = listDesktopSetlists();
      if (allLocal.length > 0) {
        rawSetlists = allLocal;
      } else if (!hasSupabaseEnv() || sampleSetlists.length > 0) {
        rawSetlists = sampleSetlists;
      }
    }

    if (rawSetlists.length === 0) {
      rawSetlists = [
        {
          id: "quick-presentation",
          name: "Quick Presentation",
          date: new Date().toISOString().split("T")[0],
          leader: "Worship Leader",
          location: "Main Sanctuary",
          callTime: "09:00",
          rehearsalTime: "08:00",
          serviceTimes: ["Sunday Worship"],
          songs: [],
          eventType: "service",
        },
      ];
    }

    const setlists = rawSetlists.map((setlist) => ({
      id: setlist.id,
      name: setlist.name,
      date: setlist.date,
      type: setlist.eventType || "sunday_service",
      songs: (setlist.songs || []).map((item) => ({
        id: item.id,
        order: item.order,
        assignedKey: item.assignedKey,
        song: {
          id: item.song.id,
          title: item.song.title,
          bpm: item.song.bpm || 70,
          originalKey: item.song.originalKey,
          lyricsChords: getSongLyricsChords(item.song),
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
