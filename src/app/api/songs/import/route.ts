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
    
    // 2. Try Ultimate Guitar
    else if (url.includes("ultimate-guitar.com")) {
      const jsStore = $(".js-store").attr("data-content");
      if (jsStore) {
        try {
          const data = JSON.parse(jsStore);
          const tabContent = data?.store?.page?.data?.tab_view?.wiki_tab?.content;
          if (tabContent) {
            chordsText = tabContent.replace(/\[ch\]/g, "").replace(/\[\/ch\]/g, "").replace(/\[tab\]/g, "").replace(/\[\/tab\]/g, "");
          }
          const tabMeta = data?.store?.page?.data?.tab;
          if (tabMeta) {
            title = tabMeta.song_name || "";
            artist = tabMeta.artist_name || "";
          }
        } catch (e) {
          // ignore parse errors
        }
      }
    }
    
    // 3. Try PraiseCharts
    else if (url.includes("praisecharts.com") || url.includes("songselect.ccli.com")) {
      return NextResponse.json({ error: "This site requires an account or subscription to view full chords. Please copy and paste manually." }, { status: 403 });
    }

    // 4. Generic fallback (find <pre> tags or code blocks)
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
      const actualTitle = $("title").text();
      return NextResponse.json({ error: `Could not find chords text on that page. (Title: ${actualTitle})` }, { status: 404 });
    }

    return NextResponse.json({ 
      title,
      artist,
      lyrics: chordsText.trim()
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
