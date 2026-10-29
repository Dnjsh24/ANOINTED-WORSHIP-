import { mobileHomeResponseSchema } from "@/lib/mobile/v2/home";
import { readHomeContent } from "@/lib/dashboard/home";
import { mobileV2Preflight, mobileV2Route, requireSelectedWorkspace } from "@/lib/server/mobile/v2/context";

export const dynamic = "force-dynamic";
export const OPTIONS = mobileV2Preflight;
export function GET(request: Request, context: { params: Promise<{ teamId: string }> }) {
  return mobileV2Route(request, async () => {
    const { teamId } = await context.params;
    const { client, identity } = await requireSelectedWorkspace(request, teamId);
    const now = new Date();
    const model = await readHomeContent(client, { ...identity, canManageMembers: identity.permissions.includes("members.manage") }, { now });
    return Response.json(mobileHomeResponseSchema.parse({ version: 2, identity, model, asOf: now.toISOString() }));
  });
}
