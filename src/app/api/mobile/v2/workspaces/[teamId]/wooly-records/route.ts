import { MOBILE_WOOLY_RECORDS_MAX_BYTES, mobileWoolyRecordsRequestSchema } from '@/lib/mobile/v2/wooly-records';
import { readMobileWoolyRecords } from '@/lib/server/mobile/v2/wooly-records';
import { readBoundedJson } from '@/lib/server/request-body';
import { mobileV2Preflight, mobileV2Route, requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
export const dynamic = 'force-dynamic';
export const OPTIONS = mobileV2Preflight;
export function POST(request: Request, context: { params: Promise<{ teamId: string }> }) {
  return mobileV2Route(request, async () => {
    const { teamId } = await context.params; const current = await requireSelectedWorkspace(request, teamId);
    const input = mobileWoolyRecordsRequestSchema.parse(await readBoundedJson(request, MOBILE_WOOLY_RECORDS_MAX_BYTES));
    return Response.json(await readMobileWoolyRecords({ ...current, request: input, signal: request.signal }));
  });
}
