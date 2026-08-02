import { NextRequest, NextResponse } from "next/server";
import { safeErrorDetails } from "@/lib/server/safe-error";
import {
  getSpotifyAccessToken,
  parseSpotifySearchQuery,
  searchSpotifyTracks,
} from "@/lib/server/spotify";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  let query: string;
  try {
    query = parseSpotifySearchQuery(searchParams.get("q"));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid Spotify search query." },
      { status: 400 }
    );
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Spotify credentials are not configured" },
      { status: 500 }
    );
  }

  try {
    const accessToken = await getSpotifyAccessToken(clientId, clientSecret);
    return NextResponse.json(await searchSpotifyTracks(query, accessToken));
  } catch (error) {
    console.error("Error in Spotify search API:", safeErrorDetails(error));
    return NextResponse.json(
      { error: "Spotify is temporarily unavailable" },
      { status: error instanceof DOMException && error.name === "AbortError" ? 504 : 502 }
    );
  }
}
