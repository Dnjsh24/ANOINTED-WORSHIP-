import { MOBILE_PERSON_PERMISSION_OVERRIDE_MAX_BYTES, mobilePersonPermissionOverrideRequestSchema } from '@/lib/mobile/v2/person-permission-override';
import { applyMobilePersonPermissionOverride } from '@/lib/server/mobile/v2/person-permission-override';
import { readBoundedJson } from '@/lib/server/request-body';
import { mobileV2Preflight, mobileV2Route, requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
export const dynamic = 'force-dynamic';
export const OPTIONS = mobileV2Preflight;
export function POST(request: Request, context: { params: Promise<{ teamId: string }> }) {
  return mobileV2Route(request, async () => {
    const { teamId } = await context.params; const { client, identity } = await requireSelectedWorkspace(request, teamId);
    const input = mobilePersonPermissionOverrideRequestSchema.parse(await readBoundedJson(request, MOBILE_PERSON_PERMISSION_OVERRIDE_MAX_BYTES));
    return Response.json(await applyMobilePersonPermissionOverride({ client, identity, request: input, signal: request.signal }));
  });
}
