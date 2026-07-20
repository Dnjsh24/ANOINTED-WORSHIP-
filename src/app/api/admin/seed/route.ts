import { NextResponse } from "next/server";
import { getMutationContext } from "@/app/actions";
import { readFileSync } from "fs";
import path from "path";

export async function GET() {
  const context = await getMutationContext("songs.create");
  if (!context.ok) {
    return NextResponse.json({ error: "Not authorized or no team found. Please log in first." }, { status: 401 });
  }

  const { supabase, teamId, userId } = context;

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
      created_by: userId,
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
