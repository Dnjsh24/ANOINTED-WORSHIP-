import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { seedSongs } from "./data";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  }

  // Get the first active team membership for the user
  const { data: membership } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "You are not a part of any team. Join or create a team first." }, { status: 401 });
  }

  const teamId = membership.team_id;

  try {
    // Step 1: Get all song titles already in this team's library
    const { data: existingSongs, error: fetchError } = await supabase
      .from("songs")
      .select("title")
      .eq("team_id", teamId);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const existingTitles = new Set(
      (existingSongs ?? []).map((s: any) => s.title.toLowerCase().trim())
    );

    // Step 2: Only keep songs that are NOT already in the library
    const newSongs = seedSongs.filter(
      (song) => !existingTitles.has(song.title.toLowerCase().trim())
    );

    if (newSongs.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        skipped: existingTitles.size,
        message: "All songs are already in your library! Nothing new to add.",
      });
    }

    // Step 3: Insert only the new songs
    const songsToInsert = newSongs.map((song: any) => ({
      team_id: teamId,
      title: song.title,
      artist: song.artist,
      original_key: song.originalKey,
      bpm: song.bpm,
      time_signature: song.timeSignature,
      lyrics_chords: song.lyrics,
      tags: song.tags || [],
      status: "approved" as const,
      created_by: user.id,
    })) as any;

    const { data, error } = await supabase
      .from("songs")
      .insert(songsToInsert)
      .select("id, title");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      count: data.length,
      skipped: existingTitles.size,
      message: `Added ${data.length} new songs. Skipped ${existingTitles.size} that were already in your library.`,
      inserted: data,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
