import { MOBILE_SERVICE_COMMAND_MAX_BYTES, mobileServiceCommandsRequestSchema } from '@/lib/mobile/v2/service-commands';
import { readBoundedJson } from '@/lib/server/request-body';
import { mobileV2Preflight, mobileV2Route, requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
import { applyMobileServiceCommands } from '@/lib/server/mobile/v2/service-commands';

export const dynamic = 'force-dynamic';
export const OPTIONS = mobileV2Preflight;
export function POST(request: Request, context: { params: Promise<{ teamId: string }> }) {
  return mobileV2Route(request, async () => {
    const { teamId } = await context.params;
    const { client, identity } = await requireSelectedWorkspace(request, teamId);
    const input = mobileServiceCommandsRequestSchema.parse(await readBoundedJson(request, MOBILE_SERVICE_COMMAND_MAX_BYTES));
    return Response.json(await applyMobileServiceCommands({ client, identity, request: input }));
  });
}
