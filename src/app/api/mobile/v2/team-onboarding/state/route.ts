import { z } from 'zod';
import { mobileTeamOnboardingQuerySchema } from '@/lib/mobile/v2/team-onboarding';
import { readMobileTeamOnboardingState } from '@/lib/server/mobile/v2/team-onboarding';
import { mobileV2Preflight, mobileV2Route, requireMobileUser } from '@/lib/server/mobile/v2/context';
export const dynamic = 'force-dynamic';
export const OPTIONS = mobileV2Preflight;
export function GET(request: Request) { return mobileV2Route(request, async () => {
  const context = await requireMobileUser(request); const entries = [...new URL(request.url).searchParams.entries()];
  if (entries.length > 1) throw new z.ZodError([{ code: 'custom', path: [], message: 'Use at most one offset.' }]);
  const { offset } = mobileTeamOnboardingQuerySchema.parse(Object.fromEntries(entries));
  return Response.json(await readMobileTeamOnboardingState({ ...context, offset, signal: request.signal }));
}); }
