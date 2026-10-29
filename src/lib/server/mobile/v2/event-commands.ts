import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database, Json } from "@/lib/supabase/database.types";
import { assertMobileEventResult, mobileEventCommandsRequestSchema, mobileEventCommandsResponseSchema, mobileEventResultSchema,
  type MobileEventCommandsRequest } from "@/lib/mobile/v2/event-commands";
import { mobileWorkflowIdentitySchema } from "@/lib/mobile/v2/workflow-commands";
import { MobileApiError } from "../context";

type EventCommandDatabase = Omit<Database, "public"> & { public: Database["public"] & { Functions: Database["public"]["Functions"] & {
  mobile_apply_event_commands: { Args: { p_team_id: string; p_member_id: string; p_commands: Json }; Returns: Json };
} } };
export async function applyMobileEventCommands(input: { client: SupabaseClient<Database>; identity: {userId:string;teamId:string;memberId:string}; request: MobileEventCommandsRequest }) {
  const request = mobileEventCommandsRequestSchema.parse(input.request);
  const identity = mobileWorkflowIdentitySchema.parse({userId:input.identity.userId,teamId:input.identity.teamId,memberId:input.identity.memberId});
  if (request.commands.some(command => command.baseValue && command.baseValue.record.team_id !== identity.teamId)) throw new MobileApiError(400,"validation","The saved base belongs to another workspace.");
  const result = await (input.client as SupabaseClient<EventCommandDatabase>).rpc("mobile_apply_event_commands", {p_team_id:identity.teamId,p_member_id:identity.memberId,p_commands:request.commands as Json});
  if (result.error) {
    const code=result.error.code;
    if (["42501","PGRST301","PGRST302","PGRST303"].includes(code)) throw new MobileApiError(code==="42501"?403:401,"permission","Reopen the matching account and workspace. Your draft is safe.");
    if (["40001","40P01"].includes(code)) throw new MobileApiError(409,"retry","Another edit is in progress. Retry with the same command IDs.");
    if (["22023","22P02","23514"].includes(code)) throw new MobileApiError(400,"validation","Review these commands. Your draft is safe.");
    throw new MobileApiError(503,"unavailable","Event sync is unavailable. Your draft is safe.");
  }
  const parsed=z.array(mobileEventResultSchema).length(request.commands.length).safeParse(result.data);
  try {
    if (!parsed.success) throw new Error('Invalid event confirmation.');
    parsed.data.forEach((response,index)=>assertMobileEventResult(request.commands[index],identity,response));
  } catch {
    throw new MobileApiError(503,"unavailable","Event confirmation could not be verified. Retry with the same command IDs.");
  }
  if (!parsed.success) throw new MobileApiError(503,"unavailable","Event confirmation could not be verified. Retry with the same command IDs.");
  return mobileEventCommandsResponseSchema.parse({version:2,identity,results:parsed.data});
}
