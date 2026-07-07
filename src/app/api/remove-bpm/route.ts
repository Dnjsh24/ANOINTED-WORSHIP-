import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Not logged in. Please log in to the app first.' }, { status: 401 });
    }

    // Get user's active team
    const { data: membership } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('profile_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'No active team found for your user.' }, { status: 400 });
    }

    const teamId = membership.team_id;

    // Update all songs for this team to have a null BPM
    const { data, error } = await supabase
      .from('songs')
      .update({ bpm: null })
      .eq('team_id', teamId)
      .select();

    if (error) {
      console.error('Error removing BPM:', error);
      return NextResponse.json({ error: 'Failed to update songs', details: error }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: `Successfully removed the BPM for all ${data?.length || 0} songs! You can now close this tab and refresh your Songs page.` 
    });

  } catch (err: any) {
    return NextResponse.json({ error: 'Internal error', details: err.message }, { status: 500 });
  }
}
