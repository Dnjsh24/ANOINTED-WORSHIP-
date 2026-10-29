import { z } from 'zod';
import { mobileRolePermissionOverrideQuerySchema } from '@/lib/mobile/v2/role-permission-override';
import { readMobileRolePermissionOverrideState } from '@/lib/server/mobile/v2/role-permission-override';
import { mobileV2Preflight, mobileV2Route, requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
export const dynamic = 'force-dynamic';
export const OPTIONS = mobileV2Preflight;
export function GET(request: Request, context: { params: Promise<{ teamId: string }> }) {
  return mobileV2Route(request, async () => {
    const { teamId } = await context.params; const { client, identity } = await requireSelectedWorkspace(request, teamId);
    const entries = [...new URL(request.url).searchParams.entries()];
    if (entries.length !== 2 || new Set(entries.map(([key]) => key)).size !== 2) throw new z.ZodError([{ code: 'custom', path: [], message: 'Use exactly one targetRole and permission query parameter.' }]);
    const input = mobileRolePermissionOverrideQuerySchema.parse(Object.fromEntries(entries));
    return Response.json(await readMobileRolePermissionOverrideState({ client, identity, input, signal: request.signal }));
  });
}
