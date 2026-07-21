const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

// Simple parser for .env.local
const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, "utf8");
  envFile.split("\n").forEach((line) => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match != null) {
      const key = match[1];
      let value = match[2] || "";
      if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
        value = value.replace(/\\n/gm, "\n");
        value = value.replace(/(^"|"$)/g, "");
      }
      process.env[key] = value;
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase env vars. supabaseUrl:", !!supabaseUrl, "supabaseServiceKey:", !!supabaseServiceKey);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  try {
    const { data: teams, error: teamsError } = await supabase
      .from("teams")
      .select("id")
      .limit(1);

    if (teamsError || !teams || teams.length === 0) {
      throw new Error("Could not find a team");
    }
    const teamId = teams[0].id;

    const { data: users } = await supabase
      .from("profiles")
      .select("id")
      .limit(1);

    const userId = users && users.length > 0 ? users[0].id : null;

    const brainPath = "C:\\Users\\danje\\.gemini\\antigravity\\brain\\6fee3659-39dd-4d04-96db-96caf1c4a46f\\scratch\\songs.json";
    const songsData = JSON.parse(fs.readFileSync(brainPath, "utf8"));

    const songsToInsert = songsData.map((song) => ({
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
      throw error;
    }

    console.log(`Successfully inserted ${data.length} songs:`);
    console.log(data.map(d => d.title).join(", "));
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
