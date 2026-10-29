import { z } from 'zod';
import { readMobileMemberRoleState } from '@/lib/server/mobile/v2/member-role-assignment';
import { mobileV2Preflight, mobileV2Route, requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
export const dynamic = 'force-dynamic';
export const OPTIONS = mobileV2Preflight;
export function GET(request: Request, context: { params: Promise<{ teamId: string }> }) {
  return mobileV2Route(request, async () => {
    const { teamId } = await context.params; const { client, identity } = await requireSelectedWorkspace(request, teamId);
    const entries = [...new URL(request.url).searchParams.entries()];
    if (entries.length !== 1) throw new z.ZodError([{ code: 'custom', path: [], message: 'Use exactly one targetMemberId query parameter.' }]);
    const input = z.object({ targetMemberId: z.uuid() }).strict().parse(Object.fromEntries(entries));
    return Response.json(await readMobileMemberRoleState({ client, identity, targetMemberId: input.targetMemberId, signal: request.signal }));
  });
}
