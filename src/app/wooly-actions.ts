"use server";

import { parseTutorialCheckpoint, type TutorialProgress } from "@/lib/domain/wooly";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";

const unavailable = "Wooly progress is unavailable. You can keep exploring.";

function parseProgress(row: Tables<"wooly_tutorial_progress">): TutorialProgress | null {
  const checkpoint = parseTutorialCheckpoint({ tourId: row.tour_id, version: row.version, status: row.status, nextStep: row.next_step });
  return checkpoint && Number.isFinite(Date.parse(row.updated_at))
    ? { ...checkpoint, updatedAt: row.updated_at }
    : null;
}

export async function readTutorialProgressAction(): Promise<{ ok: true; progress: TutorialProgress[] } | { ok: false; message: string }> {
  try {
    const supabase = await createClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) return { ok: false, message: "Sign in to save Wooly progress." };
    const { data, error } = await supabase.from("wooly_tutorial_progress").select("*").eq("profile_id", auth.user.id);
    if (error || !data) return { ok: false, message: unavailable };
    const progress = data.map(parseProgress);
    if (progress.some((row) => row === null)) return { ok: false, message: unavailable };
    return { ok: true, progress: progress.filter((row) => row !== null) };
  } catch {
    return { ok: false, message: unavailable };
  }
}

export async function saveTutorialProgressAction(input: unknown): Promise<{ ok: true; progress: TutorialProgress } | { ok: false; message: string }> {
  const checkpoint = parseTutorialCheckpoint(input);
  if (!checkpoint) return { ok: false, message: "Invalid Wooly checkpoint." };
  try {
    const supabase = await createClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) return { ok: false, message: "Sign in to save Wooly progress." };
    const { data, error } = await supabase.from("wooly_tutorial_progress").upsert({
      profile_id: auth.user.id,
      tour_id: checkpoint.tourId,
      version: checkpoint.version,
      status: checkpoint.status,
      next_step: checkpoint.nextStep,
    }, { onConflict: "profile_id,tour_id,version" }).select("*").single();
    if (error || !data) return { ok: false, message: unavailable };
    const progress = parseProgress(data);
    return progress ? { ok: true, progress } : { ok: false, message: unavailable };
  } catch {
    return { ok: false, message: unavailable };
  }
}
