import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database, Json } from "@/lib/supabase/database.types";
import { mobileWorkflowCommandsRequestSchema, mobileWorkflowCommandsResponseSchema, mobileWorkflowIdentitySchema, mobileWorkflowResultSchema, type MobileWorkflowCommandsRequest } from "@/lib/mobile/v2/workflow-commands";
import { MobileApiError } from "../context";

type WorkflowCommandDatabase = Omit<Database, "public"> & { public: Database["public"] & { Functions: Database["public"]["Functions"] & {
  mobile_apply_workflow_commands: { Args: { p_team_id: string; p_member_id: string; p_commands: Json }; Returns: Json };
} } };

/** Shared bearer service. SQL rechecks actor/membership/action access and owns mutation+receipt transactionality. */
export async function applyMobileWorkflowCommands(input: {
  client: SupabaseClient<Database>; identity: { userId: string; teamId: string; memberId: string }; request: MobileWorkflowCommandsRequest;
}) {
  const request = mobileWorkflowCommandsRequestSchema.parse(input.request);
  const identity = mobileWorkflowIdentitySchema.parse({ userId: input.identity.userId, teamId: input.identity.teamId, memberId: input.identity.memberId });
  const result = await (input.client as SupabaseClient<WorkflowCommandDatabase>).rpc("mobile_apply_workflow_commands", {
    p_team_id: identity.teamId, p_member_id: identity.memberId, p_commands: request.commands as Json,
  });
  if (result.error) {
    const code = result.error.code;
    if (["42501", "PGRST301", "PGRST302", "PGRST303"].includes(code)) throw new MobileApiError(code === "42501" ? 403 : 401, "permission", "Reopen the matching account and workspace. Your draft is safe.");
    if (["40001", "40P01"].includes(code)) throw new MobileApiError(409, "retry", "Another edit is in progress. Retry with the same command IDs.");
    if (["22023", "22P02", "23514"].includes(code)) throw new MobileApiError(400, "validation", "Review these commands. Your draft is safe.");
    throw new MobileApiError(503, "unavailable", "Workflow sync is unavailable. Your draft is safe.");
  }
  const parsed = z.array(mobileWorkflowResultSchema).length(request.commands.length).safeParse(result.data);
  if (!parsed.success || parsed.data.some((response, index) => {
    const command = request.commands[index];
    if (response.commandId !== command.commandId || response.type !== command.type || response.eventId !== command.eventId) return true;
    if (response.status !== "applied" && response.status !== "conflict") return false;
    if (response.event.id !== command.eventId || (response.attendance !== null &&
      (response.attendance.memberId !== identity.memberId || response.attendance.eventId !== command.eventId || response.attendance.revision !== response.attendanceRevision))) return true;
    if (command.type === "attendance.respond") {
      if (response.status === "applied") return response.event.deleted || response.event.approvalStatus !== "approved" || response.attendance?.status !== command.status;
      const base = response.baseValue;
      return !("status" in response.localValue) || response.localValue.status !== command.status
        || (command.baseValue === null ? base !== null : base === null || !("status" in base) || base.status !== command.baseValue.status || base.note !== command.baseValue.note);
    }
    if (response.attendance !== null || response.attendanceRevision !== 0) return true;
    if (response.status === "applied") return response.event.deleted || response.event.approvalStatus !== command.decision;
    return !("decision" in response.localValue) || response.localValue.decision !== command.decision
      || response.baseValue === null || !("approvalStatus" in response.baseValue) || response.baseValue.approvalStatus !== command.baseValue.approvalStatus;
  })) throw new MobileApiError(503, "unavailable", "Workflow confirmation could not be verified. Retry with the same command IDs.");
  return mobileWorkflowCommandsResponseSchema.parse({ version: 2, identity, results: parsed.data });
}
