import { NextRequest, NextResponse } from "next/server";
import { safeErrorDetails } from "@/lib/server/safe-error";
import { isDesktopRuntime } from "@/lib/desktop/runtime";
import { findDesktopBibleVerses } from "@/lib/desktop/workspace";
import { BIBLE_BOOKS, isBibleTranslation } from "@/lib/bible/catalog";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.trim();
  const requestedTranslation = searchParams.get("translation") || "kjv";

  if (!query) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }
  if (!isBibleTranslation(requestedTranslation)) {
    return NextResponse.json({ error: "Unsupported Bible translation" }, { status: 400 });
  }
  const match = query.match(/^(.+?)\s+(\d+)(?::(\d+)(?:-(\d+))?)?$/);
  const book = match ? BIBLE_BOOKS.find((candidate) => candidate.name.toLowerCase() === match[1].toLowerCase()) : undefined;
  const chapter = match ? Number(match[2]) : 0;
  const firstVerse = match?.[3] ? Number(match[3]) : undefined;
  const lastVerse = match?.[4] ? Number(match[4]) : firstVerse;
  if (!book || chapter < 1 || chapter > book.chapters
    || (firstVerse !== undefined && (firstVerse < 1 || firstVerse > 176))
    || (lastVerse !== undefined && (lastVerse < (firstVerse || 1) || lastVerse > 176))) {
    return NextResponse.json({ error: "Invalid Bible reference" }, { status: 400 });
  }
  const translation = requestedTranslation;

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
      console.error("Bible provider request failed.", { status: res.status });
      return NextResponse.json({ error: "Bible provider request failed" }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: unknown) {
    console.error("[Bible API Proxy]", safeErrorDetails(err));
    return NextResponse.json(
      { error: "Failed to fetch verse" },
      { status: 500 }
    );
  }
}
