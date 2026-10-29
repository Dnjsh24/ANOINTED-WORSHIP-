import { mobileV2Preflight, mobileV2Route, requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
import { readMobileSetlistDeleteScope } from '@/lib/server/mobile/v2/setlist-commands';

export const dynamic = 'force-dynamic';
export const OPTIONS = mobileV2Preflight;
export function GET(request: Request, context: { params: Promise<{ teamId: string; setlistId: string }> }) {
  return mobileV2Route(request, async () => {
    const { teamId, setlistId } = await context.params;
    const { client, identity } = await requireSelectedWorkspace(request, teamId);
    return Response.json(await readMobileSetlistDeleteScope({ client, identity, setlistId }));
  });
}
