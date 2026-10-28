import { z } from 'zod';
import { MOBILE_DANCE_PROPOSAL_MAX_BYTES, mobileDanceProposalRequestSchema } from '@/lib/mobile/v2/dance-proposals';
import { readMobileDanceProposalSnapshot, submitMobileDanceProposal } from '@/lib/server/mobile/v2/dance-proposals';
import { readBoundedJson } from '@/lib/server/request-body';
import { mobileV2Preflight, mobileV2Route, requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';

export const dynamic = 'force-dynamic';
export const OPTIONS = mobileV2Preflight;
type RouteContext = { params: Promise<{ teamId: string; chartId: string }> };

export function GET(request: Request, context: RouteContext) {
  return mobileV2Route(request, async () => {
    const { teamId, chartId } = await context.params;
    const { client, identity } = await requireSelectedWorkspace(request, teamId);
    return Response.json(await readMobileDanceProposalSnapshot({ client, identity, chartId: z.uuid().parse(chartId), signal: request.signal }));
  });
}

export function POST(request: Request, context: RouteContext) {
  return mobileV2Route(request, async () => {
    const { teamId, chartId } = await context.params;
    const { client, identity } = await requireSelectedWorkspace(request, teamId);
    const input = mobileDanceProposalRequestSchema.parse(await readBoundedJson(request, MOBILE_DANCE_PROPOSAL_MAX_BYTES));
    return Response.json(await submitMobileDanceProposal({ client, identity, chartId: z.uuid().parse(chartId), request: input, signal: request.signal }));
  });
}
