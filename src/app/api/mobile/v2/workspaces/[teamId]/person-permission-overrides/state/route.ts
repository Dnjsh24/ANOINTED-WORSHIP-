import { z } from 'zod';
import { mobilePersonPermissionOverrideQuerySchema } from '@/lib/mobile/v2/person-permission-override';
import { readMobilePersonPermissionOverrideState } from '@/lib/server/mobile/v2/person-permission-override';
import { mobileV2Preflight, mobileV2Route, requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
export const dynamic = 'force-dynamic';
export const OPTIONS = mobileV2Preflight;
export function GET(request: Request, context: { params: Promise<{ teamId: string }> }) {
  return mobileV2Route(request, async () => {
    const { teamId } = await context.params; const { client, identity } = await requireSelectedWorkspace(request, teamId);
    const entries = [...new URL(request.url).searchParams.entries()];
    if (entries.length !== 2 || new Set(entries.map(([key]) => key)).size !== 2) throw new z.ZodError([{ code: 'custom', path: [], message: 'Use exactly one targetMemberId and permission query parameter.' }]);
    const input = mobilePersonPermissionOverrideQuerySchema.parse(Object.fromEntries(entries));
    return Response.json(await readMobilePersonPermissionOverrideState({ client, identity, input, signal: request.signal }));
  });
}
