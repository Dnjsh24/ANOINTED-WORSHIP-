import { z } from 'zod';
import { mobileSelfMemberLeaveQuerySchema } from '@/lib/mobile/v2/self-member-leave';
import { readMobileSelfMemberLeaveState } from '@/lib/server/mobile/v2/self-member-leave';
import { requireSelfMemberLeaveScope, selfMemberLeaveRoute, selfMemberLeavePreflight } from '@/lib/server/mobile/v2/self-member-leave-context';
export const dynamic = 'force-dynamic';
export const OPTIONS = selfMemberLeavePreflight;
export function GET(request: Request, context: { params: Promise<{ teamId: string }> }) {
  return selfMemberLeaveRoute(request, async () => {
    const { teamId } = await context.params; const { client, scope } = await requireSelfMemberLeaveScope(request, teamId);
    const entries = [...new URL(request.url).searchParams.entries()];
    if (entries.length > 1) throw new z.ZodError([{ code: 'custom', path: [], message: 'Use at most one requestNonce.' }]);
    const input = mobileSelfMemberLeaveQuerySchema.parse(Object.fromEntries(entries));
    return Response.json(await readMobileSelfMemberLeaveState({ client, scope, input, signal: request.signal }));
  });
}
