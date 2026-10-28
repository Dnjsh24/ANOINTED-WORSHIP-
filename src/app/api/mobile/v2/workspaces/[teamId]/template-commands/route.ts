import { MOBILE_TEMPLATE_COMMAND_MAX_BYTES, mobileTemplateCommandsRequestSchema } from '@/lib/mobile/v2/template-commands';
import { readBoundedJson } from '@/lib/server/request-body';
import { mobileV2Preflight, mobileV2Route, requireSelectedWorkspace } from '@/lib/server/mobile/v2/context';
import { applyMobileTemplateCommands } from '@/lib/server/mobile/v2/template-commands';

export const dynamic = 'force-dynamic';
export const OPTIONS = mobileV2Preflight;
export function POST(request: Request, context: { params: Promise<{ teamId: string }> }) {
  return mobileV2Route(request, async () => {
    const { teamId } = await context.params;
    const { client, identity } = await requireSelectedWorkspace(request, teamId);
    const input = mobileTemplateCommandsRequestSchema.parse(await readBoundedJson(request, MOBILE_TEMPLATE_COMMAND_MAX_BYTES));
    return Response.json(await applyMobileTemplateCommands({ client, identity, request: input }));
  });
}
