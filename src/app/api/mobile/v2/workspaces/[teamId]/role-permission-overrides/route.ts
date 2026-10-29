import { MOBILE_ROLE_PERMISSION_OVERRIDE_MAX_BYTES, mobileRolePermissionOverrideRequestSchema } from '@/lib/mobile/v2/role-permission-override';
import { applyMobileRolePermissionOverride } from '@/lib/server/mobile/v2/role-permission-override';
import { readBoundedJson } from '@/lib/server/request-body';
import { mobileV2Preflight, mobileV2Route, requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
export const dynamic = 'force-dynamic';
export const OPTIONS = mobileV2Preflight;
export function POST(request: Request, context: { params: Promise<{ teamId: string }> }) {
  return mobileV2Route(request, async () => {
    const { teamId } = await context.params; const { client, identity } = await requireSelectedWorkspace(request, teamId);
    const input = mobileRolePermissionOverrideRequestSchema.parse(await readBoundedJson(request, MOBILE_ROLE_PERMISSION_OVERRIDE_MAX_BYTES));
    return Response.json(await applyMobileRolePermissionOverride({ client, identity, request: input, signal: request.signal }));
  });
}
