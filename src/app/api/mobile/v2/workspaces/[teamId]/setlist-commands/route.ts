import { MOBILE_SETLIST_COMMAND_MAX_BYTES, mobileSetlistCommandsRequestSchema } from '@/lib/mobile/v2/setlist-commands';
import { readBoundedJson } from '@/lib/server/request-body';
import { mobileV2Preflight, mobileV2Route, requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
import { applyMobileSetlistCommands } from '@/lib/server/mobile/v2/setlist-commands';

export const dynamic = 'force-dynamic';
export const OPTIONS = mobileV2Preflight;
export function POST(request: Request, context: { params: Promise<{ teamId: string }> }) {
  return mobileV2Route(request, async () => {
    const { teamId } = await context.params;
    const { client, identity } = await requireSelectedWorkspace(request, teamId);
    const input = mobileSetlistCommandsRequestSchema.parse(await readBoundedJson(request, MOBILE_SETLIST_COMMAND_MAX_BYTES));
    return Response.json(await applyMobileSetlistCommands({ client, identity, request: input }));
  });
}
