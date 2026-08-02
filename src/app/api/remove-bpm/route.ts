import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { safeErrorDetails } from '@/lib/server/safe-error';

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Not logged in. Please log in to the app first.' }, { status: 401 });
    }

    // Get user's active team
    const { data: membership } = await supabase
      .from('team_members')
      .select('team_id, role')
      .eq('profile_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: 'Owner or admin permission is required.' }, { status: 403 });
    }

    const teamId = membership.team_id;

    // Update all songs for this team to have a null BPM
    const { data, error } = await supabase
      .from('songs')
      .update({ bpm: null })
      .eq('team_id', teamId)
      .select();

    if (error) {
      console.error('Error removing BPM:', safeErrorDetails(error));
      return NextResponse.json({ error: 'Failed to update songs' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: `Successfully removed the BPM for all ${data?.length || 0} songs! You can now close this tab and refresh your Songs page.` 
    });

  } catch (error) {
    console.error("Unexpected BPM removal failure:", safeErrorDetails(error));
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 },
    );
  }
}
