import { mobileWorkspacesRequestSchema } from "@/lib/mobile/v2/workspaces";
import { mobileV2Preflight, mobileV2Route, requireMobileUser } from "@/lib/server/mobile/v2/context";
import { readMobileWorkspaces } from "@/lib/server/mobile/v2/workspaces";
import { readBoundedJson } from "@/lib/server/request-body";

export const dynamic = "force-dynamic";
export const OPTIONS = mobileV2Preflight;
export function POST(request: Request) {
  return mobileV2Route(request, async () => {
    const context = await requireMobileUser(request);
    const input = mobileWorkspacesRequestSchema.parse(await readBoundedJson(request, 4096));
    return Response.json(await readMobileWorkspaces({ ...context, input }));
  });
}
