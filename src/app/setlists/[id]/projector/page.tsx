import { notFound } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import ProjectorClient, { type ProjectorLiveState } from "./projector-client";
import type { Viewport } from "next";
import { isDesktopRuntime } from "@/lib/desktop/runtime";
import { getDesktopPresenterLiveState, getDesktopSetlist } from "@/lib/desktop/workspace";
import { setlists as sampleSetlists } from "@/lib/sample-data";
import type { PresentationSettings } from "@/lib/domain/presentation";
import type { Setlist } from "@/lib/types";

export const viewport: Viewport = {
  maximumScale: 5,
  userScalable: true,
};

function nestedPresentationSettings(value: unknown): PresentationSettings | undefined {
  if (!value || typeof value !== "object" || !("settings" in value)) {
    return undefined;
  }
  return value.settings as PresentationSettings | undefined;
}

export default async function ProjectorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teamContext = await getRequiredTeamContext();

  if (isDesktopRuntime() && teamContext.teamId) {
    const setlist = getDesktopSetlist(teamContext.teamId, id) || sampleSetlists.find((s) => s.id === id);
    if (setlist) {
      const desktopSetlist = setlist as Setlist & { presentationSettings?: unknown };
      return (
        <ProjectorClient
          setlistId={id}
          initialSettings={nestedPresentationSettings(desktopSetlist.presentationSettings)}
          initialLiveState={getDesktopPresenterLiveState(id) as ProjectorLiveState}
        />
      );
    }
    if (id === "quick-presentation") {
      return (
        <ProjectorClient
          setlistId={id}
          initialLiveState={getDesktopPresenterLiveState(id) as ProjectorLiveState}
        />
      );
    }
  } else if (hasSupabaseEnv() && teamContext.teamId && teamContext.userId) {
    const supabase = await createClient();

    const { data: dbSetlist } = await supabase
      .from("setlists")
      .select(`id, name, presentation_settings`)
      .eq("id", id)
      .eq("team_id", teamContext.teamId)
      .maybeSingle();

    if (dbSetlist) {
      return (
        <ProjectorClient
          setlistId={id}
          initialSettings={nestedPresentationSettings(dbSetlist.presentation_settings)}
        />
      );
    }
  } else if (sampleSetlists.some((setlist) => setlist.id === id)) {
    return <ProjectorClient setlistId={id} />;
  }

  notFound();
}
