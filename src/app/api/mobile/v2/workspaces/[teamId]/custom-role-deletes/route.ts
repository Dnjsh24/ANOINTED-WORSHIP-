import { MOBILE_CUSTOM_ROLE_DELETE_MAX_BYTES, mobileCustomRoleDeleteRequestSchema } from '@/lib/mobile/v2/custom-role-delete';
import { applyMobileCustomRoleDelete } from '@/lib/server/mobile/v2/custom-role-delete';
import { readBoundedJson } from '@/lib/server/request-body';
import { mobileV2Preflight, mobileV2Route, requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
export const dynamic = 'force-dynamic';
export const OPTIONS = mobileV2Preflight;
export function POST(request: Request, context: { params: Promise<{ teamId: string }> }) {
  return mobileV2Route(request, async () => {
    const { teamId } = await context.params; const { client, identity } = await requireSelectedWorkspace(request, teamId);
    const input = mobileCustomRoleDeleteRequestSchema.parse(await readBoundedJson(request, MOBILE_CUSTOM_ROLE_DELETE_MAX_BYTES));
    return Response.json(await applyMobileCustomRoleDelete({ client, identity, request: input, signal: request.signal }));
  });
}



