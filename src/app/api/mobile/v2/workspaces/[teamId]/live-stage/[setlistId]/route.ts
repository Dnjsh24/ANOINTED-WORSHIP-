import { z } from 'zod';
import { LIVE_STAGE_REQUEST_MAX_BYTES, liveStageRequestSchema } from '@/lib/domain/live-stage';
import { applyLiveStageRequest } from '@/lib/server/live-stage';
import { readBoundedJson } from '@/lib/server/request-body';
import { mobileV2Preflight, mobileV2Route, requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';

export const dynamic = 'force-dynamic';
export const OPTIONS = mobileV2Preflight;
export function POST(request: Request, context: { params: Promise<{ teamId: string; setlistId: string }> }) {
  return mobileV2Route(request, async () => {
    const { teamId, setlistId } = await context.params;
    const { client, identity } = await requireSelectedWorkspace(request, teamId);
    const input = liveStageRequestSchema.parse(await readBoundedJson(request, LIVE_STAGE_REQUEST_MAX_BYTES));
    return Response.json(await applyLiveStageRequest({ client, identity, setlistId: z.uuid().parse(setlistId), request: input, signal: request.signal }));
  });
}
