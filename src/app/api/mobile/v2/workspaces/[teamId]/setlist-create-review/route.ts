import { MOBILE_SETLIST_COMMAND_MAX_BYTES } from '@/lib/mobile/v2/setlist-commands';
import { mobileSetlistCreateReviewRequestSchema } from '@/lib/mobile/v2/setlist-create-review';
import { readBoundedJson } from '@/lib/server/request-body';
import { mobileV2Preflight, mobileV2Route, requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
import { readMobileSetlistCreateReview } from '@/lib/server/mobile/v2/setlist-create-review';

export const dynamic = 'force-dynamic';
export const OPTIONS = mobileV2Preflight;
export function POST(request: Request, context: { params: Promise<{ teamId: string }> }) {
  return mobileV2Route(request, async () => {
    const { teamId } = await context.params;
    const { client, identity } = await requireSelectedWorkspace(request, teamId);
    const input = mobileSetlistCreateReviewRequestSchema.parse(await readBoundedJson(request, MOBILE_SETLIST_COMMAND_MAX_BYTES));
    return Response.json(await readMobileSetlistCreateReview({ client, identity, request: input }));
  });
}
