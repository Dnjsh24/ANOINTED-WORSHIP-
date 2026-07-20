import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readFileSync } from "fs";
import path from "path";

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
    const songsPath = path.join(process.cwd(), "scratch", "songs.json");
    let songsData;
    
    try {
      songsData = JSON.parse(readFileSync(songsPath, "utf8"));
    } catch {
      const brainPath = "C:\\Users\\danje\\.gemini\\antigravity\\brain\\6fee3659-39dd-4d04-96db-96caf1c4a46f\\scratch\\songs.json";
      songsData = JSON.parse(readFileSync(brainPath, "utf8"));
    }

    const songsToInsert = songsData.map((song: any) => ({
      team_id: teamId,
      title: song.title,
      artist: song.artist,
      original_key: song.originalKey,
      bpm: song.bpm,
      time_signature: song.timeSignature,
      lyrics_chords: song.lyrics,
      tags: song.tags || [],
      status: "approved",
      created_by: user.id,
    }));

    const { data, error } = await supabase
      .from("songs")
      .insert(songsToInsert)
      .select("id, title");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: data.length, inserted: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
