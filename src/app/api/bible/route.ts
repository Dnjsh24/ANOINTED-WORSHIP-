import { NextRequest, NextResponse } from "next/server";
import { isDesktopRuntime } from "@/lib/desktop/runtime";
import { findDesktopBibleVerses } from "@/lib/desktop/workspace";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q");
  const translation = searchParams.get("translation") || "kjv";

  if (!query) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  if (isDesktopRuntime()) {
    const verses = findDesktopBibleVerses(query, translation);
    if (verses.length === 0) {
      return NextResponse.json({ error: "This Bible passage has not been installed on this PC." }, { status: 404 });
    }
    return NextResponse.json({ reference: query, text: verses.map((verse) => verse.text).join(" "), verses });
  }

  try {
    const url = `https://bible-api.com/${encodeURIComponent(query)}?translation=${translation}`;
    const res = await fetch(url, {
      headers: { "Accept": "application/json" },
      // 10 second timeout
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: text || "Bible API error" }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error("[Bible API Proxy]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to fetch verse" },
      { status: 500 }
    );
  }
}
