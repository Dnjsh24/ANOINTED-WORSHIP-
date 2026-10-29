import "server-only";
import { z } from "zod";
import { mobileCatalogResponseSchema, type MobileCatalogRequest, type MobileCatalogResponse } from "@/lib/mobile/catalog-contracts";
import { MobileApiError, type requireMobileContext } from "./context";

type MobileContext = Awaited<ReturnType<typeof requireMobileContext>>;
const songRowsSchema = z.array(z.object({ id: z.uuid(), title: z.string().max(160), artist: z.string().max(160) })).max(51);
const planRowsSchema = z.array(z.object({ id: z.uuid(), name: z.string().max(160), setlist_date: z.iso.date() })).max(51);
const eventRowsSchema = z.array(z.object({ id: z.uuid(), name: z.string().max(160), event_date: z.iso.date() })).max(51);

function literalSearch(search: string) {
  // Unlike ILIKE, imatch does not alias a literal '*' to a wildcard '%'.
  return search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function readMobileCatalog({ client, identity, input }: MobileContext & { input: MobileCatalogRequest }): Promise<MobileCatalogResponse> {
  const pattern = input.search ? literalSearch(input.search) : null;
  const unavailable = () => new MobileApiError(503, "unavailable", "The download catalog is unavailable. Try again later.");
  let items: MobileCatalogResponse["items"];

  if (input.kind === "song") {
    let query = client.from("songs").select("id,title,artist").eq("team_id", identity.teamId)
      .eq("status", "approved").is("deleted_at", null);
    if (input.after) query = query.gt("id", input.after);
    // Logic-tree values need PostgREST quoting; standalone filter values do not.
    if (pattern) query = query.or(`title.imatch.${JSON.stringify(pattern)},artist.imatch.${JSON.stringify(pattern)}`);
    const result = await query.order("id", { ascending: true }).limit(51);
    if (result.error) throw unavailable();
    const parsed = songRowsSchema.safeParse(result.data);
    if (!parsed.success) throw unavailable();
    items = parsed.data.map(row => ({ kind: "song", id: row.id, title: row.title, subtitle: row.artist || null }));
  } else if (input.kind === "setlist") {
    let query = client.from("setlists").select("id,name,setlist_date").eq("team_id", identity.teamId).is("deleted_at", null);
    if (input.after) query = query.gt("id", input.after);
    if (pattern) query = query.filter("name", "imatch", pattern);
    const result = await query.order("id", { ascending: true }).limit(51);
    if (result.error) throw unavailable();
    const parsed = planRowsSchema.safeParse(result.data);
    if (!parsed.success) throw unavailable();
    items = parsed.data.map(row => ({ kind: "setlist", id: row.id, title: row.name, subtitle: row.setlist_date }));
  } else {
    let query = client.from("events").select("id,name,event_date").eq("team_id", identity.teamId).is("deleted_at", null);
    if (identity.role !== "owner" && identity.role !== "admin") query = query.or(`approval_status.eq.approved,created_by.eq.${identity.userId}`);
    if (input.after) query = query.gt("id", input.after);
    if (pattern) query = query.filter("name", "imatch", pattern);
    const result = await query.order("id", { ascending: true }).limit(51);
    if (result.error) throw unavailable();
    const parsed = eventRowsSchema.safeParse(result.data);
    if (!parsed.success) throw unavailable();
    items = parsed.data.map(row => ({ kind: "event", id: row.id, title: row.name, subtitle: row.event_date }));
  }
  const nextId = items.length > 50 ? items[49].id : null;
  return mobileCatalogResponseSchema.parse({ version: 1, identity, items: items.slice(0, 50), nextId });
}
