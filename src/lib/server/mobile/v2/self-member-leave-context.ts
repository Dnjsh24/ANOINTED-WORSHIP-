import 'server-only';
import { z } from 'zod';
import { MobileApiError } from '../context';
import { mobileV2Route, requireMobileUser } from './context';
// Departure recovery deliberately authenticates the account without looking up
// a workspace that the successful request has already removed from that account.
export async function requireSelfMemberLeaveScope(request: Request, teamId: string) {
  const selectedTeam = z.uuid().parse(teamId); const context = await requireMobileUser(request);
  const memberId = z.uuid().safeParse(request.headers.get('x-mobile-member-id'));
  if (request.headers.get('x-mobile-team-id') !== selectedTeam || !memberId.success) throw new MobileApiError(409, 'scope_changed', 'Reopen the original account and membership for this saved departure.');
  return { client: context.client, scope: { userId: context.userId, teamId: selectedTeam, memberId: memberId.data } };
}
export async function selfMemberLeaveRoute(request: Request, action: () => Promise<Response>) {
  return mobileV2Route(request, action);
}
export function selfMemberLeavePreflight(request: Request) { return selfMemberLeaveRoute(request, async () => new Response(null, { status: 204 })); }
