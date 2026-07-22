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

  // Fetch all songs missing an image
  const { data: songs } = await supabase
    .from("songs")
    .select("id, title, artist")
    .eq("team_id", membership.team_id)
    .is("image_url", null);

  if (!songs || songs.length === 0) {
    return NextResponse.json({ message: "All songs already have covers!" });
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "Spotify credentials not found" }, { status: 500 });
  }

  // Get Spotify Token
  const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(clientId + ":" + clientSecret).toString("base64"),
    },
    body: "grant_type=client_credentials",
  });

  if (!tokenResponse.ok) {
    return NextResponse.json({ error: "Failed to authenticate with Spotify" }, { status: 500 });
  }

  const { access_token } = await tokenResponse.json();

  let updatedCount = 0;
  const results = [];

  for (const song of songs) {
    const query = `${song.title} ${song.artist}`;
    try {
      const searchResponse = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`,
        { headers: { Authorization: `Bearer ${access_token}` } }
      );

      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        const track = searchData.tracks?.items?.[0];

        if (track && track.album?.images?.[0]?.url) {
          const imageUrl = track.album.images[0].url;
          const spotifyUrl = track.external_urls.spotify;
          const album = track.album.name;

          const { error } = await supabase
            .from("songs")
            .update({
              image_url: imageUrl,
              spotify_url: spotifyUrl,
              album: album,
            })
            .eq("id", song.id);

          if (!error) {
            updatedCount++;
            results.push({ song: song.title, status: "Updated", image: imageUrl });
          } else {
            results.push({ song: song.title, status: "Failed DB Update", error: error.message });
          }
        } else {
          results.push({ song: song.title, status: "Not Found on Spotify" });
        }
      }
    } catch (e) {
      results.push({ song: song.title, status: "Error", error: String(e) });
    }
  }

  return NextResponse.json({
    message: `Successfully backfilled ${updatedCount} out of ${songs.length} songs.`,
    details: results,
  });
}
