import { TEAM_NOTICE_ACK_MAX_BYTES, teamNoticeAckRequestSchema } from '@/lib/mobile/v2/team-notice-ack';
import { acknowledgeMobileTeamNotice } from '@/lib/server/mobile/v2/team-notice-ack';
import { readBoundedJson } from '@/lib/server/request-body';
import { mobileV2Preflight, mobileV2Route, requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';

export const dynamic = 'force-dynamic';
export const OPTIONS = mobileV2Preflight;
export function POST(request: Request, context: { params: Promise<{ teamId: string }> }) {
  return mobileV2Route(request, async () => {
    const { teamId } = await context.params; const { client, identity } = await requireSelectedWorkspace(request, teamId);
    const input = teamNoticeAckRequestSchema.parse(await readBoundedJson(request, TEAM_NOTICE_ACK_MAX_BYTES));
    return Response.json(await acknowledgeMobileTeamNotice({ client, identity, request: input, signal: request.signal }));
  });
}
