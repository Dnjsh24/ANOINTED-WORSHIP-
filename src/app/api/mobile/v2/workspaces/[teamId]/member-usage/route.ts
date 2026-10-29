import { mobileMemberUsageRequestSchema } from '@/lib/mobile/v2/member-usage';
import { readMobileMemberUsage } from '@/lib/server/mobile/v2/member-usage';
import { mobileV2Preflight, mobileV2Route, requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
import { MobileApiError } from '@/lib/mobile/errors';

export const dynamic = 'force-dynamic';
export const OPTIONS = mobileV2Preflight;
export function GET(request: Request, context: { params: Promise<{ teamId: string }> }) {
  return mobileV2Route(request, async () => {
    const { teamId } = await context.params; const { client, identity } = await requireSelectedWorkspace(request, teamId);
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => params.getAll(key).length !== 1)) throw new MobileApiError(400, 'usage_range', 'Duplicate usage date parameters are not allowed.');
    const input = mobileMemberUsageRequestSchema.parse(Object.fromEntries(params));
    return Response.json(await readMobileMemberUsage({ client, identity, input, signal: request.signal }));
  });
}
