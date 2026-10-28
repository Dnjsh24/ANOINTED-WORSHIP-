import { MOBILE_SELF_MEMBER_LEAVE_MAX_BYTES, mobileSelfMemberLeaveRequestSchema } from '@/lib/mobile/v2/self-member-leave';
import { applyMobileSelfMemberLeave } from '@/lib/server/mobile/v2/self-member-leave';
import { requireSelfMemberLeaveScope, selfMemberLeaveRoute, selfMemberLeavePreflight } from '@/lib/server/mobile/v2/self-member-leave-context';
import { readBoundedJson } from '@/lib/server/request-body';
export const dynamic = 'force-dynamic';
export const OPTIONS = selfMemberLeavePreflight;
export function POST(request: Request, context: { params: Promise<{ teamId: string }> }) {
  return selfMemberLeaveRoute(request, async () => {
    const { teamId } = await context.params; const { client, scope } = await requireSelfMemberLeaveScope(request, teamId);
    const input = mobileSelfMemberLeaveRequestSchema.parse(await readBoundedJson(request, MOBILE_SELF_MEMBER_LEAVE_MAX_BYTES));
    return Response.json(await applyMobileSelfMemberLeave({ client, scope, request: input, signal: request.signal }));
  });
}
