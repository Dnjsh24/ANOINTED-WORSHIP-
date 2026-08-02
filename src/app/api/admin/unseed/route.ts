import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeErrorDetails } from "@/lib/server/safe-error";
import { STARTER_LIBRARY_SEED_SOURCE } from "@/lib/domain/seed";

export async function POST() {
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
    // Soft delete only the starter rows created by the seed operation. User
    // songs with a matching title are never selected.
    const { data, error } = await supabase
      .from("songs")
      .update({ deleted_at: new Date().toISOString() })
      .eq("seed_source", STARTER_LIBRARY_SEED_SOURCE)
      .eq("team_id", teamId)
      .is("deleted_at", null) // Only affect songs not already in trash
      .select("id, title");

    if (error) {
      console.error("Unseed update failed:", safeErrorDetails(error));
      return NextResponse.json({ error: "Seeded songs could not be moved to trash." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      count: data?.length || 0,
      message: `Successfully moved ${data?.length || 0} seeded songs to the Trash.`,
      removed: data,
    });
  } catch (error) {
    console.error("Unseed operation failed:", safeErrorDetails(error));
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
