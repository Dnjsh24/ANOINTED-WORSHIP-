import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { createClient } from "@/lib/supabase/server";
import { fetchAllowedRemoteHtml } from "@/lib/server/safe-remote-html";
import { readBoundedJson, RequestBodyError } from "@/lib/server/request-body";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = await readBoundedJson(req, 4_096);
    const url = payload && typeof payload === "object" && "url" in payload
      ? (payload as { url?: unknown }).url
      : undefined;
    const { url: validatedUrl, html: text } = await fetchAllowedRemoteHtml(url);
    const $ = cheerio.load(text);

    let chordsText = "";
    let title = "";
    let artist = "";

    // 1. Try WorshipChords.com
    if (validatedUrl.hostname.endsWith("worshipchords.com")) {
      $(".worship-chords-container").each((i, el) => {
        chordsText += $(el).text() + "\n";
      });
      title = $("h1.entry-title").text().replace("Chords", "").trim();
    }
    
    // 2. Try Ultimate Guitar
    else if (validatedUrl.hostname.endsWith("ultimate-guitar.com")) {
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
        } catch {
          // ignore parse errors
        }
      }
    }
    
    // Generic fallback (find <pre> tags or code blocks)
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

  } catch (err) {
    if (err instanceof RequestBodyError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Import failed.";
    const status = err instanceof DOMException && err.name === "TimeoutError" ? 504 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
