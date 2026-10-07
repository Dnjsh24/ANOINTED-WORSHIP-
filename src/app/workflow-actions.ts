"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionState } from "@/lib/action-state";
import { assignmentStateSchema, readinessStateSchema, rehearsalPlanInputSchema, serviceOrderInputSchema } from "@/lib/domain/team-workflows";
import { can, type Permission } from "@/lib/domain/rbac";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { WorkflowDatabase } from "@/lib/supabase/workflow.types";
import { loadPreparationWorkspace, loadServiceWorkspace, type PreparationWorkspace, type ServiceWorkspace, type WorkspaceResult } from "@/lib/supabase/workflow-data";

async function workflowContext(permission?: Permission) {
  const context = await getRequiredTeamContext();
  if (!hasSupabaseEnv() || !context.userId || !context.memberId) return null;
  if (permission && !can(context.role, permission, context.customPermissions)) return null;
  return await createClient() as SupabaseClient<WorkflowDatabase>;
}
function failure(error?: { code?: string } | null): ActionState {
  return { ok: false, message: error?.code === "40001" ? "This plan changed. Keep your draft and reload the latest version before saving." : "Could not save. Your draft is unchanged. Check your connection and try again." };
}

export async function saveRehearsalPlanAction(input: unknown): Promise<ActionState> {
  const parsed = rehearsalPlanInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Review song allocations and task assignees before saving." };
  const client = await workflowContext("setlists.manage");
  if (!client) return { ok: false, message: "Sign in as a setlist manager to save the shared plan." };
  try {
    const { data, error } = await client.rpc("save_rehearsal_plan", { p_setlist_id: parsed.data.setlistId, p_expected_revision: parsed.data.revision, p_allocations: parsed.data.allocations, p_tasks: parsed.data.tasks });
    if (error || data === null) return failure(error);
    revalidatePath(`/setlists/${parsed.data.setlistId}`);
    revalidatePath("/dashboard");
    return { ok: true, message: "Shared rehearsal plan saved.", data: { revision: data } };
  } catch { return failure(); }
}

export async function saveServiceOrderAction(input: unknown): Promise<ActionState> {
  const parsed = serviceOrderInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Review service items, timing, people and required roles before saving." };
  const client = await workflowContext("events.manage");
  if (!client) return { ok: false, message: "Sign in as an event manager to save the shared service order." };
  try {
    const { data, error } = await client.rpc("save_service_order", { p_event_id: parsed.data.eventId, p_expected_revision: parsed.data.revision, p_entries: parsed.data.entries, p_required_roles: parsed.data.requiredRoles });
    if (error || data === null) return failure(error);
    revalidatePath(`/events/${parsed.data.eventId}`);
    return { ok: true, message: "Service running order saved.", data: { revision: data } };
  } catch { return failure(); }
}

export async function respondPreparationTaskAction(input: unknown): Promise<ActionState> {
  const parsed = z.object({ setlistId: z.uuid(), taskKey: z.string().max(160), completed: z.boolean() }).strict().safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid preparation response." };
  const client = await workflowContext();
  if (!client) return { ok: false, message: "Sign in to update your assigned check." };
  try {
    const { error } = await client.rpc("respond_preparation_task", { p_setlist_id: parsed.data.setlistId, p_task_key: parsed.data.taskKey, p_completed: parsed.data.completed });
    if (error) return failure(error);
    revalidatePath(`/setlists/${parsed.data.setlistId}`);
    revalidatePath("/dashboard");
    return { ok: true, message: "Your preparation check was saved." };
  } catch { return failure(); }
}

export async function respondSongReadinessAction(input: unknown): Promise<ActionState> {
  const parsed = z.object({ slotId: z.uuid(), state: readinessStateSchema, note: z.string().max(500) }).strict().safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid readiness response." };
  const client = await workflowContext();
  if (!client) return { ok: false, message: "Sign in to save your song readiness." };
  try {
    const { error } = await client.rpc("respond_song_readiness", { p_slot_id: parsed.data.slotId, p_state: parsed.data.state, p_note: parsed.data.note });
    if (error) return failure(error);
    revalidatePath("/setlists", "layout");
    revalidatePath("/dashboard");
    return { ok: true, message: "Your saved readiness was updated." };
  } catch { return failure(); }
}

export async function respondAssignmentAction(input: unknown): Promise<ActionState> {
  const parsed = z.object({ assignmentId: z.uuid(), state: assignmentStateSchema, note: z.string().max(500) }).strict().safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid assignment response." };
  const client = await workflowContext();
  if (!client) return { ok: false, message: "Sign in to respond to your assignment." };
  try {
    const { error } = await client.rpc("respond_assignment", { p_assignment_id: parsed.data.assignmentId, p_state: parsed.data.state, p_note: parsed.data.note });
    if (error) return failure(error);
    revalidatePath("/events", "layout");
    revalidatePath("/dashboard");
    return { ok: true, message: "Your assignment response was saved. Availability remains a separate RSVP." };
  } catch { return failure(); }
}

export async function reloadPreparationAction(setlistId: string): Promise<WorkspaceResult<PreparationWorkspace>> {
  if (!z.uuid().safeParse(setlistId).success) return { ok: false, message: "Setlist unavailable." };
  const context = await getRequiredTeamContext();
  if (!hasSupabaseEnv()) return { ok: false, message: "Sign in to load saved team planning." };
  const client = await createClient();
  const { data, error } = await client.from("setlists").select("event_id").eq("id", setlistId).eq("team_id", context.teamId).maybeSingle();
  if (error || !data) return { ok: false, message: "Setlist could not be loaded. Your draft is unchanged." };
  return loadPreparationWorkspace(client, context.teamId, setlistId, data.event_id);
}

export async function reloadServiceOrderAction(eventId: string): Promise<WorkspaceResult<ServiceWorkspace>> {
  if (!z.uuid().safeParse(eventId).success) return { ok: false, message: "Event unavailable." };
  const context = await getRequiredTeamContext();
  if (!hasSupabaseEnv()) return { ok: false, message: "Sign in to load saved team planning." };
  const client = await createClient();
  const { data, error } = await client.from("events").select("id").eq("id", eventId).eq("team_id", context.teamId).eq("approval_status", "approved").maybeSingle();
  if (error || !data) return { ok: false, message: "Event could not be loaded. Your draft is unchanged." };
  return loadServiceWorkspace(client, context.teamId, eventId);
}
