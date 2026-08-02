import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's active team
  const { data: membership } = await supabase
    .from("team_members")
    .select("team_id, role")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .limit(1)
    .single();

  if (!membership?.team_id || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ error: "Owner or admin permission is required" }, { status: 403 });
  }

  const { count: revertedCount, error } = await supabase
    .from("songs")
    .update({
      image_url: null,
      spotify_url: null,
      album: null,
    }, { count: "exact" })
    .eq("team_id", membership.team_id)
    .not("image_url", "is", null);

  if (error) {
    return NextResponse.json({ error: "Song covers could not be reverted." }, { status: 500 });
  }

  return NextResponse.json({
    message: `Successfully reverted covers for ${revertedCount ?? 0} songs.`,
  });
}
