"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { sharedEditCursorSchema, sharedEditRequestInputSchema, sharedEditRequestRowSchema, sharedEditStatusSchema, type SharedEditRequestPage } from "@/lib/domain/shared-edit-requests";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";

function failure(code?: string): ActionState {
  return { ok: false, message: code === "42501" ? "This content or review permission is unavailable. Your draft is unchanged." : "Could not save this request. Your draft is unchanged. Retry with the same request identifier." };
}

export async function submitSharedEditRequestAction(input: unknown): Promise<ActionState> {
  const parsed = sharedEditRequestInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Review the proposed changes and explain your request." };
  if (!hasSupabaseEnv()) return { ok: false, message: "Sign in to submit a saved team edit request." };
  const context = await getRequiredTeamContext();
  if (!context.userId || !context.memberId) return failure("42501");
  try {
    const client = await createClient();
    const request = parsed.data;
    const { data, error } = await client.rpc("submit_shared_edit_request", {
      p_target_type: request.targetType, p_target_id: request.targetId, p_revision: request.revision,
      p_changes: request.changes, p_reason: request.reason, p_request_nonce: request.requestNonce,
    });
    const requestId = z.uuid().safeParse(data);
    if (error || !requestId.success) return failure(error?.code);
    const { data: saved, error: statusError } = await client.from("shared_edit_requests").select("status")
      .eq("id", requestId.data).eq("requested_by", context.userId).maybeSingle();
    const status = sharedEditStatusSchema.safeParse(saved?.status);
    if (statusError || !status.success) return failure(statusError?.code);
    revalidatePath("/requests");
    const message = status.data === "needs_revision" ? "Published content changed. Your proposal and reason are retained. Reload its revision and resubmit with a new request identifier."
      : status.data === "pending" ? "Edit request saved. Published content stays unchanged until approval."
      : `This request is ${status.data}. Start a revised proposal with a new request identifier when needed.`;
    return { ok: status.data === "pending" || status.data === "approved", message, data: { requestId: requestId.data, status: status.data } };
  } catch { return failure(); }
}

export async function reviewSharedEditRequestAction(input: unknown): Promise<ActionState> {
  const parsed = z.object({ requestId: z.uuid(), decision: z.enum(["approved", "rejected"]), reason: z.string().trim().max(1000) }).strict()
    .refine(value => value.decision !== "rejected" || value.reason.length > 0).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Select a decision and explain any rejection." };
  if (!hasSupabaseEnv()) return failure("42501");
  const context = await getRequiredTeamContext();
  if (!context.userId || !context.memberId) return failure("42501");
  try {
    const client = await createClient();
    const { data, error } = await client.rpc("review_shared_edit_request", { p_request_id: parsed.data.requestId, p_decision: parsed.data.decision, p_reason: parsed.data.reason });
    const status = sharedEditStatusSchema.safeParse(data);
    if (error || !status.success) return failure(error?.code);
    revalidatePath("/requests");
    if (status.data === "approved") {
      for (const path of ["/songs", "/setlists", "/events", "/announcements", "/reminders", "/dance"]) revalidatePath(path, "layout");
      revalidatePath("/dashboard");
    }
    return { ok: status.data !== "needs_revision", message: status.data === "needs_revision" ? "Published content changed. The proposal is retained; revise and resubmit." : `Request ${status.data}.`, data: { status: status.data } };
  } catch { return failure(); }
}

export async function withdrawSharedEditRequestAction(input: unknown): Promise<ActionState> {
  const parsed = z.object({ requestId: z.uuid() }).strict().safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  if (!hasSupabaseEnv()) return failure("42501");
  const context = await getRequiredTeamContext();
  if (!context.userId || !context.memberId) return failure("42501");
  try {
    const client = await createClient();
    const { error } = await client.rpc("withdraw_shared_edit_request", { p_request_id: parsed.data.requestId });
    if (error) return failure(error.code);
    revalidatePath("/requests");
    return { ok: true, message: "Your request was withdrawn." };
  } catch { return failure(); }
}

export async function loadSharedEditRequestsAction(input: unknown): Promise<SharedEditRequestPage> {
  const parsed = z.object({ view: z.enum(["mine", "review"]), limit: z.number().int().min(1).max(100).default(50), cursor: sharedEditCursorSchema.optional() }).strict().safeParse(input);
  if (!parsed.success || !hasSupabaseEnv()) return { ok: false, message: "Saved requests are unavailable." };
  const context = await getRequiredTeamContext();
  try {
    const client = await createClient();
    let query = client.from("shared_edit_requests").select("*").eq("team_id", context.teamId).order("requested_at", { ascending: false }).order("id", { ascending: false }).limit(parsed.data.limit + 1);
    const view = context.role === "owner" ? "review" : parsed.data.view;
    query = view === "mine" ? query.eq("requested_by", context.userId) : query.eq("status", "pending").neq("requested_by", context.userId);
    if (parsed.data.cursor) {
      const cursor = parsed.data.cursor;
      query = query.or(`requested_at.lt.${cursor.requestedAt},and(requested_at.eq.${cursor.requestedAt},id.lt.${cursor.id})`);
    }
    const { data, error } = await query;
    const rows = z.array(sharedEditRequestRowSchema).safeParse(data);
    if (error?.code === "42P01" || error?.code === "PGRST205") return { ok: false, message: "Edit requests are unavailable until the website database migration is applied." };
    if (error || !rows.success) return { ok: false, message: "Requests could not be loaded. Check your connection and retry." };
    const requests = rows.data.slice(0, parsed.data.limit);
    const last = requests.at(-1);
    return { ok: true, requests, nextCursor: rows.data.length > parsed.data.limit && last ? { requestedAt: last.requested_at, id: last.id } : null };
  } catch { return { ok: false, message: "Requests could not be loaded. Check your connection and retry." }; }
}
