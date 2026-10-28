import { MOBILE_SUPPORT_REQUEST_COMMAND_MAX_BYTES, mobileSupportRequestCommandSchema } from '@/lib/mobile/v2/support-request-commands';
import { applyMobileSupportRequestCommand } from '@/lib/server/mobile/v2/support-request-commands';
import { readBoundedJson } from '@/lib/server/request-body';
import { mobileV2Preflight, mobileV2Route, requireMobileUser } from '@/lib/server/mobile/v2/context';
export const dynamic = 'force-dynamic';
export const OPTIONS = mobileV2Preflight;
export function POST(request: Request) {
  return mobileV2Route(request, async () => {
    const context = await requireMobileUser(request);
    const intent = mobileSupportRequestCommandSchema.parse(await readBoundedJson(request, MOBILE_SUPPORT_REQUEST_COMMAND_MAX_BYTES));
    return Response.json(await applyMobileSupportRequestCommand({ ...context, intent, selectedTeamId: request.headers.get('x-mobile-team-id'), signal: request.signal }));
  });
}
