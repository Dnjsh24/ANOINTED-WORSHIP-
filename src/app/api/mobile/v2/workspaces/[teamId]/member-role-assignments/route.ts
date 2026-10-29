import { MOBILE_MEMBER_ROLE_ASSIGNMENT_MAX_BYTES, mobileMemberRoleAssignmentRequestSchema } from '@/lib/mobile/v2/member-role-assignment';
import { applyMobileMemberRoleAssignment } from '@/lib/server/mobile/v2/member-role-assignment';
import { readBoundedJson } from '@/lib/server/request-body';
import { mobileV2Preflight, mobileV2Route, requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
export const dynamic = 'force-dynamic';
export const OPTIONS = mobileV2Preflight;
export function POST(request: Request, context: { params: Promise<{ teamId: string }> }) {
  return mobileV2Route(request, async () => {
    const { teamId } = await context.params; const { client, identity } = await requireSelectedWorkspace(request, teamId);
    const input = mobileMemberRoleAssignmentRequestSchema.parse(await readBoundedJson(request, MOBILE_MEMBER_ROLE_ASSIGNMENT_MAX_BYTES));
    return Response.json(await applyMobileMemberRoleAssignment({ client, identity, request: input, signal: request.signal }));
  });
}
