import { notFound } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import ProjectorClient from "./projector-client";
import type { Viewport } from "next";

export const viewport: Viewport = {
  maximumScale: 5,
  userScalable: true,
};

export default async function ProjectorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teamContext = await getRequiredTeamContext();

  if (hasSupabaseEnv() && teamContext.teamId && teamContext.userId) {
    const supabase = await createClient();

    const { data: dbSetlist } = (await supabase
      .from("setlists")
      .select(`id, name, presentation_settings`)
      .eq("id", id)
      .eq("team_id", teamContext.teamId)
      .maybeSingle()) as any;

    if (dbSetlist) {
      return <ProjectorClient setlistId={id} initialSettings={dbSetlist.presentation_settings?.settings} />;
    }
  }

  notFound();
}
