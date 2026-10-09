import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { AssignmentResponseRow, PreparationResponseRow, RehearsalPlanRow, ServiceOrderRow, SongReadinessRow, WorkflowDatabase } from "@/lib/supabase/workflow.types";

export type WorkflowMember = { id: string; name: string };
export type WorkflowAssignment = { id: string; team_member_id: string; assignment: string };
export type PreparationWorkspace = { plan: RehearsalPlanRow | null; checks: PreparationResponseRow[]; readiness: SongReadinessRow[]; members: WorkflowMember[]; assignedMemberIds: string[] };
export type ServiceWorkspace = { order: ServiceOrderRow | null; assignments: WorkflowAssignment[]; responses: AssignmentResponseRow[]; members: WorkflowMember[]; templates: { id: string; name: string; default_roles: Json }[] };
export type WorkspaceResult<T> = { ok: true; data: T } | { ok: false; message: string };
type MemberProfileRow = { id: string; profiles: { full_name: string | null } | null };
function members(rows: unknown): WorkflowMember[] {
  return ((rows ?? []) as MemberProfileRow[]).map(row => ({ id: row.id, name: row.profiles?.full_name || "Team member" }));
}
function unavailable(error?: { code?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205"
    ? "Shared planning is unavailable until the website database migration is applied."
    : "Shared planning could not be loaded. Check your connection and retry.";
}

export async function loadPreparationWorkspace(baseClient: SupabaseClient<Database>, teamId: string, setlistId: string, eventId: string | null, slotIds: string[] = []): Promise<WorkspaceResult<PreparationWorkspace>> {
  const client = baseClient as SupabaseClient<WorkflowDatabase>;
  try {
    const [plan, checks, readiness, people, assignments] = await Promise.all([
      client.from("rehearsal_plans").select("*").eq("setlist_id", setlistId).eq("team_id", teamId).maybeSingle(),
      client.from("rehearsal_task_responses").select("*").eq("setlist_id", setlistId),
      eventId && slotIds.length ? client.from("song_readiness").select("*").eq("event_id", eventId).in("slot_id", slotIds) : Promise.resolve({ data: [], error: null }),
      baseClient.from("team_members").select("id,profiles(full_name)").eq("team_id", teamId).eq("status", "active"),
      eventId ? baseClient.from("event_assignments").select("team_member_id").eq("event_id", eventId) : Promise.resolve({ data: [], error: null }),
    ]);
    const error = [plan.error, checks.error, readiness.error, people.error, assignments.error].find(Boolean);
    if (error) return { ok: false, message: unavailable(error) };
    return { ok: true, data: { plan: plan.data, checks: checks.data ?? [], readiness: readiness.data ?? [], members: members(people.data), assignedMemberIds: [...new Set((assignments.data ?? []).map(row => row.team_member_id))] } };
  } catch { return { ok: false, message: unavailable() }; }
}

export async function loadServiceWorkspace(baseClient: SupabaseClient<Database>, teamId: string, eventId: string): Promise<WorkspaceResult<ServiceWorkspace>> {
  const client = baseClient as SupabaseClient<WorkflowDatabase>;
  try {
    const [order, assignments, people, templates] = await Promise.all([
      client.from("service_orders").select("*").eq("event_id", eventId).eq("team_id", teamId).maybeSingle(),
      baseClient.from("event_assignments").select("id,team_member_id,assignment").eq("event_id", eventId),
      baseClient.from("team_members").select("id,profiles(full_name)").eq("team_id", teamId).eq("status", "active"),
      baseClient.from("service_templates").select("id,name,default_roles").eq("team_id", teamId).order("name"),
    ]);
    const error = [order.error, assignments.error, people.error, templates.error].find(Boolean);
    if (error) return { ok: false, message: unavailable(error) };
    const rows = assignments.data ?? [];
    const responses = rows.length ? await client.from("assignment_responses").select("*").in("assignment_id", rows.map(row => row.id)) : { data: [], error: null };
    if (responses.error) return { ok: false, message: unavailable(responses.error) };
    return { ok: true, data: { order: order.data, assignments: rows, responses: responses.data ?? [], members: members(people.data), templates: templates.data ?? [] } };
  } catch { return { ok: false, message: unavailable() }; }
}
