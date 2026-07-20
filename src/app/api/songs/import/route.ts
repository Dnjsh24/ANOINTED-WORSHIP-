import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

export async function POST(req: Request) {
  try {
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: "Missing URL parameter" }, { status: 400 });
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept": "text/html"
      }
    });

    const text = await response.text();
    const $ = cheerio.load(text);

    let chordsText = "";
    let title = "";
    let artist = "";

    // 1. Try WorshipChords.com
    if (url.includes("worshipchords.com")) {
      $(".worship-chords-container").each((i, el) => {
        chordsText += $(el).text() + "\n";
      });
      title = $("h1.entry-title").text().replace("Chords", "").trim();
    }
    
    // 2. Generic fallback (find <pre> tags or code blocks)
    if (!chordsText) {
      $("pre").each((i, el) => {
        chordsText += $(el).text() + "\n\n";
      });
    }

    // Try to get title from title tag if not found
    if (!title) {
      title = $("title").text().split("|")[0].replace("Chords", "").replace("Tab", "").trim();
    }

    if (!chordsText.trim()) {
      return NextResponse.json({ error: "Could not find chords text on that page." }, { status: 404 });
    }

    return NextResponse.json({ 
      title,
      artist,
      lyrics: chordsText.trim(),
      tags: ["Monospace"]
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
