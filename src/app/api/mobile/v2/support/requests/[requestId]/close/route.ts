import { MOBILE_SUPPORT_REQUEST_CLOSE_MAX_BYTES, mobileSupportRequestCloseRequestSchema } from '@/lib/mobile/v2/support-request-close';
import { applyMobileSupportRequestClose } from '@/lib/server/mobile/v2/support-request-close';
import { readBoundedJson } from '@/lib/server/request-body';
import { mobileV2Preflight, mobileV2Route, requireMobileUser } from '@/lib/server/mobile/v2/context';
import { MobileApiError } from '@/lib/server/mobile/context';
export const dynamic = 'force-dynamic';
export const OPTIONS = mobileV2Preflight;
export function POST(request: Request, context: { params: Promise<{ requestId: string }> }) {
  return mobileV2Route(request, async () => {
    const current = await requireMobileUser(request); const input = mobileSupportRequestCloseRequestSchema.parse(await readBoundedJson(request, MOBILE_SUPPORT_REQUEST_CLOSE_MAX_BYTES));
    if ((await context.params).requestId !== input.requestId) throw new MobileApiError(403, 'support_close_scope', 'Choose the original support request.');
    return Response.json(await applyMobileSupportRequestClose({ ...current, request: input, signal: request.signal }));
  });
}
