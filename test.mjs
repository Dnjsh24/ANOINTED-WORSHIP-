import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  const { data, error } = await supabase
    .from("setlists")
    .select(`
      *,
      events (
        type
      ),
      leader:team_members!setlists_leader_member_id_fkey (
        id,
        profile_id,
        profiles (
          id,
          full_name
        )
      )
    `)
    .limit(1);

  console.log("Error:", error);
  console.log("Data:", data);
}

test();
