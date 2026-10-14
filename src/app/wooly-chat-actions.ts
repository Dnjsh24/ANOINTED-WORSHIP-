"use server";

import { matchPreparedAnswer, matchRecordQuestion, needsWoolyDate, safeWoolyPagePath, woolyQuestionSchema, type WoolyReply } from "@/lib/domain/wooly-chat";
import { requireWoolyAccount, woolyServerContext } from "@/lib/server/wooly-context";
import { readWoolyRecords } from "@/lib/server/wooly-records";
import { events, setlists, songs } from "@/lib/sample-data";
import type { RecordQuestion } from "@/lib/domain/wooly-chat";

function demoRecordAnswer(query: RecordQuestion): WoolyReply {
  const sources: { label: string; href: string }[] = [];
  let text = "";
  if (query.intent === "next-event" || query.intent === "events-date") {
    const found = events.filter((event) => query.intent === "next-event" ? event.date >= query.date! : event.date === query.date).sort((a, b) => a.date.localeCompare(b.date)).slice(0, query.intent === "next-event" ? 1 : 5);
    text = found.map((event) => `${event.name}: ${event.date}, ${event.time}.`).join("\n") || `No sample events found for ${query.date}.`;
    sources.push({ label: "Open sample Timeline", href: "/events" });
  } else if (query.intent === "find-song" || query.intent === "song-details") {
    const found = songs.filter((song) => query.term && song.title.toLowerCase().includes(query.term.toLowerCase())).slice(0, 5);
    text = found.map((song) => `${song.title}: original key ${song.originalKey}; BPM ${song.bpm ?? "not set"}.`).join("\n") || "Please include a sample song name, such as Opening Song.";
    sources.push({ label: "Open sample Songs", href: "/songs" });
  } else {
    const found = setlists.filter((setlist) => query.term && setlist.name.toLowerCase().includes(query.term.toLowerCase())).slice(0, 5);
    text = found.map((setlist) => `${setlist.name} (${setlist.date})${query.intent === "setlist-songs" ? `: ${setlist.songs.map((slot) => slot.song.title).join(", ")}` : ""}.`).join("\n") || "Please include a sample setlist name, such as Sunday Service.";
    sources.push({ label: "Open sample Setlists", href: "/setlists" });
  }
  return { kind: "answer", text: `Sample data — ${text}`, sources };
}

export async function answerWoolyQuestionAction(value: unknown): Promise<WoolyReply> {
  const parsed = woolyQuestionSchema.safeParse(value);
  if (!parsed.success) return { kind: "unavailable", text: "Please enter a question of up to 1,000 characters and a valid date." };
  const input = { ...parsed.data, pagePath: safeWoolyPagePath(parsed.data.pagePath) };
  if (needsWoolyDate(input)) return { kind: "clarification", text: "Which date? Please use YYYY-MM-DD, for example: events on 2026-10-18.", choices: [] };
  try {
    const session = await woolyServerContext();
    const record = input.choice?.kind === "topic" ? null : matchRecordQuestion(input);
    if (!session) {
      const beforeTeam = ["/teams", "/teams/join", "/teams/new", "/pending"].includes(input.pagePath);
      return record ? demoRecordAnswer(record) : matchPreparedAnswer(input, { userId: "demo-user", hasTeam: !beforeTeam, canManageMembers: !beforeTeam, session: "demo" });
    }
    if (record) {
      if (!session.context.userId || !session.context.teamId) return { kind: "unavailable", text: "Join an approved team to look up its records. I can still help explain the website.", audience: session.audience };
      await requireWoolyAccount("lookup");
      return { ...await readWoolyRecords(session.client, session.context.teamId, record), audience: session.audience };
    }
    const articles = await session.client.from("wooly_help_articles").select("*").eq("published", true).limit(200);
    // Static help remains usable before the optional support migration is applied.
    return { ...matchPreparedAnswer(input, session.audience, articles.data ?? []), audience: session.audience };
  } catch {
    return { kind: "unavailable", text: "Wooly couldn’t check that right now. Please try again; you can keep using the website." };
  }
}
