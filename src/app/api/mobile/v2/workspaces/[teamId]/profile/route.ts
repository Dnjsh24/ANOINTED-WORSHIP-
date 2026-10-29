import { z } from 'zod';
import { readMobileProfile } from '@/lib/server/mobile/v2/profile';
import { mobileV2Preflight, mobileV2Route, requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';

export const dynamic = 'force-dynamic';
export const OPTIONS = mobileV2Preflight;
export function GET(request: Request, context: { params: Promise<{ teamId: string }> }) {
  return mobileV2Route(request, async () => {
    const { teamId } = await context.params;
    const { client, identity } = await requireSelectedWorkspace(request, teamId);
    z.object({}).strict().parse(Object.fromEntries(new URL(request.url).searchParams));
    return Response.json(await readMobileProfile({ client, identity, signal: request.signal }));
  });
}
