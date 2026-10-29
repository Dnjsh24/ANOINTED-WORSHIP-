import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { RecordQuestion, WoolyRecordIntent, WoolyReply } from "@/lib/domain/wooly-chat";

const unavailable: WoolyReply = { kind: "unavailable", text: "I couldn’t check those records. Please try again or open the page directly." };
const answer = (text: string, sources: { label: string; href: string }[]): WoolyReply => ({ kind: "answer", text, sources });
const pattern = (term: string) => `%${term.replace(/[\\%_]/g, "\\$&")}%`;
function choose(records: { id: string; label: string }[], intent: Exclude<WoolyRecordIntent, "next-event" | "events-date">): WoolyReply {
  return { kind: "clarification", text: "Which record do you mean?", choices: records.slice(0, 5).map((record) => ({ label: record.label, value: { kind: "record", id: record.id, intent } })) };
}

/** Cookie-authenticated client and explicit team scope; never a service-role client. */
export async function readWoolyRecords(client: SupabaseClient<Database>, teamId: string, question: RecordQuestion, options: { signal?: AbortSignal; requireCompleteSetlist?: boolean } = {}): Promise<WoolyReply> {
  options.signal?.throwIfAborted();
  if (question.intent === "next-event" || question.intent === "events-date") {
    let query = client.from("events").select("id,name,event_date,starts_at,location").eq("team_id", teamId).eq("approval_status", "approved");
    query = question.intent === "next-event" ? query.gte("event_date", question.date!) : query.eq("event_date", question.date!);
    const ordered = query.order("event_date").order("starts_at").limit(question.intent === "next-event" ? 1 : 5);
    const result = await (options.signal ? ordered.abortSignal(options.signal) : ordered); options.signal?.throwIfAborted();
    if (result.error || !result.data) return unavailable;
    const nativeLimit = options.requireCompleteSetlist && question.intent === "events-date" ? "Showing up to five approved events.\n" : "";
    if (!result.data.length) return answer(`${nativeLimit}I found no approved events ${question.intent === "next-event" ? "on or after" : "on"} ${question.date}.`, [{ label: "Open Timeline", href: "/events" }]);
    return answer(nativeLimit + result.data.map((event) => `${event.name}: ${event.event_date}, ${event.starts_at.slice(0, 5)}${event.location ? ` at ${event.location}` : ""}.`).join("\n"), result.data.map((event) => ({ label: event.name, href: `/events/${event.id}` })));
  }
  if (!question.id && !question.term) return { kind: "clarification", text: "Please include the song or setlist name, for example: key for “Opening Song”.", choices: [] };
  if (question.intent === "find-song" || question.intent === "song-details") {
    let query = client.from("songs").select("id,title,original_key,bpm").eq("team_id", teamId).is("deleted_at", null);
    query = question.id ? query.eq("id", question.id) : query.ilike("title", pattern(question.term));
    const ordered = query.order("title").limit(6);
    const result = await (options.signal ? ordered.abortSignal(options.signal) : ordered); options.signal?.throwIfAborted();
    if (result.error || !result.data) return unavailable;
    if (!result.data.length) return answer("I couldn’t find an accessible song matching that name.", [{ label: "Open Songs", href: "/songs" }]);
    if (result.data.length > 1) return choose(result.data.map((song) => ({ id: song.id, label: song.title })), question.intent);
    const song = result.data[0];
    return answer(`${song.title}: stored original key ${song.original_key || "not set"}; BPM ${song.bpm ?? "not set"}. A setlist may use a different assigned key.`, [{ label: song.title, href: `/songs/${song.id}` }]);
  }
  let query = client.from("setlists").select("id,name,setlist_date").eq("team_id", teamId).is("deleted_at", null);
  query = question.id ? query.eq("id", question.id) : query.ilike("name", pattern(question.term));
  const ordered = query.order("setlist_date", { ascending: false }).limit(6);
  const result = await (options.signal ? ordered.abortSignal(options.signal) : ordered); options.signal?.throwIfAborted();
  if (result.error || !result.data) return unavailable;
  if (!result.data.length) return answer("I couldn’t find an accessible setlist matching that name.", [{ label: "Open Setlists", href: "/setlists" }]);
  if (result.data.length > 1) return choose(result.data.map((setlist) => ({ id: setlist.id, label: `${setlist.name} — ${setlist.setlist_date}` })), question.intent);
  const setlist = result.data[0];
  const source = [{ label: `${setlist.name} — ${setlist.setlist_date}`, href: `/setlists/${setlist.id}` }];
  if (question.intent === "find-setlist") return answer(`${setlist.name} is dated ${setlist.setlist_date}.`, source);
  const slotQuery = client.from("setlist_songs").select("song_id,assigned_key,song_order").eq("setlist_id", setlist.id).order("song_order").limit(options.requireCompleteSetlist ? 101 : 100);
  const slots = await (options.signal ? slotQuery.abortSignal(options.signal) : slotQuery); options.signal?.throwIfAborted();
  if (slots.error || !slots.data) return unavailable;
  if (options.requireCompleteSetlist && slots.data.length > 100) return { kind: "unavailable", text: "This setlist has more than 100 songs. Open the setlist to review its complete song list." };
  if (!slots.data.length) return answer(`${setlist.name} has no songs yet.`, source);
  const songQuery = client.from("songs").select("id,title").eq("team_id", teamId).is("deleted_at", null).in("id", slots.data.map((slot) => slot.song_id));
  const songs = await (options.signal ? songQuery.abortSignal(options.signal) : songQuery); options.signal?.throwIfAborted();
  if (songs.error || !songs.data) return unavailable;
  const titles = new Map(songs.data.map((song) => [song.id, song.title]));
  if (options.requireCompleteSetlist && slots.data.some(slot => !titles.has(slot.song_id))) return { kind: "unavailable", text: "Some setlist songs are unavailable. Open the setlist to review its current song list." };
  const lines = slots.data.filter((slot) => titles.has(slot.song_id)).map((slot, index) => `${index + 1}. ${titles.get(slot.song_id)}${slot.assigned_key ? ` — key ${slot.assigned_key}` : ""}`);
  return answer(`${setlist.name} (${setlist.setlist_date}):\n${lines.join("\n") || "No accessible songs."}`, source);
}
