import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { seedSongs } from "../seed/data";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  }

  // Get the first active team membership for the user
  const { data: membership } = await supabase
    .from("team_members")
    .select("team_id, role")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return NextResponse.json({ error: "You must be an owner or admin to unseed." }, { status: 401 });
  }

  const teamId = membership.team_id;

  try {
    const titlesToRemove = seedSongs.map(s => s.title);

    // Soft delete the songs
    const { data, error } = await supabase
      .from("songs")
      .update({ deleted_at: new Date().toISOString() })
      .in("title", titlesToRemove)
      .eq("team_id", teamId)
      .is("deleted_at", null) // Only affect songs not already in trash
      .select("id, title");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      count: data?.length || 0,
      message: `Successfully moved ${data?.length || 0} seeded songs to the Trash.`,
      removed: data,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
