import { MOBILE_TEAM_ONBOARDING_MAX_BYTES, mobileTeamOnboardingCommandSchema } from '@/lib/mobile/v2/team-onboarding';
import { applyMobileTeamOnboardingCommand } from '@/lib/server/mobile/v2/team-onboarding';
import { readBoundedJson } from '@/lib/server/request-body';
import { mobileV2Preflight, mobileV2Route, requireMobileUser } from '@/lib/server/mobile/v2/context';
export const dynamic = 'force-dynamic';
export const OPTIONS = mobileV2Preflight;
export function POST(request: Request) { return mobileV2Route(request, async () => {
  const context = await requireMobileUser(request); const command = mobileTeamOnboardingCommandSchema.parse(await readBoundedJson(request, MOBILE_TEAM_ONBOARDING_MAX_BYTES));
  return Response.json(await applyMobileTeamOnboardingCommand({ ...context, command, signal: request.signal }));
}); }
