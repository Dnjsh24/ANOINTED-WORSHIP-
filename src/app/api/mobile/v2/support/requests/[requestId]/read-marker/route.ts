import { MOBILE_SUPPORT_READ_MARKER_MAX_BYTES, mobileSupportReadMarkerRequestSchema } from '@/lib/mobile/v2/support-read-marker';
import { applyMobileSupportReadMarker } from '@/lib/server/mobile/v2/support-read-marker';
import { readBoundedJson } from '@/lib/server/request-body';
import { mobileV2Preflight, mobileV2Route, requireMobileUser } from '@/lib/server/mobile/v2/context';
import { MobileApiError } from '@/lib/server/mobile/context';
export const dynamic = 'force-dynamic';
export const OPTIONS = mobileV2Preflight;
export function POST(request: Request, context: { params: Promise<{ requestId: string }> }) {
  return mobileV2Route(request, async () => {
    const current = await requireMobileUser(request); const input = mobileSupportReadMarkerRequestSchema.parse(await readBoundedJson(request, MOBILE_SUPPORT_READ_MARKER_MAX_BYTES));
    if ((await context.params).requestId !== input.requestId) throw new MobileApiError(403, 'support_read_marker_scope', 'Choose the original support thread snapshot.');
    return Response.json(await applyMobileSupportReadMarker({ ...current, request: input, signal: request.signal }));
  });
}
