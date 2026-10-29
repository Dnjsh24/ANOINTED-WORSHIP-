import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
export const id = (value: number) => `10000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
export const identity = { userId: id(1), teamId: id(2), memberId: id(3) };
export const timestamp = "2026-10-16T00:00:00Z";
export type Row = Record<string, unknown>;
export function fixture(): Record<string, Row[]> {
  const makeEvent = (value: number) => ({
    id: id(value), team_id: identity.teamId, name: `Event ${value}`, type: "service", event_date: "2026-10-18", starts_at: "09:00:00", ends_at: null, call_time: null,
    location: null, description: null, rehearsal_date: null, rehearsal_time: null, rehearsal_end_time: null, recurrence_rule: "none", recurrence_parent_id: null,
    approval_status: "approved", requested_assignments: [], created_by: identity.userId, created_at: timestamp, updated_at: timestamp, deleted_at: null, sync_revision: 1,
  });
  return {
    team_members: [{ id: identity.memberId, team_id: identity.teamId, profile_id: identity.userId, status: "active", role: "owner", custom_role_id: null, custom_roles: null, profiles: null }],
    team_permission_overrides: [], events: [makeEvent(10), makeEvent(11), { ...makeEvent(12), approval_status: "pending" }, { ...makeEvent(13), approval_status: "rejected" }],
    event_assignments: [{ id: id(20), event_id: id(10), team_member_id: identity.memberId, assignment: "Media", created_at: timestamp }],
    attendance: [{ id: id(30), event_id: id(10), team_member_id: identity.memberId, status: "available", note: null, responded_at: timestamp, created_at: timestamp, updated_at: timestamp, sync_revision: 1 }],
    mobile_workflow_attendance_state: [{ actor_id: identity.userId, team_id: identity.teamId, event_id: id(10), member_id: identity.memberId, attendance_id: id(30), revision: 1, deleted: false, changed_at: timestamp }],
    setlists: [{ id: id(40), team_id: identity.teamId, event_id: id(10), deleted_at: null }],
    service_orders: [{ event_id: id(10), team_id: identity.teamId, revision: 2, entries: [], required_roles: ["Media"], updated_by: identity.userId, updated_at: timestamp }],
    assignment_responses: [{ assignment_id: id(20), team_member_id: identity.memberId, state: "confirmed", note: "Ready", updated_at: timestamp, sync_revision: 1 }],
    mobile_service_assignment_state: [{ actor_id: identity.userId, team_id: identity.teamId, event_id: id(10), assignment_id: id(20), member_id: identity.memberId, revision: 1, deleted: false, changed_at: timestamp }],
    service_templates: [{ id: id(50), team_id: identity.teamId, name: "Sunday", default_roles: { media: true } }],
    setlist_songs: [{ id: id(60), setlist_id: id(40), song_order: 1, deleted_at: null, song: { id: id(70), title: "Holy", team_id: identity.teamId } }],
  };
}
function projection(row: Row, select: string): Row {
  const columns = select.split(/,(?![^()]*\))/);
  return Object.fromEntries(columns.map(column => {
    const [field, nested] = column.split("(");
    const key = field.includes(":") ? field.split(":")[0] : field;
    const value = row[key];
    return [key, nested && value !== null && typeof value === "object" ? projection(value as Row, nested.slice(0, -1)) : value];
  }));
}
export function server(tables = fixture(), options: { userId?: string; role?: string; failTable?: string; cap?: number; mutate?: (table: string, rows: Row[], call: number) => Row[]; onRequest?: (url: URL) => void } = {}) {
  if (options.role) tables.team_members[0].role = options.role;
  const urls: URL[] = [];
  const authHeaders: string[] = [];
  let membershipCalls = 0;
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); urls.push(url); options.onRequest?.(url);
    if (url.pathname === "/auth/v1/user") {
      authHeaders.push(new Headers(init?.headers).get("authorization") ?? "");
      return Response.json({ id: options.userId ?? identity.userId });
    }
    const table = url.pathname.split("/").at(-1)!;
    if (table === options.failTable) return Response.json({ code: "XX000", message: "private SQL details" }, { status: 500 });
    if (table === "team_members" && url.searchParams.get("id")) membershipCalls++;
    let rows = (tables[table] ?? []).filter(row => [...url.searchParams].every(([field, filter]) => {
      if (["select", "order", "limit", "or"].includes(field)) return true;
      if (filter.startsWith("eq.")) return String(row[field]) === filter.slice(3);
      if (filter === "is.null") return row[field] === null;
      if (filter.startsWith("gt.")) return String(row[field]) > filter.slice(3);
      if (filter.startsWith("in.(")) return filter.slice(4, -1).split(",").includes(String(row[field]));
      throw new Error(`Unhandled filter ${field}=${filter}`);
    }));
    const order = url.searchParams.get("order")?.split(".")[0];
    if (order) rows = [...rows].sort((left, right) => String(left[order]).localeCompare(String(right[order])));
    rows = rows.slice(0, Math.min(Number(url.searchParams.get("limit") ?? 500), options.cap ?? 500));
    rows = options.mutate?.(table, rows, membershipCalls) ?? rows;
    const projected = rows.map(row => projection(row, url.searchParams.get("select")!));
    const singular = new Headers(init?.headers).get("accept")?.includes("vnd.pgrst.object");
    return Response.json(singular ? projected[0] ?? null : projected);
  };
  const client = createClient<Database>("https://event-reader.test", "publishable-test-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetcher, headers: { Authorization: "Bearer transport-token" } },
  });
  return { client, urls, authHeaders };
}

