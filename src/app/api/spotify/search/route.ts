import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q");

  if (!query) {
    return NextResponse.json(
      { error: "Query parameter 'q' is required" },
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
    // 1. Get Access Token
    const tokenResponse = await fetch(
      "https://accounts.spotify.com/api/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization:
            "Basic " +
            Buffer.from(clientId + ":" + clientSecret).toString("base64"),
        },
        body: "grant_type=client_credentials",
      }
    );

    if (!tokenResponse.ok) {
      console.error("Failed to get Spotify token", await tokenResponse.text());
      return NextResponse.json(
        { error: "Failed to authenticate with Spotify" },
        { status: 500 }
      );
    }

    const { access_token } = await tokenResponse.json();

    // 2. Search Spotify
    const searchResponse = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(
        query
      )}&type=track&limit=5`,
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );

    if (!searchResponse.ok) {
      console.error(
        "Failed to search Spotify",
        await searchResponse.text()
      );
      return NextResponse.json(
        { error: "Failed to search Spotify" },
        { status: 500 }
      );
    }

    const searchData = await searchResponse.json();
    return NextResponse.json(searchData.tracks.items);
  } catch (error) {
    console.error("Error in Spotify search API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
