import { MOBILE_TEAM_SETTINGS_EDIT_MAX_BYTES, mobileTeamSettingsEditRequestSchema } from '@/lib/mobile/v2/team-settings-edit';
import { applyMobileTeamSettingsEdit } from '@/lib/server/mobile/v2/team-settings-edit';
import { readBoundedJson } from '@/lib/server/request-body';
import { mobileV2Preflight, mobileV2Route, requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
export const dynamic = 'force-dynamic';
export const OPTIONS = mobileV2Preflight;
export function POST(request: Request, context: { params: Promise<{ teamId: string }> }) {
  return mobileV2Route(request, async () => {
    const { teamId } = await context.params; const { client, identity } = await requireSelectedWorkspace(request, teamId);
    const input = mobileTeamSettingsEditRequestSchema.parse(await readBoundedJson(request, MOBILE_TEAM_SETTINGS_EDIT_MAX_BYTES));
    return Response.json(await applyMobileTeamSettingsEdit({ client, identity, request: input, signal: request.signal }));
  });
}


