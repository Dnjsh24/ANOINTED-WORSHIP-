import { mobileAnalyticsRequestSchema } from '@/lib/mobile/v2/analytics';
import { readMobileAnalytics } from '@/lib/server/mobile/v2/analytics';
import { mobileV2Preflight, mobileV2Route, requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
import { MobileApiError } from '@/lib/mobile/errors';

export const dynamic = 'force-dynamic';
export const OPTIONS = mobileV2Preflight;
export function GET(request: Request, context: { params: Promise<{ teamId: string }> }) {
  return mobileV2Route(request, async () => {
    const { teamId } = await context.params; const { client, identity } = await requireSelectedWorkspace(request, teamId);
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => params.getAll(key).length !== 1)) throw new MobileApiError(400, 'analytics_range', 'Duplicate analytics parameters are not allowed.');
    const input = mobileAnalyticsRequestSchema.parse(Object.fromEntries(params));
    return Response.json(await readMobileAnalytics({ client, identity, input, signal: request.signal }));
  });
}
