import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's active team
  const { data: membership } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .limit(1)
    .single();

  if (!membership?.team_id) {
    return NextResponse.json({ error: "No active team found" }, { status: 400 });
  }

  // Revert all songs (clear spotify data)
  const { data: songs, error: fetchError } = await supabase
    .from("songs")
    .select("id")
    .eq("team_id", membership.team_id)
    .not("image_url", "is", null);

  if (fetchError || !songs || songs.length === 0) {
    return NextResponse.json({ message: "No songs to revert. Covers are already cleared!" });
  }

  let revertedCount = 0;
  for (const song of songs) {
    const { error } = await supabase
      .from("songs")
      .update({
        image_url: null,
        spotify_url: null,
        album: null,
      })
      .eq("id", song.id);

    if (!error) {
      revertedCount++;
    }
  }

  return NextResponse.json({
    message: `Successfully reverted covers for ${revertedCount} songs.`,
  });
}
