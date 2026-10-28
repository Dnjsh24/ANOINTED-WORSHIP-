import { MOBILE_CUSTOM_ROLE_RETIREMENT_MAX_BYTES, mobileCustomRoleRetirementRequestSchema } from '@/lib/mobile/v2/custom-role-retirement';
import { applyMobileCustomRoleRetirement } from '@/lib/server/mobile/v2/custom-role-retirement';
import { readBoundedJson } from '@/lib/server/request-body';
import { mobileV2Preflight, mobileV2Route, requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
export const dynamic = 'force-dynamic';
export const OPTIONS = mobileV2Preflight;
export function POST(request: Request, context: { params: Promise<{ teamId: string }> }) {
  return mobileV2Route(request, async () => {
    const { teamId } = await context.params; const { client, identity } = await requireSelectedWorkspace(request, teamId);
    const input = mobileCustomRoleRetirementRequestSchema.parse(await readBoundedJson(request, MOBILE_CUSTOM_ROLE_RETIREMENT_MAX_BYTES));
    return Response.json(await applyMobileCustomRoleRetirement({ client, identity, request: input, signal: request.signal }));
  });
}
