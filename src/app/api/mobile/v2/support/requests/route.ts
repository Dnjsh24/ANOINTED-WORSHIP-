import { z } from 'zod';
import { mobileSupportRequestsQuerySchema } from '@/lib/mobile/v2/support-requests';
import { readMobileSupportRequests } from '@/lib/server/mobile/v2/support-requests';
import { mobileV2Preflight, mobileV2Route, requireMobileUser } from '@/lib/server/mobile/v2/context';
export const dynamic = 'force-dynamic';
export const OPTIONS = mobileV2Preflight;
export function GET(request: Request) {
  return mobileV2Route(request, async () => {
    const current = await requireMobileUser(request);
    const entries = [...new URL(request.url).searchParams.entries()];
    if (entries.length > 1) throw new z.ZodError([{ code: 'custom', path: [], message: 'Use at most one offset.' }]);
    const { offset } = mobileSupportRequestsQuerySchema.parse(Object.fromEntries(entries));
    return Response.json(await readMobileSupportRequests({ ...current, offset, signal: request.signal }));
  });
}
