import { MOBILE_TEAM_CREATION_MAX_BYTES, mobileTeamCreationRequestSchema } from '@/lib/mobile/v2/team-creation';
import { applyMobileTeamCreation } from '@/lib/server/mobile/v2/team-creation';
import { readBoundedJson } from '@/lib/server/request-body';
import { mobileV2Preflight, mobileV2Route, requireMobileUser } from '@/lib/server/mobile/v2/context';
export const dynamic = 'force-dynamic';
export const OPTIONS = mobileV2Preflight;
export function POST(request: Request) { return mobileV2Route(request, async () => {
  const context = await requireMobileUser(request); const input = mobileTeamCreationRequestSchema.parse(await readBoundedJson(request, MOBILE_TEAM_CREATION_MAX_BYTES));
  return Response.json(await applyMobileTeamCreation({ ...context, request: input, signal: request.signal }));
}); }
