import { z } from 'zod';
import { mobileSupportRequestsQuerySchema } from '@/lib/mobile/v2/support-requests';
import { readMobileSupportRequestDetail } from '@/lib/server/mobile/v2/support-request-detail';
import { mobileV2Preflight, mobileV2Route, requireMobileUser } from '@/lib/server/mobile/v2/context';
export const dynamic = 'force-dynamic';
export const OPTIONS = mobileV2Preflight;
export function GET(request: Request, context: { params: Promise<{ requestId: string }> }) {
  return mobileV2Route(request, async () => {
    const current = await requireMobileUser(request); const requestId = z.uuid().parse((await context.params).requestId);
    const entries = [...new URL(request.url).searchParams.entries()];
    if (entries.length > 1) throw new z.ZodError([{ code: 'custom', path: [], message: 'Use at most one offset.' }]);
    const { offset } = mobileSupportRequestsQuerySchema.parse(Object.fromEntries(entries));
    return Response.json(await readMobileSupportRequestDetail({ ...current, requestId, offset, signal: request.signal }));
  });
}
