import Link from "next/link";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { SharedContentRequestForm } from "@/components/shared-content-request-form";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";

const types = ["setlist", "event", "song_slot", "announcement", "reminder", "choreography"] as const;
const targetSchema = z.enum(types);
const snapshotSchema = z.object({ revision: z.number().int().nonnegative(), values: z.record(z.string(), z.unknown()) });

export default async function NewRequestPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getRequiredTeamContext();
  const params = await searchParams;
  const type = targetSchema.safeParse(params.type).data ?? "setlist";
  const search = typeof params.q === "string" ? params.q.slice(0, 160).trim() : "";
  const id = z.uuid().safeParse(params.id).data;
  const choices: { id: string; name: string }[] = [];
  const members: { id: string; name: string }[] = [];
  const songs: { id: string; name: string }[] = [];
  let snapshot: z.infer<typeof snapshotSchema> | null = null;
  let message = "";
  if (hasSupabaseEnv()) {
    const client = await createClient();
    if (id) {
      const { data, error } = await client.rpc("get_shared_edit_target", { p_target_type: type, p_target_id: id });
      const result = snapshotSchema.safeParse(data);
      if (!error && result.success) {
        snapshot = result.data;
        if (["setlist", "event", "song_slot"].includes(type)) {
          const { data: people } = await client.from("team_members").select("id,profiles(full_name)").eq("team_id", context.teamId).eq("status", "active").order("id").limit(500);
          for (const person of people ?? []) members.push({ id: person.id, name: person.profiles?.full_name || "Team member" });
        }
        if (type === "setlist") {
          const songIds = z.array(z.uuid()).max(200).safeParse(snapshot.values.song_ids).data ?? [];
          const [current, found] = await Promise.all([
            songIds.length ? client.from("songs").select("id,title").eq("team_id", context.teamId).in("id", songIds) : Promise.resolve({ data: [] }),
            client.from("songs").select("id,title").eq("team_id", context.teamId).is("deleted_at", null).ilike("title", `%${search.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`).order("title").limit(30),
          ]);
          for (const song of [...(current.data ?? []), ...(found.data ?? [])]) if (!songs.some(item => item.id === song.id)) songs.push({ id: song.id, name: song.title });
        }
      }
      else message = "This content could not be loaded. Check your connection and access, then retry.";
    } else {
      // All choices use normal authenticated SELECT policies; lists are bounded.
      const pattern = `%${search.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
      if (type === "setlist") {
        const { data, error } = await client.from("setlists").select("id,name").eq("team_id", context.teamId).is("deleted_at", null).ilike("name", pattern).order("name").limit(30);
        choices.push(...(data ?? [])); if (error) message = "Setlists could not be loaded. Retry.";
      } else if (type === "event") {
        const { data, error } = await client.from("events").select("id,name").eq("team_id", context.teamId).is("deleted_at", null).eq("approval_status", "approved").ilike("name", pattern).order("name").limit(30);
        choices.push(...(data ?? [])); if (error) message = "Events could not be loaded. Retry.";
      } else if (type === "song_slot") {
        const { data, error } = await client.from("setlist_songs").select("id,song_order,setlists!inner(name,team_id),songs!inner(title)").eq("setlists.team_id", context.teamId).is("deleted_at", null).ilike("songs.title", pattern).order("id").limit(30);
        for (const row of data ?? []) choices.push({ id: row.id, name: `${row.setlists.name} · ${row.song_order + 1}. ${row.songs.title}` });
        if (error) message = "Song slots could not be loaded. Retry.";
      } else if (type === "announcement") {
        const { data, error } = await client.from("announcements").select("id,title").eq("team_id", context.teamId).ilike("title", pattern).order("created_at", { ascending: false }).limit(30);
        for (const row of data ?? []) choices.push({ id: row.id, name: row.title });
        if (error) message = "Announcements could not be loaded. Retry.";
      } else if (type === "reminder") {
        const { data, error } = await client.from("notifications").select("notice_group_id,title").eq("team_id", context.teamId).eq("profile_id", context.userId).not("notice_group_id", "is", null).ilike("title", pattern).order("created_at", { ascending: false }).limit(30);
        for (const row of data ?? []) if (row.notice_group_id && !choices.some(item => item.id === row.notice_group_id)) choices.push({ id: row.notice_group_id, name: row.title });
        if (error) message = "Reminders could not be loaded. Retry.";
      } else {
        const { data, error } = await client.from("dance_notes").select("id,title").eq("team_id", context.teamId).ilike("title", pattern).order("created_at", { ascending: false }).limit(30);
        for (const row of data ?? []) choices.push({ id: row.id, name: row.title });
        if (error) message = "Choreography could not be loaded. Retry.";
      }
    }
  } else message = "Sign in to submit saved team edit requests.";
  return <AppShell active="Requests" teamContext={context}>
    <Link href="/requests" className="text-sm text-violet-300">Back to requests</Link><h1 className="my-4 text-3xl font-bold">Request team content changes</h1>
    <p className="mb-6 text-zinc-400">Songs have a request button in their edit page. Shared rehearsal plans and service order can be proposed from their setlist or event page.</p>
    {snapshot && id ? <>
      {type === "setlist" && <form className="mb-5 flex flex-wrap gap-3"><input name="type" type="hidden" value={type} /><input name="id" type="hidden" value={id} /><label>Find songs before editing<input name="q" defaultValue={search} maxLength={160} className="ml-2 rounded-lg border border-white/20 bg-white/5 p-2" /></label><button className="rounded-lg border border-white/20 px-3 py-2">Find songs</button><p className="w-full text-xs text-zinc-400">Search reloads the current published content. Find your song choices before entering a draft.</p></form>}
      <SharedContentRequestForm key={`${type}:${id}:${search}`} type={type} targetId={id} revision={snapshot.revision} values={snapshot.values} members={members} songs={songs} />
    </> : <>
      <form className="mb-5 flex flex-wrap items-end gap-3"><label>Content<select name="type" defaultValue={type} className="ml-2 rounded-lg bg-zinc-900 p-2">{types.map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label><label>Search<input name="q" defaultValue={search} maxLength={160} className="ml-2 rounded-lg border border-white/20 bg-white/5 p-2" /></label><button className="rounded-lg bg-violet-600 px-4 py-2">Find content</button></form>
      <ul className="space-y-2">{choices.map(item => <li key={item.id}><Link href={`/requests/new?type=${type}&id=${item.id}`} className="block rounded-xl border border-white/10 p-3">{item.name}</Link></li>)}</ul>
      {!choices.length && !message && <p>No matching content. Try another search.</p>}
      {choices.length === 30 && <p className="mt-3 text-sm text-zinc-400">Showing up to 30 matches. Refine your search to find another item.</p>}
    </>}
    {message && <p role="alert" className="mt-4 text-amber-200">{message}</p>}
  </AppShell>;
}
