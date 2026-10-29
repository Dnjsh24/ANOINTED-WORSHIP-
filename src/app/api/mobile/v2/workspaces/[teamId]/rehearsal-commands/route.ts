import { MOBILE_REHEARSAL_MAX_BYTES, mobileRehearsalCommandsRequestSchema } from '@/lib/mobile/v2/rehearsal-commands';
import { readBoundedJson } from '@/lib/server/request-body';
import { mobileV2Preflight, mobileV2Route, requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
import { applyMobileRehearsalCommands } from '@/lib/server/mobile/v2/rehearsal';

export const dynamic = 'force-dynamic';
export const OPTIONS = mobileV2Preflight;
export function POST(request: Request, context: { params: Promise<{ teamId: string }> }) {
  return mobileV2Route(request, async () => {
    const { teamId } = await context.params;
    const { client, identity } = await requireSelectedWorkspace(request, teamId);
    const input = mobileRehearsalCommandsRequestSchema.parse(await readBoundedJson(request, MOBILE_REHEARSAL_MAX_BYTES));
    return Response.json(await applyMobileRehearsalCommands({ client, identity, request: input }));
  });
}
