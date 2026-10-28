import { MOBILE_REQUEST_MAX_BYTES, mobileCommandsRequestSchema, mobileCommandsResponseSchema, mobileMutationResultSchema, type MobileMutationResult } from "@/lib/mobile/contracts";
import { requireMobileContext } from "@/lib/server/mobile/context";
import { mobilePreflight, mobileRoute, mobileDatabaseError } from "@/lib/server/mobile/http";
import { readBoundedJson } from "@/lib/server/request-body";
import type { Json } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";
export const OPTIONS = mobilePreflight;
export function POST(request: Request) {
  return mobileRoute(request, async () => {
    const { client, identity } = await requireMobileContext(request, true);
    const input = mobileCommandsRequestSchema.parse(await readBoundedJson(request, MOBILE_REQUEST_MAX_BYTES));
    const results: MobileMutationResult[] = [];
    for (const command of input.commands) {
      const result = await client.rpc("mobile_apply_command", { p_team_id: identity.teamId, p_command: command as Json });
      if (result.error) results.push({ commandId: command.commandId, status: "rejected", ...mobileDatabaseError(result.error.code) });
      else results.push(mobileMutationResultSchema.parse(result.data) as MobileMutationResult);
    }
    return Response.json(mobileCommandsResponseSchema.parse({ version: 1, results }));
  });
}
